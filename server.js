/**
 * MovieCatalog Server v5.4.0
 *
 * Professional Digital Movie Library Manager with:
 * - Recursive directory scanning
 * - Smart media type detection (Movie, TV Series, Animation, etc.)
 * - Robust filename parser (supports 10+ naming conventions)
 * - In-memory index with JSON disk cache
 * - Real-time filesystem watcher (auto-updates on file changes)
 * - Diagnostics endpoint for admin troubleshooting
 * - Image cache (single poster per movie ID)
 * - WebSocket-based real-time selection sync (customer → managers)
 * - Order management with persistent storage
 *
 * Architecture:
 *   Scanner → Parser → Indexer → Watcher → API
 *                        ↕
 *                   catalog.json (disk cache)
 *
 *   Customer UI → Selection Store → WebSocket → Server → Managers
 *
 * Usage:
 *   npm start
 *   PORT=8080 LIBRARY_PATH=C:/Movies node server.js
 */

const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');

const { scanLibrary, scanGames } = require('./backend/scanner');
const CatalogIndexer = require('./backend/indexer');
const LibraryWatcher = require('./backend/watcher');
const Diagnostics = require('./backend/diagnostics');
const WebSocketServer = require('./server/realtime/ws-server');
const OrderManager = require('./server/orders/order-manager');
const MovieCreator = require('./backend/services/movie-creator');
const { validateCredentials, createSession, invalidateSession } = require('./server/auth/auth');

// ─── Configuration ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT, 10) || 3000;
const LIBRARY_PATH = path.resolve(process.env.LIBRARY_PATH || path.join(__dirname, 'Library'));
const CATALOG_PATH = path.join(__dirname, 'data', 'catalog.json');
const ORDERS_PATH = path.join(__dirname, 'data', 'orders.json');

// ─── Initialize Components ───────────────────────────────────────────────────

const app = express();
const httpServer = http.createServer(app);
const indexer = new CatalogIndexer(CATALOG_PATH);
const orderManager = new OrderManager(ORDERS_PATH);
let watcher = null;
let diagnostics = null;
let wsServer = null;
let movieCreator = null;

// ─── Startup Sequence ────────────────────────────────────────────────────────

function initialize() {
  console.log('');
  console.log('  ╔════════════════════════════════════════╗');
  console.log('  ║      MovieCatalog Server v5.4.0      ║');
  console.log('  ╚════════════════════════════════════════╝');
  console.log('');

  // Step 1: Load cached catalog from disk
  console.log('  → Step 1: Loading cached catalog...');
  indexer.loadFromDisk();

  // Step 2: Scan library for new/changed files
  console.log('  → Step 2: Scanning library...');
  console.log(`             Path: ${LIBRARY_PATH}`);

  if (!fs.existsSync(LIBRARY_PATH)) {
    console.warn('');
    console.warn('  [WARN] Library folder not found!');
    console.warn(`         Expected: ${LIBRARY_PATH}`);
    console.warn('');
    console.warn('  Create it with genre subfolders:');
    console.warn('    Library/');
    console.warn('      Movies/');
    console.warn('        Action/');
    console.warn('          5273-Shelter 2026.jpg');
    console.warn('        Drama/');
    console.warn('          5273-Shelter 2026.jpg');
    console.warn('      TV Series/');
    console.warn('        Comedy/');
    console.warn('          1001-Friends S01E01 1994.jpg');
    console.warn('');
  }

  const { results: scanResults, stats: scanStats } = scanLibrary(LIBRARY_PATH);
  console.log(`             Found ${scanStats.imageFilesFound} image files, parsed ${scanStats.moviesParsed} movies`);

  // Step 3: Process scan results and update index
  console.log('  → Step 3: Building index...');
  indexer.replaceFromScan(scanResults);

  // Step 3b: Scan games
  console.log('  → Step 3b: Scanning games...');
  const { results: gameResults, stats: gameStats } = scanGames(LIBRARY_PATH);
  indexer.processGameResults(gameResults);
  console.log(`             Found ${gameStats.gamesParsed} games`);

  // Step 4: Save to disk
  console.log('  → Step 4: Saving catalog cache...');
  indexer.saveToDisk();

  // Step 5: Initialize diagnostics
  diagnostics = new Diagnostics(indexer, LIBRARY_PATH);

  // Step 6: Start filesystem watcher
  console.log('  → Step 5: Starting filesystem watcher...');
  watcher = new LibraryWatcher(LIBRARY_PATH, indexer, handleFileChange);
  watcher.start();

  // Step 7: Initialize WebSocket server
  console.log('  → Step 6: Starting WebSocket server...');
  wsServer = new WebSocketServer(httpServer, orderManager);

  // Step 8: Initialize Movie Creator
  console.log('  → Step 7: Initializing Movie Creator...');
  movieCreator = new MovieCreator(LIBRARY_PATH, CATALOG_PATH, indexer, wsServer);

  // Print summary
  console.log('');
  console.log(`  → Total movies: ${indexer.count}`);
  console.log(`  → Total games: ${indexer.getGames().length}`);
  console.log(`  → Total orders: ${orderManager.count}`);

  const typeCounts = {};
  for (const movie of indexer.getMovies()) {
    typeCounts[movie.type] = (typeCounts[movie.type] || 0) + 1;
  }
  const typeStr = Object.entries(typeCounts)
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');
  if (typeStr) console.log(`  → By type: ${typeStr}`);

  const allGenres = new Set();
  for (const movie of indexer.getMovies()) {
    for (const g of movie.genres) allGenres.add(g);
  }
  console.log(`  → Genres: ${allGenres.size} (${Array.from(allGenres).sort().join(', ')})`);

  console.log('');
}

/**
 * Handle real-time file changes from the watcher.
 * Saves the catalog to disk whenever the index changes.
 */
function handleFileChange(type, data) {
  // Debounce saves (save at most once per second)
  if (handleFileChange._saveTimer) clearTimeout(handleFileChange._saveTimer);
  handleFileChange._saveTimer = setTimeout(() => {
    indexer.saveToDisk();
  }, 1000);
}

// ─── API Routes ──────────────────────────────────────────────────────────────

// CORS middleware — allow frontend served from different port (e.g., Live Server)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.static(__dirname));

/**
 * GET /api/movies
 *
 * Returns the full movie catalog from the in-memory index.
 * No disk scanning on each request — served instantly.
 */
app.get('/api/movies', (req, res) => {
  const movies = indexer.getMovies();
  res.json({
    meta: {
      version: '3.0',
      lastUpdated: new Date().toISOString(),
      totalMovies: movies.length,
      source: 'api'
    },
    movies
  });
});

/**
 * GET /api/poster/:id
 *
 * Serves the poster image file for a given movie ID.
 */
app.get('/api/poster/:id', (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'Invalid movie ID' });

  const posterPath = indexer.getPosterPath(id);
  if (posterPath && fs.existsSync(posterPath)) {
    res.sendFile(posterPath);
  } else {
    res.status(404).json({ error: 'Poster not found' });
  }
});

/**
 * POST /api/rescan
 *
 * Force a complete library rescan.
 * Used by the refresh button in the UI.
 */
app.post('/api/rescan', (req, res) => {
  console.log('  [API] Full rescan requested');

  const { results, stats: scanStats } = scanLibrary(LIBRARY_PATH);
  indexer.replaceFromScan(results);
  indexer.saveToDisk();

  res.json({
    success: true,
    count: indexer.count,
    scanStats,
    lastUpdated: new Date().toISOString()
  });
});

/**
 * GET /api/diagnostics
 *
 * Returns a comprehensive diagnostics report for the administrator.
 */
app.get('/api/diagnostics', (req, res) => {
  if (!diagnostics) {
    return res.status(503).json({ error: 'Diagnostics not initialized' });
  }

  const report = diagnostics.runFullReport();
  res.json(report);
});

/**
 * GET /api/stats
 *
 * Returns quick catalog statistics.
 */
app.get('/api/stats', (req, res) => {
  const movies = indexer.getMovies();
  const genres = {};
  const types = {};
  const decades = {};

  for (const movie of movies) {
    // Genre counts
    for (const g of movie.genres) {
      genres[g] = (genres[g] || 0) + 1;
    }
    // Type counts
    types[movie.type] = (types[movie.type] || 0) + 1;
    // Decade counts
    if (movie.year) {
      const decade = `${Math.floor(movie.year / 10) * 10}s`;
      decades[decade] = (decades[decade] || 0) + 1;
    }
  }

  res.json({
    totalMovies: movies.length,
    genres,
    types,
    decades,
    yearRange: {
      min: movies.reduce((min, m) => m.year < min ? m.year : min, Infinity),
      max: movies.reduce((max, m) => m.year > max ? m.year : max, -Infinity)
    }
  });
});

/**
 * POST /api/auth/login
 *
 * Authenticate an admin user and return a session token.
 */
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password required' });
  }

  if (validateCredentials(username, password)) {
    const token = createSession(username);
    console.log(`  [AUTH] Admin logged in: ${username}`);
    res.json({ success: true, token });
  } else {
    console.log(`  [AUTH] Failed login attempt: ${username}`);
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

/**
 * POST /api/auth/logout
 *
 * Invalidate an admin session.
 */
app.post('/api/auth/logout', (req, res) => {
  const { token } = req.body;

  if (token) {
    invalidateSession(token);
    console.log('  [AUTH] Admin logged out');
  }

  res.json({ success: true });
});

/**
 * GET /api/orders
 *
 * Returns all saved orders.
 */
app.get('/api/orders', (req, res) => {
  const orders = orderManager.getOrders();
  res.json({
    success: true,
    orders
  });
});

/**
 * GET /api/orders/:id
 *
 * Returns a specific order by ID.
 */
app.get('/api/orders/:id', (req, res) => {
  const order = orderManager.getOrder(req.params.id);
  if (order) {
    res.json({ success: true, order });
  } else {
    res.status(404).json({ success: false, error: 'Order not found' });
  }
});

/**
 * PUT /api/movies/:id
 *
 * Update a movie's details (title, year, id, imdbRating, plotSummary).
 * Handles file renaming if ID, Title, or Year changed.
 * Returns updated movie object.
 */
app.put('/api/movies/:id', (req, res) => {
  try {
    const originalId = req.params.id;
    const { title, year, id: newId, imdbRating, plotSummary } = req.body;

    // Validate required fields
    if (!title || title.trim() === '') {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }
    if (newId === undefined || newId === null || newId === '') {
      return res.status(400).json({ success: false, error: 'Movie Code/ID is required' });
    }

    // Get existing movie
    const existingMovie = indexer.getMovieById(originalId);
    if (!existingMovie) {
      return res.status(404).json({ success: false, error: 'Movie not found' });
    }

    // Check if ID changed and if new ID already exists
    const idChanged = String(originalId) !== String(newId);
    if (idChanged) {
      const conflictMovie = indexer.getMovieById(String(newId));
      if (conflictMovie) {
        return res.status(409).json({
          success: false,
          error: `Movie with Code/ID ${newId} already exists`
        });
      }
    }

    // Determine if file rename is needed
    const needsRename = idChanged ||
      (existingMovie.title !== title) ||
      (existingMovie.year !== year);

    // Handle file renaming if needed
    if (needsRename && existingMovie.absolutePosterPath) {
      const oldPath = existingMovie.absolutePosterPath;

      // Validate that oldPath is a valid absolute path before proceeding
      if (path.isAbsolute(oldPath) && fs.existsSync(oldPath)) {
        const dir = path.dirname(oldPath);
        const ext = path.extname(oldPath);
        const newFilename = `${newId}-${title} ${year || ''}${ext}`.replace(/\s+/g, ' ').trim();
        const newPath = path.join(dir, newFilename);

        // If filename actually changed
        if (oldPath !== newPath) {
          // Check if destination already exists
          if (fs.existsSync(newPath)) {
            return res.status(409).json({
              success: false,
              error: `File already exists: ${newFilename}`
            });
          }

          try {
            fs.renameSync(oldPath, newPath);
            existingMovie.absolutePosterPath = newPath;
          } catch (err) {
            console.error(`  [API] Failed to rename file: ${err.message}`);
            return res.status(500).json({
              success: false,
              error: `Failed to rename poster file: ${err.message}`
            });
          }
        }
      }
    }

    // Update movie data in memory
    existingMovie.title = title;
    existingMovie.year = year || null;
    existingMovie.id = String(newId);
    existingMovie.imdbRating = imdbRating ? parseFloat(imdbRating) : null;
    existingMovie.plotSummary = plotSummary || null;

    // Update uid if ID changed
    if (idChanged) {
      existingMovie.uid = String(newId);
      // Update movie map: remove old key, add new key
      indexer._movieMap.delete(originalId);
      indexer._movieMap.set(existingMovie.id, existingMovie);
    }

    // Update poster URL
    existingMovie.poster = `/api/poster/${encodeURIComponent(existingMovie.id)}`;

    // Save to disk
    indexer.saveToDisk();

    // Broadcast update via WebSocket
    if (wsServer) {
      wsServer.broadcastMovieUpdate(existingMovie);
    }

    console.log(`  [API] Movie updated: ${existingMovie.id} - ${existingMovie.title}`);

    res.json({
      success: true,
      movie: existingMovie
    });
  } catch (err) {
    console.error(`  [API] PUT /api/movies/:id error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: `Server error: ${err.message}`
    });
  }
});

/**
 * POST /api/movies
 *
 * Create a new movie.
 * Expects JSON body with movie data and base64-encoded poster.
 *
 * Body:
 *   {
 *     title: string (required),
 *     type: "Movie" | "Animation" | "Iranian" | "Series" (required),
 *     year: number (required for Movie),
 *     genres: string[] (required for Movie),
 *     id: string (optional, auto-generated if not provided),
 *     imdbRating: number (optional),
 *     plotSummary: string (optional),
 *     poster: string (base64-encoded image, required)
 *   }
 */
app.post('/api/movies', async (req, res) => {
  try {
    if (!movieCreator) {
      return res.status(503).json({ success: false, error: 'Movie Creator not initialized' });
    }

    const { title, type, year, genres, id, imdbRating, plotSummary, poster } = req.body;

    // Validate poster is provided
    if (!poster) {
      return res.status(400).json({ success: false, error: 'تصویر پوستر الزامی است' });
    }

    // Decode base64 poster
    let posterBuffer;
    let posterExtension;
    try {
      // Handle data URL format: data:image/jpeg;base64,XXXXX
      const base64Data = poster.includes(',') ? poster.split(',')[1] : poster;
      posterBuffer = Buffer.from(base64Data, 'base64');

      // Extract extension from data URL or default to jpg
      if (poster.includes('data:image/')) {
        const match = poster.match(/data:image\/([^;]+)/);
        posterExtension = match ? match[1] : 'jpg';
      } else {
        posterExtension = 'jpg';
      }
    } catch (err) {
      return res.status(400).json({ success: false, error: 'فرمت تصویر نامعتبر است' });
    }

    // Create movie using the MovieCreator service
    const newMovie = await movieCreator.createMovie(
      { title, type, year, genres, id, imdbRating, plotSummary },
      posterBuffer,
      posterExtension
    );

    console.log(`  [API] Movie created: ${newMovie.id} - ${newMovie.title}`);

    res.json({
      success: true,
      movie: newMovie
    });
  } catch (err) {
    console.error(`  [API] POST /api/movies error: ${err.message}`);
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/movies/next-id
 *
 * Get the next available ID for a given movie type.
 * Query parameter: type (Movie, Animation, Iranian, Series)
 */
app.get('/api/movies/next-id', (req, res) => {
  try {
    const type = req.query.type;
    if (!type || !['Movie', 'Animation', 'Iranian', 'Series'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid type' });
    }

    // Series don't use IDs
    if (type === 'Series') {
      return res.json({ success: true, nextId: null });
    }

    const movies = indexer.getMovies();
    let maxId = 0;

    // Find highest ID for this type
    for (const movie of movies) {
      if (movie.type === type && movie.id) {
        const numId = parseInt(movie.id, 10);
        if (!isNaN(numId) && numId > maxId) {
          maxId = numId;
        }
      }
    }

    // Generate next ID based on type
    const nextNum = maxId + 1;
    let nextId;

    switch (type) {
      case 'Movie':
        nextId = String(nextNum).padStart(4, '0');
        break;
      case 'Animation':
        nextId = String(nextNum).padStart(5, '0');
        break;
      case 'Iranian':
        nextId = String(nextNum).padStart(4, '0');
        break;
      default:
        nextId = String(nextNum);
    }

    res.json({ success: true, nextId });
  } catch (err) {
    console.error(`  [API] GET /api/movies/next-id error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/games
 *
 * Returns the full games catalog.
 */
app.get('/api/games', (req, res) => {
  const games = indexer.getGames();
  res.json({
    meta: {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      totalGames: games.length,
      source: 'api'
    },
    games
  });
});

/**
 * GET /api/game-poster/:title
 *
 * Serves the poster image file for a given game title.
 */
app.get('/api/game-poster/:title', (req, res) => {
  const title = req.params.title;
  if (!title) return res.status(400).json({ error: 'Invalid game title' });

  const posterPath = indexer.getGamePosterPath(title);
  if (posterPath && fs.existsSync(posterPath)) {
    res.sendFile(posterPath);
  } else {
    res.status(404).json({ error: 'Game poster not found' });
  }
});

/**
 * POST /api/games/rescan
 *
 * Force a complete games rescan.
 */
app.post('/api/games/rescan', (req, res) => {
  console.log('  [API] Games rescan requested');

  const { results, stats: gameStats } = scanGames(LIBRARY_PATH);
  indexer.processGameResults(results);

  res.json({
    success: true,
    count: indexer.getGames().length,
    gameStats,
    lastUpdated: new Date().toISOString()
  });
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

process.on('SIGINT', () => {
  console.log('\n  [SERVER] Shutting down...');
  if (wsServer) wsServer.close();
  if (watcher) watcher.stop();
  indexer.saveToDisk();
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (wsServer) wsServer.close();
  if (watcher) watcher.stop();
  indexer.saveToDisk();
  process.exit(0);
});

// ─── Start ───────────────────────────────────────────────────────────────────

initialize();

httpServer.listen(PORT, () => {
  console.log(`  → Local: http://localhost:${PORT}`);
  console.log(`  → WebSocket: ws://localhost:${PORT}`);
  console.log('');
  console.log('  Ready. Add movies to Library/ and refresh the browser.');
  console.log('');
});

/**
 * Search Worker - Background indexing and search for fast performance
 * Runs off the main thread to keep UI responsive with 20,000+ movies
 */

let movieIndex = [];

self.onmessage = function(e) {
  const { type, movies, games, query } = e.data;

  if (type === 'index') {
    movieIndex = (Array.isArray(movies) ? movies : []).map(m => ({
      uid: m.uid,
      id: m.id, // Already a string (or null for Series)
      title: (m.title || '').toLowerCase(),
      year: m.year !== null ? String(m.year) : '',
      genres: Array.isArray(m.genres) ? m.genres.map(g => g.toLowerCase()).join(' ') : '',
      type: (m.type || 'movie').toLowerCase(),
      original: m
    }));

    // Index games alongside movies
    if (Array.isArray(games)) {
      for (const g of games) {
        movieIndex.push({
          uid: g.uid,
          id: null,
          title: (g.title || '').toLowerCase(),
          year: '',
          genres: '',
          type: 'game',
          platforms: Array.isArray(g.platforms) ? g.platforms.join(' ').toLowerCase() : '',
          original: g
        });
      }
    }
  }

  if (type === 'search') {
    const q = (query || '').toLowerCase().trim();
    let results;

    if (!q) {
      results = movieIndex.map(m => m.original);
    } else {
      results = movieIndex
        .filter(m =>
          (m.id !== null && m.id.includes(q)) ||
          m.title.includes(q) ||
          m.year.includes(q) ||
          m.genres.includes(q) ||
          m.type.includes(q) ||
          (m.platforms && m.platforms.includes(q))
        )
        .map(m => m.original);
    }

    self.postMessage({ type: 'results', movies: results });
  }
};

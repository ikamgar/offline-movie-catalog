# Offline Movie Catalog

A professional digital movie library manager with real-time collaboration, auto-scanning, indexing, and caching capabilities. Designed for managing large offline movie collections with a modern, responsive web interface.

## Features

- **Auto-Scanning** — Automatically detects and indexes movie files from the local library folder
- **Smart Parsing** — Extracts movie metadata (title, year, ID) from filenames
- **Real-Time Collaboration** — WebSocket-based synchronization for multi-user selection and ordering
- **Manager Dashboard** — Admin panel for managing catalog, orders, and movie data
- **Movie Creator** — Create and manage movie entries with poster generation
- **Genre Filtering** — Browse movies by genre with color-coded categories
- **Selection System** — Users can select and manage their movie picks
- **Order Management** — Track and manage movie orders
- **Keyboard Shortcuts** — Full keyboard navigation support
- **Responsive Design** — Works on desktop and mobile devices
- **Dark/Light Themes** — Toggle between theme modes
- **Persian UI** — Full RTL support for Persian language interface

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES6+), HTML5, CSS3 |
| Backend | Node.js, Express.js |
| Real-Time | WebSocket (ws) |
| File System | Node.js fs module |
| Build | None (zero-build vanilla JS) |

## Installation

### Prerequisites

- [Node.js](https://nodejs.org) (v14 or higher)
- npm (comes with Node.js)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/ikamgar/offline-movie-catalog.git
   cd offline-movie-catalog
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

Alternatively, on Windows, double-click `Start.bat` to launch the server directly.

## Usage

1. Run `Start.bat` or execute `npm start`
2. Open your browser and navigate to `http://localhost:3000`
3. Browse your movie catalog, filter by genre, and manage selections
4. Access the admin panel by clicking the login button (Manager access required)

## Library Folder

The application scans the `Library/` folder for movie files. Organize your movies into subfolders by category:

```
Library/
  Animation/       Animated movies
  Iranian/         Iranian films
  Movies/          General movies (organized by genre subfolders)
  Serries/         TV series
```

Movie files should follow the naming convention:
```
{ID}- {Title} {Year}.ext
```
For example: `tt1234567- Inception 2010.mp4`

> **Note:** The `Library/` folder and its contents are excluded from version control via `.gitignore` due to file size.

## Project Structure

```
offline-movie-catalog/
  backend/           Server-side logic (scanner, parser, indexer, watcher)
  css/               Stylesheets (main, components, mobile, themes)
  data/              Runtime data (catalog, orders, backups)
  js/                Frontend JavaScript
    components/      UI components (modals, sidebars, cards, grid)
    realtime/        WebSocket client and sync logic
    utils/           Helpers, sorting, lazy loading
    workers/         Web workers for background tasks
  server/            Server modules
    auth/            Authentication and role management
    orders/          Order management
    realtime/        WebSocket server and selection state
  server.js          Main entry point
  index.html         Application shell
```

## Version

Current version: **5.3.0**

See [Releases](https://github.com/ikamgar/offline-movie-catalog/releases) for changelog.

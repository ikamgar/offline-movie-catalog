/**
 * Selection State Module
 *
 * Manages the in-memory selection state on the server.
 * This is the single source of truth for the current customer selection.
 *
 * The state is NEVER written to disk.
 * On server restart, the selection is empty.
 *
 * Structure:
 *   {
 *     updatedAt: ISO string,
 *     movies: [{ uid, id, title, year, poster, type, genres }]
 *   }
 */

class SelectionState {
  constructor() {
    this._state = {
      updatedAt: null,
      movies: []
    };
  }

  /**
   * Get the current selection state.
   * @returns {{ updatedAt: string|null, movies: Array }}
   */
  get() {
    return this._state;
  }

  /**
   * Replace the entire selection state.
   * Called when the customer sends a selection:update.
   *
   * @param {Array} movies - Full movie objects from the customer
   */
  set(movies) {
    this._state = {
      updatedAt: new Date().toISOString(),
      movies: Array.isArray(movies) ? movies : []
    };
  }

  /**
   * Clear the selection state.
   */
  clear() {
    this._state = {
      updatedAt: new Date().toISOString(),
      movies: []
    };
  }

  /**
   * Get the number of currently selected movies.
   * @returns {number}
   */
  get count() {
    return this._state.movies.length;
  }
}

module.exports = SelectionState;

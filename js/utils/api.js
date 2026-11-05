/**
 * API utility — authenticated fetch wrapper for admin endpoints.
 *
 * Adds the Bearer token from the store, parses JSON safely,
 * and on 401 triggers store.logout + toast + login modal (FE-08).
 */

import { store, showToast } from '../store.js';

let _loginModal = null;

function _getLoginModal() {
  if (!_loginModal) {
    _loginModal = document.querySelector('login-modal');
  }
  return _loginModal;
}

/**
 * Fetch wrapper for admin API calls.
 *
 * @param {string} path - API path (e.g. '/api/rescan')
 * @param {RequestInit} [opts] - Extra fetch options (method, headers, body, ...)
 * @returns {Promise<Response>}
 */
export async function api(path, opts = {}) {
  const token = store.state.sessionToken;

  const headers = { ...opts.headers };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(path, { ...opts, headers });

  if (response.status === 401 && store.state.role === 'admin') {
    showToast('نشست شما منقضی شده است، دوباره وارد شوید', 'error');
    store.logout();
    const modal = _getLoginModal();
    if (modal) modal.show();
  }

  return response;
}

/**
 * Convenience: authenticated JSON POST.
 *
 * @param {string} path
 * @param {object} body - Will be JSON-serialised
 * @returns {Promise<object>} Parsed JSON body
 */
export async function apiPost(path, body) {
  const resp = await api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await resp.text();
  return text ? JSON.parse(text) : {};
}

/**
 * Convenience: authenticated JSON PUT.
 *
 * @param {string} path
 * @param {object} body
 * @returns {Promise<object>}
 */
export async function apiPut(path, body) {
  const resp = await api(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await resp.text();
  return text ? JSON.parse(text) : {};
}

/**
 * Convenience: authenticated GET returning parsed JSON.
 *
 * @param {string} path
 * @returns {Promise<object|null>}
 */
export async function apiGet(path) {
  const resp = await api(path);
  if (!resp.ok) return null;
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

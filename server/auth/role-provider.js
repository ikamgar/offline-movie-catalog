/**
 * Role Provider Module
 *
 * Determines the role of a WebSocket client based on the handshake request.
 * This is the ONLY module that knows how roles are determined.
 *
 * Current implementation: reads role from the initial "hello" message.
 * Future implementation: may use login, password, IP whitelist, API token,
 * Windows account, or any other authentication mechanism.
 *
 * Changing authentication later requires changing ONLY this module.
 * The WebSocket layer remains unchanged.
 */

const VALID_ROLES = new Set(['customer', 'manager']);

/**
 * Get the role for a new WebSocket connection.
 *
 * Currently, the role is determined by the client's "hello" message.
 * This function validates the role string.
 *
 * @param {string} role - The role string from the client's hello message
 * @returns {string|null} - The validated role, or null if invalid
 */
function getClientRole(role) {
  if (VALID_ROLES.has(role)) {
    return role;
  }
  return null;
}

/**
 * Validate that a role string is a known role.
 *
 * @param {string} role
 * @returns {boolean}
 */
function isValidRole(role) {
  return VALID_ROLES.has(role);
}

module.exports = { getClientRole, isValidRole, VALID_ROLES };

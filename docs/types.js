/**
 * docs/types.js — shared JSDoc type definitions (COMMENTS ONLY, no code).
 *
 * Nothing imports this file at runtime: editors and (optionally, STOP-GATE)
 * `tsc --noEmit --allowJs --checkJs` read the @typedefs from here.
 * Shapes mirror the code: CatalogIndexer.toPublicMovie/toPublicGame,
 * order-manager.createOrder/sanitizeMovie, backend/constants.js and the
 * WebSocket messages documented in docs/ARCHITECTURE.md (protocol 3).
 */

/**
 * Catalog type of a movie poster, from the top-level folder (Invariant I3).
 * @typedef {'Movie'|'Series'|'Animation'|'Iranian'} MovieType
 */

/**
 * Every media type the app knows (backend/constants.MEDIA_TYPES).
 * Games run their own pipeline.
 * @typedef {'Movie'|'Series'|'Animation'|'Iranian'|'Game'} MediaType
 */

/**
 * PlayStation platform of a game poster folder.
 * @typedef {'PS4'|'PS5'} GamePlatform
 */

/**
 * Public movie object (CatalogIndexer.toPublicMovie — SEC-08 safe).
 * Series carry `id: null` and take their identity from `uid`
 * (`series:<normalised title>`); movies/animations/iranian carry the
 * string ID (leading zeros meaningful) as uid.
 * @typedef {object} Movie
 * @property {string} uid - selection/order identity (I6)
 * @property {string|null} id - up to 6 digits; null for Series
 * @property {string} title
 * @property {number|null} year - Movies only; null elsewhere
 * @property {string[]} genres
 * @property {MovieType} type
 * @property {string|null} poster - poster URL (`/api/poster/:key`)
 * @property {number|null} imdbRating - manager-entered (DATA-10)
 * @property {string|null} plotSummary - manager-entered (DATA-10)
 */

/**
 * Public game object (CatalogIndexer.toPublicGame).
 * @typedef {object} Game
 * @property {string} uid - `game:<normalised title>` (I6)
 * @property {string} title
 * @property {GamePlatform[]} platforms - merged across PS4/ and PS5/ (I8)
 * @property {'Game'} type
 * @property {string} poster - poster URL (`/api/game-poster/:title`)
 */

/**
 * Snapshot of one item inside an order (order-manager.sanitizeMovie):
 * the fields copied so an order survives later catalog edits.
 * @typedef {object} OrderMovie
 * @property {string} uid
 * @property {string} id - '' when the source had no id (Series/Games)
 * @property {string} title
 * @property {number|null} year
 * @property {string} type - MediaType as string
 * @property {string} poster
 * @property {string[]} genres
 */

/**
 * Order workflow status (P6d E5).
 * @typedef {'new'|'preparing'|'done'} OrderStatus
 */

/**
 * Persisted order (data/orders.json, order-manager).
 * @typedef {object} Order
 * @property {string} id - generated order id
 * @property {number} number - monotonically increasing per orders file
 * @property {string} createdAt - ISO timestamp
 * @property {string} createdBy - admin username at creation time
 * @property {OrderStatus} status
 * @property {string} customerName - <= 200 chars, may be ''
 * @property {string} note - <= 200 chars, may be ''
 * @property {string} updatedAt - ISO timestamp; legacy orders fall back to createdAt
 * @property {OrderMovie[]} movies
 */

/**
 * Error body returned by failing REST routes.
 * @typedef {object} ApiError
 * @property {boolean} [success] - present on write endpoints (false)
 * @property {string} error - user-facing (Persian) message
 * @property {string} [code] - stable machine code (e.g. 'TYPE_INVALID')
 */

/**
 * Payload of `GET /api/config` (backend/constants.publicConfig) — the one
 * runtime config the front end fetches once in store.boot().
 * @typedef {object} AppConfig
 * @property {string} version - package.json version
 * @property {MediaType[]} mediaTypes
 * @property {Record<string,string>} typeLabels - Persian type labels
 * @property {Record<string,string>} badgeLabels - Persian badge wording (I12)
 * @property {string[]} pinnedGenres - genres pinned first, in order (I11)
 * @property {string[]} imageExtensions - accepted poster extensions (I4)
 * @property {number} protocol - WebSocket protocol version
 */

/* ─── WebSocket messages (docs/ARCHITECTURE.md, JSON {type, payload}, protocol 3) ─── */

/**
 * Every WS frame is `{type, payload}`; `payload` may be omitted.
 * @typedef {object} WsMessage
 * @property {string} type
 * @property {object} [payload]
 */

/**
 * Client → Server, first frame within 10 s.
 * @typedef {object} WsHelloMessage
 * @property {'hello'} type
 * @property {{role: 'customer'|'manager', token?: string}} payload
 */

/**
 * Server → Client, handshake accepted (roles: customer|manager).
 * @typedef {object} WsHelloAckMessage
 * @property {'hello:ack'} type
 * @property {{role: 'customer'|'manager', username: string|null, protocol: number, bootId: string}} payload
 */

/**
 * Customer → Server: replace the shared selection (I9/D1).
 * @typedef {object} WsSelectionUpdateMessage
 * @property {'selection:update'} type
 * @property {{movies: (Movie|Game)[]}} payload
 */

/**
 * Server → All: the single shared selection state.
 * @typedef {object} WsSelectionStateMessage
 * @property {'selection:state'} type
 * @property {{movies: (Movie|Game)[], updatedAt?: string}} payload
 */

/**
 * Manager → Server: confirm the current shared selection — broadcasts
 * `selection:saved` to all, then clears the selection (I9/D1).
 * @typedef {object} WsSelectionSaveMessage
 * @property {'selection:save'} type
 * @property {{}} payload
 */

/**
 * Manager → Server: clear the shared selection — broadcasts
 * `selection:cleared` to all, then clears.
 * @typedef {object} WsSelectionClearMessage
 * @property {'selection:clear'} type
 * @property {{}} payload
 */

/**
 * Server → All: the selection was saved as collected (sent immediately
 * before the follow-up `selection:cleared`).
 * @typedef {object} WsSelectionSavedMessage
 * @property {'selection:saved'} type
 * @property {{timestamp: string, count: number}} payload
 */

/**
 * Server → All: the shared selection is now empty.
 * @typedef {object} WsSelectionClearedMessage
 * @property {'selection:cleared'} type
 * @property {{timestamp: string}} payload
 */

/**
 * Manager → Server: persist the current selection as an order.
 * @typedef {object} WsOrdersSaveMessage
 * @property {'orders:save'} type
 * @property {{movies: (Movie|Game)[]}} payload
 */

/**
 * Manager → Server: soft-delete an order (undo window starts).
 * @typedef {object} WsOrdersDeleteMessage
 * @property {'orders:delete'} type
 * @property {{orderId: string}} payload
 */

/**
 * Manager → Server: change an order's workflow status.
 * @typedef {object} WsOrdersUpdateStatusMessage
 * @property {'orders:update-status'} type
 * @property {{orderId: string, status: OrderStatus}} payload
 */

/**
 * Manager → Server: edit customer name / note.
 * @typedef {object} WsOrdersEditMessage
 * @property {'orders:edit'} type
 * @property {{orderId: string, customerName?: string, note?: string}} payload
 */

/**
 * Manager → Server: restore a just-deleted order inside the 10 s undo
 * window (the restored order keeps its number).
 * @typedef {object} WsOrdersUndoMessage
 * @property {'orders:undo'} type
 * @property {{orderId: string}} payload
 */

/**
 * Server → one manager: full order list.
 * @typedef {object} WsOrdersListMessage
 * @property {'orders:list'} type
 * @property {{orders: Order[]}} payload
 */

/**
 * Server → all managers: full order list after a mutation.
 * @typedef {object} WsOrdersUpdateMessage
 * @property {'orders:update'} type
 * @property {{orders: Order[]}} payload
 */

/**
 * Server → the requesting manager: order created (`orders:save`).
 * @typedef {object} WsOrdersSavedMessage
 * @property {'orders:saved'} type
 * @property {{order: Order}} payload
 */

/**
 * Server → the requesting manager: order soft-deleted (`orders:delete`).
 * @typedef {object} WsOrdersDeletedMessage
 * @property {'orders:deleted'} type
 * @property {{orderId: string}} payload
 */

/**
 * Server → the requesting manager: deleted order restored
 * (`orders:undo`, same number).
 * @typedef {object} WsOrdersRestoredMessage
 * @property {'orders:restored'} type
 * @property {{order: Order}} payload
 */

/**
 * Server → all: movie edited (movie:updated) or added (movie:added).
 * @typedef {object} WsMovieChangedMessage
 * @property {'movie:updated'|'movie:added'} type
 * @property {{movie: Movie|Game}} payload
 */

/**
 * Server → all: catalog reconciliation summary (B6 / DATA-02);
 * additive — clients ignoring it stay valid.
 * @typedef {object} WsCatalogChangedMessage
 * @property {'catalog:changed'} type
 * @property {{added: number, updated: number, removed: number}} payload
 */

/**
 * Any error/notice frame that carries only a human-readable message.
 * @typedef {object} WsMessageError
 * @property {'error'|'hello:error'|'selection:error'|'orders:error'} type
 * @property {{message: string}} payload
 */

/**
 * Application-level echo request (server replies with `pong`).
 * Liveness itself uses WebSocket protocol-level ping/pong (S9).
 * @typedef {object} WsPingMessage
 * @property {'ping'} type
 * @property {{}} [payload]
 */

/**
 * Server → sender: reply to an application-level `ping`.
 * @typedef {object} WsPongMessage
 * @property {'pong'} type
 * @property {{}} payload
 */

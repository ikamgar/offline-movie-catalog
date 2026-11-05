/**
 * Order CSV export builder (P6d E5).
 *
 * Excel shows UTF-8 correctly only when the file starts with the BOM,
 * so every export is prefixed with U+FEFF. Columns (fixed contract):
 * order,date,status,name,id,title,year,type — one row per movie.
 */

const CSV_HEADER = 'order,date,status,name,id,title,year,type';

/**
 * Quote a single cell when it contains separators/quotes/newlines,
 * and neutralize formula characters (=, +, -, @, \t, \r) with a leading
 * single quote (F42, CWE-1236).
 * @param {*} value
 * @returns {string}
 */
function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Build a UTF-8-BOM CSV string for the given orders.
 * @param {Array<object>} orders
 * @returns {string} BOM + header + one row per movie (CRLF separated)
 */
function buildOrdersCsv(orders) {
  const lines = [CSV_HEADER];
  for (const order of orders || []) {
    const base = [
      order.number,
      order.createdAt || '',
      order.status || '',
      order.customerName || ''
    ];
    for (const movie of order.movies || []) {
      lines.push([
        ...base,
        movie.id == null ? '' : movie.id,
        movie.title == null ? '' : movie.title,
        movie.year == null ? '' : movie.year,
        movie.type == null ? '' : movie.type
      ].map(csvCell).join(','));
    }
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

export { buildOrdersCsv, CSV_HEADER, csvCell };

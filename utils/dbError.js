const path = require('path');

/**
 * Distinguishes remote database connectivity / network failures from real application bugs.
 * @param {Error} error
 * @returns {boolean}
 */
function isDbConnectivityError(error) {
  if (!error) return false;
  const connectivityCodes = [
    'ENOTFOUND',
    'EAI_AGAIN',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'PROTOCOL_CONNECTION_LOST',
    'HANDSHAKE_TIMEOUT',
    'ER_CON_COUNT_ERROR',
    'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR'
  ];

  if (error.code && connectivityCodes.includes(error.code)) return true;
  if (typeof error.code === 'string' && error.code.startsWith('ETIMEDOUT')) return true;

  const msg = String(error.message || '').toLowerCase();
  return (
    msg.includes('enotfound') ||
    msg.includes('eai_again') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('connection lost') ||
    msg.includes('getaddrinfo') ||
    msg.includes('network error') ||
    msg.includes('db timeout') ||
    msg.includes('closed state')
  );
}

function isLocalhostReq(req) {
  const host = (req && req.headers && req.headers.host) || (req && req.hostname) || '';
  return host.includes('localhost') || host.includes('127.0.0.1') || host.includes('[::1]');
}

/**
 * Handles errors cleanly:
 * - If failure is due to remote database/network unavailability during an HTML navigation GET request,
 *   serves a clean Evacwar-styled inline response with status 503 without redirecting to a full-screen offline page.
 * - If failure is a genuine code/programming error, logs the stack trace and responds with 500.
 */
function handleControllerError(error, req, res, fallbackMessage = "Server Error") {
  if (isDbConnectivityError(error)) {
    // Serve clean inline response for GET HTML page navigation without full-screen offline page
    if (req.method === 'GET' && (req.accepts('html') || req.headers['sec-fetch-dest'] === 'document')) {
      res.status(503);
      res.set('Retry-After', '5');
      return res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Service Notice · Evacwar</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; min-height: 100dvh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 1.5rem; text-align: center; box-sizing: border-box; }
    .card { max-width: 26rem; width: 100%; background: #1e293b; border-radius: 1.25rem; border: 1px solid #334155; padding: 2rem 1.5rem; box-shadow: 0 12px 30px rgba(0,0,0,0.35); }
    .badge { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.85rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); margin-bottom: 1.25rem; }
    h1 { font-size: 1.1rem; font-weight: 800; margin: 0 0 0.5rem; color: #ffffff; line-height: 1.35; }
    p { font-size: 0.825rem; color: #94a3b8; margin: 0 0 1.5rem; line-height: 1.45; }
    .btn { display: inline-flex; justify-content: center; align-items: center; width: 100%; padding: 0.75rem 1rem; border-radius: 0.75rem; font-weight: 700; font-size: 0.85rem; text-decoration: none; cursor: pointer; border: none; box-sizing: border-box; }
    .btn-primary { background: #2563eb; color: #ffffff; margin-bottom: 0.5rem; }
    .btn-secondary { background: #334155; color: #e2e8f0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <span style="width:8px; height:8px; border-radius:50%; background:#f59e0b; display:inline-block;"></span>
      Reconnecting
    </div>
    <h1>Live Services Temporarily Unavailable</h1>
    <p>Database connection is currently reconnecting. You can return to your previous page or retry now.</p>
    <button type="button" class="btn btn-primary" onclick="window.history.back()">Go to Previous Page</button>
    <button type="button" class="btn btn-secondary" onclick="window.location.reload()">Retry Now</button>
  </div>
</body>
</html>`);
    }

    // API or POST request: return structured 503 JSON
    return res.status(503).json({
      success: false,
      error: 'DATABASE_UNAVAILABLE',
      message: 'Database connection is currently unavailable. Please check your internet connection.'
    });
  }

  // Real programming/application error: preserve 500 Server Error behavior
  console.error(`[Application Error] ${fallbackMessage}:`, error);
  if (!res.headersSent) {
    return res.status(500).send("Server Error");
  }
}

module.exports = {
  isDbConnectivityError,
  handleControllerError
};

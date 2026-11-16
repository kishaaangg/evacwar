const crypto = require('crypto');
const fs = require('fs');
const upload = require('../utils/upload');

/**
 * Robust, lightweight CSRF Protection Middleware for Evacwar.
 * - Generates cryptographically secure per-session CSRF tokens.
 * - Injects `res.locals.csrfToken` into all EJS views.
 * - Sets a non-httpOnly `XSRF-TOKEN` cookie for AJAX/fetch clients.
 * - Validates mutating requests (POST, PUT, DELETE, PATCH).
 * - Transparently handles multipart/form-data form submissions (e.g. resident/staff photo edits).
 * - Exempts critical emergency endpoints (SOS alerts), Socket.IO polling,
 *   web push subscriptions, and offline synchronizations.
 */

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Routes that must never be blocked by CSRF for life-safety, offline sync, or authentication transitions
const CSRF_EXEMPT_PREFIXES = [
  '/socket.io',
  '/api/sos',
  '/api/lora',
  '/api/mobile',
  '/resident-mobile',
  '/api/offline',
  '/staff/offline',
  '/staff/qr',
  '/staff/walkin',
  '/api/push',
  '/login',
  '/register',
  '/logout'
];

function isExempt(req) {
  const url = (req.originalUrl || req.url || '').split('?')[0];
  return CSRF_EXEMPT_PREFIXES.some(prefix => url.startsWith(prefix));
}

function extractSubmittedToken(req) {
  return (
    (req.body && (req.body._csrf || req.body.csrfToken || req.body.csrf_token)) ||
    (req.query && (req.query._csrf || req.query.csrfToken || req.query.csrf_token)) ||
    req.headers['x-csrf-token'] ||
    req.headers['x-xsrf-token'] ||
    req.headers['csrf-token']
  );
}

function csrfMiddleware(req, res, next) {
  // Ensure session is available
  if (!req.session) {
    return next();
  }

  // Initialize or retrieve session CSRF token
  if (!req.session._csrfToken) {
    req.session._csrfToken = generateToken();
  }
  const sessionToken = req.session._csrfToken;

  // Expose to template engine
  res.locals.csrfToken = sessionToken;

  // Set XSRF-TOKEN cookie for client-side fetch / AJAX operations
  res.cookie('XSRF-TOKEN', sessionToken, {
    path: '/',
    sameSite: 'lax',
    secure: Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === 'true'),
    httpOnly: false // Must be accessible to JavaScript fetch/axios
  });

  // Non-mutating methods are inherently CSRF-safe
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Check route exemptions (SOS emergency distress signals, offline sync, socket.io)
  if (isExempt(req)) {
    return next();
  }

  // Helper to validate current submitted token
  const validateToken = () => {
    const submittedToken = extractSubmittedToken(req);
    return Boolean(submittedToken && safeCompare(submittedToken, sessionToken));
  };

  // Helper to reject request with 403 Forbidden and clean up unvalidated files
  const sendCsrfError = () => {
    // Purge any uploaded files from disk if CSRF verification fails
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }
    if (req.files) {
      const fileList = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
      fileList.forEach(f => {
        if (f && f.path) fs.unlink(f.path, () => {});
      });
    }

    console.warn(`[CSRF Warning] Invalid or missing CSRF token on ${req.method} ${req.originalUrl} from IP ${req.ip}`);

    const isJson = req.xhr ||
      (req.headers.accept && req.headers.accept.includes('application/json')) ||
      (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) ||
      (req.originalUrl && req.originalUrl.startsWith('/api/'));

    if (isJson) {
      return res.status(403).json({
        success: false,
        error: 'CSRF_INVALID',
        message: 'Invalid or missing CSRF security token. Please reload the page and try again.'
      });
    }

    return res.status(403).send(
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>403 Security Notice</title>' +
      '<style>body{font-family:sans-serif;background:#0f172a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;text-align:center;}' +
      '.card{background:#1e293b;padding:2rem;border-radius:1rem;max-width:400px;border:1px solid #334155;}' +
      'button{background:#2563eb;color:#fff;border:none;padding:0.75rem 1.5rem;border-radius:0.5rem;cursor:pointer;margin-top:1rem;font-weight:bold;}' +
      '</style></head><body><div class="card">' +
      '<h2>Action Expired or Invalid</h2>' +
      '<p>Security validation (CSRF) failed. Please refresh the page and try submitting again.</p>' +
      '<button onclick="window.history.back()">Go Back</button>' +
      '</div></body></html>'
    );
  };

  // Check if token is already valid (e.g. from urlencoded body, headers, or query)
  if (validateToken()) {
    return next();
  }

  // If this is a multipart request and token wasn't in headers/query, parse multipart body
  // so that req.body._csrf is accessible before CSRF evaluation
  const isMultipart = Boolean(req.is('multipart/form-data'));
  if (isMultipart && !req._multerParsed) {
    return upload.any()(req, res, (err) => {
      if (err) {
        console.error('[CSRF Multer Error]:', err.message);
        return res.status(400).send('File upload parsing error: ' + err.message);
      }
      // Populate req.file alias if single file was uploaded (e.g. profile_photo)
      if (req.files && req.files.length > 0 && !req.file) {
        req.file = req.files.find(f => f.fieldname === 'profile_photo') || req.files[0];
      }
      if (validateToken()) {
        return next();
      }
      return sendCsrfError();
    });
  }

  return sendCsrfError();
}

module.exports = csrfMiddleware;


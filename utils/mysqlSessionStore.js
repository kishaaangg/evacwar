const session = require('express-session');
const pool = require('../config/db');

/**
 * Lightweight, resilient MySQL Session Store for Express-Session.
 * Persists user sessions across server reboots, dyno recycles, and browser restarts.
 * Features automatic table creation, rolling touch updates, expired session purging,
 * and seamless fallback to an in-memory store if MySQL is temporarily unreachable.
 */
class MySQLSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.pool = options.pool || pool;
    this.tableName = options.tableName || 'sessions';
    this.fallbackStore = new session.MemoryStore();
    this.useFallback = false;
    this.cleanupInterval = options.cleanupInterval || 1000 * 60 * 60; // Hourly cleanup
    this.defaultMaxAge = options.defaultMaxAge || 30 * 24 * 60 * 60 * 1000; // 30 days default

    // In-Memory L1 Cache to eliminate remote MySQL latency on active sessions
    this.cache = new Map(); // sid -> { data: object, expires: number, lastDbTouch: number }
    this.dbTouchThrottle = 15 * 60 * 1000; // Only write rolling expiration to MySQL once every 15 minutes
    this.tableInitialized = false;

    this.initTable();
    this.startCleanup();
  }

  /**
   * Ensure sessions table exists in the database.
   */
  async initTable() {
    if (this.tableInitialized) return;
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS \`${this.tableName}\` (
        \`sid\` VARCHAR(128) NOT NULL,
        \`session_data\` MEDIUMTEXT NOT NULL,
        \`expires\` BIGINT NOT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`sid\`),
        INDEX \`idx_sessions_expires\` (\`expires\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    try {
      await this.pool.query(createTableQuery);
      this.tableInitialized = true;
      this.useFallback = false;
    } catch (err) {
      console.warn('[SessionStore Warning]: Could not initialize MySQL session table; using memory fallback:', err.message);
      this.useFallback = true;
    }
  }

  /**
   * Start periodic cleanup of expired sessions.
   */
  startCleanup() {
    const timer = setInterval(async () => {
      const now = Date.now();

      // Clean expired in-memory cache entries
      for (const [sid, entry] of this.cache.entries()) {
        if (entry.expires < now) {
          this.cache.delete(sid);
        }
      }

      if (this.useFallback) return;
      try {
        await this.pool.query(`DELETE FROM \`${this.tableName}\` WHERE \`expires\` < ?`, [now]);
      } catch (err) {
        // Suppress transient cleanup errors
      }
    }, this.cleanupInterval);

    if (timer.unref) {
      timer.unref();
    }
  }

  /**
   * Retrieve session by session ID (sid).
   * Fast L1 in-memory cache hit returns in <1ms without WAN DB roundtrip.
   */
  get(sid, callback) {
    const cb = typeof callback === 'function' ? callback : () => {};

    const now = Date.now();
    const cached = this.cache.get(sid);
    if (cached) {
      if (cached.expires < now) {
        this.cache.delete(sid);
        this.destroy(sid, () => {});
        return cb(null, null);
      }
      try {
        // Return cloned object to prevent accidental mutation of cache entry
        return cb(null, JSON.parse(JSON.stringify(cached.data)));
      } catch (_e) {
        // Fall through to DB query on clone failure
      }
    }

    if (this.useFallback) {
      return this.fallbackStore.get(sid, cb);
    }

    const query = `SELECT \`session_data\`, \`expires\` FROM \`${this.tableName}\` WHERE \`sid\` = ? LIMIT 1`;
    this.pool.query(query, [sid])
      .then(([rows]) => {
        if (!rows || rows.length === 0) {
          return cb(null, null);
        }

        const row = rows[0];
        const rowExpires = Number(row.expires);
        if (rowExpires < now) {
          // Session expired: purge and return null
          this.destroy(sid, () => {});
          return cb(null, null);
        }

        let sess;
        try {
          sess = JSON.parse(row.session_data);
        } catch (parseErr) {
          console.error('[SessionStore Error]: Failed to parse session JSON:', parseErr.message);
          return cb(null, null);
        }

        // Populate L1 cache for subsequent fast reads
        this.cache.set(sid, {
          data: sess,
          expires: rowExpires,
          lastDbTouch: now
        });

        return cb(null, sess);
      })
      .catch((err) => {
        console.warn('[SessionStore get Warning]: Falling back to MemoryStore on error:', err.message);
        this.fallbackStore.get(sid, cb);
      });
  }

  /**
   * Save session data for session ID (sid).
   * Updates L1 memory cache immediately and persists to MySQL.
   */
  set(sid, sessionData, callback) {
    const cb = typeof callback === 'function' ? callback : () => {};

    let expires;
    if (sessionData && sessionData.cookie && sessionData.cookie.expires) {
      expires = new Date(sessionData.cookie.expires).getTime();
    } else if (sessionData && sessionData.cookie && sessionData.cookie.maxAge) {
      expires = Date.now() + sessionData.cookie.maxAge;
    } else {
      expires = Date.now() + this.defaultMaxAge;
    }

    // Immediately cache in L1 memory for immediate availability
    this.cache.set(sid, {
      data: sessionData,
      expires,
      lastDbTouch: Date.now()
    });

    if (this.useFallback) {
      return this.fallbackStore.set(sid, sessionData, cb);
    }

    let dataStr;
    try {
      dataStr = JSON.stringify(sessionData);
    } catch (err) {
      return cb(err);
    }

    const query = `
      INSERT INTO \`${this.tableName}\` (\`sid\`, \`session_data\`, \`expires\`)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE \`session_data\` = VALUES(\`session_data\`), \`expires\` = VALUES(\`expires\`)
    `;

    this.pool.query(query, [sid, dataStr, expires])
      .then(() => {
        // Keep fallback store updated
        this.fallbackStore.set(sid, sessionData, () => {});
        cb(null);
      })
      .catch((err) => {
        console.warn('[SessionStore set Warning]: MySQL write failed, falling back to MemoryStore:', err.message);
        this.fallbackStore.set(sid, sessionData, cb);
      });
  }

  /**
   * Destroy session for session ID (sid).
   */
  destroy(sid, callback) {
    const cb = typeof callback === 'function' ? callback : () => {};
    this.cache.delete(sid);
    this.fallbackStore.destroy(sid, () => {});

    if (this.useFallback) {
      return cb(null);
    }

    const query = `DELETE FROM \`${this.tableName}\` WHERE \`sid\` = ?`;
    this.pool.query(query, [sid])
      .then(() => cb(null))
      .catch((err) => {
        console.warn('[SessionStore destroy Warning]:', err.message);
        cb(null);
      });
  }

  /**
   * Reset session expiration for active session (rolling session support).
   * Updates L1 cache and throttles MySQL writes to once every 15 minutes.
   */
  touch(sid, sessionData, callback) {
    const cb = typeof callback === 'function' ? callback : () => {};

    let expires;
    if (sessionData && sessionData.cookie && sessionData.cookie.expires) {
      expires = new Date(sessionData.cookie.expires).getTime();
    } else if (sessionData && sessionData.cookie && sessionData.cookie.maxAge) {
      expires = Date.now() + sessionData.cookie.maxAge;
    } else {
      expires = Date.now() + this.defaultMaxAge;
    }

    const now = Date.now();
    const cached = this.cache.get(sid);
    if (cached) {
      cached.expires = expires;
      if (sessionData) cached.data = sessionData;
      // If touched recently in MySQL, skip remote DB write entirely
      if (cached.lastDbTouch && (now - cached.lastDbTouch < this.dbTouchThrottle)) {
        this.fallbackStore.touch(sid, sessionData, () => {});
        return cb(null);
      }
      cached.lastDbTouch = now;
    } else {
      this.cache.set(sid, {
        data: sessionData,
        expires,
        lastDbTouch: now
      });
    }

    this.fallbackStore.touch(sid, sessionData, () => {});

    if (this.useFallback) {
      return cb(null);
    }

    const query = `UPDATE \`${this.tableName}\` SET \`expires\` = ? WHERE \`sid\` = ?`;
    this.pool.query(query, [expires, sid])
      .then(() => cb(null))
      .catch((err) => {
        console.warn('[SessionStore touch Warning]:', err.message);
        cb(null);
      });
  }
}

module.exports = MySQLSessionStore;

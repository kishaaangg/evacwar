const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
// Ensure environment variables are loaded
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
} else {
    require('dotenv').config();
}

// Clean string values from env (stripping surrounding quotes and trimming whitespace)
const cleanEnvStr = (val) => {
    if (val === undefined || val === null) return '';
    const str = String(val).trim();
    if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
        return str.slice(1, -1).trim();
    }
    return str;
};

// Clean password while preserving special characters
const cleanEnvPassword = (val) => {
    if (val === undefined || val === null) return '';
    const str = String(val);
    if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
        return str.slice(1, -1);
    }
    return str;
};

const dbHost = cleanEnvStr(process.env.DB_HOST) || '127.0.0.1';
const dbPort = Number(cleanEnvStr(process.env.DB_PORT)) || 3306;
const dbUser = cleanEnvStr(process.env.DB_USER) || 'root';
const dbPassword = cleanEnvPassword(process.env.DB_PASSWORD);
const dbName = cleanEnvStr(process.env.DB_NAME) || 'evac_system';

// Detect whether connection targets Aiven Cloud
const isAiven = dbHost.toLowerCase().includes('aivencloud.com');

// Configure SSL strictly for Aiven Cloud; omit SSL entirely for Hostinger / local MySQL
let sslConfig = null;
if (isAiven) {
    const caPath = process.env.DB_SSL_CA_PATH || path.join(__dirname, '..', 'ca.pem');
    let caCert = process.env.DB_SSL_CA;

    if (!caCert && fs.existsSync(caPath)) {
        try {
            caCert = fs.readFileSync(caPath, 'utf8');
        } catch (err) {
            console.warn('[DB Config Warning]: Could not read Aiven CA certificate:', err.message);
        }
    }

    if (caCert) {
        sslConfig = {
            ca: caCert,
            rejectUnauthorized: true
        };
    } else {
        sslConfig = {
            rejectUnauthorized: false
        };
    }
}

const poolConfig = {
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 30,
    maxIdle: Number(process.env.DB_CONNECTION_LIMIT) || 30, // Retain all warm connections to avoid exhausting hourly handshakes
    idleTimeout: 300000, // Keep idle connections alive for 5 minutes
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 20000,
    timezone: 'Z'
};

// Support optional UNIX socket path if specified in Hostinger/Linux environment
if (process.env.DB_SOCKET_PATH) {
    poolConfig.socketPath = cleanEnvStr(process.env.DB_SOCKET_PATH);
}

// Only attach SSL configuration when connecting to Aiven
if (isAiven && sslConfig) {
    poolConfig.ssl = sslConfig;
}

const pool = mysql.createPool(poolConfig);

// Ensure every database connection explicitly operates in UTC to align with ISO-8601 / timezone: 'Z'
pool.on('connection', (connection) => {
    connection.query("SET time_zone = '+00:00'", (err) => {
        if (err) {
            console.warn('[DB Timezone Warning]: Could not set connection time_zone to +00:00:', err.message);
        }
    });
});

// Prevent unhandled error crashes from idle connection drops
pool.on('error', (err) => {
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET' || err.code === 'EPIPE') {
        // Stale connection discarded automatically by pool
        return;
    }
    console.warn('[DB Pool Warning]:', err.message || err);
});

// Helper for backoff delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Automatic retry wrapper for transient network disconnects and DNS glitches on remote databases
const isTransientError = (err) => {
    if (!err) return false;
    const code = err.code || '';
    const message = err.message || '';
    // Fail immediately if machine is offline (DNS ENOTFOUND) so offline LoRa fallback runs in 0ms!
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || message.includes('ENOTFOUND')) {
        return false;
    }
    return code === 'ECONNRESET' ||
        code === 'PROTOCOL_CONNECTION_LOST' ||
        code === 'EPIPE' ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNREFUSED' ||
        code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR' ||
        message.includes('ETIMEDOUT') ||
        message.includes('ECONNRESET');
};

const executeWithRetry = async (fn, args, maxRetries = 3) => {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn(...args);
        } catch (err) {
            lastErr = err;
            if (isTransientError(err) && attempt < maxRetries) {
                const delay = (attempt + 1) * 500;
                console.warn(`[DB Transient ${err.code || 'Error'}]: Retrying query (attempt ${attempt + 1}/${maxRetries}) in ${delay}ms...`);
                await sleep(delay);
                continue;
            }
            throw err;
        }
    }
    throw lastErr;
};

const originalExecute = pool.execute.bind(pool);
pool.execute = async function (...args) {
    return await executeWithRetry(originalExecute, args);
};

const originalQuery = pool.query.bind(pool);
pool.query = async function (...args) {
    return await executeWithRetry(originalQuery, args);
};

// Pre-warm database connection pool on startup to eliminate cold-request latency spikes
pool.prewarmPool = async function (count = 10) {
    try {
        const warmupPromises = Array.from({ length: count }, async () => {
            const conn = await pool.getConnection();
            try {
                await conn.ping();
            } finally {
                conn.release();
            }
        });
        await Promise.all(warmupPromises);
        console.log(`[DB Pool]: Successfully pre-warmed ${count} active database connections.`);
    } catch (err) {
        console.warn('[DB Pool Warning]: Pool pre-warm partial or failed:', err.message || err);
    }
};

module.exports = pool;
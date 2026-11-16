const db = require('../config/db');

let schemaChecked = false;
let schemaCheckPromise = null;
async function ensureAlertsSchema() {
  if (schemaChecked) return;
  if (schemaCheckPromise) return schemaCheckPromise;

  schemaCheckPromise = (async () => {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS alerts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sender_id INT,
          title VARCHAR(150) NOT NULL,
          message TEXT NOT NULL,
          severity VARCHAR(50) NOT NULL DEFAULT 'BLUE',
          broadcast_type ENUM('SMS', 'IN_APP', 'BOTH') NOT NULL DEFAULT 'SMS',
          target_audience VARCHAR(100) DEFAULT 'ALL',
          barangay VARCHAR(100) DEFAULT NULL,
          recipient_count INT DEFAULT 0,
          valid_phone_count INT DEFAULT 0,
          status VARCHAR(50) DEFAULT 'MOCK_SENT',
          message_id VARCHAR(255) DEFAULT NULL,
          delivery_report TEXT DEFAULT NULL,
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_alerts_sent_at (sent_at)
        )
      `);
      schemaChecked = true;
    } catch (err) {
      if (err && err.code !== 'ECONNRESET') {
        console.warn("Alerts schema notice:", err.message || err);
      }
      schemaChecked = true; // Avoid repeated retries during user requests
    } finally {
      schemaCheckPromise = null;
    }
  })();

  return schemaCheckPromise;
}

let cachedLatestAlert = null;
let lastAlertCacheTime = 0;
const ALERT_CACHE_TTL = 60000; // 60 seconds (invalidated instantly on Alert.create)

const Alert = {
    invalidateCache: () => {
        cachedLatestAlert = null;
        lastAlertCacheTime = 0;
    },
    getLatestActive: async () => {
        const now = Date.now();
        if (cachedLatestAlert !== undefined && cachedLatestAlert !== null && (now - lastAlertCacheTime < ALERT_CACHE_TTL)) {
            return cachedLatestAlert;
        }
        if (cachedLatestAlert === null && lastAlertCacheTime > 0 && (now - lastAlertCacheTime < ALERT_CACHE_TTL)) {
            return null;
        }

        try {
            await ensureAlertsSchema();
            const [rows] = await db.execute(`
                SELECT * FROM alerts 
                WHERE sent_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                ORDER BY sent_at DESC 
                LIMIT 1
            `);
            if (rows && rows.length > 0) {
                const alert = rows[0];
                const sentTime = new Date(alert.sent_at).getTime();
                if (!isNaN(sentTime) && (now - sentTime < 24 * 60 * 60 * 1000)) {
                    cachedLatestAlert = alert;
                    lastAlertCacheTime = now;
                    return alert;
                }
            }
            cachedLatestAlert = null;
            lastAlertCacheTime = now;
            return null;
        } catch (err) {
            console.error("Error in getLatestActive:", err.message || err);
            return cachedLatestAlert || null;
        }
    },
    findAllWithSender: async (limit = 50) => {
        await ensureAlertsSchema();
        const parsedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 50, 500));
        const [rows] = await db.query(`
            SELECT 
                a.*,
                u.email as sender_email,
                u.role as sender_role,
                COALESCE(CONCAT(r.first_name, ' ', r.last_name), u.email) as sender_name
            FROM alerts a
            LEFT JOIN users u ON a.sender_id = u.id
            LEFT JOIN residents r ON u.id = r.user_id
            ORDER BY a.sent_at DESC
            LIMIT ${parsedLimit}
        `);
        return rows;
    },
    findAllByBarangayWithSender: async (barangay, limit = 50) => {
        await ensureAlertsSchema();
        const parsedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 50, 500));
        const [rows] = await db.query(`
            SELECT 
                a.*,
                u.email as sender_email,
                u.role as sender_role,
                COALESCE(CONCAT(r.first_name, ' ', r.last_name), u.email) as sender_name
            FROM alerts a
            LEFT JOIN users u ON a.sender_id = u.id
            LEFT JOIN residents r ON u.id = r.user_id
            WHERE a.barangay = ? OR a.barangay IS NULL OR a.barangay = 'ALL'
            ORDER BY a.sent_at DESC
            LIMIT ${parsedLimit}
        `, [barangay]);
        return rows;
    },
    create: async (alertData) => {
        await ensureAlertsSchema();
        const {
            sender_id,
            title,
            message,
            severity = 'BLUE',
            broadcast_type = 'SMS',
            target_audience = 'ALL',
            barangay = null,
            recipient_count = 0,
            valid_phone_count = 0,
            status = 'MOCK_SENT',
            message_id = null,
            delivery_report = null
        } = alertData;

        const [result] = await db.execute(
            `INSERT INTO alerts 
            (sender_id, title, message, severity, broadcast_type, target_audience, barangay, recipient_count, valid_phone_count, status, message_id, delivery_report) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                sender_id,
                title,
                message,
                severity,
                broadcast_type,
                target_audience,
                barangay,
                recipient_count,
                valid_phone_count,
                status,
                message_id,
                delivery_report
            ]
        );
        Alert.invalidateCache();
        return result.insertId;
    }
};

module.exports = Alert;

const db = require('../config/db');

/**
 * Push Subscription Model
 * Encapsulates all database operations for Web Push subscriptions.
 * Keeps raw credentials (keys) server-side only.
 */

const PushSubscription = {
  /**
   * Save or update a subscription for a specific authenticated user.
   * Uses ON DUPLICATE KEY UPDATE to prevent duplicate endpoints.
   */
  saveSubscription: async (userId, subscription) => {
    if (!userId || !subscription || !subscription.endpoint || !subscription.keys) {
      throw new Error('Invalid subscription data: endpoint and keys are required.');
    }

    const { endpoint, keys } = subscription;
    const { p256dh, auth } = keys;

    if (!p256dh || !auth) {
      throw new Error('Invalid subscription data: keys.p256dh and keys.auth are required.');
    }

    // Verify user exists in database to prevent foreign key constraint violation
    const [userRows] = await db.execute('SELECT id FROM users WHERE id = ?', [userId]);
    if (!userRows || userRows.length === 0) {
      return { success: false, error: 'User does not exist in database.' };
    }

    const query = `
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        user_id = VALUES(user_id),
        p256dh = VALUES(p256dh),
        auth = VALUES(auth),
        updated_at = CURRENT_TIMESTAMP
    `;

    const [result] = await db.execute(query, [userId, endpoint, p256dh, auth]);
    return { success: true, id: result.insertId };
  },

  /**
   * Remove a matching subscription for the current user.
   */
  removeSubscription: async (userId, endpoint) => {
    if (!userId || !endpoint) {
      return { success: false, error: 'User ID and endpoint required' };
    }

    const [result] = await db.execute(
      'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
      [userId, endpoint]
    );

    return { success: true, deleted: result.affectedRows > 0 };
  },

  /**
   * Get all active subscriptions for a single user.
   */
  getSubscriptionsForUser: async (userId) => {
    if (!userId) return [];

    const [rows] = await db.execute(
      'SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
      [userId]
    );

    return rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      endpoint: r.endpoint,
      keys: {
        p256dh: r.p256dh,
        auth: r.auth
      }
    }));
  },

  /**
   * Get all active subscriptions for a list of user IDs.
   */
  getSubscriptionsForUsers: async (userIds) => {
    if (!Array.isArray(userIds) || userIds.length === 0) return [];

    // Filter out invalid IDs
    const cleanIds = userIds.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0);
    if (cleanIds.length === 0) return [];

    const placeholders = cleanIds.map(() => '?').join(',');
    const [rows] = await db.execute(
      `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${placeholders})`,
      cleanIds
    );

    return rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      endpoint: r.endpoint,
      keys: {
        p256dh: r.p256dh,
        auth: r.auth
      }
    }));
  },

  /**
   * Get all subscriptions stored in the database.
   */
  getAllSubscriptions: async () => {
    const [rows] = await db.execute(
      'SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions'
    );

    return rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      endpoint: r.endpoint,
      keys: {
        p256dh: r.p256dh,
        auth: r.auth
      }
    }));
  },

  /**
   * Delete subscription by endpoint (e.g. when browser returns 404 or 410 Gone).
   */
  deleteSubscriptionByEndpoint: async (endpoint) => {
    if (!endpoint) return { success: false };

    const [result] = await db.execute(
      'DELETE FROM push_subscriptions WHERE endpoint = ?',
      [endpoint]
    );

    return { success: true, deleted: result.affectedRows > 0 };
  }
};

module.exports = PushSubscription;

require('dotenv').config();
const { webpush } = require('../config/webpush');
const PushSubscription = require('../models/pushSubscriptionModel');

/**
 * Web Push Notification Delivery Service
 * Safely handles dispatching emergency notifications to Web Push subscriptions.
 * Tolerates individual subscription failures and automatically purges expired endpoints.
 */

/**
 * Send an emergency Web Push notification to targeted user IDs or all subscribed users.
 * 
 * @param {Array<number>|null} userIds - List of user IDs to target, or null/empty for all subscribed users.
 * @param {Object} alertData - Alert details (id, title, message, severity, url, etc.)
 * @returns {Promise<Object>} Summary of dispatch results
 */
async function sendEmergencyPush(userIds, alertData = {}) {
  try {
    const severity = (alertData.severity || 'RED').toUpperCase();
    const alertId = alertData.id || alertData.alertId || Date.now();
    const title = alertData.title || `🚨 ${severity} ALERT — Evacwar`;
    const message = alertData.message || 'Emergency alert received. Please open Evacwar for instructions.';
    const url = alertData.url || '/';
    
    // Choose appropriate icon / badge based on severity or default PWA icons
    const icon = '/icons/icon-192x192.png';
    const badge = '/icons/icon-192x192.png';

    // Construct the standardized push payload required by service worker
    const payload = JSON.stringify({
      title: title,
      body: message,
      message: message,
      icon: icon,
      badge: badge,
      url: url,
      alertId: alertId,
      id: alertId,
      severity: severity,
      barangay: alertData.barangay || null,
      sent_at: alertData.sent_at || new Date().toISOString(),
      type: 'EMERGENCY_ALERT',
      timestamp: Date.now()
    });

    // 1. Fetch relevant subscriptions
    let subscriptions = [];
    if (Array.isArray(userIds) && userIds.length > 0) {
      subscriptions = await PushSubscription.getSubscriptionsForUsers(userIds);
    } else {
      // If no specific users targeted (broadcast to all), retrieve all subscriptions
      subscriptions = await PushSubscription.getAllSubscriptions();
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('[PUSH] No Web Push subscriptions found for target recipients.');
      return { total: 0, sent: 0, failed: 0, removed: 0 };
    }

    let sent = 0;
    let failed = 0;
    let removed = 0;

    // Send options: maximum urgency for emergency alerts to bypass device sleep / battery restrictions
    const options = {
      TTL: 60 * 60 * 24, // 24 hours
      urgency: 'high',
      topic: 'emergency-alert'
    };

    // 2. Dispatch to each subscription concurrently with individual safety
    const sendPromises = subscriptions.map(async (sub) => {
      console.log(`[PUSH] Sending push to user ${sub.user_id}`);
      try {
        const pushSubscriptionFormat = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth
          }
        };

        await webpush.sendNotification(pushSubscriptionFormat, payload, options);
        sent++;
        console.log(`[PUSH] Push sent successfully to user ${sub.user_id}`);
      } catch (err) {
        failed++;
        const statusCode = err.statusCode || (err.response && err.response.statusCode);

        // HTTP 404 Not Found or 410 Gone indicates the subscription is expired or cancelled
        if (statusCode === 404 || statusCode === 410) {
          console.log(`[PUSH] Subscription expired/invalid for user ${sub.user_id} (HTTP ${statusCode})`);
          try {
            await PushSubscription.deleteSubscriptionByEndpoint(sub.endpoint);
            removed++;
          } catch (delErr) {
            console.error('[PUSH] Push failed: error deleting expired subscription:', delErr.message);
          }
        } else {
          console.error(`[PUSH] Push failed: for user ${sub.user_id} - HTTP ${statusCode || 'ERR'} ${err.message}`);
        }
      }
    });

    await Promise.allSettled(sendPromises);

    return { total: subscriptions.length, sent, failed, removed };
  } catch (serviceErr) {
    // Safety guarantee: Push failure must NEVER crash or abort the caller
    console.error('[PUSH] Push failed: Critical error during emergency push execution:', serviceErr.message);
    return { total: 0, sent: 0, failed: 0, removed: 0, error: serviceErr.message };
  }
}

module.exports = {
  sendEmergencyPush
};

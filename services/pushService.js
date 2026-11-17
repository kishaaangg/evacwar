require('dotenv').config();
const { webpush } = require('../config/webpush');
const PushSubscription = require('../models/pushSubscriptionModel');

/**
 * Web Push Notification Delivery Service
 * Safely handles dispatching emergency notifications to Web Push subscriptions.
 * Tolerates individual subscription failures and automatically purges expired endpoints.
 */

/**
 * Shared Web Push delivery helper to avoid duplicating subscription query & cleanup logic.
 */
async function dispatchPushPayload(userIds, payloadObj, options) {
  let subscriptions = [];
  if (Array.isArray(userIds) && userIds.length > 0) {
    subscriptions = await PushSubscription.getSubscriptionsForUsers(userIds);
  } else {
    subscriptions = await PushSubscription.getAllSubscriptions();
  }

  if (!subscriptions || subscriptions.length === 0) {
    return { total: 0, sent: 0, failed: 0, removed: 0 };
  }

  const payload = JSON.stringify(payloadObj);
  let sent = 0;
  let failed = 0;
  let removed = 0;

  const sendPromises = subscriptions.map(async (sub) => {
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
    } catch (err) {
      failed++;
      const statusCode = err.statusCode || (err.response && err.response.statusCode);
      if (statusCode === 404 || statusCode === 410) {
        try {
          await PushSubscription.deleteSubscriptionByEndpoint(sub.endpoint);
          removed++;
        } catch (delErr) {
          console.error('[PUSH] Failed deleting expired subscription:', delErr.message);
        }
      } else {
        console.error(`[PUSH] Push failed for user ${sub.user_id} - HTTP ${statusCode || 'ERR'} ${err.message}`);
      }
    }
  });

  await Promise.allSettled(sendPromises);
  return { total: subscriptions.length, sent, failed, removed };
}

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

    const icon = '/icons/icon-192x192.png';
    const badge = '/icons/icon-192x192.png';

    const payloadObj = {
      title,
      body: message,
      message,
      icon,
      badge,
      url,
      alertId,
      id: alertId,
      severity,
      barangay: alertData.barangay || null,
      sent_at: alertData.sent_at || new Date().toISOString(),
      type: 'EMERGENCY_ALERT',
      timestamp: Date.now()
    };

    const options = {
      TTL: 60 * 60 * 24,
      urgency: 'high',
      topic: 'emergency-alert'
    };

    return await dispatchPushPayload(userIds, payloadObj, options);
  } catch (serviceErr) {
    console.error('[PUSH] Critical error during emergency push execution:', serviceErr.message);
    return { total: 0, sent: 0, failed: 0, removed: 0, error: serviceErr.message };
  }
}

/**
 * Send a non-siren 2-hour LoRa Sensor Weather notification redirecting to the Weather page on click.
 */
async function sendWeatherNotificationPush(userIds, weatherAlert = {}) {
  try {
    const alertId = weatherAlert.id || weatherAlert.alertId || ('wth_' + Date.now());
    const title = weatherAlert.title || '🌤️ LoRa Weather Sensor Update';
    const message = weatherAlert.message || 'Local LoRa Relay weather telemetry updated. Tap to open Weather page.';
    const payloadObj = {
      title,
      body: message,
      message,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      url: weatherAlert.url || '/typhoon',
      alertId,
      id: alertId,
      type: 'WEATHER_UPDATE',
      noSiren: true,
      silent: true,
      sent_at: weatherAlert.sent_at || new Date().toISOString(),
      timestamp: Date.now()
    };

    const options = {
      TTL: 60 * 60 * 2,
      urgency: 'normal',
      topic: 'weather-update'
    };

    return await dispatchPushPayload(userIds, payloadObj, options);
  } catch (serviceErr) {
    console.error('[PUSH] Error during weather push execution:', serviceErr.message);
    return { total: 0, sent: 0, failed: 0, removed: 0, error: serviceErr.message };
  }
}

module.exports = {
  sendEmergencyPush,
  sendWeatherNotificationPush
};

require('dotenv').config();
const webpush = require('web-push');

/**
 * Web Push (VAPID) Service Configuration
 * Strictly initializes VAPID credentials using environment variables.
 * Private key is kept server-side only and never transmitted to clients.
 */

const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@evakwar.gov.ph';
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  try {
    webpush.setVapidDetails(
      vapidEmail,
      vapidPublicKey,
      vapidPrivateKey
    );
    console.log('[WebPush] VAPID details configured successfully.');
  } catch (err) {
    console.error('[WebPush] Failed to set VAPID details:', err.message);
  }
} else {
  console.warn('[WebPush] Warning: VAPID_PUBLIC_KEY and/or VAPID_PRIVATE_KEY missing from environment.');
}

module.exports = {
  webpush,
  getPublicKey: () => process.env.VAPID_PUBLIC_KEY || ''
};

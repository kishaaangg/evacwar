const { getPublicKey } = require('../config/webpush');
const PushSubscription = require('../models/pushSubscriptionModel');

/**
 * Push Notifications Controller
 * Handles subscription lifecycle and safe public key exposure.
 */

exports.getPublicKey = (req, res) => {
  try {
    const publicKey = getPublicKey();
    if (!publicKey) {
      return res.status(503).json({
        success: false,
        error: 'Web Push VAPID public key not configured on server.'
      });
    }

    res.status(200).json({
      success: true,
      publicKey: publicKey
    });
  } catch (error) {
    console.error('Error serving VAPID public key:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve public key' });
  }
};

exports.subscribe = async (req, res) => {
  try {
    const userId = req.session ? req.session.userId : null;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required to register push notifications.'
      });
    }

    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subscription object. endpoint and keys (p256dh, auth) are required.'
      });
    }

    if (!subscription.keys.p256dh || !subscription.keys.auth) {
      return res.status(400).json({
        success: false,
        error: 'Subscription keys must contain p256dh and auth.'
      });
    }

    // Always associate subscription strictly with the authenticated session userId
    const saveResult = await PushSubscription.saveSubscription(userId, subscription);
    if (saveResult && !saveResult.success) {
      return res.status(401).json({
        success: false,
        error: saveResult.error || 'User session invalid for push registration.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Push subscription registered successfully.'
    });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save push subscription.'
    });
  }
};

exports.unsubscribe = async (req, res) => {
  try {
    const userId = req.session ? req.session.userId : null;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required to remove push subscription.'
      });
    }

    const endpoint = req.body.endpoint || (req.body.subscription && req.body.subscription.endpoint) || req.query.endpoint;
    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: 'Endpoint is required to unsubscribe.'
      });
    }

    await PushSubscription.removeSubscription(userId, endpoint);

    res.status(200).json({
      success: true,
      message: 'Push subscription removed successfully.'
    });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove push subscription.'
    });
  }
};

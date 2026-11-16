const express = require('express');
const router = express.Router();
const pushController = require('../controllers/pushController');

/**
 * Web Push Notification API Routes
 */

// Public-safe route to retrieve VAPID public key
router.get('/public-key', pushController.getPublicKey);

// Authenticated routes to subscribe/unsubscribe (session-checked in controller)
router.post('/subscribe', pushController.subscribe);
router.delete('/unsubscribe', pushController.unsubscribe);

module.exports = router;

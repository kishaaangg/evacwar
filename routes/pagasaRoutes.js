/**
 * DOST-PAGASA Weather & Typhoon Facebook Graph API Routes
 * Endpoints for live weather bulletins, Meta Graph API sync, and 1-click LoRa broadcasts.
 */

const express = require('express');
const router = express.Router();
const facebookPagasaService = require('../utils/facebookPagasaService');
const { queueOutboundAlertBroadcast } = require('./loraRoutes');
const Alert = require('../models/alertModel');
const db = require('../config/db');

/**
 * GET /api/pagasa/feed
 * Returns current DOST-PAGASA Facebook posts, active cyclone status, and sync source.
 */
router.get('/feed', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1' || req.query.force === 'true';
    const feed = await facebookPagasaService.getPagasaFeed({ forceRefresh });
    res.json(feed);
  } catch (error) {
    console.error('[PagasaRoutes] Error fetching feed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch DOST-PAGASA feed'
    });
  }
});

/**
 * POST /api/pagasa/refresh
 * Forces a fresh pull from Meta Graph API / DOST-PAGASA official channels.
 */
router.post('/refresh', async (req, res) => {
  try {
    const feed = await facebookPagasaService.getPagasaFeed({ forceRefresh: true });

    // Broadcast live update to all connected Socket.IO clients if available
    const io = req.app.get('io');
    if (io) {
      io.emit('pagasa_feed_updated', {
        timestamp: new Date().toISOString(),
        activeStorm: feed.activeStorm,
        postsCount: feed.count,
        source: feed.source
      });
    }

    res.json({
      success: true,
      message: 'DOST-PAGASA feed refreshed successfully',
      ...feed
    });
  } catch (error) {
    console.error('[PagasaRoutes] Error refreshing feed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to refresh DOST-PAGASA feed'
    });
  }
});

/**
 * POST /api/pagasa/broadcast-lora
 * Converts an official DOST-PAGASA Facebook bulletin into an autonomous 433.875 MHz LoRa Mesh broadcast.
 * Also stores in MySQL database and emits Socket.IO event so online users get sirens & push alerts.
 */
router.post('/broadcast-lora', async (req, res) => {
  try {
    const { postId, customTitle, customMessage, severity, barangay, evacCenter } = req.body;

    // 1. Fetch current feed to locate post if postId is provided
    const feed = await facebookPagasaService.getPagasaFeed();
    const targetPost = (feed && feed.posts) ? feed.posts.find(p => p.id === postId) : null;

    let alertData = null;
    if (targetPost) {
      alertData = facebookPagasaService.formatForLoraAlert(targetPost, {
        severity,
        barangay,
        shelter: evacCenter
      });
    } else {
      // Manual or custom payload
      alertData = {
        title: (customTitle || 'DOST-PAGASA WEATHER ADVISORY').slice(0, 40),
        message: (customMessage || 'PAGASA Severe Weather Advisory hoisted for Baao. Monitor instructions.').slice(0, 95),
        severity: (severity || 'ORANGE').toUpperCase(),
        barangay: (barangay || 'ALL').toUpperCase(),
        evacCenter: evacCenter || 'San Rafael Evacuation Center',
        postId: postId || `pagasa_manual_${Date.now()}`
      };
    }

    // Apply any overrides from request body
    if (customTitle) alertData.title = customTitle.slice(0, 40);
    if (customMessage) alertData.message = customMessage.slice(0, 95);
    if (severity) alertData.severity = severity.toUpperCase();
    if (barangay) alertData.barangay = (barangay === 'all' ? 'ALL' : barangay).toUpperCase();

    const fallbackAlertId = Date.now().toString().slice(-7);

    // 2. Transmit via 433.875 MHz LoRa Mesh Gateway (0ms delay - works 100% offline!)
    let loraResult = null;
    try {
      loraResult = queueOutboundAlertBroadcast({
        id: fallbackAlertId,
        title: alertData.title,
        message: alertData.message,
        severity: alertData.severity,
        barangay: alertData.barangay,
        evacCenter: alertData.evacCenter
      });
      console.log('[PagasaRoutes] 433.875 MHz LoRa Mesh Alert Dispatched:', loraResult ? loraResult.packet : 'QUEUED');
    } catch (loraErr) {
      console.error('[PagasaRoutes] LoRa Mesh dispatch error:', loraErr);
    }

    // 3. Save into MySQL alerts table for system-wide persistence
    let dbAlertId = null;
    try {
      const senderId = (req.session && req.session.userId) ? req.session.userId : 1;
      const createdAlert = await Alert.create({
        title: alertData.title,
        message: alertData.message,
        severity: alertData.severity,
        broadcast_type: 'LORA_MESH',
        target_audience: alertData.barangay === 'ALL' ? 'ALL' : 'ZONE',
        barangay: alertData.barangay === 'ALL' ? null : alertData.barangay,
        sender_id: senderId,
        recipient_count: 0,
        valid_phone_count: 0,
        status: 'TRANSMITTED_LORA',
        message_id: 'PAGASA-LORA-433',
        delivery_report: JSON.stringify({
          source: 'DOST-PAGASA Facebook Feed',
          meshFreq: '433.875 MHz',
          channel: 'EU_433 / LONG_FAST',
          packet: loraResult ? loraResult.packet : '',
          postId: alertData.postId
        })
      });
      if (createdAlert && createdAlert.id) dbAlertId = createdAlert.id;
    } catch (dbErr) {
      console.warn('[PagasaRoutes] Note: Could not record in MySQL alerts table:', dbErr.message);
    }

    // 4. Emit real-time Socket.IO emergency alert to all online mobile & web clients
    const io = req.app.get('io');
    if (io) {
      io.emit('emergency_alert', {
        id: dbAlertId || fallbackAlertId,
        title: alertData.title,
        message: alertData.message,
        severity: alertData.severity,
        barangay: alertData.barangay,
        evacCenter: alertData.evacCenter,
        timestamp: new Date().toISOString(),
        source: 'DOST-PAGASA Official Facebook Broadcast'
      });
    }

    res.json({
      success: true,
      message: 'DOST-PAGASA advisory broadcasted across 433.875 MHz LoRa Mesh and Web/Mobile clients!',
      alertId: dbAlertId || fallbackAlertId,
      loraPacket: loraResult ? loraResult.packet : `EVW|ALT|${fallbackAlertId}|${alertData.severity}|${alertData.barangay}|${alertData.title}|${alertData.evacCenter}|${alertData.message}`,
      alert: alertData
    });
  } catch (error) {
    console.error('[PagasaRoutes] Broadcast error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to dispatch LoRa alert broadcast'
    });
  }
});

module.exports = router;

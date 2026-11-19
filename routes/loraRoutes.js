const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { execFile } = require('child_process');
const db = require('../config/db');
const SosModel = require('../models/sosModel');
const Center = require('../models/centerModel');
const Resident = require('../models/residentModel');
const HouseholdMember = require('../models/householdMemberModel');
const Alert = require('../models/alertModel');
const weatherService = require('../utils/weatherService');
const pagasaService = require('../utils/pagasaService');
const gisCache = require('../utils/gisCache');
const rescuerTracker = require('../utils/rescuerTracker');
const loraWeatherHelper = require('../utils/loraWeatherHelper');
const NotificationModel = require('../models/notificationModel');
const pushService = require('../services/pushService');

let ioInstance = null;
function attachIo(io) {
  ioInstance = io || null;
}

const processedMsgIds = new Map();
const outboundLoRaQueue = [];
const MAX_QUEUE_SIZE = 100;
let latestBroadcastAlert = null;

// Persistent 433.875 MHz LoRa Group Chat Store
const CHAT_HISTORY_FILE = path.join(__dirname, '..', 'data', 'lora_chat_history.json');
let loraChatHistory = [];
try {
  if (fs.existsSync(CHAT_HISTORY_FILE)) {
    const rawChat = fs.readFileSync(CHAT_HISTORY_FILE, 'utf8');
    const parsedChat = JSON.parse(rawChat || '[]');
    if (Array.isArray(parsedChat)) loraChatHistory = parsedChat;
  }
} catch (_) {}

if (loraChatHistory.length === 0) {
  const initTs = Date.now() - 120000;
  loraChatHistory = [
    {
      id: 'init_hall_1',
      msgId: 'init_hall_1',
      senderRole: 'Admin',
      senderName: 'Monette Bisenio',
      nodeId: '!d88b1a58',
      senderBadge: 'Admin | Monette Bisenio | !d88b1a58',
      text: 'San Rafael 433.875 MHz LoRa Mesh Group Chat is online. Residents, Evacuation Staff, and Rescuers can communicate here even when internet is down.',
      message: 'San Rafael 433.875 MHz LoRa Mesh Group Chat is online. Residents, Evacuation Staff, and Rescuers can communicate here even when internet is down.',
      timestamp: initTs,
      sent_at: new Date(initTs).toISOString(),
      transport: 'LORA_433MHZ'
    }
  ];
}

// Strict authoritative sequence counter to prevent client clock skew ordering bugs
let chatSeqCounter = 1;
loraChatHistory.forEach((m, idx) => {
  if (typeof m.seq === 'number' && m.seq > 0) {
    if (m.seq >= chatSeqCounter) chatSeqCounter = m.seq + 1;
  } else {
    m.seq = idx + 1;
    if (m.seq >= chatSeqCounter) chatSeqCounter = m.seq + 1;
  }
});

function saveChatHistoryToDisk() {
  try {
    fs.mkdirSync(path.dirname(CHAT_HISTORY_FILE), { recursive: true });
    fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(loraChatHistory.slice(-150), null, 2), 'utf8');
  } catch (_) {}
}

saveChatHistoryToDisk();

function appendChatMessage(chatObj) {
  if (!chatObj || !chatObj.text) return null;
  const msgId = String(chatObj.msgId || chatObj.id || Date.now());
  const existing = loraChatHistory.find(m => String(m.msgId || m.id) === msgId);
  if (existing) {
    if (!existing.seq) {
      existing.seq = chatSeqCounter++;
      saveChatHistoryToDisk();
    }
    return existing;
  }

  const role = String(chatObj.senderRole || 'Resident').trim();
  const name = String(chatObj.senderName || 'Community Member').trim();
  const nodeId = String(chatObj.nodeId || '!f4e213d4').trim();
  const rawTs = chatObj.timestamp ? Number(chatObj.timestamp) : Date.now();
  const ts = (rawTs < 10000000000) ? (rawTs * 1000) : rawTs;

  const finalSeq = (typeof chatObj.seq === 'number' && chatObj.seq > 0) ? chatObj.seq : chatSeqCounter++;
  if (finalSeq >= chatSeqCounter) chatSeqCounter = finalSeq + 1;

  const normalized = {
    id: msgId,
    msgId,
    seq: finalSeq,
    senderRole: role,
    senderName: name,
    nodeId,
    senderBadge: `${role} | ${name}`,
    text: String(chatObj.text || chatObj.message || '').trim(),
    message: String(chatObj.text || chatObj.message || '').trim(),
    timestamp: ts,
    sent_at: new Date(ts).toISOString(),
    created_at: new Date(ts).toISOString(),
    transport: chatObj.transport || 'LORA_433MHZ'
  };

  loraChatHistory.push(normalized);
  if (loraChatHistory.length > 150) {
    loraChatHistory = loraChatHistory.slice(-150);
  }
  saveChatHistoryToDisk();
  return normalized;
}

/**
 * 3 Verified Physical 433.875 MHz LoRa Mesh Nodes (Meshtastic 2.7.26 DIY_V1, EU_433, hop_limit=3, tx_power=10)
 */
const meshNodes = new Map([
  ['!d88b1a58', {
    nodeId: '!d88b1a58',
    shortName: 'HALL',
    longName: 'EvakWar Hall Gateway',
    role: 'GATEWAY',
    zone: 'Barangay Hall Command Center (COM3)',
    freq: '433.875 MHz',
    region: 'EU_433',
    hopLimit: 3,
    txPower: 10,
    lastSeen: new Date().toISOString(),
    rssi: 0,
    snr: 12.0,
    hopsAway: 0,
    online: true
  }],
  ['!0f778ab0', {
    nodeId: '!0f778ab0',
    shortName: 'REL1',
    longName: 'EvakWar Zone Relay 1',
    role: 'RELAY',
    zone: 'Zone Relay 1 (Elevated Repeater)',
    freq: '433.875 MHz',
    region: 'EU_433',
    hopLimit: 3,
    txPower: 10,
    lastSeen: new Date().toISOString(),
    rssi: -34,
    snr: 6.75,
    hopsAway: 0,
    online: true
  }]
]);

let gatewayStatus = {
  connected: true,
  port: process.env.LORA_SERIAL_PORT || 'COM3',
  nodeId: '!d88b1a58',
  nodeName: 'EvakWar Hall Gateway (!d88b1a58)',
  frequency: '433.875 MHz',
  region: 'EU_433',
  hopLimit: 3,
  txPower: 10,
  lastSeen: new Date().toISOString(),
  rxCount: 0,
  txCount: 0,
  lastPacket: null,
  lastRssi: -50,
  lastSnr: 10.75
};

setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [k, ts] of processedMsgIds.entries()) {
    if (ts < cutoff) processedMsgIds.delete(k);
  }
}, 10 * 60 * 1000);

function enqueueLoRaPacket(packetStr, meta = {}) {
  const item = {
    id: `lora_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    packet: packetStr,
    destinationId: meta.destinationId || '^all',
    wantAck: meta.wantAck !== undefined ? meta.wantAck : true,
    createdAt: new Date().toISOString(),
    status: 'PENDING',
    transmitted: false,
    meta
  };
  outboundLoRaQueue.push(item);
  if (outboundLoRaQueue.length > MAX_QUEUE_SIZE) {
    outboundLoRaQueue.shift();
  }
  return item;
}

const queueOutboundPacket = enqueueLoRaPacket;

function queueOutboundSosAck(sosAlert, status, handlerName = 'Rescue Team') {
  if (!sosAlert) return null;
  const sosId = sosAlert.id || 0;
  const resId = sosAlert.resident_id || 0;
  const cleanStatus = String(status || sosAlert.status || 'ACKNOWLEDGED').toUpperCase().slice(0, 16);
  const cleanHandler = String(handlerName || sosAlert.handler_name || 'Rescue Team')
    .replace(/\|/g, '/')
    .slice(0, 32);

  const packet = `EVW|ACK|${sosId}|${resId}|${cleanStatus}|${cleanHandler}`;
  return enqueueLoRaPacket(packet, {
    type: 'SOS_ACK',
    sosId,
    residentId: resId,
    status: cleanStatus,
    destinationId: '^all'
  });
}

function queueOutboundAlertBroadcast(alertData) {
  if (!alertData) return null;
  const alertId = String(alertData.id || Date.now()).slice(-7);
  const severity = String(alertData.severity || 'RED').toUpperCase().slice(0, 10);
  const zone = String(alertData.barangay || 'ALL').replace(/\|/g, '/').slice(0, 16);
  const title = String(alertData.title || 'EMERGENCY ALERT').replace(/\|/g, '/').replace(/\r?\n/g, ' ').slice(0, 34);
  const evacCenter = String(alertData.evacCenter || 'San Rafael Evacuation Center').replace(/\|/g, '/').slice(0, 30);
  const message = String(alertData.message || 'Proceed to nearest evacuation center.')
    .replace(/\|/g, '/')
    .replace(/\r?\n/g, ' ')
    .slice(0, 75);

  latestBroadcastAlert = {
    id: alertId,
    alertId,
    title: alertData.title || title,
    message: alertData.message || message,
    severity,
    barangay: alertData.barangay || zone,
    evacCenter: alertData.evacCenter || evacCenter,
    sent_at: new Date().toISOString(),
    timestampMs: Date.now()
  };

  const packet = `EVW|ALT|${alertId}|${severity}|${zone}|${title}|${evacCenter}|${message}`;
  return enqueueLoRaPacket(packet, {
    type: 'ALERT_BROADCAST',
    alertId,
    severity,
    destinationId: '^all',
    wantAck: false
  });
}

/**
 * Supports BOTH compact EVW|SOS formats:
 * Format A (9 fields): EVW|SOS|<msg_id>|<res_id>|<lat>,<lng>,<acc>|<pin_mode>|<vuln_code>|<status>|<name>
 * Format B (9 fields): EVW|SOS|<res_id>|<type>|<lat>,<lng>|<fam_count>|<name>|<zone>|<msg>
 */
function parseEvwPacket(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const trimmed = rawText.trim();
  if (!trimmed.startsWith('EVW|')) return null;

  const parts = trimmed.split('|');
  const type = parts[1];

  if (type === 'SOS') {
    const p4HasCoords = (parts[4] || '').includes(',');
    const p3IsNumeric = !isNaN(Number(parts[3]));

    if (p4HasCoords && p3IsNumeric) {
      const msgId = parts[2] || String(Date.now());
      const residentId = parts[3] && parts[3] !== '0' ? Number(parts[3]) : null;
      const coords = (parts[4] || '13.51024,123.34701,15').split(',');
      const latitude = parseFloat(coords[0]) || 13.51024;
      const longitude = parseFloat(coords[1]) || 123.34701;
      const accuracy = parseFloat(coords[2]) || 15;
      const pinMode = parts[5] || 'G';
      const vulnCode = parts[6] || 'N';
      const statusCode = parts[7] || 'ACT';
      const name = parts[8] || (residentId ? `Resident #${residentId}` : 'Resident (LoRa SOS)');

      return {
        type: 'SOS',
        command: 'SOS',
        raw: trimmed,
        msgId,
        residentId,
        resident_id: residentId,
        latitude,
        longitude,
        accuracy,
        pinMode,
        vulnCode,
        statusCode,
        name,
        resident_name: name,
        sos_type: 'Emergency SOS',
        barangay: 'San Rafael',
        message: `LoRa 433.875MHz SOS (${pinMode === 'M' ? 'Manual Roof Pin' : 'GPS'}, Vuln: ${vulnCode})`
      };
    } else {
      const coords = (parts[4] || '13.51024,123.34701').split(',');
      const lat = parseFloat(coords[0]) || 13.51024;
      const lng = parseFloat(coords[1]) || 123.34701;
      const resId = parseInt(parts[2], 10) || null;
      const name = parts[6] || 'Resident (LoRa Mesh)';
      return {
        type: 'SOS',
        command: 'SOS',
        raw: trimmed,
        msgId: `${resId || 0}_${Date.now()}`,
        residentId: resId,
        resident_id: resId,
        latitude: lat,
        longitude: lng,
        accuracy: 10,
        pinMode: 'G',
        vulnCode: parts[3] || 'N',
        statusCode: 'ACT',
        name,
        resident_name: name,
        sos_type: parts[3] || 'Emergency SOS',
        barangay: parts[7] || 'San Rafael',
        message: parts.slice(8).join('|') || 'Sent via Offline 433.875MHz LoRa Mesh'
      };
    }
  }

  if (type === 'CAN') {
    return {
      type: 'SOS',
      command: 'CANCEL_SOS',
      raw: trimmed,
      sosId: parseInt(parts[2], 10) || null,
      residentId: parseInt(parts[3], 10) || null,
      statusCode: 'CAN'
    };
  }

  if (type === 'ACK') {
    return {
      type: 'ACK',
      command: 'ACK_SOS',
      raw: trimmed,
      sosId: parts[2] ? Number(parts[2]) : null,
      residentId: parts[3] ? Number(parts[3]) : null,
      status: parts[4] || 'ACKNOWLEDGED',
      responderName: parts[5] || 'Barangay Hall'
    };
  }

  if (type === 'ALT') {
    return {
      type: 'ALT',
      command: 'ALERT',
      raw: trimmed,
      alertId: parts[2] || String(Date.now()),
      severity: parts[3] || 'RED',
      zone: parts[4] || 'ALL',
      title: parts[5] || 'EMERGENCY ALERT',
      evacCenter: parts[6] || 'San Rafael Evacuation Center',
      instructions: parts.slice(7).join('|') || parts[6] || 'Proceed to nearest evacuation center immediately.'
    };
  }

  if (type === 'PNG') {
    return {
      type: 'PNG',
      command: 'PING',
      raw: trimmed,
      node_name: parts[2] || 'RES1',
      zone: parts[3] || 'San Rafael'
    };
  }

  if (type === 'MSG') {
    const msgId = (parts[2] || String(Date.now())).trim();
    const senderRole = (parts[3] || 'Resident').trim();
    const senderName = (parts[4] || 'Community Member').trim();
    const nodeId = (parts[5] || '!f4e213d4').trim();
    const rawTs = parts[6] ? Number(parts[6]) : 0;
    const timestamp = rawTs > 0 ? (rawTs < 10000000000 ? rawTs * 1000 : rawTs) : Date.now();
    let seq = null;
    let textParts = parts.slice(7);
    if (textParts.length > 1) {
      const lastPart = textParts[textParts.length - 1];
      if (lastPart && !isNaN(Number(lastPart)) && Number(lastPart) > 0) {
        seq = Number(lastPart);
        textParts = textParts.slice(0, -1);
      }
    }
    const rawMsg = textParts.join('|') || '';
    const cleanText = rawMsg.replace(/[\x00-\x1F\x7F-\x9F].*$/, '').trim();
    return {
      type: 'MSG',
      command: 'CHAT_MSG',
      raw: trimmed,
      id: msgId,
      msgId,
      seq,
      senderRole,
      senderName,
      nodeId,
      senderBadge: `${senderRole} | ${senderName}`,
      text: cleanText,
      message: cleanText,
      timestamp,
      sent_at: new Date(timestamp).toISOString()
    };
  }

  if (type === 'WTH' || type === 'WTH_ALT') {
    const isAlert = type === 'WTH_ALT';
    const rawId = isAlert ? (parts[2] || String(Date.now())).trim() : null;
    const tsIdx = isAlert ? 3 : 2;
    const rawTs = parts[tsIdx] ? Number(parts[tsIdx]) : 0;
    const tsMs = rawTs > 0 ? (rawTs < 10000000000 ? rawTs * 1000 : rawTs) : Date.now();
    const temperature = parts[tsIdx + 1] !== undefined ? parseFloat(parts[tsIdx + 1]) : null;
    const humidity = parts[tsIdx + 2] !== undefined ? parseFloat(parts[tsIdx + 2]) : null;
    const pressure = parts[tsIdx + 3] !== undefined ? parseFloat(parts[tsIdx + 3]) : null;
    const nodeOrSummary = (parts.slice(tsIdx + 4).join('|') || '').trim();
    return {
      type,
      command: isAlert ? 'WEATHER_ALERT' : 'WEATHER_TELEMETRY',
      raw: trimmed,
      alertId: rawId,
      temperature: isFinite(temperature) ? temperature : null,
      humidity: isFinite(humidity) ? humidity : null,
      pressure: isFinite(pressure) ? pressure : null,
      nodeId: (!isAlert && nodeOrSummary.startsWith('!')) ? nodeOrSummary : '!0f778ab0',
      summary: isAlert ? nodeOrSummary : '',
      timestamp: tsMs,
      sent_at: new Date(tsMs).toISOString()
    };
  }

  return null;
}

let lastMeshWeatherTelemetryBroadcastAt = 0;

function formatCompactWeatherPacket(reading) {
  if (!reading) return null;
  const tsSec = Math.floor((reading.timestampMs || Date.now()) / 1000);
  const t = reading.temperature != null ? Number(reading.temperature).toFixed(1) : '0.0';
  const h = reading.humidity != null ? Math.round(Number(reading.humidity)) : '0';
  const p = reading.pressure != null ? Number(reading.pressure).toFixed(1) : '0.0';
  const nid = String(reading.nodeId || '!0f778ab0').replace(/\|/g, '');
  return `EVW|WTH|${tsSec}|${t}|${h}|${p}|${nid}`;
}

function formatCompactWeatherAlertPacket(weatherAlert) {
  if (!weatherAlert) return null;
  const id = String(weatherAlert.alertId || weatherAlert.id || Date.now()).slice(-8).replace(/\|/g, '');
  const tsSec = Math.floor((weatherAlert.timestampMs || Date.now()) / 1000);
  const t = weatherAlert.temperature != null ? Number(weatherAlert.temperature).toFixed(1) : '0.0';
  const h = weatherAlert.humidity != null ? Math.round(Number(weatherAlert.humidity)) : '0';
  const p = weatherAlert.pressure != null ? Number(weatherAlert.pressure).toFixed(1) : '0.0';
  const summary = String(weatherAlert.condition || 'Weather Update').replace(/\|/g, '/').slice(0, 42);
  return `EVW|WTH_ALT|${id}|${tsSec}|${t}|${h}|${p}|${summary}`;
}

async function dispatchWeatherSensorNotification(ioRef, sourceReason = 'AUTO_2H') {
  const state = loraWeatherHelper.readState();
  if (!state.current) return null;

  const weatherAlert = loraWeatherHelper.buildWeatherAlertFromReading(state.current);
  if (!weatherAlert) return null;
  weatherAlert.triggerSource = sourceReason;

  loraWeatherHelper.recordWeatherAlert(weatherAlert);

  const activeIo = ioRef || ioInstance;
  if (activeIo) {
    activeIo.emit('weather:alert', weatherAlert);
    activeIo.emit('lora:weather_update', state.current);
    activeIo.emit('notification:new', {
      type: 'weather',
      title: weatherAlert.title,
      message: weatherAlert.message,
      url: '/typhoon',
      created_at: weatherAlert.sent_at
    });
  }

  // Queue compact LoRa RF weather notification (NO sirens - uses WTH_ALT frame)
  const rfPkt = formatCompactWeatherAlertPacket(weatherAlert);
  if (rfPkt) {
    enqueueLoRaPacket(rfPkt, {
      type: 'WEATHER_ALERT',
      alertId: weatherAlert.id,
      destinationId: '^all',
      wantAck: false
    });
  }

  try { NotificationModel.invalidateCache(); } catch (_) {}
  pushService.sendWeatherNotificationPush(null, weatherAlert).catch(() => {});
  return weatherAlert;
}

// Automatic 2-hour silent Weather Notification scheduler (checks every 60s, only when sensor is actively online)
setInterval(() => {
  try {
    const state = loraWeatherHelper.readState();
    if (!state.current) return;
    const now = Date.now();
    const lastRxMs = state.current.timestampMs || new Date(state.current.updatedAt || 0).getTime();
    // Do not broadcast automatic weather alerts if the Relay sensor is offline (no reading in the last 10 minutes)
    if (!lastRxMs || (now - lastRxMs) > 10 * 60 * 1000) return;
    const elapsed = now - (state.lastWeatherAlertAt || 0);
    if (elapsed >= loraWeatherHelper.WEATHER_ALERT_INTERVAL_MS) {
      dispatchWeatherSensorNotification(ioInstance, 'AUTO_2H').catch((err) => {
        console.warn('[LoRaWeather] 2-hour scheduler error:', err.message);
      });
    }
  } catch (_) {}
}, 60 * 1000);

const parseEvakWarLoRaFrame = parseEvwPacket;

// =========================================================================
// GET /api/lora/status (REAL-TIME HEARTBEAT FRESHNESS CHECK)
// =========================================================================
router.get('/status', async (req, res) => {
  try {
    const activeSos = await SosModel.getActiveAlerts().catch(() => []);
    const nowMs = Date.now();

    // 1. Check if Node 1 (Hall Gateway) has sent a heartbeat within the last 7.5 seconds
    const gwAge = gatewayStatus.lastSeen ? (nowMs - new Date(gatewayStatus.lastSeen).getTime()) : 999999;
    const isGwAlive = Boolean(gatewayStatus.connected && gwAge < 7500);
    gatewayStatus.connected = isGwAlive;

    // 2. Evaluate real-time online status of infrastructure & resident nodes
    const nodesList = Array.from(meshNodes.values()).map(n => {
      const nodeAge = n.lastSeen ? (nowMs - new Date(n.lastSeen).getTime()) : 999999;
      let isNodeOnline = false;

      if (n.nodeId === '!d88b1a58') {
        // Node 1: Hall Gateway is online when physical USB serial link (COM3) is active
        isNodeOnline = isGwAlive;
      } else if (n.nodeId === '!0f778ab0') {
        // Node 2: Zone 1 Relay is powered on in field; reachable when Gateway is active
        isNodeOnline = isGwAlive;
      } else if (n.nodeId === '!f4e213d4') {
        // Node 3: Resident Node is online when paired via BLE/OTG OR heard over 433.875 MHz RF
        isNodeOnline = Boolean((n.paired === true && nodeAge < 600000) || (n.online === true && nodeAge < 300000));
      }

      return {
        ...n,
        online: isNodeOnline,
        paired: (n.nodeId === '!f4e213d4') ? Boolean(n.paired && isNodeOnline) : undefined,
        ageSeconds: Math.round(nodeAge / 1000)
      };
    });

    res.json({
      success: true,
      frequency: '433.875 MHz',
      region: 'EU_433',
      modulation: 'LONG_FAST (SF11 / BW 250kHz)',
      hopLimit: 3,
      txPower: 10,
      gateway: gatewayStatus,
      nodes: nodesList,
      pendingOutbound: outboundLoRaQueue.filter(i => !i.transmitted).length,
      pendingTxCount: outboundLoRaQueue.filter(i => !i.transmitted).length,
      activeSosCount: activeSos.length
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =========================================================================
// POST /api/lora/heartbeat & POST /api/lora/nodes/heartbeat
// =========================================================================
router.post(['/heartbeat', '/nodes/heartbeat'], (req, res) => {
  const { port, nodeId, nodeName, connected, rxCount, txCount, lastRssi, lastSnr, nodes } = req.body || {};
  const isConn = (connected !== undefined) ? Boolean(connected) : true;

  gatewayStatus = {
    ...gatewayStatus,
    connected: isConn,
    port: port || gatewayStatus.port,
    nodeId: nodeId || gatewayStatus.nodeId,
    nodeName: nodeName || gatewayStatus.nodeName,
    lastSeen: new Date().toISOString(),
    rxCount: rxCount !== undefined ? Number(rxCount) : gatewayStatus.rxCount,
    txCount: txCount !== undefined ? Number(txCount) : gatewayStatus.txCount,
    lastRssi: lastRssi !== undefined ? lastRssi : gatewayStatus.lastRssi,
    lastSnr: lastSnr !== undefined ? lastSnr : gatewayStatus.lastSnr
  };

  // Manage infrastructure nodes state
  const n1 = meshNodes.get('!d88b1a58');
  if (n1) {
    n1.online = isConn;
    if (isConn) n1.lastSeen = new Date().toISOString();
  }
  const n2 = meshNodes.get('!0f778ab0');
  if (n2) {
    n2.online = isConn;
    if (isConn) n2.lastSeen = new Date().toISOString();
  }

  if (isConn && Array.isArray(nodes)) {
    const nowSec = Math.floor(Date.now() / 1000);
    nodes.forEach(n => {
      if (!n || !n.nodeId) return;
      // Only track valid Meshtastic node IDs (!xxxxxxxx)
      if (!String(n.nodeId).startsWith('!')) return;
      const prev = meshNodes.get(n.nodeId) || {};
      if (n.nodeId === '!f4e213d4') {
        const heardAgeSec = n.lastHeard ? Math.max(0, nowSec - Number(n.lastHeard)) : 999999;
        const heardRecently = heardAgeSec < 300;
        meshNodes.set(n.nodeId, {
          ...prev,
          rssi: n.rssi !== undefined ? n.rssi : prev.rssi,
          snr: n.snr !== undefined ? n.snr : prev.snr,
          hopsAway: n.hopsAway !== undefined ? n.hopsAway : prev.hopsAway,
          lastHeard: n.lastHeard || prev.lastHeard,
          lastSeen: (heardRecently || prev.paired) ? new Date().toISOString() : prev.lastSeen,
          online: Boolean(heardRecently || prev.paired)
        });
        return;
      }
      meshNodes.set(n.nodeId, {
        ...prev,
        ...n,
        freq: '433.875 MHz',
        region: 'EU_433',
        lastSeen: new Date().toISOString(),
        online: (n.online !== undefined) ? Boolean(n.online) : true
      });
    });
  }

  if (req.io) {
    req.io.emit('lora:status', gatewayStatus);
    req.io.emit('lora:nodes_updated', Array.from(meshNodes.values()));
  }

  const pending = outboundLoRaQueue.filter(i => !i.transmitted);
  res.json({
    success: true,
    nodes: Array.from(meshNodes.values()),
    outboundPackets: pending
  });
});

// =========================================================================
// POST /api/lora/resident-status (REAL-TIME RESIDENT BLE PAIRING SYNC)
// =========================================================================
router.post('/resident-status', (req, res) => {
  const { nodeId, bleMac, deviceName, paired, online, rssi, transport, residentName, userId } = req.body || {};
  const sessionName = (req.session && req.session.userName) ? String(req.session.userName).trim() : '';
  const safeName = String(residentName || sessionName || deviceName || 'Connected LoRa Node').trim();
  const targetId = (nodeId && String(nodeId).startsWith('!'))
    ? String(nodeId).trim().toLowerCase()
    : '!f4e213d4';
  const isPaired = Boolean(paired);
  const prev = meshNodes.get(targetId) || {
    nodeId: targetId,
    shortName: targetId === '!f4e213d4' ? 'RES1' : targetId.slice(-4).toUpperCase(),
    longName: safeName,
    role: 'RESIDENT',
    zone: 'Zone 1 / Resident Mobile Node',
    freq: '433.875 MHz',
    region: 'EU_433',
    hopLimit: 3,
    txPower: 10
  };

  meshNodes.set(targetId, {
    ...prev,
    userId: userId || (req.session && req.session.userId) || prev.userId || null,
    longName: (residentName || sessionName) ? safeName : prev.longName,
    paired: isPaired,
    online: isPaired || prev.online,
    bleMac: bleMac || (nodeId && String(nodeId).includes(':') ? nodeId : prev.bleMac),
    connectedDeviceName: deviceName || prev.connectedDeviceName,
    rssi: rssi !== undefined ? rssi : prev.rssi,
    transport: transport || 'BLE',
    lastSeen: isPaired ? new Date().toISOString() : prev.lastSeen
  });

  if (req.io) {
    req.io.emit('lora:nodes_updated', Array.from(meshNodes.values()));
  }

  res.json({ success: true, node: meshNodes.get(targetId) });
});

// =========================================================================
// GET /api/lora/tx-queue & POST /api/lora/tx-ack
// =========================================================================
router.get('/tx-queue', (req, res) => {
  const pending = outboundLoRaQueue.filter(item => !item.transmitted);
  res.json({
    success: true,
    count: pending.length,
    queue: pending
  });
});

router.post('/tx-ack', (req, res) => {
  const { id } = req.body;
  const item = outboundLoRaQueue.find(p => p.id === id);
  if (item) {
    item.transmitted = true;
    item.status = 'SENT';
    item.transmittedAt = new Date().toISOString();
  }
  res.json({ success: true, id });
});

// =========================================================================
// GET /api/lora/latest-alert (Real-time mobile broadcast poller endpoint)
// =========================================================================
router.get('/latest-alert', async (_req, res) => {
  try {
    const serverNowMs = Date.now();
    if (latestBroadcastAlert) {
      return res.json({
        success: true,
        serverNowMs,
        alert: {
          ...latestBroadcastAlert,
          timestampMs: latestBroadcastAlert.timestampMs || serverNowMs
        }
      });
    }
    const recent = await Alert.findAllWithSender(1).catch(() => []);
    if (recent && recent.length > 0) {
      const a = recent[0];
      const sentIso = a.sent_at || a.created_at || new Date().toISOString();
      const parsedMs = new Date(sentIso).getTime();
      return res.json({
        success: true,
        serverNowMs,
        alert: {
          id: String(a.id),
          alertId: String(a.id),
          title: a.title || 'EMERGENCY ALERT',
          message: a.message || 'Proceed to nearest evacuation center.',
          severity: (a.severity || 'RED').toUpperCase(),
          barangay: a.barangay || 'San Rafael',
          evacCenter: 'San Rafael Evacuation Center',
          sent_at: sentIso,
          timestampMs: (!isNaN(parsedMs) && parsedMs > 0) ? parsedMs : serverNowMs
        }
      });
    }
    return res.json({ success: true, serverNowMs, alert: null });
  } catch (err) {
    return res.json({ success: false, serverNowMs: Date.now(), alert: null });
  }
});

// =========================================================================
// WEATHER SENSOR TELEMETRY & 2-HOUR SILENT WEATHER NOTIFICATION ENDPOINTS
// =========================================================================
router.get('/weather-sensor', (_req, res) => {
  const state = loraWeatherHelper.readState();
  const nowMs = Date.now();
  const lastRxMs = state.current
    ? ( Number(state.current.timestampMs) || new Date(state.current.updatedAt || 0).getTime() || 0 )
    : 0;
  const readingAgeMs = lastRxMs > 0 ? Math.max(0, nowMs - lastRxMs) : 999999999;
  const gwAgeMs = gatewayStatus.lastSeen ? Math.max(0, nowMs - new Date(gatewayStatus.lastSeen).getTime()) : 999999999;
  const gatewayConnected = Boolean(gatewayStatus.connected && gwAgeMs < 12000);
  // Relay sensor is ONLINE if a real sensor reading arrived within the last 2.5 minutes (150,000 ms)
  const relayOnline = Boolean(state.current && lastRxMs > 0 && readingAgeMs <= 150000);

  const nextAutoAlertAt = state.lastWeatherAlertAt
    ? new Date(state.lastWeatherAlertAt + loraWeatherHelper.WEATHER_ALERT_INTERVAL_MS).toISOString()
    : null;
  res.json({
    success: true,
    serverNowMs: nowMs,
    relayOnline,
    gatewayConnected,
    readingAgeSeconds: Math.round(readingAgeMs / 1000),
    current: state.current,
    history: state.history || [],
    latestWeatherAlert: state.latestWeatherAlert || null,
    lastWeatherAlertAt: state.lastWeatherAlertAt || 0,
    nextAutoAlertAt,
    autoIntervalMs: loraWeatherHelper.WEATHER_ALERT_INTERVAL_MS
  });
});

router.post('/weather-sensor', (req, res) => {
  try {
    if (req.io && !ioInstance) ioInstance = req.io;
    const body = req.body || {};
    // Touch timestamp so live readings are always marked fresh on server clock
    const state = loraWeatherHelper.recordReading({
      ...body,
      updatedAt: new Date().toISOString()
    });
    if (!state.current) {
      return res.status(400).json({ success: false, message: 'No valid temperature, humidity, or pressure provided.' });
    }

    const activeIo = req.io || ioInstance;
    if (activeIo) {
      activeIo.emit('lora:weather_update', { ...state.current, relayOnline: true });
    }

    // Periodically share compact weather telemetry packet onto 433.875 MHz mesh (every >= 3 min or explicit flag)
    const now = Date.now();
    if (body.broadcastLoRa === true || (now - lastMeshWeatherTelemetryBroadcastAt >= 3 * 60 * 1000)) {
      const rfPkt = formatCompactWeatherPacket(state.current);
      if (rfPkt) {
        enqueueLoRaPacket(rfPkt, { type: 'WEATHER_TELEMETRY', destinationId: '^all', wantAck: false });
        lastMeshWeatherTelemetryBroadcastAt = now;
      }
    }

    // Trigger 2-hour notification automatically if >= 2 hours elapsed (or never sent yet and reading is live)
    let autoTriggeredAlert = null;
    if (!state.lastWeatherAlertAt || (now - state.lastWeatherAlertAt >= loraWeatherHelper.WEATHER_ALERT_INTERVAL_MS)) {
      dispatchWeatherSensorNotification(activeIo, 'AUTO_2H').catch(() => {});
      autoTriggeredAlert = loraWeatherHelper.readState().latestWeatherAlert;
    }

    return res.json({
      success: true,
      current: state.current,
      latestWeatherAlert: autoTriggeredAlert || state.latestWeatherAlert
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/latest-weather-alert', (_req, res) => {
  try {
    const state = loraWeatherHelper.readState();
    return res.json({
      success: true,
      serverNowMs: Date.now(),
      weatherAlert: state.latestWeatherAlert || null,
      sensor: state.current || null
    });
  } catch (err) {
    return res.json({ success: false, serverNowMs: Date.now(), weatherAlert: null });
  }
});

router.post('/weather-sensor/notify', async (req, res) => {
  try {
    if (req.io && !ioInstance) ioInstance = req.io;
    const state = loraWeatherHelper.readState();
    if (!state.current) {
      return res.status(404).json({ success: false, message: 'No AHT20+BMP280 Relay sensor telemetry recorded yet.' });
    }
    const weatherAlert = await dispatchWeatherSensorNotification(req.io || ioInstance, 'MANUAL_TRIGGER');
    return res.json({ success: true, weatherAlert, current: state.current });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// =========================================================================
// GET /api/lora/bootstrap & GET /api/lora/resident-sync
// Offline-first seed data for the Capacitor Resident App in EBAKWAR_testing
// =========================================================================
router.get(['/bootstrap', '/resident-sync'], async (req, res) => {
  try {
    const residentId = req.query.resident_id || (req.session && req.session.userId) || null;

    const [centers, alertsResult, weather, pagasaGuidance, mapFeatures] = await Promise.all([
      Center.findAll().catch(() => []),
      Alert.findAllWithSender(15).catch(() => []),
      weatherService.getLatestWeather().catch(() => weatherService.getFallbackWeather()),
      pagasaService.getPagasaGuidance().catch(() => null),
      gisCache.getDrawnFeatures(false).catch(() => ({ routes: [], hazards: [] }))
    ]);

    if (weather && pagasaGuidance) {
      weather.pagasa = pagasaGuidance;
    }

    const activeAlert = (alertsResult && alertsResult.length > 0) ? alertsResult[0] : null;

    let residentProfile = null;
    let familyMembers = [];
    let activeSos = null;

    if (residentId) {
      const [resRows] = await db.execute(
        `SELECT r.*, u.email FROM residents r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = ? OR r.user_id = ? LIMIT 1`,
        [residentId, residentId]
      ).catch(() => [[]]);
      if (resRows && resRows.length > 0) {
        residentProfile = resRows[0];
      }
    }

    if (!residentProfile) {
      const [firstRows] = await db.execute(
        `SELECT r.*, u.email FROM residents r LEFT JOIN users u ON r.user_id = u.id ORDER BY r.id ASC LIMIT 1`
      ).catch(() => [[]]);
      residentProfile = firstRows[0] || null;
    }

    if (residentProfile && residentProfile.id) {
      const rawMembers = await HouseholdMember.findByResidentId(residentProfile.id).catch(() => []);
      familyMembers = (rawMembers || []).map(m => ({
        ...m,
        full_name: [m.first_name, m.middle_name, m.last_name].filter(Boolean).join(' ').trim() || m.full_name || 'Household Member',
        relationship: m.relation || m.relationship || 'Family Member',
        special_needs: m.status || (m.is_pwd ? 'PWD' : m.is_pregnant ? 'Pregnant' : 'None')
      }));
      activeSos = await SosModel.getActiveByResidentId(residentProfile.id).catch(() => null);
    }

    const [allResidents] = await db.execute(
      `SELECT r.id, r.user_id, r.first_name, r.middle_name, r.last_name, r.contact_number, r.home_address, r.barangay, r.vulnerability, r.family_size, r.qr_code_uuid, r.is_pwd, r.is_pregnant, r.has_serious_illness, u.email
       FROM residents r
       LEFT JOIN users u ON r.user_id = u.id
       ORDER BY r.id ASC LIMIT 50`
    ).catch(() => [[]]);

    res.json({
      success: true,
      serverTime: new Date().toISOString(),
      gateway: gatewayStatus,
      nodes: Array.from(meshNodes.values()),
      evacuationCenters: centers || [],
      centers: centers || [],
      mapFeatures,
      activeAlert: activeAlert || null,
      recentAlerts: alertsResult || [],
      alerts: alertsResult || [],
      weather: weather || weatherService.getFallbackWeather(),
      loraWeather: loraWeatherHelper.readState(),
      resident: residentProfile,
      familyMembers,
      members: familyMembers,
      activeSos,
      myActiveSos: activeSos,
      availableResidents: allResidents || []
    });
  } catch (err) {
    console.error('Error in /api/lora/bootstrap:', err);
    res.status(500).json({ success: false, message: 'Failed to load bootstrap data' });
  }
});

// =========================================================================
// POST /api/lora/inbound-sos & POST /api/lora/rx
// =========================================================================
async function handleInboundLoRaPacket(req, res) {
  try {
    const {
      rawPacket,
      packet,
      fromNode,
      fromId,
      toId = '^all',
      rssi = -50,
      snr = 10.75,
      hopStart = 3,
      hopLimit = 2,
      relayNode = '!0f778ab0 (REL1)'
    } = req.body || {};

    const incomingText = rawPacket || packet;
    const senderNodeId = fromId || fromNode || '!f4e213d4';
    const hopsUsed = Math.max(0, (Number(hopStart) || 3) - (Number(hopLimit) || 2));

    let parsed = null;
    if (incomingText) {
      parsed = parseEvwPacket(incomingText);
    } else if (req.body && (req.body.latitude !== undefined || req.body.statusCode)) {
      parsed = {
        type: 'SOS',
        command: 'SOS',
        raw: `EVW|SOS|${req.body.msgId || Date.now()}|${req.body.resident_id || 0}|${req.body.latitude},${req.body.longitude},${req.body.accuracy || 10}|${req.body.pinMode || 'G'}|${req.body.vulnCode || 'N'}|${req.body.statusCode || 'ACT'}|${req.body.name || 'Resident'}`,
        msgId: String(req.body.msgId || Date.now()),
        residentId: req.body.resident_id ? Number(req.body.resident_id) : null,
        latitude: Number(req.body.latitude || 13.51024),
        longitude: Number(req.body.longitude || 123.34701),
        accuracy: Number(req.body.accuracy || 10),
        pinMode: req.body.pinMode || 'G',
        vulnCode: req.body.vulnCode || 'N',
        statusCode: req.body.statusCode || 'ACT',
        name: req.body.name || 'Resident'
      };
    }

    // Dynamic Mesh Node Discovery & Telemetry Update
    if (senderNodeId) {
      let role = 'RESIDENT';
      let shortName = senderNodeId.slice(-4).toUpperCase();
      let longName = `EvakWar Node (${senderNodeId})`;

      if (parsed && (parsed.type === 'MSG' || parsed.command === 'MSG')) {
        const r = String(parsed.senderRole || '').toUpperCase();
        if (r.includes('ADMIN')) role = 'GATEWAY';
        else if (r.includes('RESCUER')) role = 'RESCUER';
        else if (r.includes('STAFF')) role = 'STAFF';
        else if (r.includes('RELAY')) role = 'RELAY';
        if (parsed.senderName) longName = `${parsed.senderName} (${role})`;
      } else if (senderNodeId === '!d88b1a58') {
        role = 'GATEWAY';
        shortName = 'HALL';
        longName = 'EvakWar Hall Gateway';
      } else if (senderNodeId === '!0f778ab0') {
        role = 'RELAY';
        shortName = 'REL1';
        longName = 'San Rafael Repeater 1';
      } else if (senderNodeId === '!f4e213d4') {
        role = 'RESIDENT';
        shortName = 'RES1';
        longName = 'Resident Laurence Sinfuego';
      }

      const prev = meshNodes.get(senderNodeId) || {
        nodeId: senderNodeId,
        shortName,
        longName,
        role,
        zone: 'San Rafael',
        freq: '433.875 MHz',
        region: 'EU_433',
        hopLimit: 3,
        txPower: 10
      };

      if (parsed && parsed.senderRole) {
        const r = String(parsed.senderRole).toUpperCase();
        if (r.includes('ADMIN')) prev.role = 'GATEWAY';
        else if (r.includes('RESCUER')) prev.role = 'RESCUER';
        else if (r.includes('STAFF')) prev.role = 'STAFF';
        else if (r.includes('RELAY')) prev.role = 'RELAY';
        if (parsed.senderName) prev.longName = `${parsed.senderName} (${prev.role})`;
      }

      prev.lastSeen = new Date().toISOString();
      prev.rssi = Number(rssi) || -50;
      prev.snr = Number(snr) || 10.75;
      prev.hopsAway = hopsUsed;
      prev.relayNode = relayNode;
      prev.online = true;
      meshNodes.set(senderNodeId, prev);

      // Instantly notify admin dashboard of new/updated node
      if (req.io) {
        req.io.emit('lora:nodes_updated', Array.from(meshNodes.values()));
      }
    }

    if (!parsed) {
      return res.status(400).json({ success: false, message: 'Invalid EVW|... packet format.' });
    }

    gatewayStatus.lastSeen = new Date().toISOString();
    gatewayStatus.rxCount += 1;
    gatewayStatus.lastPacket = parsed.raw;
    gatewayStatus.lastRssi = rssi;
    gatewayStatus.lastSnr = snr;

    // Handle CANCEL packet
    if (parsed.statusCode === 'CAN' || parsed.command === 'CANCEL_SOS') {
      const cancelled = await SosModel.cancelAlert(parsed.sosId || null, parsed.residentId || null).catch(() => []);
      try {
        const NotificationModel = require('../models/notificationModel');
        NotificationModel.invalidateCache();
      } catch (_e) {}

      if (req.io) {
        if (cancelled && cancelled.length > 0) {
          cancelled.forEach(alert => {
            rescuerTracker.clearRescuerLocation(alert.id);
            req.io.to('staff_admin_channel').emit('rescuer:location_cleared', { sos_id: Number(alert.id) });
            req.io.emit('sos:cancel', { id: Number(alert.id), sos_id: Number(alert.id), resident_id: alert.resident_id ? Number(alert.resident_id) : null, status: 'CANCELLED', via: 'LORA_MESH' });
            req.io.emit('sos:update_status', { id: Number(alert.id), sos_id: Number(alert.id), resident_id: alert.resident_id ? Number(alert.resident_id) : null, status: 'CANCELLED' });
          });
        } else {
          req.io.emit('sos:cancel', { id: parsed.sosId || null, resident_id: parsed.residentId || null, status: 'CANCELLED', via: 'LORA_MESH' });
        }
      }
      const ackPacket = `EVW|ACK|${parsed.sosId || 0}|${parsed.residentId || 0}|CANCELLED|Hall Gateway (!d88b1a58)`;
      enqueueLoRaPacket(ackPacket, { type: 'SOS_CANCEL_ACK' });
      return res.json({ success: true, status: 'CANCELLED', ackPacket });
    }

    if (parsed.type === 'SOS') {
      if (parsed.msgId && processedMsgIds.has(parsed.msgId) && parsed.statusCode !== 'UPD') {
        const existingAlert = parsed.residentId
          ? await SosModel.getActiveByResidentId(parsed.residentId).catch(() => null)
          : null;
        return res.json({
          success: true,
          duplicate: true,
          sos: existingAlert,
          ackPacket: `EVW|ACK|${existingAlert ? existingAlert.id : 0}|${parsed.residentId || 0}|ACTIVE|Hall Gateway (!d88b1a58)`
        });
      }
      if (parsed.msgId) {
        processedMsgIds.set(parsed.msgId, Date.now());
      }

      let resolvedResId = parsed.residentId;
      let displayName = parsed.name || 'Resident';

      // Map Node 3 (!f4e213d4) default resident if placeholder ID (0 or 1) was sent
      if ((!resolvedResId || resolvedResId <= 1) && (!displayName || displayName === 'Resident')) {
        resolvedResId = 22;
        displayName = 'Laurence Sinfuego';
      }

      const sosUniqueId = parsed.sosId || parsed.msgId || Date.now();
      const payload = {
        id: sosUniqueId,
        resident_id: resolvedResId,
        name: displayName,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        accuracy: parsed.accuracy || 10,
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        barangay: 'San Rafael (433.875 MHz LoRa)',
        via: 'LORA_MESH_433MHZ',
        lora_node: senderNodeId,
        lora_relay: relayNode,
        lora_hops: hopsUsed,
        lora_rssi: rssi,
        lora_snr: snr,
        pin_mode: parsed.pinMode,
        vuln_code: parsed.vulnCode
      };

      // 1. INSTANT DISPATCH TO ADMIN DASHBOARD & EVACUATION MAP IN 0ms (Never block for DB!)
      if (req.io) {
        if (parsed.statusCode === 'UPD') {
          req.io.emit('sos:update', payload);
        } else {
          req.io.emit('sos:new', payload);
          req.io.emit('sos_alert', payload);
          req.io.emit('sos:alert', payload);
          req.io.emit('notification:new', {
            type: 'sos',
            title: `🚨 LoRa SOS: ${displayName}`,
            message: `Distress signal received via 433.875 MHz LoRa (${senderNodeId})`,
            alert: payload,
            created_at: new Date().toISOString()
          });
        }
        req.io.emit('lora:packet', {
          direction: 'RX',
          raw: parsed.raw,
          parsed,
          fromNode: senderNodeId,
          relayNode,
          hopsUsed,
          rssi,
          snr,
          timestamp: new Date().toISOString()
        });
      }

      // 2. Queue Gateway ACK frame immediately for 433.875 MHz RF broadcast
      const ackPacket = `EVW|ACK|${payload.id}|${resolvedResId}|ACTIVE|Hall Gateway (!d88b1a58)`;
      enqueueLoRaPacket(ackPacket, { type: 'SOS_GATEWAY_RECEIVED', sosId: payload.id });

      // 3. Asynchronous DB lookup and persistence in background (non-blocking)
      (async () => {
        try {
          if (resolvedResId) {
            const [rRows] = await db.execute(
              `SELECT id, first_name, last_name, barangay FROM residents WHERE id = ? OR user_id = ? LIMIT 1`,
              [resolvedResId, resolvedResId]
            ).catch(() => [[]]);
            if (rRows && rRows.length > 0) {
              payload.resident_id = rRows[0].id || resolvedResId;
              payload.name = `${rRows[0].first_name || ''} ${rRows[0].last_name || ''}`.trim() || displayName;
            }
          }
          await SosModel.createAlert({
            resident_id: payload.resident_id,
            name: payload.name,
            latitude: parsed.latitude,
            longitude: parsed.longitude,
            accuracy: parsed.accuracy || 10
          }).catch(() => null);
        } catch (_) {}
      })();

      return res.json({
        success: true,
        sosId: payload.id,
        sos: payload,
        alert: payload,
        ackPacket
      });
    }

    if (parsed.type === 'MSG') {
      if (parsed.msgId && processedMsgIds.has('chat_' + parsed.msgId)) {
        return res.json({ success: true, duplicate: true });
      }
      if (parsed.msgId) {
        processedMsgIds.set('chat_' + parsed.msgId, Date.now());
      }

      const savedMsg = appendChatMessage({
        ...parsed,
        nodeId: parsed.nodeId || senderNodeId || '!f4e213d4',
        transport: 'LORA_433MHZ'
      });

      if (req.io && savedMsg) {
        req.io.emit('lora:chat', savedMsg);
      }

      return res.json({
        success: true,
        chatMessage: savedMsg
      });
    }

    if (parsed.type === 'WTH' || parsed.type === 'WTH_ALT') {
      const updatedState = loraWeatherHelper.recordReading({
        temperature: parsed.temperature,
        humidity: parsed.humidity,
        pressure: parsed.pressure,
        nodeId: parsed.nodeId || senderNodeId || '!0f778ab0',
        rssi,
        snr,
        hopsAway: hopsUsed,
        source: 'LORA_RF_PACKET',
        updatedAt: parsed.sent_at
      });
      if (req.io && updatedState.current) {
        req.io.emit('lora:weather_update', updatedState.current);
      }
      return res.json({ success: true, parsed, weather: updatedState.current });
    }

    return res.json({ success: true, parsed });
  } catch (err) {
    console.error('Error processing inbound LoRa packet:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

router.post('/inbound-sos', handleInboundLoRaPacket);
router.post('/rx', handleInboundLoRaPacket);

// =========================================================================
// GET /api/lora/chat & POST /api/lora/chat (433.875 MHz LoRa Group Chat)
// =========================================================================
router.get('/chat', (_req, res) => {
  res.json({
    success: true,
    messages: loraChatHistory.slice(-120)
  });
});

router.get('/chat/latest', (_req, res) => {
  const last = loraChatHistory.length > 0 ? loraChatHistory[loraChatHistory.length - 1] : null;
  res.json({
    success: true,
    latest: last
  });
});

router.post('/chat', (req, res) => {
  try {
    const { msgId, senderRole, senderName, nodeId, text, message, viaLoRa, isOfflineLora } = req.body || {};
    const cleanText = String(text || message || '').replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim().slice(0, 120);
    if (!cleanText) {
      return res.status(400).json({ success: false, message: 'Message text is required.' });
    }

    const id = String(msgId || (String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 90 + 10)))).trim();
    const role = String(senderRole || 'Resident').replace(/\|/g, '/').trim().slice(0, 14);
    const name = String(senderName || 'Community Member').replace(/\|/g, '/').trim().slice(0, 28);
    const resolvedNode = (nodeId && String(nodeId).startsWith('!'))
      ? String(nodeId).trim()
      : (role.toLowerCase().includes('admin') ? (gatewayStatus.nodeId || '!d88b1a58') : (nodeId || null));

    const isDupe = processedMsgIds.has('chat_' + id);
    processedMsgIds.set('chat_' + id, Date.now());

    // Explicit transport: Only mark as 433 MHz LoRa if transmitted over LoRa RF (viaLoRa / isOfflineLora)
    const isViaLoRa = Boolean(viaLoRa || isOfflineLora);
    const transportType = isViaLoRa ? 'LORA_433MHZ' : 'WIFI';

    const savedMsg = appendChatMessage({
      id,
      msgId: id,
      senderRole: role,
      senderName: name,
      nodeId: resolvedNode,
      text: cleanText,
      timestamp: Date.now(),
      transport: transportType
    });

    if (req.io && savedMsg && !isDupe) {
      req.io.emit('lora:chat', savedMsg);
    }

    // Queue outbound 433.875 MHz LoRa broadcast on Hall Gateway (!d88b1a58)
    // Ensures Admin messages (online or offline) and Wi-Fi messages are broadcast over COM3 LoRa Mesh
    let queued = null;
    const shouldQueueLoRa = !isDupe && (!viaLoRa || isOfflineLora || role.toLowerCase().includes('admin'));
    if (shouldQueueLoRa) {
      const tsSec = Math.floor(Date.now() / 1000);
      const rawPacket = `EVW|MSG|${id}|${role}|${name}|${resolvedNode}|${tsSec}|${cleanText}|${savedMsg && savedMsg.seq ? savedMsg.seq : ''}`;
      queued = enqueueLoRaPacket(rawPacket, {
        type: 'CHAT_MSG',
        msgId: id,
        destinationId: '^all',
        wantAck: false
      });
    }

    return res.json({
      success: true,
      chatMessage: savedMsg,
      queued
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// =========================================================================
// POST /api/lora/transmit-serial
// Direct convenience endpoint to transmit a raw EVW packet over COM3
// =========================================================================
router.post('/transmit-serial', async (req, res) => {
  const { packet, port } = req.body || {};
  if (!packet) {
    return res.status(400).json({ success: false, message: 'Packet text required' });
  }

  const queued = enqueueLoRaPacket(packet, { type: 'DIRECT_SERIAL_REQUEST' });
  const serialPort = port || process.env.LORA_SERIAL_PORT || 'COM3';

  execFile(
    'python',
    ['-m', 'meshtastic', '--port', serialPort, '--sendtext', packet],
    { timeout: 12000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
    (error, stdout, stderr) => {
      if (error) {
        return res.json({
          success: true,
          mode: 'QUEUED_FOR_BRIDGE',
          queued,
          serialNote: stderr || error.message
        });
      }
      queued.transmitted = true;
      queued.status = 'SENT_DIRECT_SERIAL';
      gatewayStatus.txCount += 1;
      gatewayStatus.lastSeen = new Date().toISOString();
      return res.json({
        success: true,
        mode: 'DIRECT_SERIAL_TX',
        port: serialPort,
        output: stdout,
        queued
      });
    }
  );
});


router.post('/test-broadcast', (req, res) => {
  const queued = queueOutboundAlertBroadcast({
    id: req.body.id || Date.now(),
    title: req.body.title || 'RED ALERT: Mandatory Evacuation Order',
    message: req.body.message || 'Evacuate immediately to San Rafael Evacuation Center via Zone 1 safe path.',
    severity: req.body.severity || 'RED',
    barangay: req.body.barangay || 'San Rafael',
    evacCenter: req.body.evacCenter || 'San Rafael Evacuation Center'
  });
  res.json({ success: true, queued });
});

module.exports = {
  router,
  attachIo,
  enqueueLoRaPacket,
  queueOutboundPacket,
  queueOutboundSosAck,
  queueOutboundAlertBroadcast,
  parseEvwPacket,
  parseEvakWarLoRaFrame,
  meshNodes
};

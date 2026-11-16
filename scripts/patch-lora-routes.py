with open('routes/loraRoutes.js', 'r', encoding='utf-8') as f:
    text = f.read()

target = """// =========================================================================
// GET /api/lora/status
// =========================================================================
router.get('/status', async (req, res) => {
  try {
    const activeSos = await SosModel.getActiveAlerts().catch(() => []);
    res.json({
      success: true,
      frequency: '433.875 MHz',
      region: 'EU_433',
      modulation: 'LONG_FAST (SF11 / BW 250kHz)',
      hopLimit: 3,
      txPower: 10,
      gateway: gatewayStatus,
      nodes: Array.from(meshNodes.values()),
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
  gatewayStatus = {
    ...gatewayStatus,
    connected: connected !== undefined ? Boolean(connected) : true,
    port: port || gatewayStatus.port,
    nodeId: nodeId || gatewayStatus.nodeId,
    nodeName: nodeName || gatewayStatus.nodeName,
    lastSeen: new Date().toISOString(),
    rxCount: rxCount !== undefined ? Number(rxCount) : gatewayStatus.rxCount,
    txCount: txCount !== undefined ? Number(txCount) : gatewayStatus.txCount,
    lastRssi: lastRssi !== undefined ? lastRssi : gatewayStatus.lastRssi,
    lastSnr: lastSnr !== undefined ? lastSnr : gatewayStatus.lastSnr
  };

  if (Array.isArray(nodes)) {
    nodes.forEach(n => {
      if (!n || !n.nodeId) return;
      const prev = meshNodes.get(n.nodeId) || {};
      meshNodes.set(n.nodeId, {
        ...prev,
        ...n,
        freq: '433.875 MHz',
        region: 'EU_433',
        lastSeen: new Date().toISOString(),
        online: true
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
});"""

replacement = """// =========================================================================
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

    // 2. Evaluate real-time online status of all 3 nodes
    const nodesList = Array.from(meshNodes.values()).map(n => {
      const nodeAge = n.lastSeen ? (nowMs - new Date(n.lastSeen).getTime()) : 999999;
      let isNodeOnline = Boolean(n.online);

      if (n.nodeId === '!d88b1a58') {
        // Node 1: Hall Gateway is only online if physical serial link is alive
        isNodeOnline = isGwAlive;
      } else if (n.nodeId === '!0f778ab0') {
        // Node 2: Relay is only reachable if Gateway is connected AND heard within 25 seconds
        isNodeOnline = isGwAlive && (nodeAge < 25000);
      } else if (n.nodeId === '!f4e213d4') {
        // Node 3: Resident is only online/paired if actively connected via BLE/Mesh within 20 seconds
        isNodeOnline = Boolean(n.paired !== false && n.online !== false && (nodeAge < 20000));
      }

      return {
        ...n,
        online: isNodeOnline,
        paired: (n.nodeId === '!f4e213d4') ? isNodeOnline : undefined,
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

  // If gateway reported disconnected, mark Node 1 & Node 2 offline immediately
  if (!isConn) {
    const n1 = meshNodes.get('!d88b1a58');
    if (n1) n1.online = false;
    const n2 = meshNodes.get('!0f778ab0');
    if (n2) n2.online = false;
  } else if (Array.isArray(nodes)) {
    nodes.forEach(n => {
      if (!n || !n.nodeId) return;
      const prev = meshNodes.get(n.nodeId) || {};
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
  const { nodeId, paired, online, rssi, transport } = req.body || {};
  const targetId = nodeId || '!f4e213d4';
  const isPaired = Boolean(paired);
  const prev = meshNodes.get(targetId) || {
    nodeId: targetId,
    shortName: 'RES1',
    longName: 'EvakWar Resident 1',
    role: 'RESIDENT'
  };

  meshNodes.set(targetId, {
    ...prev,
    paired: isPaired,
    online: isPaired,
    rssi: rssi !== undefined ? rssi : prev.rssi,
    transport: transport || 'BLE',
    lastSeen: isPaired ? new Date().toISOString() : null
  });

  if (req.io) {
    req.io.emit('lora:nodes_updated', Array.from(meshNodes.values()));
  }

  res.json({ success: true, node: meshNodes.get(targetId) });
});"""

assert target in text, "target not found in routes/loraRoutes.js"
text = text.replace(target, replacement, 1)

with open('routes/loraRoutes.js', 'w', encoding='utf-8') as f:
    f.write(text)

print("Updated routes/loraRoutes.js with real-time freshness checks!")

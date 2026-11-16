with open('routes/loraRoutes.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Node 3 definition
old_node3 = """  ['!f4e213d4', {
    nodeId: '!f4e213d4',
    shortName: 'RES1',
    longName: 'EvakWar Resident 1',
    role: 'RESIDENT',
    zone: 'Zone 1 / Resident Mobile Node',
    freq: '433.875 MHz',
    region: 'EU_433',
    hopLimit: 3,
    txPower: 10,
    lastSeen: new Date().toISOString(),
    rssi: -50,
    snr: 10.75,
    hopsAway: 0,
    online: true
  }]"""

new_node3 = """  ['!f4e213d4', {
    nodeId: '!f4e213d4',
    shortName: 'RES1',
    longName: 'Sinfuego Laurence Resident',
    role: 'RESIDENT',
    zone: 'Zone 1 / Resident Mobile Node',
    freq: '433.875 MHz',
    region: 'EU_433',
    hopLimit: 3,
    txPower: 10,
    lastSeen: null,
    rssi: -50,
    snr: 10.75,
    hopsAway: 0,
    online: false,
    paired: false
  }]"""

# Replace status evaluation
old_eval = """    // 2. Evaluate real-time online status of all 3 nodes
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
    });"""

new_eval = """    // 2. Evaluate real-time online status of infrastructure & resident nodes
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
        // Node 3: Resident Node is ONLY online/paired when mobile app is actively connected via BLE
        isNodeOnline = Boolean(n.paired === true && n.online === true && (nodeAge < 30000));
      }

      return {
        ...n,
        online: isNodeOnline,
        paired: (n.nodeId === '!f4e213d4') ? isNodeOnline : undefined,
        ageSeconds: Math.round(nodeAge / 1000)
      };
    });"""

# Replace heartbeat handler
old_hb = """  // If gateway reported disconnected, mark Node 1 & Node 2 offline immediately
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
  }"""

new_hb = """  // Manage infrastructure nodes state
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
    nodes.forEach(n => {
      if (!n || !n.nodeId) return;
      // Resident node BLE pairing is managed via /api/lora/resident-status, not gateway heartbeat
      if (n.nodeId === '!f4e213d4') return;
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
  }"""

norm_c = content.replace('\r\n', '\n')
norm_c = norm_c.replace(old_node3.replace('\r\n', '\n'), new_node3.replace('\r\n', '\n'))
norm_c = norm_c.replace(old_eval.replace('\r\n', '\n'), new_eval.replace('\r\n', '\n'))
norm_c = norm_c.replace(old_hb.replace('\r\n', '\n'), new_hb.replace('\r\n', '\n'))

with open('routes/loraRoutes.js', 'w', encoding='utf-8') as f:
    f.write(norm_c)

print('SUCCESS: routes/loraRoutes.js patched cleanly')

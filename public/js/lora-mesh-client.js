/**
 * EvakWar (E-BAKWAR) — Resident Multi-Transport LoRa Mesh Client (433.875 MHz)
 * Supports 3 Offline Hardware Connection Modes to the Resident's ESP32 + SX1278 Node:
 *   1. BLE (Bluetooth Low Energy GATT - Interactive Device Picker Modal + Native Capacitor BLE & Web Bluetooth)
 *   2. USB-OTG Serial (115200 baud, Meshtastic 0x94 0xC3 framing via Native AndroidUsbSerialBridge & WebSerial)
 *   3. Wi-Fi / LAN Bridge (ESP32 Hotspot 192.168.4.1 or Barangay Hall Server)
 */
(function (global) {
  'use strict';

  // Meshtastic Official BLE GATT UUIDs
  const MESH_SERVICE_UUID = '6ba1b218-15a8-461f-9fa8-5dcae273eafd';
  const TORADIO_UUID      = 'f75c76d2-129e-4dad-a1dd-7866124401e7';
  const FROMRADIO_UUID    = '2c55e69e-4993-11ed-b878-0242ac120002';
  const FROMNUM_UUID      = 'ed9da18c-a800-4f66-a670-aa7547e34453';

  // Meshtastic Serial Stream Framing (0x94, 0xC3, MSB_LEN, LSB_LEN, ...protobuf)
  const SERIAL_MAGIC_1 = 0x94;
  const SERIAL_MAGIC_2 = 0xC3;

  // =========================================================================
  // Minimal Pure-JS Protobuf Encoder/Decoder for Meshtastic ToRadio/FromRadio
  // =========================================================================
  function encodeVarint(value) {
    const bytes = [];
    let v = value >>> 0;
    while (v > 0x7f) {
      bytes.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    bytes.push(v & 0x7f);
    return new Uint8Array(bytes);
  }

  function concatUint8(arrays) {
    let total = 0;
    for (const a of arrays) total += a.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) {
      out.set(a, offset);
      offset += a.length;
    }
    return out;
  }

  function encodeLengthDelimited(fieldNumber, payloadBytes) {
    const tag = (fieldNumber << 3) | 2;
    return concatUint8([
      encodeVarint(tag),
      encodeVarint(payloadBytes.length),
      payloadBytes
    ]);
  }

  function encodeVarintField(fieldNumber, value) {
    const tag = (fieldNumber << 3) | 0;
    return concatUint8([encodeVarint(tag), encodeVarint(value)]);
  }

  function encodeFixed32Field(fieldNumber, value) {
    const tag = (fieldNumber << 3) | 5;
    const b = new Uint8Array(5);
    b[0] = tag;
    b[1] = value & 0xff;
    b[2] = (value >>> 8) & 0xff;
    b[3] = (value >>> 16) & 0xff;
    b[4] = (value >>> 24) & 0xff;
    return b;
  }

  /**
   * Builds a Meshtastic `ToRadio` protobuf binary payload containing a broadcast
   * `MeshPacket` on `PortNum.TEXT_MESSAGE_APP` (1) with `hop_limit = 3` and `want_ack = true`.
   */
  function encodeMeshtasticTextToRadio(textString) {
    const textBytes = new TextEncoder().encode(textString);

    // message Data { PortNum portnum = 1; bytes payload = 2; }
    const dataMsg = concatUint8([
      encodeVarintField(1, 1), // portnum = 1 (TEXT_MESSAGE_APP)
      encodeLengthDelimited(2, textBytes) // payload = UTF8 bytes
    ]);

    const packetId = Math.floor(Math.random() * 0x7fffffff) || 1001;

    // message MeshPacket {
    //   fixed32 to = 2; (0xffffffff broadcast)
    //   Data decoded = 4;
    //   fixed32 id = 6;
    //   uint32 hop_limit = 9;
    //   bool want_ack = 10;
    // }
    const meshPacket = concatUint8([
      encodeFixed32Field(2, 0xffffffff),
      encodeLengthDelimited(4, dataMsg),
      encodeFixed32Field(6, packetId),
      encodeVarintField(9, 3) // hop_limit = 3 (broadcast packets must have want_ack = false)
    ]);

    // message ToRadio { MeshPacket packet = 1; }
    return encodeLengthDelimited(1, meshPacket);
  }

  /**
   * Builds `ToRadio { uint32 want_config_id = 3; }` to wake up Meshtastic BLE/Serial stream
   */
  function encodeWantConfigToRadio() {
    return encodeVarintField(3, 4242);
  }

  /**
   * Builds a 24-byte `ToRadio` packet that requests live Environment Telemetry (`AHT20 + BMP280`)
   * from the outdoor Relay node (`!0f778ab0` = `0x0f778ab0`) over 433.875 MHz LoRa RF.
   *
   * MeshPacket {
   *   fixed32 to = 2 (0x0f778ab0);
   *   Data decoded = 4 { portnum = 67 (TELEMETRY_APP), payload = [0x1a, 0x00] (environment_metrics), want_response = true };
   *   fixed32 id = 6 (packetId);
   *   uint32 hop_limit = 9 (3);
   * }
   */
  function encodeRequestRelayTelemetryToRadio(relayNodeNum = 0x0f778ab0) {
    const dataMsg = concatUint8([
      encodeVarintField(1, 67), // PortNum.TELEMETRY_APP = 67
      encodeLengthDelimited(2, new Uint8Array([0x1a, 0x00])), // Telemetry { environment_metrics: {} }
      encodeVarintField(3, 1) // want_response = true
    ]);
    const packetId = Math.floor(Math.random() * 0x7fffffff) || 1;
    const meshPacket = concatUint8([
      encodeFixed32Field(2, relayNodeNum >>> 0),
      encodeLengthDelimited(4, dataMsg),
      encodeFixed32Field(6, packetId),
      encodeVarintField(9, 3) // hop_limit = 3
    ]);
    return encodeLengthDelimited(1, meshPacket);
  }

  /**
   * Wraps a `ToRadio` protobuf payload in the 4-byte Meshtastic Serial header (0x94 0xC3 MSB LSB)
   */
  function wrapSerialFrame(protoBytes) {
    const len = protoBytes.length;
    const frame = new Uint8Array(4 + len);
    frame[0] = SERIAL_MAGIC_1;
    frame[1] = SERIAL_MAGIC_2;
    frame[2] = (len >>> 8) & 0xff;
    frame[3] = len & 0xff;
    frame.set(protoBytes, 4);
    return frame;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Scans an incoming `FromRadio` protobuf byte array for any `EVW|...` UTF-8 payload.
   * Uses exact Meshtastic protobuf decoding first (`FromRadio.packet(2) -> MeshPacket.decoded(4) -> Data.payload(2)`)
   * so UTF-8 emojis (📡, 🌊, 🚑, 📍) and accented characters are preserved 100% intact.
   */
  function extractEvwStringFromBytes(uint8Bytes) {
    if (!uint8Bytes || uint8Bytes.length < 6) return null;
    try {
      // 1. Exact Meshtastic Protobuf decode: FromRadio -> MeshPacket (fn=2) -> Data (fn=4) -> payload (fn=2)
      const fromRadioFields = readProtoFields(uint8Bytes);
      const pktField = fromRadioFields.find(f => f.fn === 2 && f.wt === 2);
      if (pktField && pktField.val) {
        const pktFields = readProtoFields(pktField.val);
        const decField = pktFields.find(f => f.fn === 4 && f.wt === 2);
        if (decField && decField.val) {
          const dataFields = readProtoFields(decField.val);
          const payloadField = dataFields.find(f => f.fn === 2 && f.wt === 2);
          if (payloadField && payloadField.val && payloadField.val.length >= 6) {
            const decodedText = new TextDecoder('utf-8', { fatal: false }).decode(payloadField.val);
            const evwPos = decodedText.indexOf('EVW|');
            if (evwPos !== -1) {
              const clean = decodedText.slice(evwPos).replace(/[\x00-\x1F\x7F\uFFFD]+$/g, '').trim();
              if (clean.length >= 8) return clean;
            }
          }
        }
      }

      // 2. Fallback UTF-8 scan (e.g. plain-text serial logs or unwrapped Data bytes)
      const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8Bytes);
      return extractEvwStringFromAscii(text);
    } catch (e) {
      return null;
    }
  }

  function extractEvwStringFromAscii(text) {
    if (!text || typeof text !== 'string') return null;
    const idx = text.indexOf('EVW|');
    if (idx === -1) return null;
    let result = '';
    for (let i = idx; i < text.length; i++) {
      const code = text.charCodeAt(i);
      // Stop on ASCII control characters or invalid UTF-8 replacement chars, but KEEP all valid UTF-8 / emojis!
      if (code < 32 || code === 127 || code === 0xFFFD) {
        break;
      }
      result += text[i];
    }
    return result.length >= 8 ? result.trim() : null;
  }

  // Minimal protobuf reader for Meshtastic FromRadio -> MeshPacket -> Data (portnum=67) -> Telemetry -> EnvironmentMetrics
  function readProtoFields(bytes) {
    const fields = [];
    if (!bytes || !bytes.length) return fields;
    let pos = 0;
    const len = bytes.length;
    const readVarint = () => {
      let res = 0;
      let shift = 0;
      let count = 0;
      while (pos < len && count < 10) {
        const b = bytes[pos++];
        count++;
        if (shift < 32) {
          res |= (b & 0x7f) << shift;
        }
        if ((b & 0x80) === 0) return res >>> 0;
        shift += 7;
      }
      return res >>> 0;
    };
    while (pos < len) {
      const tag = readVarint();
      if (!tag) break;
      const fn = tag >>> 3;
      const wt = tag & 0x7;
      if (wt === 0) {
        const raw = readVarint();
        fields.push({ fn, wt, val: raw, i32: raw | 0 });
      } else if (wt === 1) {
        if (pos + 8 > len) break;
        pos += 8;
      } else if (wt === 2) {
        const slen = readVarint();
        if (pos + slen > len) break;
        fields.push({ fn, wt, val: bytes.subarray(pos, pos + slen) });
        pos += slen;
      } else if (wt === 5) {
        if (pos + 4 > len) break;
        const dv = new DataView(bytes.buffer, bytes.byteOffset + pos, 4);
        fields.push({ fn, wt, u32: dv.getUint32(0, true), f32: dv.getFloat32(0, true) });
        pos += 4;
      } else {
        break;
      }
    }
    return fields;
  }

  function extractEnvironmentTelemetryFromBytes(bytes) {
    try {
      const fromRadioFields = readProtoFields(bytes);
      const pktField = fromRadioFields.find(f => f.fn === 2 && f.wt === 2);
      if (!pktField) return null;

      const pktFields = readProtoFields(pktField.val);
      const fromField = pktFields.find(f => f.fn === 1 && f.wt === 5);
      const decField = pktFields.find(f => f.fn === 4 && f.wt === 2);
      const snrField = pktFields.find(f => f.fn === 8 && f.wt === 5);
      const rssiField = pktFields.find(f => f.fn === 12 && f.wt === 0);
      if (!decField) return null;

      const dataFields = readProtoFields(decField.val);
      const portField = dataFields.find(f => f.fn === 1 && f.wt === 0);
      const payField = dataFields.find(f => f.fn === 2 && f.wt === 2);
      if (!portField || portField.val !== 67 || !payField) return null; // 67 = TELEMETRY_APP

      const telFields = readProtoFields(payField.val);
      const timeField = telFields.find(f => f.fn === 1 && f.wt === 5);
      const envField = telFields.find(f => f.fn === 3 && f.wt === 2);
      if (!envField) return null;

      const envFields = readProtoFields(envField.val);
      const tF = envFields.find(f => f.fn === 1 && f.wt === 5);
      const hF = envFields.find(f => f.fn === 2 && f.wt === 5);
      const pF = envFields.find(f => f.fn === 3 && f.wt === 5);

      const temperature = tF && isFinite(tF.f32) ? Number(tF.f32.toFixed(2)) : null;
      const humidity = hF && isFinite(hF.f32) ? Number(hF.f32.toFixed(2)) : null;
      const pressure = pF && isFinite(pF.f32) ? Number(pF.f32.toFixed(2)) : null;
      if (temperature === null && humidity === null && pressure === null) return null;

      const nodeId = fromField ? ('!' + fromField.u32.toString(16).padStart(8, '0')) : '!0f778ab0';
      const tsMs = (timeField && timeField.u32 > 1600000000) ? (timeField.u32 * 1000) : Date.now();
      const rssi = (rssiField && isFinite(rssiField.i32) && rssiField.i32 !== 0) ? rssiField.i32 : null;
      const snr = (snrField && isFinite(snrField.f32)) ? Number(snrField.f32.toFixed(2)) : null;
      return {
        type: 'WTH',
        nodeId,
        temperature,
        humidity,
        pressure,
        rssi,
        snr,
        timestamp: tsMs,
        sent_at: new Date(tsMs).toISOString(),
        source: 'LORA_TELEMETRY_RF'
      };
    } catch (_) {
      return null;
    }
  }

  /**
   * Parses an `EVW|...` packet into a structured JavaScript object
   */
  function parseEvwPacket(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const trimmed = rawText.trim();
    if (!trimmed.startsWith('EVW|')) return null;

    const parts = trimmed.split('|');
    const type = parts[1];

    if (type === 'CAN') {
      return {
        type: 'SOS',
        command: 'CANCEL_SOS',
        statusCode: 'CAN',
        raw: trimmed,
        sosId: parts[2] || null,
        residentId: parts[3] ? Number(parts[3]) : null
      };
    }

    if (type === 'SOS') {
      const coords = (parts[4] || '13.51024,123.34701,10').split(',');
      return {
        type: 'SOS',
        raw: trimmed,
        msgId: parts[2] || String(Date.now()),
        sosId: parts[2] || String(Date.now()),
        residentId: parts[3] ? Number(parts[3]) : null,
        latitude: parseFloat(coords[0]) || 13.51024,
        longitude: parseFloat(coords[1]) || 123.34701,
        accuracy: parseFloat(coords[2]) || 10,
        pinMode: parts[5] || 'G',
        vulnCode: parts[6] || 'N',
        statusCode: parts[7] || 'ACT',
        name: parts[8] || 'Resident'
      };
    }

    if (type === 'ACK') {
      const coordParts = (parts[6] || '').split(',');
      const rLat = coordParts.length >= 2 ? parseFloat(coordParts[0]) : null;
      const rLng = coordParts.length >= 2 ? parseFloat(coordParts[1]) : null;
      return {
        type: 'ACK',
        raw: trimmed,
        sosId: parts[2] ? (isNaN(Number(parts[2])) ? parts[2] : Number(parts[2])) : null,
        residentId: parts[3] ? Number(parts[3]) : null,
        status: parts[4] || 'ACKNOWLEDGED',
        responderName: parts[5] || 'Barangay Hall',
        rescuerLat: (rLat !== null && isFinite(rLat)) ? rLat : null,
        rescuerLng: (rLng !== null && isFinite(rLng)) ? rLng : null
      };
    }

    if (type === 'ALT') {
      const evacCenter = (parts[6] || 'San Rafael Evacuation Center').trim();
      const rawMsg = parts.slice(7).join('|') || 'Proceed to nearest evacuation center immediately.';
      const cleanMsg = rawMsg.replace(/[\x00-\x1F\x7F-\x9F].*$/, '').trim();
      return {
        type: 'ALT',
        raw: trimmed,
        id: parts[2] || String(Date.now()),
        alertId: parts[2] || String(Date.now()),
        severity: (parts[3] || 'RED').toUpperCase(),
        zone: parts[4] || 'ALL',
        barangay: parts[4] || 'San Rafael',
        title: (parts[5] || 'EMERGENCY ALERT').trim(),
        evacCenter: evacCenter,
        instructions: cleanMsg,
        message: cleanMsg,
        source: 'LORA_433MHZ',
        sent_at: new Date().toISOString()
      };
    }

    if (type === 'CAN') {
      return {
        type: 'CAN',
        raw: trimmed,
        sosId: parts[2] ? Number(parts[2]) : null,
        residentId: parts[3] ? Number(parts[3]) : null,
        status: 'CANCELLED'
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
        raw: trimmed,
        id: msgId,
        msgId: msgId,
        seq: seq,
        senderRole: senderRole,
        senderName: senderName,
        nodeId: nodeId,
        senderBadge: `${senderRole} | ${senderName}`,
        text: cleanText,
        message: cleanText,
        timestamp: timestamp,
        sent_at: new Date(timestamp).toISOString(),
        created_at: new Date(timestamp).toISOString(),
        source: 'LORA_433MHZ',
        transport: 'LORA_433MHZ'
      };
    }

    if (type === 'WTH' || type === 'WTH_ALT') {
      const isAlert = type === 'WTH_ALT';
      const alertId = isAlert ? (parts[2] || String(Date.now())).trim() : null;
      const tsIdx = isAlert ? 3 : 2;
      const rawTs = parts[tsIdx] ? Number(parts[tsIdx]) : 0;
      const timestamp = rawTs > 0 ? (rawTs < 10000000000 ? rawTs * 1000 : rawTs) : Date.now();
      const temperature = parts[tsIdx + 1] !== undefined ? parseFloat(parts[tsIdx + 1]) : null;
      const humidity = parts[tsIdx + 2] !== undefined ? parseFloat(parts[tsIdx + 2]) : null;
      const pressure = parts[tsIdx + 3] !== undefined ? parseFloat(parts[tsIdx + 3]) : null;
      const extra = (parts.slice(tsIdx + 4).join('|') || '').replace(/[\x00-\x1F\x7F-\x9F].*$/, '').trim();
      return {
        type,
        raw: trimmed,
        alertId,
        temperature: isFinite(temperature) ? temperature : null,
        humidity: isFinite(humidity) ? humidity : null,
        pressure: isFinite(pressure) ? pressure : null,
        nodeId: (!isAlert && extra.startsWith('!')) ? extra : '!0f778ab0',
        summary: isAlert ? extra : '',
        timestamp,
        sent_at: new Date(timestamp).toISOString(),
        source: 'LORA_433MHZ'
      };
    }

    return null;
  }

  function isLikelyLoraDevice(name, deviceId) {
    const nm = String(name || '').toLowerCase();
    const id = String(deviceId || '').toLowerCase();
    return (
      nm.includes('meshtastic') ||
      nm.includes('res1') ||
      nm.includes('res2') ||
      nm.includes('rsc') ||
      nm.includes('rescuer') ||
      nm.includes('stf1') ||
      nm.includes('rel1') ||
      nm.includes('hall') ||
      nm.includes('f4e2') ||
      nm.includes('13d4') ||
      nm.includes('13d6') ||
      nm.includes('8ab0') ||
      nm.includes('1a58') ||
      nm.includes('lora') ||
      nm.includes('evakwar') ||
      nm.includes('ebakwar') ||
      nm.includes('esp32') ||
      id.includes('f4:e2') ||
      id.includes('13:d4') ||
      id.includes('13:d6') ||
      id.includes('8a:b0') ||
      id.includes('8a:b2') ||
      id.includes('1a:58') ||
      id.includes('1a:5a')
    );
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // =========================================================================
  // LoRaMeshClient Class
  // =========================================================================
  class LoRaMeshClient {
    constructor() {
      this.mode = localStorage.getItem('evw_lora_mode') || 'AUTO'; // BLE, USB, WIFI, AUTO
      this.connected = false;
      this.transport = 'DISCONNECTED'; // 'BLE', 'USB_SERIAL', 'WIFI_GATEWAY', 'DISCONNECTED'
      this.deviceName = localStorage.getItem('evw_lora_device_name') || 'EvakWar LoRa Node';
      this.deviceId = localStorage.getItem('evw_lora_device_id') || '';
      this.serverUrl = localStorage.getItem('evw_server_url') || window.location.origin;

      // BLE handles
      this.bleDeviceId = localStorage.getItem('evw_lora_ble_device_id') || null;
      this.nativeBleActive = false;
      this.nativeBleAsciiBuffer = '';
      this.webBleDevice = null;
      this.webBleServer = null;
      this.webBleToRadio = null;
      this.webBleFromRadio = null;
      this.webBleFromNum = null;
      this.isScanningBle = false;

      // USB Serial handles
      this.serialPort = null;
      this.serialReader = null;
      this.serialWriter = null;
      this.serialBuffer = new Uint8Array(0);
      this.nativeUsbActive = false;
      this.nativeUsbAsciiBuffer = '';

      // Event listeners
      this.listeners = {
        status: [],
        packet: [],
        ack: [],
        alert: [],
        sos: [],
        chat: [],
        weather: [],
        weatherAlert: []
      };
      this.relayTelemetryPollTimer = null;

      this._initNativeUsbListeners();
      this._initNativeBleListeners();
      if (typeof window !== 'undefined' && !window.__evwUnloadFlagBound) {
        window.__evwUnloadFlagBound = true;
        window.addEventListener('beforeunload', () => {
          window.__evwPageUnloading = true;
          try {
            const c = window.evakwarLoraClient;
            if (c && c.serialPort) {
              try { if (c.serialReader) c.serialReader.cancel().catch(() => {}); } catch (_) {}
              try { if (c.serialWriter) c.serialWriter.releaseLock(); } catch (_) {}
              try { c.serialPort.close().catch(() => {}); } catch (_) {}
            }
          } catch (_) {}
        });
      }
      this._restorePersistentConnectionState();
    }

    _restorePersistentConnectionState() {
      if (typeof window === 'undefined') return;
      try {
        const isOnline = Boolean(typeof navigator !== 'undefined' && navigator.onLine);
        const btEnabled = (typeof window !== 'undefined' && window.AndroidSettingsBridge && typeof window.AndroidSettingsBridge.isBluetoothEnabled === 'function')
          ? window.AndroidSettingsBridge.isBluetoothEnabled()
          : true;

        // If Bluetooth is disabled on the phone hardware, clear any stale BLE state immediately
        if (!btEnabled) {
          try {
            const rawSession = localStorage.getItem('evw_lora_connected_session');
            if (rawSession && rawSession.includes('"BLE"')) {
              localStorage.removeItem('evw_lora_connected_session');
            }
          } catch (_) {}
          this.connected = false;
          this.nativeBleActive = false;
          this.transport = isOnline ? 'WIFI_GATEWAY' : 'DISCONNECTED';
          this.setStatus(false, this.transport, 'LoRa Mesh Standby');
          return;
        }

        // 1. Check Native Android BLE Bridge (persists in MainActivity across all WebView page navigations!)
        if (typeof window !== 'undefined' && window.AndroidBleBridge && typeof window.AndroidBleBridge.isConnected === 'function') {
          const isBleConn = window.AndroidBleBridge.isConnected();
          if (isBleConn) {
            let devName = this.deviceName || 'RES1 (!f4e213d4)';
            let devId = this.deviceId || '!f4e213d4';
            if (typeof window.AndroidBleBridge.getConnectionStateJson === 'function') {
              try {
                const state = JSON.parse(window.AndroidBleBridge.getConnectionStateJson() || '{}');
                if (state.name) devName = state.name;
                if (state.deviceId) devId = state.deviceId;
              } catch (_) {}
            }
            this.connected = true;
            this.transport = 'BLE';
            this.nativeBleActive = true;
            this.bleDeviceId = devId;
            this.deviceId = devId;
            this.deviceName = devName;
            this.setStatus(true, 'BLE', devName);
            return;
          } else {
            // BLE bridge reports not connected! Clear any stale BLE session
            try {
              const rawSession = localStorage.getItem('evw_lora_connected_session');
              if (rawSession && rawSession.includes('"BLE"')) {
                localStorage.removeItem('evw_lora_connected_session');
              }
            } catch (_) {}
          }
        }

        // 2. Check Native Android USB-OTG Serial Bridge
        if (typeof window !== 'undefined' && window.AndroidUsbSerialBridge && typeof window.AndroidUsbSerialBridge.isConnected === 'function') {
          if (window.AndroidUsbSerialBridge.isConnected()) {
            this.connected = true;
            this.transport = 'USB_SERIAL';
            this.nativeUsbActive = true;
            this.deviceName = localStorage.getItem('evw_lora_device_name') || 'USB-OTG LoRa Node (433MHz)';
            this.setStatus(true, 'USB_SERIAL', this.deviceName);
            return;
          }
        }

        // 3. Desktop WebSerial / WebBluetooth auto-reconnect after page navigation (if user previously paired!)
        let savedSession = null;
        try { savedSession = JSON.parse(localStorage.getItem('evw_lora_connected_session') || 'null'); } catch (_) {}
        const sessionRecent = Boolean(savedSession && savedSession.connected && (Date.now() - (savedSession.ts || 0) < 12 * 60 * 60 * 1000));

        if (sessionRecent && savedSession.transport === 'USB_SERIAL' && navigator.serial && typeof navigator.serial.getPorts === 'function') {
          this._autoReconnectWebSerial(savedSession.deviceName).catch(() => {});
          return;
        }
        if (sessionRecent && savedSession.transport === 'BLE' && navigator.bluetooth && typeof navigator.bluetooth.getDevices === 'function') {
          this._autoReconnectWebBle(savedSession.deviceId, savedSession.deviceName).catch(() => {});
          return;
        }

        // 4. Fallback default when no hardware is connected:
        this.connected = false;
        this.nativeBleActive = false;
        this.nativeUsbActive = false;
        this.transport = isOnline ? 'WIFI_GATEWAY' : 'DISCONNECTED';
        this.setStatus(false, this.transport, 'LoRa Mesh Standby');
      } catch (err) {
        console.warn('[LoRaMeshClient] Restore session note:', err);
      }
    }

    async _autoReconnectWebSerial(savedName) {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const ports = await navigator.serial.getPorts();
          if (!ports || ports.length === 0) return false;
          const port = ports[0];
          if (!port.readable) {
            await port.open({ baudRate: 115200 });
          }
          this.serialPort = port;
          this.serialWriter = port.writable.getWriter();
          const wakeFrame = wrapSerialFrame(encodeWantConfigToRadio());
          await this.serialWriter.write(wakeFrame);
          this.readUsbSerialLoop(port);
          const name = savedName || 'USB-OTG LoRa Node (433MHz)';
          this.setStatus(true, 'USB_SERIAL', name);
          console.log('[LoRaMeshClient] ✅ Auto-reconnected WebSerial across page navigation:', name);
          return true;
        } catch (err) {
          console.warn(`[LoRaMeshClient] WebSerial auto-reconnect attempt ${attempt + 1}:`, err && err.message ? err.message : err);
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 350));
          }
        }
      }
      return false;
    }

    async _autoReconnectWebBle(savedDeviceId, savedName) {
      try {
        const devices = await navigator.bluetooth.getDevices();
        if (!devices || devices.length === 0) return false;
        const device = devices.find(d => d.id === savedDeviceId) || devices.find(d => isLikelyLoraDevice(d.name, d.id)) || devices[0];
        if (!device) return false;
        console.log('[LoRaMeshClient] Auto-reconnecting WebBLE across page navigation:', device.name || device.id);
        return await this._attachWebBleDevice(device);
      } catch (err) {
        console.warn('[LoRaMeshClient] WebBLE auto-reconnect note:', err && err.message ? err.message : err);
        return false;
      }
    }

    async _attachWebBleDevice(device) {
      this.webBleDevice = device;
      this.deviceId = device.id;
      this.bleDeviceId = device.id;
      const name = device.name || 'EvakWar BLE Node';

      if (!device._evwDisconnectBound) {
        device._evwDisconnectBound = true;
        device.addEventListener('gattserverdisconnected', () => {
          if (this.webBleDrainInterval) {
            clearInterval(this.webBleDrainInterval);
            this.webBleDrainInterval = null;
          }
          // Do NOT erase evw_lora_connected_session on page unload so the next page can auto-reconnect!
          if (!window.__evwPageUnloading) {
            this.setStatus(false, 'DISCONNECTED', `${name} (Disconnected)`);
          }
        });
      }

      this.webBleServer = await device.gatt.connect();
      const service = await this.webBleServer.getPrimaryService(MESH_SERVICE_UUID);
      this.webBleToRadio = await service.getCharacteristic(TORADIO_UUID);
      this.webBleFromRadio = await service.getCharacteristic(FROMRADIO_UUID);
      this.webBleFromNum = await service.getCharacteristic(FROMNUM_UUID);

      await this.webBleToRadio.writeValue(encodeWantConfigToRadio());

      try {
        await this.webBleFromNum.startNotifications();
        this.webBleFromNum.addEventListener('characteristicvaluechanged', async () => {
          await this.drainWebBleFromRadio();
        });
      } catch (notifErr) {
        console.warn('[LoRaMeshClient] WebBLE FromNum notification note:', notifErr);
      }

      await this.drainWebBleFromRadio();

      if (this.webBleDrainInterval) clearInterval(this.webBleDrainInterval);
      this.webBleDrainInterval = setInterval(() => {
        this.drainWebBleFromRadio();
      }, 1200);

      this.setStatus(true, 'BLE', name);
      return { success: true, transport: 'BLE', deviceName: name };
    }

    _initNativeBleListeners() {
      if (typeof window === 'undefined') return;

      window.addEventListener('evakwar:native-ble-rx', (e) => {
        const detail = (e && e.detail) || {};
        if (detail.packet && detail.packet.includes('EVW|')) {
          this.handleIncomingRawPacket(detail.packet, 'BLE');
          this.nativeBleAsciiBuffer = '';
          return;
        }
        if (detail.telemetryJson) {
          try {
            const telObj = typeof detail.telemetryJson === 'string' ? JSON.parse(detail.telemetryJson) : detail.telemetryJson;
            this._handleWeatherTelemetryObject(telObj, 'BLE', Boolean(telObj && telObj.isAlert));
          } catch (_) {}
        }
        if (detail.ascii) {
          this.nativeBleAsciiBuffer += detail.ascii;
          const evw = extractEvwStringFromAscii(this.nativeBleAsciiBuffer);
          if (evw) {
            this.handleIncomingRawPacket(evw, 'BLE');
            this.nativeBleAsciiBuffer = '';
          } else if (this.nativeBleAsciiBuffer.length > 2048) {
            this.nativeBleAsciiBuffer = this.nativeBleAsciiBuffer.slice(-512);
          }
        }
      });

      window.addEventListener('evakwar:native-ble-state', (e) => {
        const detail = (e && e.detail) || {};
        if (detail.state === 'CONNECTED') {
          this.nativeBleActive = true;
          if (detail.deviceId) {
            this.bleDeviceId = detail.deviceId;
            this.deviceId = detail.deviceId;
            localStorage.setItem('evw_lora_ble_device_id', detail.deviceId);
          }
          const nm = detail.name || this.deviceName || 'RES1 (!f4e213d4)';
          this.setStatus(true, 'BLE', nm);
        } else if (detail.state === 'DISCONNECTED' && this.nativeBleActive) {
          this.nativeBleActive = false;
          localStorage.removeItem('evw_lora_connected_session');
          this.setStatus(false, 'DISCONNECTED', 'BLE Disconnected');
        }
      });
    }

    _initNativeUsbListeners() {
      if (typeof window === 'undefined') return;

      window.addEventListener('evakwar:native-usb-rx', (e) => {
        const detail = (e && e.detail) || {};
        if (detail.packet && detail.packet.includes('EVW|')) {
          this.handleIncomingRawPacket(detail.packet, 'USB_SERIAL');
          this.nativeUsbAsciiBuffer = '';
          return;
        }
        if (detail.telemetryJson) {
          try {
            const telObj = typeof detail.telemetryJson === 'string' ? JSON.parse(detail.telemetryJson) : detail.telemetryJson;
            this._handleWeatherTelemetryObject(telObj, 'USB_SERIAL', Boolean(telObj && telObj.isAlert));
          } catch (_) {}
        }
        if (detail.hex) {
          try {
            const bytes = new Uint8Array(detail.hex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
            const envTel = extractEnvironmentTelemetryFromBytes(bytes);
            if (envTel) this._handleWeatherTelemetryObject(envTel, 'USB_SERIAL', false);
          } catch (_) {}
        }
        if (detail.ascii) {
          this.nativeUsbAsciiBuffer += detail.ascii;
          const evw = extractEvwStringFromAscii(this.nativeUsbAsciiBuffer);
          if (evw) {
            this.handleIncomingRawPacket(evw, 'USB_SERIAL');
            this.nativeUsbAsciiBuffer = '';
          } else if (this.nativeUsbAsciiBuffer.length > 2048) {
            this.nativeUsbAsciiBuffer = this.nativeUsbAsciiBuffer.slice(-512);
          }
        }
      });

      window.addEventListener('evakwar:native-usb-detached', () => {
        if (this.transport === 'USB_SERIAL') {
          this.nativeUsbActive = false;
          localStorage.removeItem('evw_lora_connected_session');
          this.setStatus(false, 'DISCONNECTED', 'USB-OTG Disconnected');
        }
      });
    }

    on(event, fn) {
      if (this.listeners[event]) {
        this.listeners[event].push(fn);
        if (event === 'status' && this.connected) {
          const payload = {
            connected: this.connected,
            transport: this.transport,
            deviceName: this.deviceName,
            deviceId: this.deviceId,
            frequency: '433.875 MHz'
          };
          setTimeout(() => {
            try { fn(payload); } catch (_) {}
          }, 0);
        }
      }
    }

    emit(event, payload) {
      if (this.listeners[event]) {
        this.listeners[event].forEach(fn => {
          try { fn(payload); } catch (e) { console.error(e); }
        });
      }
    }

    setStatus(connected, transport, deviceName, extra = {}) {
      this.connected = connected;
      this.transport = transport;
      if (deviceName) {
        this.deviceName = deviceName;
        localStorage.setItem('evw_lora_device_name', deviceName);
      }

      // Persist active peripheral connection across multi-page navigation
      try {
        if (connected && (transport === 'BLE' || transport === 'USB_SERIAL' || transport === 'ESP_WIFI')) {
          localStorage.setItem('evw_lora_connected_session', JSON.stringify({
            connected: true,
            transport: transport,
            deviceName: this.deviceName || 'RES1 (!f4e213d4)',
            deviceId: this.bleDeviceId || this.deviceId || '!f4e213d4',
            ts: Date.now()
          }));
          this._startRelayTelemetryPolling();
        } else if (!connected && !window.__evwPageUnloading) {
          // Only clear saved session on explicit disconnect, NOT during page navigation
          if (transport === 'DISCONNECTED' && deviceName === 'Not Paired') {
            localStorage.removeItem('evw_lora_connected_session');
          }
          this._stopRelayTelemetryPolling();
        }
      } catch (_) {}

      this.emit('status', {
        connected: this.connected,
        transport: this.transport,
        deviceName: this.deviceName,
        deviceId: this.deviceId,
        frequency: '433.875 MHz',
        ...extra
      });

      // Synchronize pairing status with server when online
      if (navigator.onLine) {
        try {
          let activeName = '';
          let activeUserId = null;
          try {
            activeName = localStorage.getItem('evw_user_full_name') || '';
            const cRes = JSON.parse(localStorage.getItem('evw_cached_resident') || 'null');
            const cStf = JSON.parse(localStorage.getItem('evw_cached_staff') || 'null');
            if (cStf) {
              activeUserId = cStf.userId || cStf.user_id || cStf.id;
              if (!activeName) activeName = cStf.full_name || cStf.name || '';
            } else if (cRes) {
              activeUserId = cRes.user_id || cRes.id;
              if (!activeName) activeName = cRes.full_name || cRes.name || '';
            }
          } catch (_) {}
          fetch('/api/lora/resident-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nodeId: this.getResolvedNodeId() || '!f4e213d4',
              bleMac: this.bleDeviceId || this.deviceId,
              deviceName: this.deviceName,
              residentName: activeName || undefined,
              userId: activeUserId || undefined,
              paired: Boolean(connected),
              online: Boolean(connected),
              transport: transport,
              rssi: extra.rssi || -50
            })
          }).catch(() => {});
        } catch (_) {}
      }
    }

    async disconnect() {
      if (window.AndroidBleBridge && typeof window.AndroidBleBridge.disconnect === 'function') {
        try { window.AndroidBleBridge.disconnect(); } catch (_) {}
      }
      this.nativeBleActive = false;
      const capBle = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.BluetoothLe;
      if (capBle && this.bleDeviceId) {
        try { await capBle.disconnect({ deviceId: this.bleDeviceId }); } catch (_) {}
      }
      if (this.nativeUsbActive && window.AndroidUsbSerialBridge) {
        try { window.AndroidUsbSerialBridge.disconnect(); } catch (_) {}
        this.nativeUsbActive = false;
      }
      localStorage.removeItem('evw_lora_ble_device_id');
      localStorage.removeItem('evw_lora_connected_session');
      this.setStatus(false, 'DISCONNECTED', 'Not Paired');
    }

    handleIncomingRawPacket(rawText, sourceTransport) {
      const parsed = parseEvwPacket(rawText);
      if (!parsed) return;

      console.log(`[LoRaMeshClient RX via ${sourceTransport}]`, parsed);
      this.emit('packet', { ...parsed, transport: sourceTransport, receivedAt: new Date().toISOString() });

      if (parsed.type === 'ACK') {
        // Persist ACK status into local offline LoRa SOS cache so Rescuer/Resident UIs stay synced off-grid
        try {
          let storedSos = JSON.parse(localStorage.getItem('evw_lora_active_sos') || '[]');
          if (Array.isArray(storedSos) && storedSos.length > 0) {
            const stUpper = String(parsed.status || 'ACKNOWLEDGED').toUpperCase();
            if (stUpper === 'RESOLVED' || stUpper === 'CANCELLED') {
              storedSos = storedSos.filter(a =>
                String(a.sosId || a.id) !== String(parsed.sosId) &&
                !(parsed.residentId && Number(a.residentId || a.resident_id) === Number(parsed.residentId))
              );
            } else {
              storedSos = storedSos.map(a => {
                const matchId = parsed.sosId && String(a.sosId || a.id) === String(parsed.sosId);
                const matchRes = parsed.residentId && Number(a.residentId || a.resident_id) === Number(parsed.residentId);
                if (matchId || matchRes) {
                  return Object.assign({}, a, {
                    status: stUpper,
                    handler_name: parsed.responderName || a.handler_name,
                    responder_name: parsed.responderName || a.responder_name,
                    rescuer_lat: parsed.rescuerLat != null ? parsed.rescuerLat : a.rescuer_lat,
                    rescuer_lng: parsed.rescuerLng != null ? parsed.rescuerLng : a.rescuer_lng,
                    updated_at: new Date().toISOString()
                  });
                }
                return a;
              });
            }
            localStorage.setItem('evw_lora_active_sos', JSON.stringify(storedSos.slice(-30)));
          }
        } catch (_) {}

        try {
          window.dispatchEvent(new CustomEvent('evakwar:lora-ack', {
            detail: { ...parsed, transport: sourceTransport || 'LORA_433MHZ', viaLoRa: true }
          }));
        } catch (_) {}

        this.emit('ack', parsed);
      } else if (parsed.type === 'CAN' || (parsed.type === 'SOS' && (parsed.statusCode === 'CAN' || parsed.command === 'CANCEL_SOS'))) {
        try {
          let storedSos = JSON.parse(localStorage.getItem('evw_lora_active_sos') || '[]');
          if (Array.isArray(storedSos)) {
            storedSos = storedSos.filter(a =>
              String(a.sosId || a.id) !== String(parsed.sosId) &&
              !(parsed.residentId && Number(a.residentId || a.resident_id) === Number(parsed.residentId))
            );
            localStorage.setItem('evw_lora_active_sos', JSON.stringify(storedSos));
          }
        } catch (_) {}

        try {
          window.dispatchEvent(new CustomEvent('evakwar:lora-cancel', {
            detail: { ...parsed, status: 'CANCELLED', transport: sourceTransport || 'LORA_433MHZ', viaLoRa: true }
          }));
        } catch (_) {}

        this.emit('sos', { ...parsed, status: 'CANCELLED' });
      } else if (parsed.type === 'SOS') {
        const sosKey = String(parsed.msgId || parsed.sosId || `${parsed.residentId || 0}_${parsed.latitude}_${parsed.longitude}`);
        this._processedSosIds = this._processedSosIds || new Set();
        const isUpdate = parsed.statusCode === 'UPD';
        if (!isUpdate && this._processedSosIds.has(sosKey)) {
          return;
        }
        this._processedSosIds.add(sosKey);

        const sosObj = {
          ...parsed,
          id: parsed.sosId || ('lora_' + (parsed.residentId || sosKey)),
          sosId: parsed.sosId || ('lora_' + (parsed.residentId || sosKey)),
          sos_id: parsed.sosId || ('lora_' + (parsed.residentId || sosKey)),
          residentId: parsed.residentId || 0,
          resident_id: parsed.residentId || 0,
          name: parsed.name || 'Resident in Distress',
          residentName: parsed.name || 'Resident in Distress',
          status: 'ACTIVE',
          barangay: 'San Rafael (433.875 MHz LoRa)',
          transport: sourceTransport || 'LORA_MESH_433MHZ',
          viaLoRa: true,
          is_lora: true,
          created_at: new Date().toISOString()
        };

        // Persist so Rescuer sees incoming LoRa SOS immediately even if they switch from Dashboard/Chat to Map
        try {
          let storedSos = JSON.parse(localStorage.getItem('evw_lora_active_sos') || '[]');
          if (!Array.isArray(storedSos)) storedSos = [];
          const idx = storedSos.findIndex(a =>
            String(a.sosId || a.id) === String(sosObj.sosId) ||
            (sosObj.residentId && Number(a.residentId || a.resident_id) === Number(sosObj.residentId))
          );
          if (idx >= 0) {
            storedSos[idx] = Object.assign({}, storedSos[idx], sosObj, {
              status: storedSos[idx].status && storedSos[idx].status !== 'ACTIVE' ? storedSos[idx].status : 'ACTIVE'
            });
          } else {
            storedSos.unshift(sosObj);
          }
          localStorage.setItem('evw_lora_active_sos', JSON.stringify(storedSos.slice(0, 30)));
        } catch (_) {}

        try {
          window.dispatchEvent(new CustomEvent('evakwar:lora-sos', { detail: sosObj }));
        } catch (_) {}

        this.emit('sos', sosObj);
      } else if (parsed.type === 'MSG') {
        const msgId = String(parsed.msgId || parsed.id || '').trim();
        const msgText = String(parsed.text || parsed.message || '').trim();
        if (!msgText) {
          // Never poison _processedChatIds with an incomplete/empty fragment
          return;
        }
        this._processedChatIds = this._processedChatIds || new Set();
        if (msgId && this._processedChatIds.has(msgId)) {
          return;
        }
        if (msgId) this._processedChatIds.add(msgId);

        const chatObj = {
          ...parsed,
          text: msgText,
          message: msgText,
          transport: sourceTransport || 'LORA_433MHZ',
          viaLoRa: true
        };

        try {
          let stored = JSON.parse(localStorage.getItem('evw_lora_chat_messages') || '[]');
          if (!Array.isArray(stored)) stored = [];
          if (!stored.some(m => String(m.msgId || m.id) === msgId)) {
            stored.push(chatObj);
            if (stored.length > 150) stored = stored.slice(-150);
            localStorage.setItem('evw_lora_chat_messages', JSON.stringify(stored));
          }
        } catch (_) {}

        try {
          window.dispatchEvent(new CustomEvent('evakwar:lora-chat', { detail: chatObj }));
        } catch (_) {}

        // If this gateway/browser is online (e.g. Admin PC on Wi-Fi with USB LoRa), immediately archive to MySQL & broadcast via Socket.IO
        if (navigator.onLine) {
          try {
            let bgUrl = (this.serverUrl || window.location.origin).replace(/\/$/, '');
            if (bgUrl === 'http://localhost' || bgUrl === 'https://localhost') bgUrl = 'https://evacwar.onrender.com';
            if (bgUrl.startsWith('http')) {
              fetch(`${bgUrl}/api/lora/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  msgId: msgId || String(Date.now()),
                  senderRole: chatObj.senderRole || 'Resident',
                  senderName: chatObj.senderName || 'Community Member',
                  nodeId: chatObj.nodeId || null,
                  text: msgText,
                  timestamp: chatObj.timestamp || Date.now(),
                  viaLoRa: true,
                  archiveOnly: true
                })
              }).catch(() => {});
            }
          } catch (_) {}
        }

        this.emit('chat', chatObj);
      } else if (parsed.type === 'ALT') {
        console.log('[LoRaMeshClient] 🚨 LORA EMERGENCY ALERT PACKET RECEIVED:', parsed);

        const rawId = String(parsed.alertId || parsed.id || '').trim();
        let mutedList = [];
        try { mutedList = JSON.parse(localStorage.getItem('evw_muted_alert_ids') || '[]'); } catch (_) {}
        if (rawId && mutedList.includes(rawId)) {
          return; // Resident already acknowledged and muted this alert
        }
        this._processedAlertIds = this._processedAlertIds || new Set();
        if (rawId && this._processedAlertIds.has(rawId)) {
          return; // Already processed in this session
        }
        if (rawId) this._processedAlertIds.add(rawId);
        this._lastAltId = rawId;
        this._lastAltTime = Date.now();

        const alertObj = {
          id: 'lora_alt_' + rawId,
          alertId: rawId,
          title: (parsed.title || parsed.disasterType || 'EMERGENCY ALERT').toUpperCase(),
          type: (parsed.severity || parsed.level || 'red').toLowerCase(),
          severity: (parsed.severity || parsed.level || 'RED').toUpperCase(),
          zone: parsed.zone || parsed.barangay || 'San Rafael',
          barangay: parsed.zone || parsed.barangay || 'San Rafael',
          message: parsed.message || parsed.instructions || 'Evacuation Warning Broadcasted over 433.875 MHz LoRa Mesh',
          instructions: parsed.instructions || parsed.message || 'Proceed to designated evacuation zone.',
          evacCenter: parsed.evacCenter || 'San Rafael Evacuation Center',
          sent_at: new Date().toISOString(),
          broadcast_time: new Date().toISOString(),
          viaLoRa: true
        };

        try {
          window.dispatchEvent(new CustomEvent('evakwar:lora-alert', { detail: alertObj }));
        } catch (_) {}

        if (typeof window.triggerEmergencyAlarm === 'function') {
          window.triggerEmergencyAlarm(alertObj);
        }

        this.emit('alert', alertObj);
      } else if (parsed.type === 'WTH' || parsed.type === 'WTH_ALT') {
        this._handleWeatherTelemetryObject(parsed, sourceTransport || 'LORA_433MHZ', parsed.type === 'WTH_ALT');
      }
    }

    _startRelayTelemetryPolling() {
      if (this.relayTelemetryPollTimer) clearInterval(this.relayTelemetryPollTimer);
      setTimeout(() => {
        if (this.connected && (this.transport === 'BLE' || this.transport === 'USB_SERIAL')) {
          this.requestRelayWeatherTelemetry().catch(() => {});
        }
      }, 2500);
      this.relayTelemetryPollTimer = setInterval(() => {
        if (this.connected && (this.transport === 'BLE' || this.transport === 'USB_SERIAL')) {
          this.requestRelayWeatherTelemetry().catch(() => {});
        }
      }, 60000);
    }

    _stopRelayTelemetryPolling() {
      if (this.relayTelemetryPollTimer) {
        clearInterval(this.relayTelemetryPollTimer);
        this.relayTelemetryPollTimer = null;
      }
    }

    /**
     * Actively polls the outdoor Relay (`!0f778ab0` / `0x0f778ab0`) over 433.875 MHz LoRa RF
     * for its live `AHT20 + BMP280` environment_metrics telemetry via the connected LoRa node.
     */
    async requestRelayWeatherTelemetry(relayNodeNum = 0x0f778ab0) {
      const now = Date.now();
      if (this._lastRelayPollAttempt && (now - this._lastRelayPollAttempt) < 3500) {
        return { throttled: true };
      }
      this._lastRelayPollAttempt = now;

      const protoBytes = encodeRequestRelayTelemetryToRadio(relayNodeNum);
      const hexStr = bytesToHex(protoBytes);
      const capBle = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.BluetoothLe;

      try {
        // 1. Native Android USB-OTG Serial
        if (this.transport === 'USB_SERIAL' && this.nativeUsbActive && window.AndroidUsbSerialBridge) {
          const serialFrame = wrapSerialFrame(protoBytes);
          const ok = window.AndroidUsbSerialBridge.writeHex(bytesToHex(serialFrame));
          if (ok) return { success: true, transport: 'USB_SERIAL' };
        }

        // 2. Native Android BLE Bridge
        if (window.AndroidBleBridge && typeof window.AndroidBleBridge.writeHex === 'function') {
          const isNativeConnected = this.nativeBleActive || (
            typeof window.AndroidBleBridge.isConnected === 'function' && window.AndroidBleBridge.isConnected()
          );
          if (isNativeConnected) {
            const ok = window.AndroidBleBridge.writeHex(hexStr);
            if (ok) return { success: true, transport: 'BLE' };
          }
        }

        // 3. Capacitor BLE
        if (capBle && this.bleDeviceId) {
          try {
            await capBle.write({
              deviceId: this.bleDeviceId,
              service: MESH_SERVICE_UUID,
              characteristic: TORADIO_UUID,
              value: hexStr
            });
            return { success: true, transport: 'BLE' };
          } catch (_) {
            await capBle.writeWithoutResponse({
              deviceId: this.bleDeviceId,
              service: MESH_SERVICE_UUID,
              characteristic: TORADIO_UUID,
              value: hexStr
            });
            return { success: true, transport: 'BLE' };
          }
        }

        // 4. Web Bluetooth
        if (this.transport === 'BLE' && this.webBleToRadio) {
          await this.webBleToRadio.writeValue(protoBytes);
          return { success: true, transport: 'BLE' };
        }

        // 5. Desktop WebSerial USB
        if (this.transport === 'USB_SERIAL' && this.serialWriter) {
          const serialFrame = wrapSerialFrame(protoBytes);
          await this.serialWriter.write(serialFrame);
          return { success: true, transport: 'USB_SERIAL' };
        }
      } catch (err) {
        console.warn('[LoRaMeshClient] requestRelayWeatherTelemetry warning:', err && err.message ? err.message : err);
      }
      return { success: false };
    }

    _handleWeatherTelemetryObject(parsed, sourceTransport, isAlert = false) {
      if (!parsed) return;
      const rawTemp = parsed.temperature != null ? Number(parsed.temperature) : null;
      const rawHum = parsed.humidity != null ? Number(parsed.humidity) : null;
      const rawPress = parsed.pressure != null ? Number(parsed.pressure) : null;

      // Filter out loose-wire I2C glitch values (e.g. 177.6°C, 0% RH, -176.4 hPa)
      const validTemp = (rawTemp !== null && isFinite(rawTemp) && rawTemp >= -10 && rawTemp <= 65) ? Number(rawTemp.toFixed(2)) : null;
      const validHum = (rawHum !== null && isFinite(rawHum) && rawHum >= 1 && rawHum <= 100) ? Number(rawHum.toFixed(2)) : null;
      const validPress = (rawPress !== null && isFinite(rawPress) && rawPress >= 850 && rawPress <= 1100) ? Number(rawPress.toFixed(2)) : null;
      const isI2cWarning = Boolean(validTemp === null && validHum === null && validPress === null);

      let prevCached = null;
      try { prevCached = JSON.parse(localStorage.getItem('evw_lora_sensor_weather') || 'null'); } catch (_) {}
      if (isI2cWarning && !parsed.rssi && !parsed.nodeId) {
        return;
      }

      const nowMs = Date.now();
      const rawTs = Number(parsed.timestamp || nowMs);
      // Use current receive clock if node RTC is unsynced or stale
      const tsMs = (isFinite(rawTs) && Math.abs(nowMs - rawTs) < 3600000) ? rawTs : nowMs;

      const weatherObj = {
        temperature: validTemp !== null ? validTemp : (prevCached && prevCached.temperature != null ? prevCached.temperature : null),
        humidity: validHum !== null ? validHum : (prevCached && prevCached.humidity != null ? prevCached.humidity : null),
        pressure: validPress !== null ? validPress : (prevCached && prevCached.pressure != null ? prevCached.pressure : null),
        rssi: (parsed.rssi != null && isFinite(Number(parsed.rssi))) ? Number(parsed.rssi) : null,
        snr: (parsed.snr != null && isFinite(Number(parsed.snr))) ? Number(parsed.snr) : null,
        hopsAway: (parsed.hopsAway != null && isFinite(Number(parsed.hopsAway))) ? Number(parsed.hopsAway) : 0,
        i2cBusWarning: isI2cWarning,
        relayHeartbeatOnly: isI2cWarning,
        nodeId: parsed.nodeId || '!0f778ab0',
        nodeName: parsed.nodeName || 'EvakWar Zone Relay 1 (REL1)',
        sensorModel: 'AHT20 + BMP280 (I2C)',
        summary: parsed.summary || '',
        source: sourceTransport || parsed.source || 'LORA_433MHZ',
        updatedAt: new Date(tsMs).toISOString(),
        timestampMs: tsMs,
        relayOnline: true,
        ageMinutes: 0
      };

      try {
        localStorage.setItem('evw_lora_sensor_weather', JSON.stringify(weatherObj));
        if (!isI2cWarning) {
          let hist = JSON.parse(localStorage.getItem('evw_lora_sensor_history') || '[]');
          if (!Array.isArray(hist)) hist = [];
          const top = hist[0];
          if (!top || Math.abs((top.timestampMs || 0) - tsMs) > 45000 || top.temperature !== weatherObj.temperature || top.pressure !== weatherObj.pressure) {
            hist.unshift(weatherObj);
            localStorage.setItem('evw_lora_sensor_history', JSON.stringify(hist.slice(0, 72)));
          }
        }
      } catch (_) {}

      try {
        window.dispatchEvent(new CustomEvent('evakwar:lora-weather', { detail: weatherObj }));
      } catch (_) {}
      this.emit('weather', weatherObj);

      // Crowd-sync outdoor Relay telemetry to the EvakWar server whenever any node-connected device has internet
      // so Admin, Residents, Staff, and Rescuers all see the live outdoor Relay readings immediately!
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const lastSync = this._lastWeatherServerSyncMs || 0;
        const tempChanged = this._lastWeatherServerTemp !== weatherObj.temperature || this._lastWeatherServerPress !== weatherObj.pressure;
        if (nowMs - lastSync > 20000 || tempChanged) {
          this._lastWeatherServerSyncMs = nowMs;
          this._lastWeatherServerTemp = weatherObj.temperature;
          this._lastWeatherServerPress = weatherObj.pressure;
          const syncPayload = JSON.stringify({
            temperature: validTemp,
            humidity: validHum,
            pressure: validPress,
            i2cBusWarning: isI2cWarning,
            relayHeartbeatOnly: isI2cWarning,
            rssi: weatherObj.rssi,
            snr: weatherObj.snr,
            hopsAway: weatherObj.hopsAway,
            nodeId: weatherObj.nodeId,
            nodeName: weatherObj.nodeName,
            sensorModel: weatherObj.sensorModel,
            source: `${weatherObj.source}_RELAY_FORWARD`,
            forwardedByNode: this.getResolvedNodeId() || this.deviceId || 'MESH_NODE',
            timestampMs: tsMs
          });
          const primaryUrl = (this.serverUrl || window.location.origin || '').replace(/\/$/, '');
          const targets = new Set();
          if (primaryUrl && primaryUrl.startsWith('http')) targets.add(primaryUrl);
          if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http')) {
            targets.add(window.location.origin.replace(/\/$/, ''));
          }
          targets.add('https://evacwar.onrender.com');
          targets.forEach((baseUrl) => {
            fetch(`${baseUrl}/api/lora/weather-sensor`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: syncPayload
            }).catch(() => {});
          });
        }
      }

      if (isAlert) {
        const alertId = String(parsed.alertId || tsMs);
        this._processedWeatherAlertIds = this._processedWeatherAlertIds || new Set();
        if (this._processedWeatherAlertIds.has(alertId)) return;
        this._processedWeatherAlertIds.add(alertId);

        // Compute full meteorological summary 100% OFFLINE from AHT20 + BMP280 sensor readings
        const tC = weatherObj.temperature;
        const rh = weatherObj.humidity;
        const pHpa = weatherObj.pressure;

        let heatIndexC = null;
        if (tC != null && rh != null) {
          const tF = (tC * 9) / 5 + 32;
          let hiF = tF;
          if (tF >= 80 && rh >= 40) {
            hiF = -42.379 + 2.04901523 * tF + 10.14333127 * rh - 0.22475541 * tF * rh
              - 0.00683783 * tF * tF - 0.05481717 * rh * rh
              + 0.00122874 * tF * tF * rh + 0.00085282 * tF * rh * rh
              - 0.00000199 * tF * tF * rh * rh;
          }
          heatIndexC = Math.round((((hiF - 32) * 5) / 9) * 10) / 10;
        }

        let dewPointC = null;
        if (tC != null && rh != null && rh > 0) {
          const gamma = Math.log(rh / 100) + (17.625 * tC) / (243.04 + tC);
          dewPointC = Math.round(((243.04 * gamma) / (17.625 - gamma)) * 10) / 10;
        }

        let heatCat = 'Normal Heat';
        if (heatIndexC != null) {
          if (heatIndexC >= 52) heatCat = 'Extreme Danger Heat';
          else if (heatIndexC >= 42) heatCat = 'Danger Heat';
          else if (heatIndexC >= 33) heatCat = 'Extreme Caution Heat';
          else if (heatIndexC >= 27) heatCat = 'Caution Heat';
        }

        let trendLabel = 'Steady';
        try {
          const prevP = parseFloat(localStorage.getItem('evw_last_lora_pressure') || '');
          if (pHpa != null) {
            if (Number.isFinite(prevP)) {
              const delta = pHpa - prevP;
              if (delta <= -1.5) trendLabel = 'Rapidly Falling';
              else if (delta <= -0.5) trendLabel = 'Falling';
              else if (delta >= 0.5) trendLabel = 'Rising';
            }
            localStorage.setItem('evw_last_lora_pressure', String(pHpa));
          }
        } catch (_) {}

        let cond = 'Fair / Partly Cloudy';
        let guidance = 'Stable local weather across Barangay San Rafael.';
        let icon = '🌤️';
        if (pHpa != null && pHpa < 1004) {
          cond = 'Low Pressure / Storm Risk';
          guidance = 'Low barometric pressure detected. Prepare emergency go-bag and monitor advisories.';
          icon = '⛈️';
        } else if (trendLabel === 'Rapidly Falling' || (pHpa != null && pHpa < 1008 && rh != null && rh >= 82)) {
          cond = 'Rain / Squall Possible';
          guidance = 'Dropping pressure and high humidity indicate possible rain showers.';
          icon = '🌦️';
        } else if (heatIndexC != null && heatIndexC >= 42) {
          cond = 'Hot & Humid';
          guidance = 'High heat index. Drink water frequently and avoid midday sun exposure.';
          icon = '🔥';
        } else if (rh != null && rh >= 85) {
          cond = 'Humid / Overcast';
          guidance = 'High humidity in San Rafael. Light rain showers possible.';
          icon = '☁️';
        }

        const tText = tC != null ? `${tC.toFixed(1)}°C` : '--°C';
        const hiText = heatIndexC != null ? ` (Feels ${heatIndexC.toFixed(1)}°C • ${heatCat})` : '';
        const hText = rh != null ? `${Math.round(rh)}%` : '--%';
        const dpText = dewPointC != null ? ` • Dew Pt ${dewPointC.toFixed(1)}°C` : '';
        const pText = pHpa != null ? `${pHpa.toFixed(1)} hPa (${trendLabel})` : '-- hPa';

        const alertObj = {
          ...weatherObj,
          id: alertId,
          alertId,
          noSiren: true,
          url: '/typhoon',
          condition: cond,
          heatIndex: heatIndexC,
          heatCategory: heatCat,
          dewPoint: dewPointC,
          pressureTrend: trendLabel,
          guidance,
          title: `${icon} San Rafael Weather: ${cond}`,
          message: `Temp ${tText}${hiText} • Humidity ${hText}${dpText} • Pressure ${pText}. ${guidance}`
        };
        try {
          window.dispatchEvent(new CustomEvent('evakwar:lora-weather-alert', { detail: alertObj }));
        } catch (_) {}
        this.emit('weatherAlert', alertObj);
      }
    }

    // -----------------------------------------------------------------------
    // MODE 1: BLUETOOTH LOW ENERGY (BLE GATT - Interactive Device Options Popup)
    // -----------------------------------------------------------------------
    async connectBLEDevice(deviceId, deviceName, onProgress) {
      const capBle = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.BluetoothLe;
      const report = (msg) => {
        if (typeof onProgress === 'function') onProgress(msg);
      };

      // Stop any active scan before initiating GATT connection (required on Android to prevent GATT 133)
      if (window.AndroidBleBridge && typeof window.AndroidBleBridge.stopScan === 'function') {
        try { window.AndroidBleBridge.stopScan(); } catch (_) {}
      }
      if (capBle) {
        try { await Promise.race([capBle.stopLEScan(), new Promise(r => setTimeout(r, 400))]); } catch (_) {}
      }
      this.isScanningBle = false;

      this.bleDeviceId = deviceId;
      this.deviceId = deviceId;
      const name = deviceName || `EvakWar Node (${deviceId.slice(-5)})`;

      // A) Try Direct Native AndroidBleBridge GATT Engine first (Handles already-paired ESP32 nodes without MTU timeout!)
      if (window.AndroidBleBridge && typeof window.AndroidBleBridge.connectDevice === 'function') {
        report(`Connecting to ${name} via Native Android BLE...`);
        const nativeRes = await new Promise((resolve) => {
          let settled = false;
          const finish = (val) => {
            if (settled) return;
            settled = true;
            window.removeEventListener('evakwar:native-ble-state', onState);
            clearTimeout(timer);
            resolve(val);
          };

          const onState = (e) => {
            const d = (e && e.detail) || {};
            if (d.state === 'CONNECTING' || d.state === 'DISCOVERING' || d.state === 'RETRYING') {
              if (d.message) report(d.message);
            } else if (d.state === 'CONNECTED') {
              finish({ ok: true, name: d.name || name, deviceId: d.deviceId || deviceId });
            } else if (d.state === 'ERROR') {
              finish({ ok: false, error: d.message || 'Native BLE connection failed' });
            }
          };

          const timer = setTimeout(() => {
            try {
              if (window.AndroidBleBridge && typeof window.AndroidBleBridge.disconnect === 'function') {
                window.AndroidBleBridge.disconnect();
              }
            } catch (_) {}
            finish({ ok: false, error: 'Native BLE connection timed out' });
          }, 11500);

          window.addEventListener('evakwar:native-ble-state', onState);
          try {
            window.AndroidBleBridge.connectDevice(deviceId, name);
          } catch (err) {
            finish({ ok: false, error: err.message });
          }
        });

        if (nativeRes && nativeRes.ok) {
          this.nativeBleActive = true;
          this.deviceName = name;
          const hexMatch = String(name).match(/!([0-9a-fA-F]{4,8})/);
          const fourHexMatch = String(name).match(/Meshtastic\s+([0-9a-fA-F]{4})/i);
          let extractedId = '!f4e213d4';
          if (hexMatch) {
            extractedId = '!' + hexMatch[1].toLowerCase();
          } else if (fourHexMatch) {
            extractedId = '!' + fourHexMatch[1].toLowerCase();
          } else if (deviceId && String(deviceId).startsWith('!')) {
            extractedId = String(deviceId).toLowerCase();
          }
          this.deviceId = extractedId;
          localStorage.setItem('evw_lora_ble_device_id', deviceId);
          localStorage.setItem('evw_lora_device_name', name);
          localStorage.setItem('evw_lora_device_id', extractedId);
          this.setStatus(true, 'BLE', name);
          return { success: true, transport: 'BLE', deviceName: name, deviceId: extractedId };
        }
        try {
          if (window.AndroidBleBridge && typeof window.AndroidBleBridge.disconnect === 'function') {
            window.AndroidBleBridge.disconnect();
          }
        } catch (_) {}
        console.warn('[LoRaMeshClient] Native AndroidBleBridge note, falling back to Capacitor BLE:', nativeRes && nativeRes.error);
      }

      // B) Capacitor BluetoothLe Plugin Connection (Patched for already-paired ESP32 MTU)
      if (!capBle) {
        throw new Error(`Could not connect to ${name}. Make sure the ESP32 LoRa node is powered ON and within range.`);
      }

      report(`Resetting Bluetooth link to ${name}...`);
      try {
        await Promise.race([
          capBle.disconnect({ deviceId: this.bleDeviceId }),
          new Promise(r => setTimeout(r, 600))
        ]);
      } catch (_) {}

      await new Promise(r => setTimeout(r, 250));

      report(`Connecting to ${name} (If prompted for PIN, enter 123456)...`);
      let connectedOk = false;
      let lastErr = null;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await capBle.connect({
            deviceId: this.bleDeviceId,
            timeout: 10000
          });
          connectedOk = true;
          break;
        } catch (err) {
          lastErr = err;
          console.warn(`[LoRaMeshClient] BLE connect attempt ${attempt} failed:`, err);
          try {
            await Promise.race([
              capBle.disconnect({ deviceId: this.bleDeviceId }),
              new Promise(r => setTimeout(r, 500))
            ]);
          } catch (_) {}
          if (attempt === 1) {
            report(`Retrying connection to ${name}...`);
            await new Promise(r => setTimeout(r, 450));
          }
        }
      }

      if (!connectedOk) {
        throw new Error(
          (lastErr && lastErr.message)
            ? `Could not connect to ${name}: ${lastErr.message}`
            : `Connection failed. Make sure ${name} is powered ON and not connected to another phone.`
        );
      }

      this.nativeBleActive = false;
      this.deviceName = name;
      const hexMatch2 = String(name).match(/!([0-9a-fA-F]{4,8})/);
      const fourHexMatch2 = String(name).match(/Meshtastic\s+([0-9a-fA-F]{4})/i);
      let extractedId2 = '!f4e213d4';
      if (hexMatch2) {
        extractedId2 = '!' + hexMatch2[1].toLowerCase();
      } else if (fourHexMatch2) {
        extractedId2 = '!' + fourHexMatch2[1].toLowerCase();
      }
      this.deviceId = extractedId2;
      localStorage.setItem('evw_lora_ble_device_id', deviceId);
      localStorage.setItem('evw_lora_device_name', name);
      localStorage.setItem('evw_lora_device_id', extractedId2);

      report(`Discovering 433.875 MHz LoRa Mesh services...`);
      try {
        if (typeof capBle.discoverServices === 'function') {
          await Promise.race([
            capBle.discoverServices({ deviceId: this.bleDeviceId }),
            new Promise(r => setTimeout(r, 1500))
          ]);
        }
      } catch (discErr) {
        console.warn('[LoRaMeshClient] discoverServices note:', discErr);
      }

      // Send WantConfig to wake Meshtastic BLE radio queue
      report(`Waking Meshtastic 433.875 MHz transceiver...`);
      const wantCfg = encodeWantConfigToRadio();
      const hexStr = bytesToHex(wantCfg);
      try {
        await Promise.race([
          capBle.write({
            deviceId: this.bleDeviceId,
            service: MESH_SERVICE_UUID,
            characteristic: TORADIO_UUID,
            value: hexStr
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('write timeout')), 1200))
        ]);
      } catch (e1) {
        try {
          await Promise.race([
            capBle.writeWithoutResponse({
              deviceId: this.bleDeviceId,
              service: MESH_SERVICE_UUID,
              characteristic: TORADIO_UUID,
              value: hexStr
            }),
            new Promise(r => setTimeout(r, 1000))
          ]);
        } catch (_) {}
      }

      // Subscribe to FromNum notifications and drain FromRadio
      try {
        if (typeof capBle.addListener === 'function') {
          capBle.addListener('notification|' + this.bleDeviceId + '|' + MESH_SERVICE_UUID.toLowerCase() + '|' + FROMNUM_UUID.toLowerCase(), async () => {
            await this.drainCapacitorFromRadio(capBle);
          });
        }
        await Promise.race([
          capBle.startNotifications({
            deviceId: this.bleDeviceId,
            service: MESH_SERVICE_UUID,
            characteristic: FROMNUM_UUID
          }, async () => {
            await this.drainCapacitorFromRadio(capBle);
          }),
          new Promise(r => setTimeout(r, 1200))
        ]);
      } catch (e) {
        console.warn('[LoRaMeshClient] BLE notification setup note:', e);
      }

      if (this.bleDrainInterval) clearInterval(this.bleDrainInterval);
      this.bleDrainInterval = setInterval(() => {
        this.drainCapacitorFromRadio(capBle);
      }, 1200);

      this.setStatus(true, 'BLE', name);
      return { success: true, transport: 'BLE', deviceName: name, deviceId };
    }

    async autoConnectBLE() {
      if (this.connected && this.transport === 'BLE') return true;
      return false;
    }

    /**
     * Opens an interactive Bluetooth Device Options Popup Modal IMMEDIATELY so the user can see
     * all paired phone devices + nearby BLE nodes and select which one to connect to.
     */
    async openBleDevicePickerModal(capBle) {
      return new Promise((resolve) => {
        // Remove existing modal if any
        const existing = document.getElementById('evakwarBlePickerModal');
        if (existing) existing.remove();

        const devicesMap = new Map(); // deviceId -> { deviceId, name, rssi, bonded, isLora }

        const modal = document.createElement('div');
        modal.id = 'evakwarBlePickerModal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(2,6,23,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

        modal.innerHTML = `
          <div style="width:100%;max-width:430px;background:#0f172a;color:#f8fafc;border-radius:24px;border:1px solid rgba(99,102,241,0.45);box-shadow:0 25px 50px -12px rgba(0,0,0,0.85);overflow:hidden;display:flex;flex-direction:column;max-height:86vh;">
            <!-- Header -->
            <div style="padding:16px 18px;background:linear-gradient(135deg,#1e1b4b,#0f172a);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;">
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:38px;height:38px;border-radius:12px;background:rgba(99,102,241,0.2);border:1px solid rgba(129,140,248,0.4);display:flex;align-items:center;justify-content:center;color:#818cf8;font-size:20px;">
                  <i class="ph ph-bluetooth"></i>
                </div>
                <div>
                  <h3 style="margin:0;font-size:15px;font-weight:900;color:#ffffff;">Select Bluetooth Device</h3>
                  <p id="evwBleScanSubtitle" style="margin:2px 0 0;font-size:11px;color:#a5b4fc;display:flex;align-items:center;gap:5px;">
                    <span style="width:7px;height:7px;border-radius:50%;background:#818cf8;display:inline-block;"></span>
                    <span>Tap your paired ESP32 / LoRa node below to connect</span>
                  </p>
                </div>
              </div>
              <button type="button" id="evwBleCloseBtn" style="width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,255,255,0.08);color:#cbd5e1;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                ✕
              </button>
            </div>

            <!-- Connection Status Banner (Hidden until a device is tapped) -->
            <div id="evwBleProgressBox" style="display:none;padding:12px 16px;background:rgba(79,70,229,0.25);border-bottom:1px solid rgba(99,102,241,0.45);font-size:12px;font-weight:700;color:#e0e7ff;">
              <div id="evwBleProgressText">Connecting...</div>
              <div style="font-size:10.5px;color:#a5b4fc;margin-top:3px;font-weight:600;">Default Meshtastic Pairing PIN: <strong>123456</strong></div>
            </div>

            <!-- Error Banner -->
            <div id="evwBleErrorBox" style="display:none;padding:10px 16px;background:rgba(220,38,38,0.18);border-bottom:1px solid rgba(248,113,113,0.35);font-size:11.5px;font-weight:700;color:#fca5a5;"></div>

            <!-- Device List -->
            <div id="evwBleDeviceList" style="padding:12px 14px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:8px;min-height:190px;max-height:50vh;">
              <div style="text-align:center;padding:28px 12px;color:#94a3b8;font-size:12px;">
                Loading paired &amp; nearby Bluetooth devices...
              </div>
            </div>

            <!-- Footer Actions -->
            <div style="padding:12px 14px;background:#020617;border-top:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:8px;">
              <div style="display:flex;gap:8px;">
                <button type="button" id="evwBleRescanBtn" style="flex:1;padding:10px 12px;border-radius:12px;border:1px solid rgba(99,102,241,0.4);background:rgba(79,70,229,0.25);color:#e0e7ff;font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                  <span>🔄 Scan Again</span>
                </button>
                <button type="button" id="evwBleSettingsBtn" style="flex:1;padding:10px 12px;border-radius:12px;border:1px solid rgba(148,163,184,0.25);background:rgba(30,41,59,0.9);color:#f1f5f9;font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                  <span>⚙️ Phone BT Settings</span>
                </button>
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#64748b;padding:0 2px;">
                <span>Meshtastic BLE PIN: <strong style="color:#94a3b8;">123456</strong></span>
                <span style="color:#94a3b8;">Tap any device above to connect</span>
              </div>
            </div>
          </div>
        `;

        document.body.appendChild(modal);

        const listEl = modal.querySelector('#evwBleDeviceList');
        const subtitleEl = modal.querySelector('#evwBleScanSubtitle');
        const progressBox = modal.querySelector('#evwBleProgressBox');
        const progressText = modal.querySelector('#evwBleProgressText');
        const errorBox = modal.querySelector('#evwBleErrorBox');
        let isConnectingNow = false;
        let scanStopTimer = null;

        const onNativeScanEvent = (e) => {
          const d = (e && e.detail) || {};
          if (d && d.deviceId) {
            upsertDevice({
              deviceId: d.deviceId,
              name: d.name,
              rssi: d.rssi,
              bonded: Boolean(d.bonded)
            });
          }
        };
        window.addEventListener('evakwar:native-ble-scan', onNativeScanEvent);

        const stopScanCleanly = async () => {
          if (scanStopTimer) {
            clearTimeout(scanStopTimer);
            scanStopTimer = null;
          }
          if (window.AndroidBleBridge && typeof window.AndroidBleBridge.stopScan === 'function') {
            try { window.AndroidBleBridge.stopScan(); } catch (_) {}
          }
          if (capBle) {
            try { await Promise.race([capBle.stopLEScan(), new Promise(r => setTimeout(r, 300))]); } catch (_) {}
          }
          this.isScanningBle = false;
        };

        const cleanupAndClose = async () => {
          window.removeEventListener('evakwar:native-ble-scan', onNativeScanEvent);
          await stopScanCleanly();
          if (modal.parentNode) modal.parentNode.removeChild(modal);
        };

        const upsertDevice = (dev) => {
          if (!dev || !dev.deviceId) return;
          const idKey = String(dev.deviceId).toUpperCase();
          const prev = devicesMap.get(idKey) || {};
          const rawName = (dev.name && !String(dev.name).startsWith('Bluetooth Device')) ? dev.name : '';
          const name = rawName || dev.localName || prev.realName || '';
          const rssi = typeof dev.rssi === 'number' ? dev.rssi : prev.rssi;
          const bonded = Boolean(dev.bonded || prev.bonded);
          const isLora = Boolean(dev.isLora || prev.isLora || isLikelyLoraDevice(name, idKey));

          devicesMap.set(idKey, {
            deviceId: idKey,
            realName: name,
            name: name || `Bluetooth Device (${idKey.slice(-5)})`,
            hasRealName: Boolean(name),
            rssi,
            bonded,
            isLora
          });
          renderDeviceList();
        };

        const renderDeviceList = () => {
          if (!listEl) return;
          const all = Array.from(devicesMap.values());

          // Sort: 1) LIVE LoRa nodes (with active RSSI), 2) Bonded LoRa nodes, 3) Other LIVE nodes, 4) Other Bonded
          all.sort((a, b) => {
            const aLiveLora = Boolean(a.isLora && typeof a.rssi === 'number');
            const bLiveLora = Boolean(b.isLora && typeof b.rssi === 'number');
            if (aLiveLora !== bLiveLora) return aLiveLora ? -1 : 1;
            if (a.isLora !== b.isLora) return a.isLora ? -1 : 1;
            const aLive = typeof a.rssi === 'number';
            const bLive = typeof b.rssi === 'number';
            if (aLive !== bLive) return aLive ? -1 : 1;
            if (a.bonded !== b.bonded) return a.bonded ? -1 : 1;
            if (a.hasRealName !== b.hasRealName) return a.hasRealName ? -1 : 1;
            return (b.rssi || -999) - (a.rssi || -999);
          });

          if (all.length === 0) {
            listEl.innerHTML = `
              <div style="text-align:center;padding:24px 12px;color:#94a3b8;font-size:12px;">
                <div style="font-size:13px;font-weight:800;color:#e2e8f0;margin-bottom:4px;">Searching for Bluetooth devices...</div>
                <div style="font-size:11px;color:#64748b;line-height:1.45;">
                  Make sure your ESP32 LoRa node (<strong>RES1</strong>) is powered ON and Bluetooth is enabled.
                </div>
              </div>
            `;
            return;
          }

          listEl.innerHTML = all.map(d => {
            const isLive = typeof d.rssi === 'number';
            const borderColor = (d.isLora && isLive)
              ? 'rgba(16,185,129,0.8)'
              : (d.isLora ? 'rgba(99,102,241,0.65)' : (d.bonded ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.09)'));
            const bgColor = (d.isLora && isLive)
              ? 'linear-gradient(135deg,rgba(6,78,59,0.65),rgba(15,23,42,0.95))'
              : (d.isLora ? 'linear-gradient(135deg,rgba(49,46,129,0.55),rgba(15,23,42,0.95))' : 'rgba(30,41,59,0.75)');
            const badgeHtml = (d.isLora && isLive)
              ? `<span style="font-size:9.5px;font-weight:900;padding:2px 7px;border-radius:999px;background:#059669;color:#ffffff;text-transform:uppercase;">🟢 LIVE LORA (${d.rssi} dBm)</span>`
              : (d.isLora
                  ? `<span style="font-size:9.5px;font-weight:900;padding:2px 7px;border-radius:999px;background:#4f46e5;color:#ffffff;text-transform:uppercase;">433MHz LoRa (Paired)</span>`
                  : (d.bonded
                      ? `<span style="font-size:9.5px;font-weight:800;padding:2px 7px;border-radius:999px;background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.35);">Paired</span>`
                      : ''));
            const rssiText = isLive
              ? `Live Signal: ${d.rssi} dBm`
              : (d.bonded ? 'Saved in Phone (No live BLE signal detected yet)' : 'Nearby BLE');

            const unpairBtnHtml = d.bonded
              ? `<button type="button" data-unpair-id="${escapeHtml(d.deviceId)}" data-unpair-name="${escapeHtml(d.name)}" title="Unpair stale Bluetooth bond"
                   style="padding:7px 9px;border-radius:10px;border:1px solid rgba(248,113,113,0.4);background:rgba(220,38,38,0.2);color:#fca5a5;font-size:10.5px;font-weight:800;cursor:pointer;flex-shrink:0;">
                   Unpair
                 </button>`
              : '';

            return `
              <div style="width:100%;padding:11px 12px;border-radius:14px;border:1px solid ${borderColor};background:${bgColor};color:#ffffff;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div data-ble-id="${escapeHtml(d.deviceId)}" data-ble-name="${escapeHtml(d.name)}" style="min-width:0;flex:1;cursor:pointer;">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <span style="font-size:13.5px;font-weight:800;color:#ffffff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(d.name)}</span>
                    ${badgeHtml}
                  </div>
                  <div style="font-size:10.5px;color:${isLive ? '#6ee7b7' : '#94a3b8'};margin-top:3px;font-family:monospace;">
                    ${escapeHtml(d.deviceId)} &bull; ${escapeHtml(rssiText)}
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                  ${unpairBtnHtml}
                  <button type="button" data-ble-id="${escapeHtml(d.deviceId)}" data-ble-name="${escapeHtml(d.name)}"
                    style="padding:7px 12px;border-radius:10px;border:none;background:${isLive && d.isLora ? '#10b981' : (d.isLora ? '#4f46e5' : 'rgba(255,255,255,0.14)')};color:#ffffff;font-size:11.5px;font-weight:800;cursor:pointer;">
                    Connect
                  </button>
                </div>
              </div>
            `;
          }).join('');

          listEl.querySelectorAll('[data-ble-id]').forEach(btn => {
            btn.addEventListener('click', async () => {
              if (isConnectingNow) return;
              const targetId = btn.getAttribute('data-ble-id');
              const targetName = btn.getAttribute('data-ble-name') || 'EvakWar LoRa Node';
              await connectSelectedDevice(targetId, targetName);
            });
          });

          listEl.querySelectorAll('button[data-unpair-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const targetId = btn.getAttribute('data-unpair-id');
              const targetName = btn.getAttribute('data-unpair-name') || targetId;
              if (window.AndroidBleBridge && typeof window.AndroidBleBridge.unpairDevice === 'function') {
                window.AndroidBleBridge.unpairDevice(targetId);
              }
              const existingDev = devicesMap.get(targetId);
              if (existingDev) {
                existingDev.bonded = false;
                devicesMap.set(targetId, existingDev);
              }
              if (progressBox) progressBox.style.display = 'block';
              if (progressText) progressText.textContent = `Cleared old bond for ${targetName}. Rescanning...`;
              setTimeout(() => {
                if (progressBox && !isConnectingNow) progressBox.style.display = 'none';
                startDiscovery();
              }, 800);
            });
          });
        };

        const connectSelectedDevice = async (targetId, targetName) => {
          isConnectingNow = true;
          if (errorBox) errorBox.style.display = 'none';
          if (progressBox) progressBox.style.display = 'block';
          if (progressText) progressText.textContent = `Connecting to ${targetName}...`;

          try {
            const result = await this.connectBLEDevice(targetId, targetName, (stepMsg) => {
              if (progressText) progressText.textContent = stepMsg;
            });
            if (progressText) progressText.textContent = `✅ Connected to ${targetName}!`;
            setTimeout(async () => {
              await cleanupAndClose();
              resolve(result);
            }, 300);
          } catch (connErr) {
            isConnectingNow = false;
            if (progressBox) progressBox.style.display = 'none';
            if (errorBox) {
              errorBox.style.display = 'block';
              errorBox.textContent = connErr.message || `Could not connect to ${targetName}. Make sure the ESP32 is powered ON and within Bluetooth range.`;
            }
          }
        };

        const startDiscovery = async () => {
          if (errorBox) errorBox.style.display = 'none';
          if (subtitleEl) {
            subtitleEl.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#818cf8;display:inline-block;"></span><span>Scanning paired &amp; nearby LoRa nodes...</span>`;
          }

          // 1. Synchronous Instant Load from Native AndroidBleBridge (OS-connected + Paired devices)
          if (window.AndroidBleBridge && typeof window.AndroidBleBridge.getDevicesJson === 'function') {
            try {
              const rawJson = window.AndroidBleBridge.getDevicesJson();
              const parsed = JSON.parse(rawJson || '[]');
              if (Array.isArray(parsed)) {
                parsed.forEach(d => upsertDevice({
                  deviceId: d.deviceId,
                  name: d.name,
                  bonded: Boolean(d.bonded),
                  rssi: d.rssi,
                  isLora: Boolean(d.isLora)
                }));
              }
            } catch (_) {}
          }

          // 2. Synchronous Instant Load from AndroidSettingsBridge
          if (window.AndroidSettingsBridge && typeof window.AndroidSettingsBridge.getBondedBluetoothDevicesJson === 'function') {
            try {
              const rawJson = window.AndroidSettingsBridge.getBondedBluetoothDevicesJson();
              const parsed = JSON.parse(rawJson || '[]');
              if (Array.isArray(parsed)) {
                parsed.forEach(d => upsertDevice({ deviceId: d.deviceId, name: d.name, bonded: true }));
              }
            } catch (_) {}
          }

          renderDeviceList();

          // 4. Start Native AndroidBleBridge BLE Scanner (non-blocking)
          if (window.AndroidBleBridge && typeof window.AndroidBleBridge.startScan === 'function') {
            try { window.AndroidBleBridge.startScan(); } catch (_) {}
          }

          // 5. Also query Capacitor BLE plugin with strict non-blocking timeouts so UI never freezes
          if (capBle) {
            try {
              await Promise.race([
                capBle.initialize({ androidNeverForLocation: true }),
                new Promise(r => setTimeout(r, 1200))
              ]);
              if (typeof capBle.getBondedDevices === 'function') {
                const bondedRes = await Promise.race([
                  capBle.getBondedDevices(),
                  new Promise(r => setTimeout(r, 1000))
                ]);
                if (bondedRes && Array.isArray(bondedRes.devices)) {
                  bondedRes.devices.forEach(d => upsertDevice({
                    deviceId: d.deviceId,
                    name: d.name,
                    bonded: true
                  }));
                }
              }
              if (typeof capBle.requestLEScan === 'function') {
                this.isScanningBle = true;
                await Promise.race([
                  capBle.requestLEScan({ allowDuplicates: true }, (res) => {
                    if (res && res.device) {
                      upsertDevice({
                        deviceId: res.device.deviceId,
                        name: res.device.name || res.localName,
                        rssi: res.rssi
                      });
                    }
                  }),
                  new Promise(r => setTimeout(r, 1200))
                ]);
              }
            } catch (scanErr) {
              console.warn('[LoRaMeshClient] BLE scan note:', scanErr);
            }
          }

          scanStopTimer = setTimeout(async () => {
            await stopScanCleanly();
            if (subtitleEl) {
              subtitleEl.innerHTML = `<span>Found ${devicesMap.size} Bluetooth device${devicesMap.size === 1 ? '' : 's'}. Tap your node to connect.</span>`;
            }
          }, 8000);
        };

        // Wire Modal Buttons
        const closeBtn = modal.querySelector('#evwBleCloseBtn');
        if (closeBtn) {
          closeBtn.addEventListener('click', async () => {
            await cleanupAndClose();
            resolve({ cancelled: true });
          });
        }

        const rescanBtn = modal.querySelector('#evwBleRescanBtn');
        if (rescanBtn) {
          rescanBtn.addEventListener('click', () => {
            startDiscovery();
          });
        }

        const settingsBtn = modal.querySelector('#evwBleSettingsBtn');
        if (settingsBtn) {
          settingsBtn.addEventListener('click', () => {
            if (window.AndroidSettingsBridge && typeof window.AndroidSettingsBridge.openBluetoothSettings === 'function') {
              window.AndroidSettingsBridge.openBluetoothSettings();
            } else if (typeof window.openAndroidSettings === 'function') {
              window.openAndroidSettings('bluetooth');
            }
          });
        }

        startDiscovery();
      });
    }

    async connectBLE() {
      const capBle = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.BluetoothLe;

      // A) Native Android (AndroidBleBridge or Capacitor BLE) -> Immediately open Interactive Bluetooth Device Options Popup!
      if (window.AndroidBleBridge || capBle) {
        try {
          if (window.AndroidSettingsBridge && typeof window.AndroidSettingsBridge.isBluetoothEnabled === 'function') {
            if (!window.AndroidSettingsBridge.isBluetoothEnabled()) {
              window.AndroidSettingsBridge.requestEnableBluetooth();
            }
          }
        } catch (_) {}

        return await this.openBleDevicePickerModal(capBle);
      }

      // B) Web Bluetooth API (Chrome on Android / Desktop)
      if (navigator.bluetooth) {
        try {
          const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [MESH_SERVICE_UUID]
          });
          return await this._attachWebBleDevice(device);
        } catch (err) {
          console.error('Web Bluetooth error:', err);
          throw new Error(err.message || 'Bluetooth pairing cancelled.');
        }
      }

      throw new Error('Bluetooth Low Energy is not supported in this browser. Use the EvakWar Android App or Chrome.');
    }

    async drainCapacitorFromRadio(capBle) {
      if (!this.bleDeviceId) return;
      for (let i = 0; i < 15; i++) {
        try {
          const res = await capBle.read({
            deviceId: this.bleDeviceId,
            service: MESH_SERVICE_UUID,
            characteristic: FROMRADIO_UUID
          });
          if (!res || !res.value) break;
          const bytes = new Uint8Array(res.value.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
          if (bytes.length === 0) break;
          const evw = extractEvwStringFromBytes(bytes);
          if (evw) this.handleIncomingRawPacket(evw, 'BLE');
          const envTel = extractEnvironmentTelemetryFromBytes(bytes);
          if (envTel) this._handleWeatherTelemetryObject(envTel, 'BLE', false);
        } catch (e) {
          break;
        }
      }
    }

    async drainWebBleFromRadio() {
      if (!this.webBleFromRadio || this._drainingWebBle) return;
      this._drainingWebBle = true;
      try {
        for (let i = 0; i < 20; i++) {
          try {
            const view = await this.webBleFromRadio.readValue();
            if (!view || view.byteLength === 0) break;
            const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
            const evw = extractEvwStringFromBytes(bytes);
            if (evw) this.handleIncomingRawPacket(evw, 'BLE');
            const envTel = extractEnvironmentTelemetryFromBytes(bytes);
            if (envTel) this._handleWeatherTelemetryObject(envTel, 'BLE', false);
          } catch (e) {
            break;
          }
        }
      } finally {
        this._drainingWebBle = false;
      }
    }

    // -----------------------------------------------------------------------
    // MODE 2: USB-OTG SERIAL (115200 baud Meshtastic Stream - Native Android + WebSerial)
    // -----------------------------------------------------------------------
    async openUsbDevicePickerModal() {
      return new Promise((resolve) => {
        const existing = document.getElementById('evakwarUsbPickerModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'evakwarUsbPickerModal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(2,6,23,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

        modal.innerHTML = `
          <div style="width:100%;max-width:430px;background:#0f172a;color:#f8fafc;border-radius:24px;border:1px solid rgba(6,182,212,0.45);box-shadow:0 25px 50px -12px rgba(0,0,0,0.85);overflow:hidden;display:flex;flex-direction:column;max-height:85vh;">
            <!-- Header -->
            <div style="padding:16px 18px;background:linear-gradient(135deg,#083344,#0f172a);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;">
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:38px;height:38px;border-radius:12px;background:rgba(6,182,212,0.2);border:1px solid rgba(34,211,238,0.4);display:flex;align-items:center;justify-content:center;color:#22d3ee;font-size:20px;">
                  <i class="ph ph-plugs"></i>
                </div>
                <div>
                  <h3 style="margin:0;font-size:15px;font-weight:900;color:#ffffff;">USB-OTG LoRa Connection</h3>
                  <p style="margin:2px 0 0;font-size:11px;color:#67e8f9;">Direct 115200 Baud Serial + Phone Reverse Power</p>
                </div>
              </div>
              <button type="button" id="evwUsbCloseBtn" style="width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,255,255,0.08);color:#cbd5e1;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                ✕
              </button>
            </div>

            <!-- Status Box -->
            <div id="evwUsbStatusBox" style="display:none;padding:11px 16px;background:rgba(8,145,178,0.25);border-bottom:1px solid rgba(34,211,238,0.35);font-size:12px;font-weight:700;color:#cffafe;"></div>

            <!-- Device List -->
            <div id="evwUsbDeviceList" style="padding:14px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:10px;min-height:160px;"></div>

            <!-- Footer -->
            <div style="padding:12px 14px;background:#020617;border-top:1px solid rgba(255,255,255,0.08);display:flex;gap:8px;">
              <button type="button" id="evwUsbRefreshBtn" style="flex:1;padding:10px 12px;border-radius:12px;border:1px solid rgba(6,182,212,0.4);background:rgba(8,145,178,0.25);color:#cffafe;font-size:12px;font-weight:800;cursor:pointer;">
                🔄 Refresh USB Devices
              </button>
              <button type="button" id="evwUsbOtgSettingsBtn" style="flex:1;padding:10px 12px;border-radius:12px;border:1px solid rgba(148,163,184,0.25);background:rgba(30,41,59,0.9);color:#f1f5f9;font-size:12px;font-weight:800;cursor:pointer;">
                ⚙️ Phone OTG Settings
              </button>
            </div>
          </div>
        `;

        document.body.appendChild(modal);

        const listEl = modal.querySelector('#evwUsbDeviceList');
        const statusBox = modal.querySelector('#evwUsbStatusBox');
        let pollTimer = null;

        const showStatus = (msg, isError = false) => {
          if (!statusBox) return;
          statusBox.style.display = 'block';
          statusBox.style.background = isError ? 'rgba(220,38,38,0.2)' : 'rgba(8,145,178,0.25)';
          statusBox.style.color = isError ? '#fca5a5' : '#cffafe';
          statusBox.textContent = msg;
        };

        const cleanup = () => {
          if (pollTimer) clearInterval(pollTimer);
          window.removeEventListener('evakwar:native-usb-permission', onUsbPerm);
          window.removeEventListener('evakwar:native-usb-attached', refreshDevices);
          if (modal.parentNode) modal.parentNode.removeChild(modal);
        };

        const onUsbPerm = (e) => {
          const d = (e && e.detail) || {};
          if (d.granted && d.connected) {
            this.nativeUsbActive = true;
            const name = 'USB-OTG LoRa Node (433MHz)';
            this.setStatus(true, 'USB_SERIAL', name);
            showStatus('✅ Connected to USB-OTG LoRa Node!');
            setTimeout(() => {
              cleanup();
              resolve({ success: true, transport: 'USB_SERIAL', deviceName: name });
            }, 350);
          } else {
            showStatus('USB permission was denied or connection failed. Tap Connect to try again.', true);
            refreshDevices();
          }
        };

        window.addEventListener('evakwar:native-usb-permission', onUsbPerm);

        const connectToUsbId = (deviceId, label) => {
          try {
            showStatus(`Connecting to ${label}...`);
            const rawRes = window.AndroidUsbSerialBridge.connectDevice(Number(deviceId));
            const res = JSON.parse(rawRes || '{}');
            if (res.status === 'CONNECTED') {
              this.nativeUsbActive = true;
              const name = label || 'USB-OTG LoRa Node (433MHz)';
              this.setStatus(true, 'USB_SERIAL', name);
              showStatus(`✅ Connected to ${name}!`);
              setTimeout(() => {
                cleanup();
                resolve({ success: true, transport: 'USB_SERIAL', deviceName: name });
              }, 300);
            } else if (res.status === 'PERMISSION_REQUESTED') {
              showStatus('Please tap "OK" on the Android USB permission popup...');
            } else {
              showStatus(res.message || 'Could not open USB serial device.', true);
            }
          } catch (err) {
            showStatus(err.message || 'Failed to connect USB-OTG device.', true);
          }
        };

        const refreshDevices = () => {
          if (!listEl || !window.AndroidUsbSerialBridge) return;
          let devices = [];
          try {
            devices = JSON.parse(window.AndroidUsbSerialBridge.listDevicesJson() || '[]');
          } catch (_) {}

          if (!Array.isArray(devices) || devices.length === 0) {
            listEl.innerHTML = `
              <div style="text-align:center;padding:18px 12px;background:rgba(30,41,59,0.5);border-radius:16px;border:1px dashed rgba(148,163,184,0.3);">
                <div style="font-size:13px;font-weight:800;color:#e2e8f0;margin-bottom:6px;">No USB-OTG LoRa Node Detected Yet</div>
                <div style="font-size:11.5px;color:#94a3b8;line-height:1.5;">
                  1. Plug your <strong>Type-C OTG adapter + USB data cable</strong> into the phone and ESP32 LoRa node.<br>
                  2. Ensure the ESP32 red power LED turns ON.<br>
                  3. If using Oppo / Vivo / Realme / Xiaomi, tap <strong>Phone OTG Settings</strong> below and turn ON "OTG Connection".
                </div>
              </div>
            `;
            return;
          }

          listEl.innerHTML = devices.map(d => `
            <button type="button" data-usb-id="${d.deviceId}" data-usb-label="${escapeHtml(d.label || d.deviceName)}"
              style="width:100%;text-align:left;padding:13px 14px;border-radius:16px;border:1px solid rgba(34,211,238,0.55);background:linear-gradient(135deg,rgba(8,51,68,0.75),rgba(15,23,42,0.9));color:#ffffff;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <div>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:13.5px;font-weight:800;color:#ffffff;">${escapeHtml(d.label || 'ESP32 USB-OTG LoRa Node')}</span>
                  <span style="font-size:9.5px;font-weight:900;padding:2px 7px;border-radius:999px;background:#0891b2;color:#ffffff;">${escapeHtml(d.chipType || '115200')}</span>
                </div>
                <div style="font-size:11px;color:#67e8f9;margin-top:3px;font-family:monospace;">
                  ${escapeHtml(d.deviceName)} &bull; 115200 baud 8N1
                </div>
              </div>
              <div style="padding:7px 12px;border-radius:10px;background:#06b6d4;color:#083344;font-size:11.5px;font-weight:900;flex-shrink:0;">
                Connect OTG
              </div>
            </button>
          `).join('');

          listEl.querySelectorAll('button[data-usb-id]').forEach(btn => {
            btn.addEventListener('click', () => {
              connectToUsbId(btn.getAttribute('data-usb-id'), btn.getAttribute('data-usb-label'));
            });
          });
        };

        window.addEventListener('evakwar:native-usb-attached', refreshDevices);
        pollTimer = setInterval(refreshDevices, 1500);

        modal.querySelector('#evwUsbCloseBtn').addEventListener('click', () => {
          cleanup();
          resolve({ cancelled: true });
        });
        modal.querySelector('#evwUsbRefreshBtn').addEventListener('click', refreshDevices);
        modal.querySelector('#evwUsbOtgSettingsBtn').addEventListener('click', () => {
          if (window.AndroidSettingsBridge) {
            window.AndroidSettingsBridge.openGeneralSettings();
          }
        });

        refreshDevices();
      });
    }

    async connectUSBSerial() {
      // A) Native Android USB-OTG Host Bridge (Capacitor Android App)
      if (window.AndroidUsbSerialBridge) {
        return await this.openUsbDevicePickerModal();
      }

      // B) Desktop Chrome / Edge WebSerial API
      if (navigator.serial) {
        try {
          const port = await navigator.serial.requestPort();
          await port.open({ baudRate: 115200 });
          this.serialPort = port;
          this.serialWriter = port.writable.getWriter();

          const wakeFrame = wrapSerialFrame(encodeWantConfigToRadio());
          await this.serialWriter.write(wakeFrame);

          this.readUsbSerialLoop(port);

          const name = 'USB-OTG LoRa Node (433MHz)';
          this.setStatus(true, 'USB_SERIAL', name);
          return { success: true, transport: 'USB_SERIAL', deviceName: name };
        } catch (err) {
          console.error('USB Serial error:', err);
          throw new Error(err.message || 'USB-OTG Serial port could not be opened.');
        }
      }

      throw new Error('USB-OTG Serial requires the EvakWar Android App or a WebSerial-compatible browser.');
    }

    async readUsbSerialLoop(port) {
      try {
        this.serialReader = port.readable.getReader();
        while (true) {
          const { value, done } = await this.serialReader.read();
          if (done) break;
          if (value && value.length > 0) {
            this.serialBuffer = concatUint8([this.serialBuffer, value]);

            // Properly parse complete Meshtastic 0x94 0xC3 framed protobuf packets without chopping partial chunks!
            let cursor = 0;
            let parsedAnyFrame = false;
            while (cursor <= this.serialBuffer.length - 4) {
              if (this.serialBuffer[cursor] === 0x94 && this.serialBuffer[cursor + 1] === 0xc3) {
                const frameLen = (this.serialBuffer[cursor + 2] << 8) | this.serialBuffer[cursor + 3];
                if (frameLen > 0 && frameLen <= 512) {
                  if (cursor + 4 + frameLen <= this.serialBuffer.length) {
                    // Complete protobuf frame received!
                    const frameBytes = this.serialBuffer.subarray(cursor + 4, cursor + 4 + frameLen);
                    const evw = extractEvwStringFromBytes(frameBytes);
                    if (evw) {
                      this.handleIncomingRawPacket(evw, 'USB_SERIAL');
                    }
                    const envTel = extractEnvironmentTelemetryFromBytes(frameBytes);
                    if (envTel) {
                      this._handleWeatherTelemetryObject(envTel, 'USB_SERIAL', false);
                    }
                    cursor += 4 + frameLen;
                    parsedAnyFrame = true;
                    continue;
                  } else {
                    // Partial frame still arriving over USB — wait for the remaining bytes!
                    break;
                  }
                }
              }
              cursor++;
            }

            if (parsedAnyFrame && cursor > 0) {
              this.serialBuffer = this.serialBuffer.slice(cursor);
            } else {
              // Plain-text fallback ONLY if newline-terminated (e.g., debug serial logs) and NOT inside a 0x94 0xC3 binary frame
              let hasPendingBinaryFrame = false;
              for (let i = 0; i < this.serialBuffer.length - 1; i++) {
                if (this.serialBuffer[i] === 0x94 && this.serialBuffer[i + 1] === 0xc3) {
                  hasPendingBinaryFrame = true;
                  break;
                }
              }
              if (!hasPendingBinaryFrame) {
                const ascii = new TextDecoder('utf-8', { fatal: false }).decode(this.serialBuffer);
                if (ascii.includes('EVW|') && (ascii.includes('\n') || ascii.includes('\r'))) {
                  const evw = extractEvwStringFromAscii(ascii);
                  if (evw) {
                    this.handleIncomingRawPacket(evw, 'USB_SERIAL');
                    this.serialBuffer = new Uint8Array(0);
                  }
                }
              }
              if (this.serialBuffer.length > 4096) {
                this.serialBuffer = this.serialBuffer.slice(-1024);
              }
            }
          }
        }
      } catch (err) {
        console.warn('USB Serial reader closed:', err);
        if (!window.__evwPageUnloading) {
          this.setStatus(false, 'DISCONNECTED', 'USB Node Disconnected');
        }
      }
    }

    // -----------------------------------------------------------------------
    // MODE 3: ESP32 WI-FI HOTSPOT / BARANGAY HALL LAN SYNC
    // -----------------------------------------------------------------------
    async connectWiFiBridge(customUrl) {
      const targetUrl = (customUrl || this.serverUrl || window.location.origin).replace(/\/$/, '');
      try {
        const resp = await fetch(`${targetUrl}/api/lora/status`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        this.serverUrl = targetUrl;
        localStorage.setItem('evw_server_url', targetUrl);

        const gw = data.gateway || {};
        const label = gw.nodeName
          ? `${gw.nodeName} (${gw.nodeId || '433MHz'})`
          : 'EvakWar Wi-Fi / Hall Gateway';

        this.setStatus(true, 'WIFI_GATEWAY', label, { gateway: gw });
        return { success: true, transport: 'WIFI_GATEWAY', deviceName: label, gateway: gw };
      } catch (err) {
        throw new Error(`Could not reach EvakWar Gateway at ${targetUrl}`);
      }
    }

    // -----------------------------------------------------------------------
    // UNIFIED PACKET TRANSMITTER (BLE -> Native USB-OTG -> WebSerial -> Wi-Fi)
    // -----------------------------------------------------------------------
    async sendPacket(rawEvwPacket, metadata = {}) {
      console.log(`[LoRaMeshClient TX] ${rawEvwPacket}`);
      const capBle = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.BluetoothLe;

      // 1. Try Native Android USB-OTG Serial if active
      if (this.transport === 'USB_SERIAL' && this.nativeUsbActive && window.AndroidUsbSerialBridge) {
        const protoBytes = encodeMeshtasticTextToRadio(rawEvwPacket);
        const serialFrame = wrapSerialFrame(protoBytes);
        const hexStr = bytesToHex(serialFrame);
        const ok = window.AndroidUsbSerialBridge.writeHex(hexStr);
        if (ok) {
          return { success: true, transport: 'USB_SERIAL', packet: rawEvwPacket };
        }
      }

      // 1b. Try Direct Native Android BLE Bridge if active (or if native bridge reports connected)
      if (window.AndroidBleBridge && typeof window.AndroidBleBridge.writeHex === 'function') {
        const isNativeConnected = this.nativeBleActive || (
          typeof window.AndroidBleBridge.isConnected === 'function' && window.AndroidBleBridge.isConnected()
        );
        if (isNativeConnected) {
          this.nativeBleActive = true;
          const protoBytes = encodeMeshtasticTextToRadio(rawEvwPacket);
          const hexStr = bytesToHex(protoBytes);
          const ok = window.AndroidBleBridge.writeHex(hexStr);

          // For high-priority SOS / Cancel SOS / Rescuer ACK / LoRa Chat frames, schedule a 2nd RF burst 2.2s later
          // (after the 805ms SF11 LoRa airtime completes) so RF collisions can never drop a packet!
          if (rawEvwPacket && (rawEvwPacket.startsWith('EVW|SOS|') || rawEvwPacket.startsWith('EVW|CAN|') || rawEvwPacket.startsWith('EVW|ACK|') || rawEvwPacket.startsWith('EVW|MSG|'))) {
            setTimeout(() => {
              try {
                if (window.AndroidBleBridge && typeof window.AndroidBleBridge.writeHex === 'function') {
                  const retryBytes = encodeMeshtasticTextToRadio(rawEvwPacket);
                  window.AndroidBleBridge.writeHex(bytesToHex(retryBytes));
                }
              } catch (_e) {}
            }, 2200);
          }

          // Dual-path redundancy (SOS / ACK only - never Wi-Fi mirror for LoRa-only chat)
          if (!metadata.loraOnly && navigator.onLine) {
            const bgUrl = (this.serverUrl || window.location.origin).replace(/\/$/, '');
            if (bgUrl.startsWith('http')) {
              fetch(`${bgUrl}/api/lora/inbound-sos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  rawPacket: rawEvwPacket,
                  fromNode: this.deviceId || '!f4e213d4',
                  ...metadata
                })
              }).catch(() => {});
            }
          }

          if (ok) {
            this.setStatus(true, 'BLE', this.deviceName || 'RES1 (!f4e213d4)');
            return { success: true, transport: 'BLE', packet: rawEvwPacket };
          }
        }
      }

      // 2. Try Native Capacitor BLE
      if (capBle && this.bleDeviceId) {
        const protoBytes = encodeMeshtasticTextToRadio(rawEvwPacket);
        const hexStr = bytesToHex(protoBytes);

        try {
          await capBle.write({
            deviceId: this.bleDeviceId,
            service: MESH_SERVICE_UUID,
            characteristic: TORADIO_UUID,
            value: hexStr
          });
          this.setStatus(true, 'BLE', this.deviceName || 'RES1 (!f4e213d4)');
          return { success: true, transport: 'BLE', packet: rawEvwPacket };
        } catch (writeErr) {
          console.warn('[LoRaMeshClient] write failed, attempting writeWithoutResponse:', writeErr);
          try {
            await capBle.writeWithoutResponse({
              deviceId: this.bleDeviceId,
              service: MESH_SERVICE_UUID,
              characteristic: TORADIO_UUID,
              value: hexStr
            });
            this.setStatus(true, 'BLE', this.deviceName || 'RES1 (!f4e213d4)');
            return { success: true, transport: 'BLE', packet: rawEvwPacket };
          } catch (noRespErr) {
            console.error('[LoRaMeshClient] BLE write error:', noRespErr);
            throw new Error(`BLE Send Failed: ${noRespErr.message || 'Node rejected packet'}`);
          }
        }
      }

      // 3. Try Web Bluetooth if connected
      if (this.transport === 'BLE' && this.webBleToRadio) {
        const protoBytes = encodeMeshtasticTextToRadio(rawEvwPacket);
        await this.webBleToRadio.writeValue(protoBytes);
        return { success: true, transport: 'BLE', packet: rawEvwPacket };
      }

      // 4. Try Desktop WebSerial USB-OTG if connected
      if (this.transport === 'USB_SERIAL' && this.serialWriter) {
        const protoBytes = encodeMeshtasticTextToRadio(rawEvwPacket);
        const serialFrame = wrapSerialFrame(protoBytes);
        await this.serialWriter.write(serialFrame);
        return { success: true, transport: 'USB_SERIAL', packet: rawEvwPacket };
      }

      // 5. Try Wi-Fi / Barangay Hall Gateway / Local Serial COM3 Relay (disabled when loraOnly is true)
      if (metadata && metadata.loraOnly) {
        throw new Error('LoRa Mesh Chat requires a connected LoRa device (Bluetooth or USB-OTG). Wi-Fi sending is disabled.');
      }
      const targetUrl = (this.serverUrl || window.location.origin).replace(/\/$/, '');
      try {
        const resp = await fetch(`${targetUrl}/api/lora/inbound-sos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawPacket: rawEvwPacket,
            fromNode: this.deviceId || '!f4e213d4',
            ...metadata
          })
        });

        if (resp.ok) {
          const json = await resp.json();
          fetch(`${targetUrl}/api/lora/transmit-serial`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ packet: rawEvwPacket })
          }).catch(() => {});

          if (json.ackPacket) {
            setTimeout(() => {
              this.handleIncomingRawPacket(json.ackPacket, this.transport || 'WIFI_GATEWAY');
            }, 900);
          }
          return {
            success: true,
            transport: this.transport === 'DISCONNECTED' ? 'WIFI_GATEWAY' : this.transport,
            packet: rawEvwPacket,
            serverResponse: json
          };
        }
      } catch (netErr) {
        console.warn('[LoRaMeshClient] Network/Wi-Fi dispatch unavailable:', netErr.message);
      }

      throw new Error('No active LoRa Node (Bluetooth / USB-OTG / Wi-Fi) connected. Tap the top connection icon to connect your LoRa device.');
    }

    /**
     * Formats and transmits a compact EvakWar SOS packet (`EVW|SOS|...`)
     */
    async sendSosAlert({ msgId, residentId, name, latitude, longitude, accuracy, pinMode = 'G', vulnCode = 'N', statusCode = 'ACT' }) {
      const id = msgId || String(Date.now()).slice(-6);
      const resId = residentId || 0;
      const lat = Number(latitude || 13.51024).toFixed(5);
      const lng = Number(longitude || 123.34701).toFixed(5);
      const acc = Math.round(Number(accuracy || 10));
      const cleanName = String(name || 'Resident').replace(/\|/g, ' ').slice(0, 26);

      const rawPacket = `EVW|SOS|${id}|${resId}|${lat},${lng},${acc}|${pinMode}|${vulnCode}|${statusCode}|${cleanName}`;
      return await this.sendPacket(rawPacket, {
        msgId: id,
        resident_id: resId,
        name: cleanName,
        latitude: Number(lat),
        longitude: Number(lng),
        accuracy: acc,
        pinMode,
        vulnCode,
        statusCode
      });
    }

    /**
     * Convenience alias for transmitting raw EVW|... frames over active LoRa Node (BLE / USB-OTG / Wi-Fi)
     */
    async sendText(rawEvwPacket, metadata = {}) {
      return await this.sendPacket(rawEvwPacket, metadata);
    }

    /**
     * Formats and transmits a Rescuer SOS Acknowledgment / Status Update over 433.875 MHz LoRa RF
     * (`EVW|ACK|<sosId>|<residentId>|<status>|<rescuerName>|<lat>,<lng>`)
     */
    async sendSosAck({ sosId, residentId = 0, status = 'ACKNOWLEDGED', rescuerName = 'Rescuer Unit', latitude = null, longitude = null }) {
      const sId = sosId || 0;
      const resId = residentId || 0;
      const cleanStatus = String(status || 'ACKNOWLEDGED').toUpperCase().replace(/\|/g, '');
      const cleanName = String(rescuerName || 'Rescuer Unit').replace(/\|/g, '/').trim().slice(0, 24);
      const hasCoords = (latitude !== null && longitude !== null && isFinite(Number(latitude)) && isFinite(Number(longitude)));
      const coordSuffix = hasCoords ? `|${Number(latitude).toFixed(5)},${Number(longitude).toFixed(5)}` : '';
      const rawPacket = `EVW|ACK|${sId}|${resId}|${cleanStatus}|${cleanName}${coordSuffix}`;
      return await this.sendPacket(rawPacket, {
        sosId: sId,
        resident_id: resId,
        status: cleanStatus,
        responderName: cleanName,
        rescuerLat: hasCoords ? Number(latitude) : null,
        rescuerLng: hasCoords ? Number(longitude) : null
      });
    }

    /**
     * Formats and transmits a compact EvakWar SOS Cancellation packet (`EVW|CAN|<sosId>|<residentId>`)
     */
    async sendCancelSos({ sosId, residentId }) {
      const sId = sosId || 0;
      const resId = residentId || 0;
      const rawPacket = `EVW|CAN|${sId}|${resId}`;
      return await this.sendPacket(rawPacket, {
        sosId: sId,
        resident_id: resId,
        status: 'CANCELLED'
      });
    }

    /**
     * Resolves the active 433.875 MHz LoRa Node ID (!d88b1a58, !0f778ab0, !f4e213d4)
     */
    getResolvedNodeId(role = 'Resident') {
      const devName = String(this.deviceName || '');
      // 1. Matches hex ID directly if present in name, e.g. "STF1 (!abc4ca70)" or "!abc4ca70"
      const match = devName.match(/!([0-9a-fA-F]{4,8})/);
      if (match) return '!' + match[1].toLowerCase();

      // 2. Default Meshtastic BLE advertisement names, e.g. "Meshtastic 64f4" or "Meshtastic ca70"
      const fourHexMatch = devName.match(/Meshtastic\s+([0-9a-fA-F]{4})/i);
      if (fourHexMatch) return '!' + fourHexMatch[1].toLowerCase();

      // 3. Stored hardware device ID from active BLE link
      if (this.deviceId && String(this.deviceId).startsWith('!')) {
        return String(this.deviceId).toLowerCase();
      }

      const r = String(role || '').toLowerCase();
      if (r.includes('admin')) return '!d88b1a58';
      return this.deviceId || null;
    }

    /**
     * Formats and transmits a compact LoRa Mesh Group Chat packet (`EVW|MSG|<msgId>|<role>|<name>|<nodeId>|<ts>|<text>`)
     */
    async sendChatMessage({ msgId, senderRole = 'Resident', senderName = 'Community Member', nodeId, text }) {
      const id = msgId || (String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 90 + 10)));
      const cleanRole = String(senderRole || 'Resident').replace(/\|/g, '/').trim().slice(0, 14);
      const cleanName = String(senderName || 'Community Member').replace(/\|/g, '/').trim().slice(0, 28);
      const resolvedNode = (nodeId && String(nodeId).startsWith('!')) ? String(nodeId) : this.getResolvedNodeId(cleanRole);
      const cleanText = String(text || '').replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim().slice(0, 120);
      const tsSec = Math.floor(Date.now() / 1000);

      const rawPacket = `EVW|MSG|${id}|${cleanRole}|${cleanName}|${resolvedNode}|${tsSec}|${cleanText}`;
      this._processedChatIds = this._processedChatIds || new Set();
      this._processedChatIds.add(id);
      if (typeof window !== 'undefined' && window.AndroidBleBridge) {
        if (typeof window.AndroidBleBridge.markMessageSentBySelf === 'function') {
          try { window.AndroidBleBridge.markMessageSentBySelf(id); } catch (_) {}
        }
        if (typeof window.AndroidBleBridge.setActiveUser === 'function') {
          try { window.AndroidBleBridge.setActiveUser(cleanName, cleanRole); } catch (_) {}
        }
      }

      const chatObj = {
        type: 'MSG',
        id,
        msgId: id,
        senderRole: cleanRole,
        senderName: cleanName,
        nodeId: resolvedNode,
        senderBadge: `${cleanRole} | ${cleanName}`,
        text: cleanText,
        message: cleanText,
        timestamp: tsSec * 1000,
        sent_at: new Date(tsSec * 1000).toISOString(),
        raw: rawPacket
      };

      const txRes = await this.sendPacket(rawPacket, {
        loraOnly: true,
        msgId: id,
        senderRole: cleanRole,
        senderName: cleanName,
        nodeId: resolvedNode,
        text: cleanText
      });

      try {
        let stored = JSON.parse(localStorage.getItem('evw_lora_chat_messages') || '[]');
        if (!Array.isArray(stored)) stored = [];
        if (!stored.some(m => String(m.msgId || m.id) === id)) {
          stored.push(chatObj);
          if (stored.length > 150) stored = stored.slice(-150);
          localStorage.setItem('evw_lora_chat_messages', JSON.stringify(stored));
        }
      } catch (_) {}

      return {
        ...txRes,
        chatMessage: chatObj
      };
    }
  }

  global.LoRaMeshClient = LoRaMeshClient;
  global.parseEvwPacket = parseEvwPacket;

  if (!global.evakwarLoraClient) {
    global.evakwarLoraClient = new LoRaMeshClient();
  }
})(window);

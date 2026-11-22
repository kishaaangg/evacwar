/**
 * EvakWar Direct Relay Wi-Fi -> MQTT Weather Sensor Bridge
 * ---------------------------------------------------------
 * Allows the outdoor Meshtastic Relay ESP32 (REL1 with AHT20 + BMP280)
 * to publish live weather telemetry directly over Wi-Fi/Hotspot to the
 * cloud server even when ZERO PC USB gateways and ZERO BLE phones are connected.
 *
 * Meanwhile, the Relay keeps 433.875 MHz LoRa Mesh active simultaneously.
 */

let mqttClient = null;
let bridgeStatus = {
  enabled: true,
  connected: false,
  brokerUrl: null,
  topic: null,
  lastMessageAt: null,
  lastNodeId: null,
  messageCount: 0,
  lastError: null
};

function formatMeshtasticNodeId(fromVal, senderVal) {
  if (typeof senderVal === 'string' && senderVal.startsWith('!')) {
    return senderVal.toLowerCase();
  }
  if (typeof fromVal === 'string' && fromVal.startsWith('!')) {
    return fromVal.toLowerCase();
  }
  const num = Number(fromVal);
  if (Number.isFinite(num) && num > 0) {
    return '!' + (num >>> 0).toString(16).padStart(8, '0');
  }
  return '!0f778ab0';
}

function extractEnvironmentTelemetry(msg) {
  if (!msg || typeof msg !== 'object') return null;

  const payload = (msg.payload && typeof msg.payload === 'object') ? msg.payload : msg;
  const env = (payload.environment_metrics && typeof payload.environment_metrics === 'object')
    ? payload.environment_metrics
    : payload;

  const rawTemp = env.temperature ?? env.temp ?? env.t;
  const rawHum = env.relative_humidity ?? env.humidity ?? env.hum ?? env.h;
  const rawPress = env.barometric_pressure ?? env.pressure ?? env.press ?? env.p;

  const temperature = (rawTemp !== undefined && rawTemp !== null && rawTemp !== '') ? Number(rawTemp) : null;
  const humidity = (rawHum !== undefined && rawHum !== null && rawHum !== '') ? Number(rawHum) : null;
  const pressure = (rawPress !== undefined && rawPress !== null && rawPress !== '') ? Number(rawPress) : null;

  const hasValidTemp = temperature !== null && Number.isFinite(temperature) && temperature > -40 && temperature < 85;
  const hasValidHum = humidity !== null && Number.isFinite(humidity) && humidity >= 0 && humidity <= 100;
  const hasValidPress = pressure !== null && Number.isFinite(pressure) && pressure > 300 && pressure < 1200;

  if (!hasValidTemp && !hasValidHum && !hasValidPress) {
    return null;
  }

  return {
    temperature: hasValidTemp ? temperature : null,
    humidity: hasValidHum ? humidity : null,
    pressure: hasValidPress ? pressure : null,
    nodeId: formatMeshtasticNodeId(msg.from, msg.sender),
    nodeName: msg.nodeName || 'EvakWar Zone Relay 1 (REL1)',
    sensorModel: 'AHT20 + BMP280 (I2C)',
    rssi: (msg.rssi !== undefined && Number.isFinite(Number(msg.rssi))) ? Number(msg.rssi) : null,
    snr: (msg.snr !== undefined && Number.isFinite(Number(msg.snr))) ? Number(msg.snr) : null,
    hopsAway: (msg.hops_away !== undefined && Number.isFinite(Number(msg.hops_away))) ? Number(msg.hops_away) : 0,
    source: 'RELAY_WIFI_MQTT',
    updatedAt: new Date().toISOString()
  };
}

function start({ onWeatherReading } = {}) {
  if (process.env.DISABLE_LORA_MQTT === '1' || process.env.DISABLE_LORA_MQTT === 'true') {
    bridgeStatus.enabled = false;
    return null;
  }
  if (mqttClient) return mqttClient;

  let mqtt;
  try {
    mqtt = require('mqtt');
  } catch (err) {
    bridgeStatus.lastError = 'mqtt package not installed';
    console.warn('[LoRa-MQTT] mqtt package not installed; skipping direct Relay Wi-Fi bridge.');
    return null;
  }

  const brokerUrl = process.env.LORA_MQTT_BROKER || 'mqtt://broker.emqx.io:1883';
  const rootTopic = (process.env.LORA_MQTT_ROOT || 'evakwar/sanrafael').replace(/\/+$/, '');
  const subTopic = `${rootTopic}/2/json/#`;
  const directTopic = `${rootTopic}/weather`;

  bridgeStatus.brokerUrl = brokerUrl;
  bridgeStatus.topic = subTopic;

  const clientId = `evakwar-srv-${Math.random().toString(16).slice(2, 10)}`;

  try {
    const client = mqtt.connect(brokerUrl, {
      clientId,
      clean: true,
      connectTimeout: 15000,
      reconnectPeriod: 10000,
      keepalive: 45,
      username: process.env.LORA_MQTT_USERNAME || undefined,
      password: process.env.LORA_MQTT_PASSWORD || undefined
    });

    mqttClient = client;

    client.on('connect', () => {
      bridgeStatus.connected = true;
      bridgeStatus.lastError = null;
      client.subscribe([subTopic, directTopic], { qos: 0 }, (err) => {
        if (err) {
          bridgeStatus.lastError = err.message;
          console.warn('[LoRa-MQTT] Subscribe error:', err.message);
        } else {
          console.log(`[LoRa-MQTT] Connected to ${brokerUrl} — listening on ${subTopic}`);
        }
      });
    });

    client.on('reconnect', () => {
      bridgeStatus.connected = false;
    });

    client.on('close', () => {
      bridgeStatus.connected = false;
    });

    client.on('error', (err) => {
      bridgeStatus.connected = false;
      bridgeStatus.lastError = err ? err.message : 'MQTT error';
    });

    client.on('message', (_topic, payloadBuf) => {
      try {
        const rawText = payloadBuf ? payloadBuf.toString('utf8').trim() : '';
        if (!rawText || !rawText.startsWith('{')) return;
        const parsed = JSON.parse(rawText);

        // Ignore non-telemetry packets (nodeinfo, position, routing, etc.)
        if (parsed.type && parsed.type !== 'telemetry' && parsed.type !== 'weather') {
          return;
        }

        const reading = extractEnvironmentTelemetry(parsed);
        if (!reading) return;

        bridgeStatus.lastMessageAt = reading.updatedAt;
        bridgeStatus.lastNodeId = reading.nodeId;
        bridgeStatus.messageCount += 1;

        console.log(
          `[LoRa-MQTT] Live Relay Telemetry (${reading.nodeId}): ` +
          `Temp=${reading.temperature ?? '--'}°C, Hum=${reading.humidity ?? '--'}%, Press=${reading.pressure ?? '--'} hPa`
        );

        if (typeof onWeatherReading === 'function') {
          onWeatherReading(reading);
        }
      } catch (_parseErr) {
        // Ignore malformed non-JSON MQTT packets cleanly
      }
    });

    return client;
  } catch (err) {
    bridgeStatus.lastError = err.message;
    console.warn('[LoRa-MQTT] Failed to initialize MQTT bridge (non-fatal):', err.message);
    return null;
  }
}

function getStatus() {
  return { ...bridgeStatus };
}

module.exports = {
  start,
  getStatus,
  extractEnvironmentTelemetry
};

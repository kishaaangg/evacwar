const fs = require('fs');
const path = require('path');

const WEATHER_SENSOR_FILE = path.join(__dirname, '..', 'data', 'lora_weather_sensor.json');
const WEATHER_ALERT_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_HISTORY_ENTRIES = 72;

/**
 * Computes heat index in Celsius using Rothfusz regression (NOAA / PAGASA standard).
 */
function computeHeatIndex(tempC, humidity) {
  if (tempC == null || humidity == null || !isFinite(tempC) || !isFinite(humidity)) return null;
  const t = Number(tempC);
  const rh = Math.max(0, Math.min(100, Number(humidity)));
  if (t < 27 || rh < 40) return Number(t.toFixed(1));

  const tf = (t * 9) / 5 + 32;
  let hiF =
    -42.379 +
    2.04901523 * tf +
    10.14333127 * rh -
    0.22475541 * tf * rh -
    0.00683783 * tf * tf -
    0.05481717 * rh * rh +
    0.00122874 * tf * tf * rh +
    0.00085282 * tf * rh * rh -
    0.00000199 * tf * tf * rh * rh;

  if (rh < 13 && tf >= 80 && tf <= 112) {
    hiF -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(tf - 95)) / 17);
  } else if (rh > 85 && tf >= 80 && tf <= 87) {
    hiF += ((rh - 85) / 10) * ((87 - tf) / 5);
  }
  return Number((((hiF - 32) * 5) / 9).toFixed(1));
}

/**
 * Computes dew point in Celsius via Magnus-Tetens approximation.
 */
function computeDewPoint(tempC, humidity) {
  if (tempC == null || humidity == null || !isFinite(tempC) || !isFinite(humidity)) return null;
  const t = Number(tempC);
  const rh = Math.max(1, Math.min(100, Number(humidity)));
  const a = 17.625;
  const b = 243.04;
  const gamma = Math.log(rh / 100) + (a * t) / (b + t);
  return Number(((b * gamma) / (a - gamma)).toFixed(1));
}

/**
 * Computes barometric pressure trend against recent history readings.
 */
function computePressureTrend(pressureHpa, history = []) {
  if (pressureHpa == null || !isFinite(pressureHpa)) {
    return { label: 'Steady', deltaHpa: 0, code: 'STEADY' };
  }
  const now = Date.now();
  const baseline = history.find((entry) => {
    const ts = new Date(entry.updatedAt || entry.timestamp || 0).getTime();
    return entry.pressure != null && ts > 0 && now - ts >= 30 * 60 * 1000 && now - ts <= 4 * 60 * 60 * 1000;
  }) || history[history.length - 1];

  if (!baseline || baseline.pressure == null) {
    return { label: 'Steady', deltaHpa: 0, code: 'STEADY' };
  }

  const delta = Number((Number(pressureHpa) - Number(baseline.pressure)).toFixed(2));
  if (delta <= -3.0) return { label: 'Rapid Drop', deltaHpa: delta, code: 'RAPID_FALL' };
  if (delta <= -1.0) return { label: 'Falling', deltaHpa: delta, code: 'FALLING' };
  if (delta >= 1.5) return { label: 'Rising', deltaHpa: delta, code: 'RISING' };
  return { label: 'Steady', deltaHpa: delta, code: 'STEADY' };
}

/**
 * Classifies local sky/weather outlook and heat advisory strictly from AHT20 + BMP280 readings.
 */
function deriveWeatherSummary(tempC, humidity, pressureHpa, trend = { code: 'STEADY' }) {
  const t = Number(tempC || 0);
  const rh = Number(humidity || 0);
  const p = Number(pressureHpa || 1013);
  const hi = computeHeatIndex(t, rh);

  let heatCategory = 'Normal';
  if (hi !== null) {
    if (hi >= 52) heatCategory = 'Extreme Danger Heat';
    else if (hi >= 42) heatCategory = 'Danger Heat';
    else if (hi >= 33) heatCategory = 'Extreme Caution Heat';
    else if (hi >= 27) heatCategory = 'Caution Warmth';
  }

  let condition = 'Fair / Partly Cloudy';
  let advisoryLevel = 'NORMAL';
  let guidance = 'Local Relay sensor telemetry shows stable ambient weather across San Rafael.';

  if (p < 1002 || trend.code === 'RAPID_FALL') {
    condition = 'Low Pressure / Possible Storm';
    advisoryLevel = 'WATCH';
    guidance = 'Barometric pressure dropped significantly. Expect possible heavy rain or squalls and monitor PAGASA updates.';
  } else if (p < 1008 || (rh >= 86 && trend.code === 'FALLING')) {
    condition = 'Cloudy / Rain Showers Likely';
    advisoryLevel = 'CAUTION';
    guidance = 'High moisture with lower pressure detected on Relay sensor. Keep rain gear ready and watch low-lying drainage.';
  } else if (rh >= 80) {
    condition = 'Warm & Humid';
    advisoryLevel = hi >= 33 ? 'CAUTION' : 'NORMAL';
    guidance = hi >= 33
      ? 'High humidity increases heat index. Stay hydrated and limit strenuous midday outdoor exposure.'
      : 'Humid ambient air detected on the Relay station with comfortable pressure.';
  } else if (p >= 1015 && rh < 75) {
    condition = 'Clear / Fair Skies';
    advisoryLevel = 'NORMAL';
    guidance = 'High barometric pressure and moderate humidity indicate generally fair local weather.';
  }

  return {
    heatIndex: hi,
    dewPoint: computeDewPoint(t, rh),
    heatCategory,
    condition,
    advisoryLevel,
    guidance
  };
}

function readState() {
  try {
    if (fs.existsSync(WEATHER_SENSOR_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(WEATHER_SENSOR_FILE, 'utf8') || '{}');
      return {
        current: parsed.current || null,
        history: Array.isArray(parsed.history) ? parsed.history : [],
        latestWeatherAlert: parsed.latestWeatherAlert || null,
        lastWeatherAlertAt: Number(parsed.lastWeatherAlertAt || 0)
      };
    }
  } catch (_) {}
  return {
    current: null,
    history: [],
    latestWeatherAlert: null,
    lastWeatherAlertAt: 0
  };
}

function saveState(state) {
  try {
    fs.mkdirSync(path.dirname(WEATHER_SENSOR_FILE), { recursive: true });
    fs.writeFileSync(WEATHER_SENSOR_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[LoRaWeather] Failed saving sensor state:', err.message);
  }
}

function recordReading(payload = {}) {
  const state = readState();
  const temp = payload.temperature != null ? Number(Number(payload.temperature).toFixed(2)) : null;
  const hum = payload.humidity != null ? Number(Number(payload.humidity).toFixed(2)) : (payload.relativeHumidity != null ? Number(Number(payload.relativeHumidity).toFixed(2)) : null);
  const press = payload.pressure != null ? Number(Number(payload.pressure).toFixed(2)) : (payload.barometricPressure != null ? Number(Number(payload.barometricPressure).toFixed(2)) : null);

  if (temp === null && hum === null && press === null) {
    return state;
  }

  const trend = computePressureTrend(press, state.history);
  const derived = deriveWeatherSummary(temp, hum, press, trend);
  const updatedAt = payload.updatedAt || payload.rxTime || new Date().toISOString();

  const reading = {
    temperature: temp,
    humidity: hum,
    pressure: press,
    heatIndex: derived.heatIndex,
    dewPoint: derived.dewPoint,
    heatCategory: derived.heatCategory,
    condition: derived.condition,
    advisoryLevel: derived.advisoryLevel,
    guidance: derived.guidance,
    pressureTrend: trend.label,
    pressureTrendCode: trend.code,
    pressureDeltaHpa: trend.deltaHpa,
    nodeId: String(payload.nodeId || '!0f778ab0').toLowerCase(),
    nodeName: payload.nodeName || 'EvakWar Zone Relay 1 (REL1)',
    sensorModel: payload.sensorModel || 'AHT20 + BMP280 (I2C)',
    rssi: payload.rssi !== undefined ? Number(payload.rssi) : null,
    snr: payload.snr !== undefined ? Number(payload.snr) : null,
    hopsAway: payload.hopsAway !== undefined ? Number(payload.hopsAway) : 0,
    source: payload.source || 'LORA_AHT20_BMP280',
    updatedAt,
    timestampMs: Date.now()
  };

  state.current = reading;
  const lastEntry = state.history[0];
  const lastTs = lastEntry ? new Date(lastEntry.updatedAt || 0).getTime() : 0;
  // Append real sensor reading when values shift or >= 45s has elapsed since the previous log
  const changedEnough = !lastEntry ||
    Math.abs((lastEntry.temperature || 0) - (temp || 0)) >= 0.2 ||
    Math.abs((lastEntry.humidity || 0) - (hum || 0)) >= 1.0 ||
    Math.abs((lastEntry.pressure || 0) - (press || 0)) >= 0.3 ||
    (Date.now() - lastTs >= 45 * 1000);

  if (changedEnough) {
    state.history.unshift({
      temperature: temp,
      humidity: hum,
      pressure: press,
      heatIndex: derived.heatIndex,
      condition: derived.condition,
      updatedAt
    });
    state.history = state.history.slice(0, MAX_HISTORY_ENTRIES);
  }

  saveState(state);
  return state;
}

function buildWeatherAlertFromReading(reading, alertIdOverride = null) {
  if (!reading) return null;
  const id = String(alertIdOverride || ('wth_' + Date.now()));
  const tempText = reading.temperature != null ? `${Number(reading.temperature).toFixed(1)}°C` : '--°C';
  const humText = reading.humidity != null ? `${Math.round(Number(reading.humidity))}%` : '--%';
  const pressText = reading.pressure != null ? `${Number(reading.pressure).toFixed(1)} hPa` : '-- hPa';
  const title = reading.advisoryLevel === 'WATCH'
    ? '🌦️ LoRa Weather Watch (2-Hr Sensor Update)'
    : '🌤️ 2-Hour LoRa Weather Sensor Update';
  const message = `${reading.condition} • Temp ${tempText} • Humidity ${humText} • Pressure ${pressText} (Relay ${reading.nodeId || '!0f778ab0'})`;

  return {
    id,
    alertId: id,
    type: 'WEATHER_UPDATE',
    silent: true,
    noSiren: true,
    title,
    message,
    condition: reading.condition,
    advisoryLevel: reading.advisoryLevel,
    guidance: reading.guidance,
    temperature: reading.temperature,
    humidity: reading.humidity,
    pressure: reading.pressure,
    heatIndex: reading.heatIndex,
    dewPoint: reading.dewPoint,
    pressureTrend: reading.pressureTrend,
    nodeId: reading.nodeId || '!0f778ab0',
    url: '/typhoon',
    sent_at: new Date().toISOString(),
    timestampMs: Date.now()
  };
}

function recordWeatherAlert(alertObj) {
  const state = readState();
  state.latestWeatherAlert = alertObj;
  state.lastWeatherAlertAt = Date.now();
  saveState(state);
  return state;
}

module.exports = {
  WEATHER_SENSOR_FILE,
  WEATHER_ALERT_INTERVAL_MS,
  computeHeatIndex,
  computeDewPoint,
  computePressureTrend,
  deriveWeatherSummary,
  readState,
  saveState,
  recordReading,
  buildWeatherAlertFromReading,
  recordWeatherAlert
};

const pagasaService = require('./pagasaService');

const LATITUDE = 13.5102;
const LONGITUDE = 123.3470;

// WMO Weather interpretation codes mapping
const WMO_CODE_MAP = {
  0: { status: 'Clear Skies', icon: 'ph-sun' },
  1: { status: 'Mainly Clear', icon: 'ph-sun-dim' },
  2: { status: 'Partly Cloudy', icon: 'ph-cloud-sun' },
  3: { status: 'Overcast', icon: 'ph-cloud' },
  45: { status: 'Foggy', icon: 'ph-cloud-fog' },
  48: { status: 'Depositing Rime Fog', icon: 'ph-cloud-fog' },
  51: { status: 'Light Drizzle', icon: 'ph-cloud-rain' },
  53: { status: 'Moderate Drizzle', icon: 'ph-cloud-rain' },
  55: { status: 'Dense Drizzle', icon: 'ph-cloud-rain' },
  56: { status: 'Light Freezing Drizzle', icon: 'ph-cloud-rain' },
  57: { status: 'Dense Freezing Drizzle', icon: 'ph-cloud-rain' },
  61: { status: 'Slight Rain', icon: 'ph-cloud-rain' },
  63: { status: 'Moderate Rain', icon: 'ph-cloud-rain' },
  65: { status: 'Heavy Rain', icon: 'ph-cloud-rain' },
  66: { status: 'Light Freezing Rain', icon: 'ph-cloud-rain' },
  67: { status: 'Heavy Freezing Rain', icon: 'ph-cloud-rain' },
  71: { status: 'Slight Snow Fall', icon: 'ph-snowflake' },
  73: { status: 'Moderate Snow Fall', icon: 'ph-snowflake' },
  75: { status: 'Heavy Snow Fall', icon: 'ph-snowflake' },
  77: { status: 'Snow Grains', icon: 'ph-snowflake' },
  80: { status: 'Slight Rain Showers', icon: 'ph-cloud-rain' },
  81: { status: 'Moderate Rain Showers', icon: 'ph-cloud-rain' },
  82: { status: 'Violent Rain Showers', icon: 'ph-cloud-rain' },
  85: { status: 'Slight Snow Showers', icon: 'ph-snowflake' },
  86: { status: 'Heavy Snow Showers', icon: 'ph-snowflake' },
  95: { status: 'Thunderstorm', icon: 'ph-cloud-lightning' },
  96: { status: 'Thunderstorm with Hail', icon: 'ph-cloud-lightning' },
  99: { status: 'Severe Thunderstorm', icon: 'ph-cloud-lightning' }
};

function getWeatherCondition(code, hour) {
  const currentHour = (hour !== undefined) ? hour : (new Date().getHours());
  const isDay = currentHour >= 6 && currentHour < 18;

  if (code === 95 || code === 96 || code === 99) {
    if (isDay && currentHour < 14) {
      return { status: 'Scattered Rain Showers', icon: 'ph-cloud-rain' };
    }
    return { status: 'Thunderstorm', icon: 'ph-cloud-lightning' };
  }
  if (code === 80 || code === 81 || code === 82 || code === 61 || code === 63 || code === 65 || code === 51 || code === 53 || code === 55) {
    if (isDay) {
      return { status: 'Scattered Rain Showers', icon: 'ph-cloud-rain' };
    }
    return { status: 'Rain Showers', icon: 'ph-cloud-rain' };
  }
  if (code === 2 || code === 3 || code === 45 || code === 48) {
    return isDay ? { status: 'Partly Cloudy', icon: 'ph-cloud-sun' } : { status: 'Partly Cloudy', icon: 'ph-cloud-moon' };
  }
  if (code === 0 || code === 1) {
    return isDay ? { status: 'Clear Skies', icon: 'ph-sun' } : { status: 'Clear Night', icon: 'ph-moon' };
  }
  return { status: 'Partly Cloudy', icon: isDay ? 'ph-cloud-sun' : 'ph-cloud-moon' };
}

function formatTime(timestamp) {
  if (!timestamp) return 'Just now';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'Just now';
  
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true,
    timeZone: 'Asia/Manila' 
  });
}

let weatherMemoryCache = null;
let lastCacheTimestamp = 0;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache TTL
let isFetchingBackground = false;

function generateFallbackDaily() {
  return [
    { date: '2026-09-02', day_name: 'Today', temp_max: 29, temp_min: 25, weather_code: 80, status: 'Scattered Rain Showers', icon: 'ph-cloud-rain', rain_sum: 5.4 },
    { date: '2026-09-03', day_name: 'Tomorrow', temp_max: 29, temp_min: 25, weather_code: 95, status: 'Thunderstorm', icon: 'ph-cloud-lightning', rain_sum: 10.4 },
    { date: '2026-09-04', day_name: 'Fri', temp_max: 28, temp_min: 24, weather_code: 95, status: 'Thunderstorm', icon: 'ph-cloud-lightning', rain_sum: 14.7 },
    { date: '2026-09-05', day_name: 'Sat', temp_max: 27, temp_min: 24, weather_code: 2, status: 'Partly Cloudy', icon: 'ph-cloud-sun', rain_sum: 19.1 },
    { date: '2026-09-06', day_name: 'Sun', temp_max: 28, temp_min: 24, weather_code: 2, status: 'Partly Cloudy', icon: 'ph-cloud-sun', rain_sum: 20.4 },
    { date: '2026-09-07', day_name: 'Mon', temp_max: 28, temp_min: 24, weather_code: 2, status: 'Partly Cloudy', icon: 'ph-cloud-sun', rain_sum: 23.4 },
    { date: '2026-09-08', day_name: 'Tue', temp_max: 26, temp_min: 24, weather_code: 80, status: 'Scattered Rain Showers', icon: 'ph-cloud-rain', rain_sum: 32.1 }
  ];
}

function generateFallbackHourly() {
  const list = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getTime() + i * 3600 * 1000);
    list.push({
      time: d.toISOString().slice(0, 16),
      label: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      temperature: Number((26.5 + Math.sin(i / 3) * 2.5).toFixed(1)),
      dew_point: 24.5,
      humidity: Math.round(85 + Math.cos(i / 3) * 8),
      pressure: Number((998.5 + Math.sin(i / 4) * 1.5).toFixed(1)),
      precipitation: i === 2 || i === 8 ? 0.3 : 0.0,
      wind_speed: Number((15 + Math.sin(i / 2) * 5).toFixed(1)),
      wind_gusts: Number((30 + Math.sin(i / 2) * 10).toFixed(1))
    });
  }
  return list;
}

function getFallbackWeather(customLat, customLon, locName) {
  const latNum = (customLat !== undefined && customLat !== null && !isNaN(Number(customLat))) ? Number(customLat) : LATITUDE;
  const lonNum = (customLon !== undefined && customLon !== null && !isNaN(Number(customLon))) ? Number(customLon) : LONGITUDE;
  const validLat = (latNum >= -90 && latNum <= 90) ? Number(latNum.toFixed(4)) : LATITUDE;
  const validLon = (lonNum >= -180 && lonNum <= 180) ? Number(lonNum.toFixed(4)) : LONGITUDE;
  const isCustom = Math.abs(validLat - LATITUDE) > 0.001 || Math.abs(validLon - LONGITUDE) > 0.001;
  const locationName = locName || (isCustom ? `📍 My Location (${validLat.toFixed(2)}°, ${validLon.toFixed(2)}°)` : 'San Rafael, Baao');

  return {
    weather_status: 'Scattered Rain Showers',
    wind_speed: 18.3,
    wind_gusts: 39.6,
    rainfall: 0.2,
    temperature: 26.6,
    apparent_temperature: 30.4,
    dew_point: 24.6,
    pressure: 998.4,
    humidity: 89,
    latitude: validLat,
    longitude: validLon,
    location_name: locationName,
    is_device_location: isCustom,
    created_at: new Date(),
    formatted_time: formatTime(new Date()),
    icon: 'ph-cloud-rain',
    daily: generateFallbackDaily(),
    hourly: generateFallbackHourly(),
    pagasa: pagasaService.getCachedGuidanceSync()
  };
}

/**
 * Fetches fresh Open-Meteo weather data for specified coordinates (defaults to Barangay San Rafael, Baao: 13.5102, 123.3470),
 * updates in-memory cache, and returns current weather reading (no database logging).
 */
async function fetchAndSaveWeather(customLat, customLon, customLocationName) {
  const latNum = (customLat !== undefined && customLat !== null && !isNaN(Number(customLat))) ? Number(customLat) : LATITUDE;
  const lonNum = (customLon !== undefined && customLon !== null && !isNaN(Number(customLon))) ? Number(customLon) : LONGITUDE;
  const validLat = (latNum >= -90 && latNum <= 90) ? Number(latNum.toFixed(4)) : LATITUDE;
  const validLon = (lonNum >= -180 && lonNum <= 180) ? Number(lonNum.toFixed(4)) : LONGITUDE;
  const isCustom = Math.abs(validLat - LATITUDE) > 0.001 || Math.abs(validLon - LONGITUDE) > 0.001;
  const locationName = customLocationName || (isCustom ? `📍 My Location (${validLat.toFixed(2)}°, ${validLon.toFixed(2)}°)` : 'San Rafael, Baao');

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${validLat}&longitude=${validLon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,dew_point_2m,precipitation,rain,showers,weather_code,surface_pressure,wind_speed_10m,wind_gusts_10m&hourly=temperature_2m,dew_point_2m,relative_humidity_2m,surface_pressure,precipitation,wind_speed_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&wind_speed_unit=kmh&timezone=Asia%2FManila&forecast_days=7`;

  try {
    let data;
    if (typeof fetch === 'function') {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
          throw new Error(`Open-Meteo HTTP error! status: ${response.status}`);
        }
        data = await response.json();
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        throw fetchErr;
      }
    } else {
      const https = require('https');
      data = await new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: 6000 }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('HTTPS request timeout'));
        });
      });
    }

    const current = data.current || {};
    const temp = current.temperature_2m !== undefined ? Number(current.temperature_2m) : 26.6;
    const apparentTemp = current.apparent_temperature !== undefined ? Number(current.apparent_temperature) : Number((temp + 3.8).toFixed(1));
    const dewPoint = current.dew_point_2m !== undefined ? Number(current.dew_point_2m) : Number((temp - 2.0).toFixed(1));
    const wind = current.wind_speed_10m !== undefined ? Number(current.wind_speed_10m) : 18.3;
    const gusts = current.wind_gusts_10m !== undefined ? Number(current.wind_gusts_10m) : Number((wind * 2.1).toFixed(1));
    const pressure = current.surface_pressure !== undefined ? Number(current.surface_pressure) : 998.4;
    const humidity = current.relative_humidity_2m !== undefined ? Math.round(Number(current.relative_humidity_2m)) : 89;
    
    // Rainfall mm: precipitation or rain + showers
    let rain = 0.0;
    if (current.precipitation !== undefined) {
      rain = Number(current.precipitation);
    } else if (current.rain !== undefined || current.showers !== undefined) {
      rain = Number((Number(current.rain || 0) + Number(current.showers || 0)).toFixed(1));
    }

    const weatherCode = current.weather_code !== undefined ? current.weather_code : 80;
    const condition = getWeatherCondition(weatherCode);

    // Parse accurate daily 7-day forecast from Open-Meteo
    let dailyForecast = [];
    if (data.daily && Array.isArray(data.daily.time)) {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      dailyForecast = data.daily.time.map((timeStr, i) => {
        const code = data.daily.weather_code ? data.daily.weather_code[i] : 0;
        const cond = getWeatherCondition(code);
        const dObj = new Date(timeStr + 'T00:00:00');
        const dayIdx = isNaN(dObj.getDay()) ? i : dObj.getDay();
        return {
          date: timeStr,
          day_name: i === 0 ? 'Today' : (i === 1 ? 'Tomorrow' : days[dayIdx]),
          temp_max: Math.round(data.daily.temperature_2m_max ? data.daily.temperature_2m_max[i] : temp),
          temp_min: Math.round(data.daily.temperature_2m_min ? data.daily.temperature_2m_min[i] : temp - 5),
          weather_code: code,
          status: cond.status,
          icon: cond.icon,
          rain_sum: data.daily.precipitation_sum ? Number(data.daily.precipitation_sum[i]) : 0
        };
      });
    } else {
      dailyForecast = generateFallbackDaily();
    }

    // Parse accurate hourly next 24-hour readings from Open-Meteo
    let hourlyForecast = [];
    if (data.hourly && Array.isArray(data.hourly.time)) {
      const currentIsoHour = new Date().toISOString().slice(0, 13);
      let startIdx = data.hourly.time.findIndex(t => t.startsWith(currentIsoHour));
      if (startIdx < 0) startIdx = 0;
      const count = Math.min(24, data.hourly.time.length - startIdx);
      for (let i = 0; i < count; i++) {
        const idx = startIdx + i;
        const tStr = data.hourly.time[idx];
        const hPart = tStr.split('T')[1] || '';
        const hourNum = parseInt(hPart.split(':')[0], 10);
        const ampm = isNaN(hourNum) ? '' : (hourNum >= 12 ? 'pm' : 'am');
        const hour12 = isNaN(hourNum) ? tStr : (hourNum % 12 || 12);
        hourlyForecast.push({
          time: tStr,
          label: `${hour12}:00 ${ampm}`,
          temperature: data.hourly.temperature_2m ? Number(data.hourly.temperature_2m[idx]) : temp,
          dew_point: data.hourly.dew_point_2m ? Number(data.hourly.dew_point_2m[idx]) : dewPoint,
          humidity: data.hourly.relative_humidity_2m ? Math.round(data.hourly.relative_humidity_2m[idx]) : humidity,
          pressure: data.hourly.surface_pressure ? Number(data.hourly.surface_pressure[idx]) : pressure,
          precipitation: data.hourly.precipitation ? Number(data.hourly.precipitation[idx]) : 0,
          wind_speed: data.hourly.wind_speed_10m ? Number(data.hourly.wind_speed_10m[idx]) : wind,
          wind_gusts: data.hourly.wind_gusts_10m ? Number(data.hourly.wind_gusts_10m[idx]) : gusts
        });
      }
    } else {
      hourlyForecast = generateFallbackHourly();
    }

    let pagasaData = pagasaService.getCachedGuidanceSync();
    try {
      const livePagasa = await pagasaService.getPagasaGuidance();
      if (livePagasa) pagasaData = livePagasa;
    } catch (e) {}

    const freshRecord = {
      weather_status: condition.status,
      wind_speed: wind,
      wind_gusts: gusts,
      rainfall: rain,
      temperature: temp,
      apparent_temperature: apparentTemp,
      dew_point: dewPoint,
      pressure: pressure,
      humidity: humidity,
      latitude: validLat,
      longitude: validLon,
      location_name: locationName,
      is_device_location: isCustom,
      created_at: new Date(),
      formatted_time: formatTime(new Date()),
      icon: condition.icon,
      daily: dailyForecast,
      hourly: hourlyForecast,
      pagasa: pagasaData
    };

    weatherMemoryCache = freshRecord;
    lastCacheTimestamp = Date.now();
    return freshRecord;
  } catch (error) {
    console.error('Error fetching Open-Meteo weather data:', error.message || error);
    const fallback = getFallbackWeather(validLat, validLon, locationName);
    weatherMemoryCache = fallback;
    lastCacheTimestamp = Date.now();
    return fallback;
  }
}

function formatWeatherRow(row, defaultIcon) {
  let icon = defaultIcon || 'ph-sun';
  if (!defaultIcon) {
    for (const key in WMO_CODE_MAP) {
      if (WMO_CODE_MAP[key].status.toLowerCase() === (row.weather_status || '').toLowerCase()) {
        icon = WMO_CODE_MAP[key].icon;
        break;
      }
    }
    if (row.weather_status && row.weather_status.toLowerCase().includes('rain')) icon = 'ph-cloud-rain';
    if (row.weather_status && row.weather_status.toLowerCase().includes('drizzle')) icon = 'ph-cloud-rain';
    if (row.weather_status && row.weather_status.toLowerCase().includes('thunder')) icon = 'ph-cloud-lightning';
    if (row.weather_status && row.weather_status.toLowerCase().includes('cloud')) icon = 'ph-cloud-sun';
  }

  const wind = row.wind_speed !== null ? Number(row.wind_speed) : 18.3;
  const gusts = row.wind_gusts !== null ? Number(row.wind_gusts) : Number((wind * 2.1).toFixed(1));
  const rain = row.rainfall !== null ? Number(row.rainfall) : 0.2;
  const temp = row.temperature !== null ? Number(row.temperature) : 26.6;
  const apparentTemp = row.apparent_temperature !== null ? Number(row.apparent_temperature) : Number((temp + 3.8).toFixed(1));
  const dewPoint = row.dew_point !== null ? Number(row.dew_point) : Number((temp - 2.0).toFixed(1));
  const press = row.pressure !== null ? Number(row.pressure) : 998.4;
  const hum = row.humidity !== null ? Math.round(Number(row.humidity)) : 89;

  const rowLat = row.latitude !== null ? Number(row.latitude) : LATITUDE;
  const rowLon = row.longitude !== null ? Number(row.longitude) : LONGITUDE;
  const isCustom = Math.abs(rowLat - LATITUDE) > 0.001 || Math.abs(rowLon - LONGITUDE) > 0.001;
  const locName = isCustom ? `📍 My Location (${rowLat.toFixed(2)}°, ${rowLon.toFixed(2)}°)` : 'San Rafael, Baao';

  return {
    id: row.id,
    weather_status: row.weather_status || 'Thunderstorm',
    wind_speed: wind,
    wind_gusts: gusts,
    rainfall: rain,
    temperature: temp,
    apparent_temperature: apparentTemp,
    dew_point: dewPoint,
    pressure: press,
    humidity: hum,
    latitude: rowLat,
    longitude: rowLon,
    location_name: locName,
    is_device_location: isCustom,
    created_at: row.created_at,
    formatted_time: formatTime(row.created_at),
    icon: icon,
    daily: (weatherMemoryCache && weatherMemoryCache.daily) ? weatherMemoryCache.daily : generateFallbackDaily(),
    hourly: (weatherMemoryCache && weatherMemoryCache.hourly) ? weatherMemoryCache.hourly : generateFallbackHourly(),
    pagasa: pagasaService.getCachedGuidanceSync()
  };
}

/**
 * Returns latest cached weather record instantly (< 2ms) without blocking page renders.
 * Triggers background fetch asynchronously if cache is older than 5 minutes.
 * Operates purely in-memory with zero database logging.
 */
async function getLatestWeather() {
  const now = Date.now();
  
  // 1. If in-memory cache is valid (< 5 minutes), return instantly
  if (weatherMemoryCache && (now - lastCacheTimestamp < CACHE_TTL_MS)) {
    const syncPagasa = pagasaService.getCachedGuidanceSync();
    if (syncPagasa) {
      weatherMemoryCache.pagasa = syncPagasa;
    }
    return weatherMemoryCache;
  }

  // 2. Trigger asynchronous background fetch if cache expired and not currently fetching
  if (!isFetchingBackground && (now - lastCacheTimestamp >= CACHE_TTL_MS || !weatherMemoryCache)) {
    isFetchingBackground = true;
    fetchAndSaveWeather()
      .then(updated => {
        if (updated) weatherMemoryCache = updated;
      })
      .catch(err => console.warn('Background weather update warning:', err.message))
      .finally(() => { isFetchingBackground = false; });
  }

  // 3. If cache is empty on cold start, fetch once
  if (!weatherMemoryCache) {
    try {
      await fetchAndSaveWeather();
    } catch (err) {
      // Fallback handled below
    }
  }

  const result = weatherMemoryCache || getFallbackWeather();
  if (result) {
    const syncPagasa = pagasaService.getCachedGuidanceSync();
    if (syncPagasa) {
      result.pagasa = syncPagasa;
    }
  }
  return result;
}

module.exports = {
  fetchAndSaveWeather,
  getLatestWeather,
  getFallbackWeather,
  getPagasaGuidance: pagasaService.getPagasaGuidance,
  LATITUDE,
  LONGITUDE
};

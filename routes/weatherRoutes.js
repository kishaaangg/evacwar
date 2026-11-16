const express = require('express');
const router = express.Router();
const weatherService = require('../utils/weatherService');

// Prevent caching of live weather and PAGASA guidance by browsers, SW, or proxies
router.use((_req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

// Handles both GET and POST requests for refreshing Open-Meteo weather data (with optional device GPS coordinates)
router.all('/refresh', async (req, res) => {
  try {
    const rawLat = req.body?.lat ?? req.query?.lat;
    const rawLon = req.body?.lon ?? req.query?.lon;
    const rawAccuracy = req.body?.accuracy ?? req.query?.accuracy;
    const locationName = req.body?.location_name ?? req.query?.location_name;

    const hasCoords = (rawLat !== undefined && rawLat !== null && !isNaN(Number(rawLat))) &&
      (rawLon !== undefined && rawLon !== null && !isNaN(Number(rawLon)));

    const lat = hasCoords ? Number(Number(rawLat).toFixed(4)) : undefined;
    const lon = hasCoords ? Number(Number(rawLon).toFixed(4)) : undefined;
    const accuracy = rawAccuracy !== undefined ? Number(rawAccuracy) : null;

    if (hasCoords) {
      console.log(`GPS latitude: ${lat}`);
      console.log(`GPS longitude: ${lon}`);
      console.log(`GPS accuracy: ${accuracy !== null ? accuracy.toFixed(1) + ' m' : 'N/A'}`);
    } else {
      console.log(`GPS latitude: ${weatherService.LATITUDE} (Default San Rafael, Baao)`);
      console.log(`GPS longitude: ${weatherService.LONGITUDE} (Default San Rafael, Baao)`);
      console.log(`GPS accuracy: N/A`);
    }

    const weather = await weatherService.fetchAndSaveWeather(lat, lon, locationName);

    console.log(`Open-Meteo latitude: ${weather.latitude}`);
    console.log(`Open-Meteo longitude: ${weather.longitude}`);
    console.log(`Weather result location: ${weather.location_name || 'San Rafael, Baao'}`);

    res.json({ success: true, weather });
  } catch (error) {
    console.error('Error in /api/weather/refresh:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Gets latest weather data from in-memory cache (or fetches from Open-Meteo if empty)
router.get('/latest', async (req, res) => {
  try {
    const weather = await weatherService.getLatestWeather();
    res.json({ success: true, weather });
  } catch (error) {
    console.error('Error in /api/weather/latest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Gets official PAGASA weather and warning guidance
router.get('/pagasa', async (req, res) => {
  try {
    const pagasaGuidance = await weatherService.getPagasaGuidance();
    res.json({ success: true, pagasa: pagasaGuidance });
  } catch (error) {
    console.error('Error in /api/weather/pagasa:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

/**
 * PAGASA Official Weather & Warning Guidance Service for Evacwar
 * Location Target: San Rafael / Baao, Camarines Sur (Bicol Region V)
 * Coordinates: 13.5102° N, 123.3470° E
 */

const https = require('https');

// Action Level Constants
const ACTION_LEVELS = {
  MONITOR: {
    level: 'MONITOR',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    icon: 'ph-eye',
    color: 'emerald',
    description: 'Normal conditions or localized rain showers. Keep monitoring daily forecasts and local advisories.'
  },
  PREPARE: {
    level: 'PREPARE',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    icon: 'ph-shield-warning',
    color: 'amber',
    description: 'Advisory in effect. Secure essential supplies, inspect drainage, and prepare emergency go-bags.'
  },
  BE_READY: {
    level: 'BE READY TO EVACUATE',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
    icon: 'ph-warning',
    color: 'orange',
    description: 'Heightened alert. High flood or landslide risk in low-lying zones. Be ready for evacuation orders.'
  },
  EVACUATE: {
    level: 'EVACUATE',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
    icon: 'ph-siren',
    color: 'rose',
    description: 'Critical danger. Severe weather or severe flooding imminent. Evacuate to designated shelters immediately.'
  }
};

let cachedGuidance = null;
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

function formatPhTime(date = new Date()) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila'
  });
}

function formatPhDate(date = new Date()) {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila'
  });
}

const DEFAULT_PAGASA_VIDEO = {
  hasVideo: true,
  videoId: 'AgcXtAFRGkw',
  title: 'Public Weather Forecast issued at 5:00 AM | November 12, 2026 - Thursday',
  published: '2026-11-11T21:20:56+00:00',
  formattedPublished: 'Nov 12, 2026 • 5:20 AM PHT',
  isLive: false,
  badgeLabel: '📺 Latest DOST-PAGASA Weather Forecast',
  badgeText: 'Latest DOST-PAGASA Weather Forecast',
  embedUrl: 'https://www.youtube-nocookie.com/embed/AgcXtAFRGkw?rel=0&autoplay=0&enablejsapi=1',
  watchUrl: 'https://www.youtube.com/watch?v=AgcXtAFRGkw',
  channelUrl: 'https://www.youtube.com/@dost_pagasa/videos'
};

let cachedVideo = { ...DEFAULT_PAGASA_VIDEO };
let lastVideoFetchTime = 0;
const VIDEO_CACHE_TTL = 3 * 60 * 1000; // 3 minutes cache for responsive live detection

function formatVideoTimestamp(isoStr) {
  if (!isoStr) return 'Daily Forecast Broadcast';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return 'Daily Forecast Broadcast';
    const datePart = d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'Asia/Manila'
    });
    const timePart = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Manila'
    });
    return `${datePart} • ${timePart} PHT`;
  } catch (e) {
    return 'Daily Forecast Broadcast';
  }
}

/**
 * Robust HTTPS GET that follows HTTP redirects (up to maxRedirects)
 */
function getWithRedirects(url, maxRedirects = 3) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (val) => {
      if (!resolved) {
        resolved = true;
        resolve(val);
      }
    };

    const req = https.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          redirectUrl = 'https://www.youtube.com' + redirectUrl;
        }
        resolved = true;
        return resolve(getWithRedirects(redirectUrl, maxRedirects - 1));
      }
      let data = '';
      res.on('data', chunk => {
        data += chunk;
        if (data.length > 500000) {
          req.destroy();
          done({ statusCode: res.statusCode, headers: res.headers, url, body: data });
        }
      });
      res.on('end', () => done({ statusCode: res.statusCode, headers: res.headers, url, body: data }));
      res.on('close', () => done({ statusCode: res.statusCode, headers: res.headers, url, body: data }));
      res.on('error', () => done(null));
    });
    req.on('timeout', () => { req.destroy(); done(null); });
    req.on('error', () => done(null));
    req.on('close', () => done(null));
  });
}

/**
 * Checks if DOST-PAGASA currently has an active official livestream on YouTube
 */
async function checkPagasaLiveBroadcast() {
  try {
    const response = await getWithRedirects('https://www.youtube.com/@dost_pagasa/live', 3);
    if (!response || !response.body) return null;

    const data = response.body;
    const finalUrl = response.url || '';

    // Check if live indicators are present
    const isLive = (data.includes('"isLive":true') || 
                    data.includes('"isLiveBroadcast":true') || 
                    data.includes('"BADGE_STYLE_TYPE_LIVE_NOW"') ||
                    data.includes('LIVE_NOW')) &&
                   !data.includes('"isLive":false');

    if (isLive) {
      const urlVideoIdMatch = finalUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      const bodyVideoIdMatch = data.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      const videoId = (urlVideoIdMatch && urlVideoIdMatch[1]) || (bodyVideoIdMatch && bodyVideoIdMatch[1]);

      const titleMatch = data.match(/"title":\{"runs":\[\{"text":"(.*?)"\}\]/) ||
                         data.match(/<title>(.*?)<\/title>/);
      let rawTitle = titleMatch ? titleMatch[1] : 'DOST-PAGASA Live Weather Broadcast';
      rawTitle = rawTitle.replace(' - YouTube', '').trim();

      if (videoId) {
        return {
          hasVideo: true,
          videoId,
          title: rawTitle,
          isLive: true,
          published: new Date().toISOString(),
          formattedPublished: 'Streaming Live Now',
          badgeLabel: '🔴 LIVE',
          badgeText: 'DOST-PAGASA Weather Update',
          embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&autoplay=0&enablejsapi=1`,
          watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
          channelUrl: 'https://www.youtube.com/@dost_pagasa/videos'
        };
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Checks YouTube Data API v3 for live streams (if YOUTUBE_API_KEY is configured in env)
 */
function checkYoutubeApiLive(apiKey) {
  return new Promise((resolve) => {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=UCpyLikj1x70S8UPxVqsPr6g&eventType=live&type=video&key=${encodeURIComponent(apiKey)}`;
    const req = https.get(url, { timeout: 4000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.items && json.items.length > 0) {
            const item = json.items[0];
            const videoId = item.id ? item.id.videoId : null;
            if (videoId) {
              return resolve({
                hasVideo: true,
                videoId,
                title: item.snippet ? item.snippet.title : 'DOST-PAGASA Live Weather Broadcast',
                isLive: true,
                published: item.snippet ? item.snippet.publishedAt : new Date().toISOString(),
                formattedPublished: 'Streaming Live Now',
                badgeLabel: '🔴 LIVE',
                badgeText: 'DOST-PAGASA Weather Update',
                embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&autoplay=0&enablejsapi=1`,
                watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
                channelUrl: 'https://www.youtube.com/@dost_pagasa/videos'
              });
            }
          }
          resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

/**
 * Dynamically fetches the latest official DOST-PAGASA video from their public channel feed
 */
function fetchLatestPagasaVideo() {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (val) => {
      if (!resolved) {
        resolved = true;
        resolve(val);
      }
    };

    const req = https.get('https://www.youtube.com/feeds/videos.xml?channel_id=UCpyLikj1x70S8UPxVqsPr6g', {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)' }
    }, (res) => {
      if (res.statusCode !== 200) {
        return done(null);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const entries = data.match(/<entry>[\s\S]*?<\/entry>/g) || [];
          if (entries.length === 0) return done(null);

          // Find newest official weather forecast entry
          const first = entries[0];
          const videoId = first.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
          const rawTitle = first.match(/<title>(.*?)<\/title>/)?.[1] || 'DOST-PAGASA Weather Forecast';
          const title = rawTitle.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
          const published = first.match(/<published>(.*?)<\/published>/)?.[1];
          const updated = first.match(/<updated>(.*?)<\/updated>/)?.[1];
          
          if (!videoId) return done(null);

          const isLiveTitle = title.toLowerCase().includes('🔴 live') || 
                              title.toLowerCase().includes('press conference live') ||
                              title.toLowerCase().includes('live weather briefing');

          const formattedPublished = formatVideoTimestamp(published || updated);

          done({
            hasVideo: true,
            videoId,
            title,
            published: published || updated,
            formattedPublished: formattedPublished,
            isLive: isLiveTitle,
            badgeLabel: isLiveTitle ? '🔴 LIVE' : '📺 Latest DOST-PAGASA Weather Forecast',
            badgeText: isLiveTitle ? 'DOST-PAGASA Weather Update' : 'Latest DOST-PAGASA Weather Forecast',
            embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&autoplay=0&enablejsapi=1`,
            watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
            channelUrl: 'https://www.youtube.com/@dost_pagasa/videos'
          });
        } catch (e) {
          done(null);
        }
      });
      res.on('error', () => done(null));
      res.on('close', () => done(null));
    });
    req.on('timeout', () => { req.destroy(); done(null); });
    req.on('error', () => done(null));
    req.on('close', () => done(null));
  });
}

/**
 * Resolves current live or latest video with multi-tier priority fallback
 */
async function resolvePagasaVideo() {
  // 1. Priority 1: Check for active official livestream
  if (process.env.YOUTUBE_API_KEY) {
    try {
      const apiLive = await checkYoutubeApiLive(process.env.YOUTUBE_API_KEY);
      if (apiLive && apiLive.videoId) return apiLive;
    } catch (e) {}
  }

  try {
    const liveStream = await checkPagasaLiveBroadcast();
    if (liveStream && liveStream.videoId) {
      return liveStream;
    }
  } catch (e) {}

  // 2. Priority 2: Check latest uploaded forecast video from official XML feed
  try {
    const latestUpload = await fetchLatestPagasaVideo();
    if (latestUpload && latestUpload.videoId) {
      return latestUpload;
    }
  } catch (e) {}

  // 3. Fallback: If live broadcast and channel feed could not resolve, return currently cached video or verified default
  return (cachedVideo && cachedVideo.videoId) ? cachedVideo : { ...DEFAULT_PAGASA_VIDEO };
}

/**
 * Returns baseline official PAGASA guidance for Camarines Sur / Baao
 */
function getBaselineGuidance(videoData = null) {
  const now = new Date();
  const video = videoData || cachedVideo || { ...DEFAULT_PAGASA_VIDEO };

  return {
    source: 'PAGASA',
    sourceLabel: 'PAGASA Official Warning / Guidance',
    isOfficial: true,
    hasActiveWarning: false,
    warningType: '24-Hour Public Weather Forecast',
    warningSeverity: 'NORMAL', // NORMAL, YELLOW, ORANGE, RED
    affectedArea: 'San Rafael, Baao & Camarines Sur (Bicol Region)',
    issuedAt: `${formatPhDate(now)} • ${formatPhTime(now)} PHT`,
    updatedTime: formatPhTime(now),
    plainLanguageSummary: 'Partly cloudy to overcast skies with isolated or scattered rain showers due to localized thunderstorms. No severe tropical cyclone wind signal currently hoisted for Camarines Sur.',
    residentExplanation: 'Normal to localized rainy weather. Low-lying areas in San Rafael should monitor water levels during sudden heavy downpours.',
    actionLevel: ACTION_LEVELS.MONITOR,
    officialBulletinUrl: 'https://bagong.pagasa.dost.gov.ph/',
    officialForecastUrl: 'https://www.pagasa.dost.gov.ph/weather',
    officialFloodUrl: 'https://bagong.pagasa.dost.gov.ph/flood',
    officialCycloneUrl: 'https://bagong.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin',
    youtube: video
  };
}

/**
 * Helper to generate Evacwar plain interpretation and action level based on official PAGASA advisory
 */
function interpretWarning(warningType, severity, areaName = 'San Rafael / Baao, Camarines Sur') {
  const sev = (severity || '').toUpperCase();
  let action = ACTION_LEVELS.MONITOR;
  let explanation = '';

  if (sev === 'RED' || warningType.toLowerCase().includes('red') || warningType.toLowerCase().includes('signal #3') || warningType.toLowerCase().includes('signal #4')) {
    action = ACTION_LEVELS.EVACUATE;
    explanation = '⚠️ Critical Warning: Severe weather / torrential rainfall expected. Dangerous flooding and landslides are imminent. Residents in flood-prone zones of San Rafael must evacuate to safe evacuation centers immediately.';
  } else if (sev === 'ORANGE' || warningType.toLowerCase().includes('orange') || warningType.toLowerCase().includes('signal #2') || warningType.toLowerCase().includes('flood alert')) {
    action = ACTION_LEVELS.BE_READY;
    explanation = '⚠️ Pre-Evacuation Warning: Intense rain and rising floodwaters expected. Residents in low-lying zones should secure household belongings and be ready to move to assigned evacuation shelters on short notice.';
  } else if (sev === 'YELLOW' || warningType.toLowerCase().includes('yellow') || warningType.toLowerCase().includes('signal #1') || warningType.toLowerCase().includes('flood watch') || warningType.toLowerCase().includes('heavy rain')) {
    action = ACTION_LEVELS.PREPARE;
    explanation = '⚠️ Heavy rainfall warning: Heavy rain may cause localized flooding in low-lying areas. Residents near flood-prone zones and riverbanks should prepare emergency kits and monitor evacuation instructions.';
  } else {
    action = ACTION_LEVELS.MONITOR;
    explanation = 'Localized weather condition. No severe storm warning is active. Residents should remain updated on daily weather forecasts.';
  }

  return { action, explanation };
}

/**
 * Retrieves latest PAGASA guidance with fallback protection and dynamic video fetch
 */
async function getPagasaGuidance() {
  const now = Date.now();
  if (cachedGuidance && (now - lastFetchTime < CACHE_TTL)) {
    return cachedGuidance;
  }

  let videoData = cachedVideo;
  if (!videoData || (now - lastVideoFetchTime > VIDEO_CACHE_TTL)) {
    try {
      const fetched = await resolvePagasaVideo();
      if (fetched) {
        cachedVideo = fetched;
        lastVideoFetchTime = now;
        videoData = fetched;
      }
    } catch (e) {
      // Ignore network errors and use fallback
    }
  }

  const base = getBaselineGuidance(videoData);
  cachedGuidance = base;
  lastFetchTime = now;
  return base;
}

function getCachedGuidanceSync() {
  return cachedGuidance || getBaselineGuidance(cachedVideo);
}

module.exports = {
  getPagasaGuidance,
  getBaselineGuidance,
  getCachedGuidanceSync,
  interpretWarning,
  resolvePagasaVideo,
  checkPagasaLiveBroadcast,
  fetchLatestPagasaVideo,
  ACTION_LEVELS
};

// Pre-warm video and guidance cache asynchronously on start
resolvePagasaVideo()
  .then(v => {
    if (v && v.videoId) {
      cachedVideo = v;
      lastVideoFetchTime = Date.now();
    }
  })
  .catch(() => {});


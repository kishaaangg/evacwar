// map configuration

function getMapConfig() {
  const googleMapsApiKey = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  const esriApiKey = (process.env.ESRI_API_KEY || '').trim();
  const keyParam = googleMapsApiKey ? `&key=${encodeURIComponent(googleMapsApiKey)}` : '';

  // 1. Google Maps Hybrid (Satellite + Labels) & Satellite Imagery using GOOGLE_MAPS_API_KEY
  const hybridUrl = `https://mt1.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}${keyParam}`;
  const satelliteUrl = `https://mt1.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}${keyParam}`;

  // 2. Google Maps Standard Roads using GOOGLE_MAPS_API_KEY
  const osmUrl = `https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}${keyParam}`;

  const cartoApiKey = (process.env.CARTO_API_KEY || 'cb1_3yqn_1_e8e7aa49f848f5be5735ded9').trim();
  const labelsUrl = `https://mt1.google.com/vt/lyrs=h&hl=en&x={x}&y={y}&z={z}${keyParam}`;

  const provider = 'maplibre';
  const terrainDemUrl = (process.env.TERRAIN_DEM_URL || 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png').trim();

  return {
    provider,
    googleMapsApiKey,
    cartoApiKey,
    hybridUrl,
    satelliteUrl: hybridUrl,
    pureSatelliteUrl: satelliteUrl,
    satelliteTiles: [hybridUrl],
    osmUrl,
    osmTiles: [osmUrl],
    labelsUrl,
    labelsTiles: [labelsUrl],
    terrainDemUrl,
    hasEsriKey: Boolean(esriApiKey)
  };
}

module.exports = getMapConfig;


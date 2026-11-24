import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '100kb' }));

function getMapsApiKey(): string {
  return process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'GoRide', timezone: 'Asia/Karachi' });
});

// Expose public browser-scoped Google Maps API key to client <APIProvider>
app.get('/api/maps-config', (_req, res) => {
  const apiKey = getMapsApiKey();
  res.json({ apiKey, configured: Boolean(apiKey) });
});

// Server-side Reverse Geocoding proxy (avoids CORS & deprecated JS Geocoder)
app.get('/api/reverse-geocode', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: 'Invalid latitude or longitude coordinates.' });
    return;
  }

  const apiKey = getMapsApiKey();
  if (!apiKey) {
    res.status(503).json({ error: 'Google Maps API key is not configured.' });
    return;
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('key', apiKey);

    const headers: Record<string, string> = {};
    if (req.headers.referer) headers.Referer = req.headers.referer;

    const response = await fetch(url.toString(), { headers });
    if (response.status === 429) {
      res.status(429).json({ error: 'RESOURCE_EXHAUSTED', quotaExceeded: true });
      return;
    }

    const data = await response.json();
    if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'RESOURCE_EXHAUSTED') {
      res.status(429).json({ error: 'RESOURCE_EXHAUSTED', quotaExceeded: true });
      return;
    }

    if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
      res.status(404).json({
        error: data.error_message || 'Unable to resolve address for this location.',
        status: data.status,
      });
      return;
    }

    const primary = data.results[0];
    const cityComp = primary.address_components?.find((c: { types: string[] }) =>
      c.types.includes('locality') || c.types.includes('administrative_area_level_2')
    );

    res.json({
      formattedAddress: primary.formatted_address,
      city: cityComp?.long_name || 'Pakistan',
      lat,
      lng,
    });
  } catch (err) {
    console.error('Reverse geocode error:', err);
    res.status(500).json({ error: 'Failed to reverse geocode coordinates.' });
  }
});

// Server-side Forward Geocoding proxy (Pakistan-biased)
app.get('/api/geocode', async (req, res) => {
  const address = typeof req.query.address === 'string' ? req.query.address.trim() : '';
  if (address.length < 2 || address.length > 250) {
    res.status(400).json({ error: 'Please provide a valid address between 2 and 250 characters.' });
    return;
  }

  const apiKey = getMapsApiKey();
  if (!apiKey) {
    res.status(503).json({ error: 'Google Maps API key is not configured.' });
    return;
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('region', 'pk');
    url.searchParams.set('key', apiKey);

    const headers: Record<string, string> = {};
    if (req.headers.referer) headers.Referer = req.headers.referer;

    const response = await fetch(url.toString(), { headers });
    if (response.status === 429) {
      res.status(429).json({ error: 'RESOURCE_EXHAUSTED', quotaExceeded: true });
      return;
    }

    const data = await response.json();
    if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'RESOURCE_EXHAUSTED') {
      res.status(429).json({ error: 'RESOURCE_EXHAUSTED', quotaExceeded: true });
      return;
    }

    if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
      res.status(404).json({
        error: data.error_message || 'Address not found in Pakistan.',
        status: data.status,
      });
      return;
    }

    const primary = data.results[0];
    res.json({
      formattedAddress: primary.formatted_address,
      lat: primary.geometry.location.lat,
      lng: primary.geometry.location.lng,
    });
  } catch (err) {
    console.error('Geocode error:', err);
    res.status(500).json({ error: 'Failed to geocode address.' });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production build not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GoRide server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start GoRide server:', err);
  process.exit(1);
});

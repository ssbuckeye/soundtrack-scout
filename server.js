const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── API Keys (from environment variables) ──────────────────
const TMDB_KEY = process.env.TMDB_KEY || '';
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';

app.use(express.static(path.join(__dirname, 'public')));

// ── Spotify Token Cache ─────────────────────────────────────
let spotifyToken = null;
let spotifyTokenExpiry = 0;

async function getSpotifyToken() {
  if (spotifyToken && Date.now() < spotifyTokenExpiry) return spotifyToken;
  const creds = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await r.json();
  spotifyToken = data.access_token;
  spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return spotifyToken;
}

// ── Proxy MusicBrainz ───────────────────────────────────────
app.get('/api/mb', async (req, res) => {
  const { endpoint, ...rest } = req.query;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
  const qs = new URLSearchParams(rest).toString();
  const url = `https://musicbrainz.org/ws/2/${endpoint}${qs ? '?' + qs : ''}`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'SoundtrackScout/0.3 (prototype)', 'Accept': 'application/json' }
    });
    if (!r.ok) return res.status(r.status).json({ error: `MusicBrainz ${r.status}` });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Proxy TMDB ──────────────────────────────────────────────
app.get('/api/tmdb', async (req, res) => {
  if (!TMDB_KEY) return res.status(503).json({ error: 'TMDB key not configured' });
  const { path: tmdbPath, ...rest } = req.query;
  if (!tmdbPath) return res.status(400).json({ error: 'Missing path' });
  const qs = new URLSearchParams(rest).toString();
  const url = `https://api.themoviedb.org/3${tmdbPath}?api_key=${TMDB_KEY}${qs ? '&' + qs : ''}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).json({ error: `TMDB ${r.status}` });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Spotify: Search tracks ──────────────────────────────────
// Usage: GET /api/spotify/search?q=Tiny+Dancer
app.get('/api/spotify/search', async (req, res) => {
  if (!SPOTIFY_CLIENT_ID) return res.status(503).json({ error: 'Spotify not configured' });
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });
  try {
    const token = await getSpotifyToken();
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`;
    const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!r.ok) return res.status(r.status).json({ error: `Spotify ${r.status}` });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Spotify: Get playlists a track appears in ───────────────
// Usage: GET /api/spotify/track-playlists?trackId=xxx&title=Tiny+Dancer&artist=Elton+John
app.get('/api/spotify/track-playlists', async (req, res) => {
  if (!SPOTIFY_CLIENT_ID) return res.status(503).json({ error: 'Spotify not configured' });
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ error: 'Missing title' });
  try {
    const token = await getSpotifyToken();

    // Search for soundtrack playlists containing this song
    const searchTerms = [
      `${title} soundtrack`,
      `${title} ${artist || ''} movie`,
      `${title} film`
    ];

    const results = await Promise.all(searchTerms.map(async term => {
      const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(term)}&type=playlist&limit=5`;
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!r.ok) return [];
      const data = await r.json();
      return (data.playlists?.items || []).filter(p =>
        p && /soundtrack|score|music from|songs from/i.test(p.name)
      );
    }));

    // Deduplicate by playlist id
    const seen = new Set();
    const playlists = results.flat().filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    res.json({ playlists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎬 Soundtrack Scout running at http://localhost:${PORT}`);
  console.log(`   TMDB: ${TMDB_KEY ? '✅' : '❌ not configured'}`);
  console.log(`   Spotify: ${SPOTIFY_CLIENT_ID ? '✅' : '❌ not configured'}\n`);
});

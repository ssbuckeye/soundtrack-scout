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

// ── Spotify: Find soundtrack playlists for a song ───────────
app.get('/api/spotify/track-playlists', async (req, res) => {
  if (!SPOTIFY_CLIENT_ID) return res.status(503).json({ error: 'Spotify not configured' });
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ error: 'Missing title' });
  try {
    const token = await getSpotifyToken();

    // Search with multiple strategies to find soundtrack playlists
    const searchTerms = [
      `${title} ${artist || ''} original motion picture soundtrack`,
      `${title} original soundtrack`,
      `${title} film soundtrack`,
      `${title} movie soundtrack`
    ];

    const results = await Promise.all(searchTerms.map(async term => {
      const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(term)}&type=playlist&limit=8`;
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!r.ok) return [];
      const data = await r.json();
      return (data.playlists?.items || []).filter(p => {
        if (!p) return false;
        const name = p.name || '';
        // Must mention soundtrack, score, or music from
        if (!/soundtrack|original score|music from|songs from|o\.s\.t/i.test(name)) return false;
        // Skip generic compilation playlists
        if (/top \d+|best of|greatest hits|collection|playlist|mix|radio|hits|instrumenta/i.test(name)) return false;
        // Skip non-Latin playlists
        if (name.charCodeAt(0) > 127) return false;
        // Must have reasonable length name
        if (name.length < 4 || name.length > 80) return false;
        return true;
      });
    }));

    // Deduplicate by playlist id
    const seen = new Set();
    const playlists = results.flat().filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    // Clean up playlist names to extract movie title
    const cleaned = playlists.map(p => {
      const cleanName = p.name
        .replace(/original motion picture soundtrack/gi, '')
        .replace(/original soundtrack/gi, '')
        .replace(/\bost\b/gi, '')
        .replace(/soundtrack/gi, '')
        .replace(/original score/gi, '')
        .replace(/music from (the )?/gi, '')
        .replace(/songs from (the )?/gi, '')
        .replace(/o\.s\.t\.?/gi, '')
        .replace(/\(.*?\)/g, '')
        .replace(/[-–:|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return { ...p, cleanName: cleanName || p.name };
    }).filter(p => p.cleanName.length > 1);

    res.json({ playlists: cleaned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎬 Soundtrack Scout running at http://localhost:${PORT}`);
  console.log(`   TMDB: ${TMDB_KEY ? '✅' : '❌ not configured'}`);
  console.log(`   Spotify: ${SPOTIFY_CLIENT_ID ? '✅' : '❌ not configured'}\n`);
});

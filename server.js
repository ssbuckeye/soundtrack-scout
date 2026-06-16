const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const TMDB_KEY = process.env.TMDB_KEY || '';
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';

app.use(express.static(path.join(__dirname, 'public')));

// ── Spotify Token ───────────────────────────────────────────
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
  if (!data.access_token) {
    console.error('Spotify token error:', JSON.stringify(data));
    throw new Error('Could not get Spotify token');
  }
  spotifyToken = data.access_token;
  spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  console.log('Spotify token refreshed OK');
  return spotifyToken;
}

async function spotifyGet(url) {
  const token = await getSpotifyToken();
  const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!r.ok) {
    const body = await r.text();
    console.error(`Spotify ${r.status} for ${url.substring(0, 100)}:`, body.substring(0, 150));
    throw new Error(`Spotify ${r.status}`);
  }
  return r.json();
}

// ── MusicBrainz ─────────────────────────────────────────────
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TMDB ─────────────────────────────────────────────────────
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Spotify: Search tracks ───────────────────────────────────
app.get('/api/spotify/search', async (req, res) => {
  if (!SPOTIFY_CLIENT_ID) return res.status(503).json({ error: 'Spotify not configured' });
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });
  try {
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10`;
    const data = await spotifyGet(url);
    const qLower = q.toLowerCase().replace(/[^a-z0-9 ]/g, '');
    const seen = new Set();
    const filtered = (data.tracks?.items || []).filter(t => {
      const name = (t.name || '').toLowerCase();
      const nameClean = name.replace(/[^a-z0-9 ]/g, '');
      // Filter non-matching results
      if (!nameClean.includes(qLower.substring(0, 5)) &&
          !qLower.includes(nameClean.substring(0, 5))) return false;
      // Filter live/demo/remix
      if (/\blive\b|\bdemo\b|acoustic|remix|remaster|karaoke|instrumental/i.test(name)) return false;
      // Deduplicate
      const artist = (t.artists?.[0]?.name || '').toLowerCase().replace(/[^a-z]/g, '');
      const key = `${nameClean.replace(/ /g,'')}:${artist}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 4);
    res.json({ tracks: { items: filtered } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Spotify: Find soundtrack appearances ─────────────────────
app.get('/api/spotify/track-playlists', async (req, res) => {
  if (!SPOTIFY_CLIENT_ID) return res.status(503).json({ error: 'Spotify not configured' });
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ error: 'Missing title' });
  try {
    // Search for soundtrack albums matching this song
    const searchQ = encodeURIComponent(`${title} ${artist || ''} soundtrack`);
    const albumData = await spotifyGet(
      `https://api.spotify.com/v1/search?q=${searchQ}&type=album&limit=8`
    );

    const soundtrackAlbums = (albumData.albums?.items || []).filter(a => {
      if (!a) return false;
      const name = a.name || '';
      if (!/soundtrack|original score|music from|songs from|o\.s\.t/i.test(name)) return false;
      if (/top \d+|greatest hits|collection|instrumenta|karaoke|efteling|theme park/i.test(name)) return false;
      if (name.charCodeAt(0) > 127) return false;
      return true;
    });

    const verified = [];
    for (const album of soundtrackAlbums.slice(0, 5)) {
      try {
        const trackData = await spotifyGet(
          `https://api.spotify.com/v1/albums/${album.id}/tracks?limit=30`
        );
        const found = (trackData.items || []).some(t =>
          (t.name || '').toLowerCase().includes(title.toLowerCase())
        );
        if (found) {
          const cleanName = album.name
            .replace(/original motion picture soundtrack/gi, '')
            .replace(/original soundtrack/gi, '')
            .replace(/\bost\b/gi, '')
            .replace(/soundtrack/gi, '')
            .replace(/original score/gi, '')
            .replace(/music from( the)?/gi, '')
            .replace(/songs from( the)?/gi, '')
            .replace(/\(.*?\)/g, '')
            .replace(/[-–:|]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          verified.push({
            id: album.id,
            name: album.name,
            cleanName: cleanName || album.name,
            year: (album.release_date || '').substring(0, 4),
            image: album.images?.[1]?.url || album.images?.[0]?.url || null,
            spotifyUrl: album.external_urls?.spotify || '',
            type: 'album'
          });
        }
      } catch (e) { console.error('Album check error:', e.message); }
    }

    // Playlist fallback if fewer than 2 album results
    if (verified.length < 2) {
      const plQ = encodeURIComponent(`${title} original soundtrack`);
      const plData = await spotifyGet(
        `https://api.spotify.com/v1/search?q=${plQ}&type=playlist&limit=6`
      );
      const playlists = (plData.playlists?.items || []).filter(p => {
        if (!p) return false;
        const name = p.name || '';
        if (!/soundtrack|original score|music from|songs from/i.test(name)) return false;
        if (/top \d+|greatest hits|instrumenta|mix|radio|efteling|karaoke/i.test(name)) return false;
        if (name.charCodeAt(0) > 127) return false;
        if (name.length < 4 || name.length > 80) return false;
        return true;
      }).slice(0, 3);

      for (const pl of playlists) {
        const cleanName = pl.name
          .replace(/original motion picture soundtrack/gi, '')
          .replace(/original soundtrack/gi, '')
          .replace(/soundtrack/gi, '')
          .replace(/original score/gi, '')
          .replace(/music from( the)?/gi, '')
          .replace(/\(.*?\)/g, '')
          .replace(/[-–:|]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleanName.length > 1 && !verified.some(v => v.cleanName.toLowerCase() === cleanName.toLowerCase())) {
          verified.push({
            id: pl.id,
            name: pl.name,
            cleanName,
            year: '',
            image: pl.images?.[0]?.url || null,
            spotifyUrl: pl.external_urls?.spotify || '',
            type: 'playlist'
          });
        }
      }
    }

    res.json({ playlists: verified });
  } catch (err) {
    console.error('track-playlists error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎬 Soundtrack Scout running at http://localhost:${PORT}`);
  console.log(`   TMDB: ${TMDB_KEY ? '✅' : '❌ not configured'}`);
  console.log(`   Spotify: ${SPOTIFY_CLIENT_ID ? '✅' : '❌ not configured'}\n`);
});

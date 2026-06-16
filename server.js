const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const data = await r.json();
  spotifyToken = data.access_token;
  spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return spotifyToken;
}

async function spotifyGet(url) {
  const token = await getSpotifyToken();
  const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Spotify ${r.status}`);
  return r.json();
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
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Spotify: Search tracks ──────────────────────────────────
app.get('/api/spotify/search', async (req, res) => {
  if (!SPOTIFY_CLIENT_ID) return res.status(503).json({ error: 'Spotify not configured' });
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });
  try {
    const data = await spotifyGet(`https://api.spotify.com/v1/search?q=track:${encodeURIComponent(q)}&type=track&limit=20`);
    const qLower = q.toLowerCase();
    const seen = new Set();
    const filtered = (data.tracks?.items || []).filter(t => {
      const name = t.name?.toLowerCase() || '';
      // Must roughly match the search query
      if (!name.includes(qLower.substring(0, Math.min(qLower.length, 8))) &&
          !qLower.includes(name.substring(0, Math.min(name.length, 8)))) return false;
      // Filter live/demo/remix versions
      if (/\blive\b|\bdemo\b|acoustic|remix|remaster|karaoke|instrumental|session|concert|tour/i.test(name)) return false;
      // Deduplicate by base song name + artist
      const artist = t.artists?.[0]?.name || '';
      const key = `${name.replace(/[^a-z]/g, '')}:${artist.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 4);
    res.json({ tracks: { items: filtered } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Spotify: Smart soundtrack finder ───────────────────────
// Strategy 1: Search for "[title] soundtrack" playlists, verify track appears in them
// Strategy 2: Search Spotify albums of type "soundtrack" that contain this track
app.get('/api/spotify/track-playlists', async (req, res) => {
  if (!SPOTIFY_CLIENT_ID) return res.status(503).json({ error: 'Spotify not configured' });
  const { title, artist, trackId } = req.query;
  if (!title) return res.status(400).json({ error: 'Missing title' });

  try {
    // Strategy 1: Search for soundtrack ALBUMS containing this track
    // This is more reliable than playlists
    const albumSearch = await spotifyGet(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(title + ' ' + (artist || ''))}&type=album&limit=10`
    );

    const soundtrackAlbums = (albumSearch.albums?.items || []).filter(a => {
      if (!a) return false;
      const name = a.name || '';
      // Must mention soundtrack or score
      if (!/soundtrack|original score|music from|songs from|o\.s\.t/i.test(name)) return false;
      // Skip generic compilations
      if (/top \d+|greatest hits|collection|instrumenta|vol\.|volume/i.test(name)) return false;
      // Skip non-Latin
      if (name.charCodeAt(0) > 127) return false;
      return true;
    });

    // For each album, include it (name filtering already ensures quality)
    const verified = [];
    for (const album of soundtrackAlbums.slice(0, 6)) {
      try {
        // Quick check - does album track list include our song?
        const tracks = await spotifyGet(`https://api.spotify.com/v1/albums/${album.id}/tracks?limit=50`);
        const found = (tracks.items || []).some(t =>
          t.name?.toLowerCase() === title.toLowerCase() ||
          t.name?.toLowerCase().includes(title.toLowerCase())
        );
        if (found) {
          const cleanName = album.name
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
          verified.push({
            id: album.id,
            name: album.name,
            cleanName: cleanName || album.name,
            year: album.release_date ? album.release_date.substring(0, 4) : '',
            image: album.images?.[1]?.url || album.images?.[0]?.url || null,
            spotifyUrl: album.external_urls?.spotify || '',
            type: 'album'
          });
        }
      } catch { /* skip failed album lookups */ }
    }

    // Strategy 2: Also search playlists as fallback if albums found < 2
    if (verified.length < 2) {
      const playlistSearch = await spotifyGet(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(title + ' original soundtrack')}&type=playlist&limit=8`
      );
      const playlists = (playlistSearch.playlists?.items || []).filter(p => {
        if (!p) return false;
        const name = p.name || '';
        if (!/soundtrack|original score|music from|songs from/i.test(name)) return false;
        if (/top \d+|greatest hits|collection|instrumenta|mix|radio/i.test(name)) return false;
        if (name.charCodeAt(0) > 127) return false;
        if (name.length < 4 || name.length > 80) return false;
        // Blacklist known junk playlists
        if (/efteling|disney on ice|karaoke|lullaby|ringtone/i.test(name)) return false;
        // Skip theme park / non-film playlists
        if (/theme park|pretpark|attractie/i.test(name)) return false;
        // Don't add if we already have this movie from album search
        const clean = name.replace(/soundtrack|score|music from/gi, '').trim().toLowerCase();
        if (verified.some(v => v.cleanName.toLowerCase().includes(clean.substring(0, 10)))) return false;
        return true;
      }).slice(0, 3);

      for (const pl of playlists) {
        const cleanName = pl.name
          .replace(/original motion picture soundtrack/gi, '')
          .replace(/original soundtrack/gi, '')
          .replace(/\bost\b/gi, '')
          .replace(/soundtrack/gi, '')
          .replace(/original score/gi, '')
          .replace(/music from (the )?/gi, '')
          .replace(/songs from (the )?/gi, '')
          .replace(/\(.*?\)/g, '')
          .replace(/[-–:|]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleanName.length > 1) {
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
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎬 Soundtrack Scout running at http://localhost:${PORT}`);
  console.log(`   TMDB: ${TMDB_KEY ? '✅' : '❌ not configured'}`);
  console.log(`   Spotify: ${SPOTIFY_CLIENT_ID ? '✅' : '❌ not configured'}\n`);
});

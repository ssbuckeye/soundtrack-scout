const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = 3000;

// ── Put your TMDB API key here ──────────────────────────────
// Free key at: https://www.themoviedb.org/settings/api
const TMDB_KEY = '7c974a554f5d94552bc945f1c490f3c2';  // <-- paste your key between the quotes
// ───────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

// Proxy MusicBrainz
// Usage: /api/mb?endpoint=release-group&query=...&fmt=json
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

// Proxy TMDB
// Usage: /api/tmdb?path=/search/movie&query=Pulp+Fiction
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

app.listen(PORT, () => {
  console.log(`\n🎬 Soundtrack Scout running at http://localhost:${PORT}`);
  if (!TMDB_KEY) console.log(`   ℹ️  Add your TMDB key to server.js for movie posters\n`);
  else console.log(`   ✅ TMDB connected — movie posters enabled\n`);
});

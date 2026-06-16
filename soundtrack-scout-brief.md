# Soundtrack Scout — Project Brief
*Paste this at the start of any new Claude conversation to get up to speed*

---

## What We're Building
**Soundtrack Scout** — a web app that lets users search movies to see their soundtracks, and search songs to see what movies/soundtracks they've appeared on. Tagline: "Where have I heard this song before?"

**Live URL:** https://soundtrack-scout-production.up.railway.app/
**GitHub:** https://github.com/ssbuckeye/soundtrack-scout
**TikTok intro card:** https://soundtrack-scout-production.up.railway.app/card.html

---

## The Person Building It
- **Name:** Andy Young
- **Email:** andy.g.young@gmail.com
- **Social:** @RedWheelsPanda (TikTok + Instagram) — ~10k followers built around music discovery, movie soundtracks, and nostalgia content
- 20+ years in digital for Fortune 500 companies — owns UX and experience design
- No coding background beyond basic macros 30 years ago
- Building this as a potential business, not just a side project

---

## Current Tech Stack
- **Frontend:** Single HTML file (`public/index.html`) — vanilla JS, no framework
- **Backend:** Node.js + Express (`server.js`) — proxies all API calls to avoid CORS
- **Data sources:**
  - MusicBrainz (free, open) — movie soundtracks and track listings for Movie → Songs
  - TMDB (The Movie Database) — movie posters, overviews, ratings
  - Spotify — song search and soundtrack album matching for Song → Movies (Beta)
- **Hosting:** Railway (auto-deploys from GitHub push) — $5/month Hobby plan
- **Font:** Nunito / Nunito Sans (Google Fonts)
- **Color palette:** Dark bg `#0e0e0f`, gold accent `#e8c87a`, light text `#f0ede8`, Spotify green `#1db954`

---

## File Structure
```
soundtrack-scout/
├── server.js           # Express server — proxies MusicBrainz, TMDB, Spotify
├── package.json        # start script: "node server.js"
├── public/
│   ├── index.html      # Main app — all frontend code
│   └── card.html       # Animated TikTok intro card
└── soundtrack-scout-brief.md  # This file
```

---

## Environment Variables (set in Railway)
```
TMDB_KEY=<key>              # The Movie Database API key
SPOTIFY_CLIENT_ID=<id>      # Spotify Developer app client ID
SPOTIFY_CLIENT_SECRET=<secret>  # Spotify Developer app client secret
```
**Never hardcode these in files** — always use Railway environment variables.

---

## How to Run Locally
```
cd "C:\Users\andre\OneDrive\Desktop\Soundtrack Scout Stuff\soundtrack-scout"
node server.js
```
Then open http://localhost:3000
Note: Railway assigns port 8080, local uses 3000. Both work via `process.env.PORT || 3000`.

---

## How to Deploy
```
git add .
git commit -m "your message"
git push
```
Railway auto-deploys on push. If Railway seems stuck, add an empty commit:
```
git commit --allow-empty -m "Force redeploy"
git push
```
**Important:** Railway port is set to 8080 in Networking settings. If app stops responding after deploy, check the port setting hasn't changed.

---

## What's Working

### Movie → Songs (fully live)
- Search any film, get real soundtrack data from MusicBrainz
- Full track listings with artist and duration
- Real movie posters from TMDB with smart title matching
- Movie overview and rating on detail page
- Spotify + Apple Music streaming links for every track
- Filters out Broadway cast recordings and non-Latin TV show results
- Title cleaner strips MusicBrainz suffixes ("Music From the Motion Picture" etc.)
- Back navigation preserves poster cache

### Song → Movies (Beta)
- Search any song by title
- Finds studio recordings, filters out live/demo/remix versions
- Deduplicates by song name + artist
- Searches Spotify for soundtrack albums containing the song (verified by checking track list)
- Falls back to playlist search if fewer than 2 album results found
- Shows album art, year, and Spotify play link for each soundtrack found
- When no results found: shows "Search Tunefind" and "Google it" fallback links
- Beta label on tab sets user expectations correctly
- Notice at bottom explains limitation and mentions Tunefind integration coming

### TikTok Intro Card
- Animated dark cinematic card at /card.html
- Film strip background animation, gold glow pulse, staggered text reveals
- "I built an app that answers the question you've Googled 1000 times" + Soundtrack.Scout logo
- Designed to be screen-recorded on phone for TikTok intro

---

## What's NOT Working / Coming Next
1. **Tunefind integration** — the killer feature. Song → Movies with scene context ("plays during the bus scene in Almost Famous"). Applied for API access twice, awaiting response. This is the data that makes Song → Movies truly accurate.
2. **Scene context** — which scene a song plays in, timestamps. Tunefind dependency.
3. **Shareable TikTok cards** — auto-generated cards for countdowns/rankings
4. **Custom domain** — soundtrackscout.app or similar
5. **AI scene search** — "what's the song from the bar fight in Kingsman?" Natural language search.
6. **TV shows, video games, commercials** — long-term vision expansion

---

## Known Technical Issues & Solutions

| Issue | Solution |
|-------|----------|
| Express v5 doesn't support wildcard routes (`/api/mb/*`) | Use query params instead: `/api/mb?endpoint=...` |
| TMDB key must be server-side only | Store in Railway env vars, never in index.html |
| MusicBrainz titles have long suffixes | Strip before TMDB search (regex in tmdbSearch function) |
| CORS blocks direct browser API calls | All external calls go through server.js proxy |
| Git on Windows: spaces in path | Wrap path in quotes: `cd "C:\Users\..."` |
| Railway caches old Docker image | Add empty commit to force fresh build |
| Railway port mismatch | Port set to 8080 in Railway Networking settings |
| Spotify "Invalid limit" 400 error | Was caused by accumulated bad code — clean rewrite fixed it |
| Spotify returns junk playlists | Filter by name patterns + blacklist known junk (efteling etc.) |
| MusicBrainz "Almost Famous" not found | Stored as "Almost Famous (Music From the Motion Picture)" — title cleaner handles this |

---

## Key Technical Patterns

### tmdbSearch() — smart movie matching
Strips MusicBrainz suffixes from title, searches TMDB without year, picks best match by:
1. Exact title match closest to given year
2. Exact title match with highest popularity  
3. Most popular result overall

### Spotify song search filtering
- Fetches 10 results, filters to 4
- Removes live/demo/remix/acoustic/remaster/karaoke versions
- Deduplicates by normalized song name + artist
- Requires song name to roughly match query (first 5 chars)

### Spotify soundtrack matching
- Searches for "[title] [artist] soundtrack" albums
- Verifies song actually appears in each album by checking track list
- Falls back to playlist search if <2 album results
- Cleans album/playlist names by stripping soundtrack-related words

---

## Business Context
- **Revenue model:** Freemium ($2.99/mo premium), affiliate links (Spotify, Apple Music, vinyl), creator tools
- **Go-to-market:** TikTok first via @RedWheelsPanda audience
- **Competitive angle:** Only app built specifically for the song ↔ movie relationship
- **Long-term vision:** TV shows, video games, commercials, trailers, sports broadcasts
- **Main data gap:** Tunefind for song→movie sync licensing data and scene context

---

## Andy's Preferences
- Simple and usable over flashy
- No serif fonts — uses Nunito (Calibri-feel for web)
- Gold accent color (#e8c87a) is the brand color
- Dark background is current choice
- Prefers clear step-by-step technical instructions
- Wants to understand what's happening, not just copy/paste blindly

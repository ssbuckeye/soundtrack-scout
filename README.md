# Soundtrack Scout — Local Setup

## You need Node.js installed
Check by opening Terminal and typing: `node --version`
If you don't have it: https://nodejs.org (download the LTS version)

---

## Setup (one time only)

1. Unzip this folder somewhere on your computer (e.g. Desktop)
2. Open Terminal (Mac) or Command Prompt (Windows)
3. Navigate to the folder:
   ```
   cd ~/Desktop/soundtrack-scout
   ```
4. Install dependencies:
   ```
   npm install
   ```

---

## Run it

Every time you want to use the app:

```
node server.js
```

Then open your browser and go to:
**http://localhost:3000**

That's it. Search any movie or song — it pulls real data from MusicBrainz live.

---

## Stop it
Press `Ctrl + C` in the terminal window.

---

## What's working
- Movie → Songs: search any film, see its real soundtrack with streaming links
- Song → Movies: search any song, see which soundtracks it appears on
- Spotify + Apple Music links for every track

## What's coming next
- Movie posters (TMDB integration)
- Scene-level context (Tunefind integration)
- AI natural language search ("song from the bar scene in...")
- Shareable cards

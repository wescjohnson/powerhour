# 🍺 Power Hour

Spotify-powered power hour app. 60 songs, 60 seconds each, chorus only.

## Setup

### 1. Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Set **Redirect URI** to: `http://localhost:3000/api/auth/callback`
4. Enable **Web API** and **Web Playback SDK**
5. Copy your **Client ID** and **Client Secret**

### 2. Configure Environment

```bash
cp .env.local.example .env.local
```

Fill in your credentials in `.env.local`:
- `SPOTIFY_CLIENT_ID` - from your Spotify app
- `SPOTIFY_CLIENT_SECRET` - from your Spotify app
- `SESSION_SECRET` - generate with: `openssl rand -base64 32`
- Supabase values (optional for now - for multiplayer queue later)

### 3. Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Requirements

- **Spotify Premium** — required for Web Playback SDK
- Node.js 18+

## Architecture

```
app/
  api/
    auth/
      login/      → Redirects to Spotify OAuth
      callback/   → Handles OAuth code exchange
      me/         → Returns current session + access token
    player/
      search/     → Proxies Spotify track search
      play/       → Triggers playback on device
    analysis/
      [trackId]/  → Fetches audio analysis + detects chorus
  room/           → Main Power Hour UI
  page.tsx        → Landing / login page

lib/
  spotify.ts          → Spotify API wrapper
  chorus-detection.ts → Algorithm to find chorus position
  session.ts          → iron-session cookie management

hooks/
  useSpotifyPlayer.ts → Web Playback SDK hook
```

## How Chorus Detection Works

1. Fetch Spotify's `/audio-analysis/{trackId}` — returns track sections with timestamps, loudness, tempo
2. Calculate average loudness across all sections
3. Score each section: louder sections in the 20–70% range of the track get high scores
4. Skip intros (first 15%) and outros (last 20%)
5. Return the highest-scored section start time as `positionMs`

Confidence is rated `high/medium/low` based on how clearly one section stands out.

## Next Steps

- [ ] Add Supabase for real-time multi-user queue
- [ ] Add skip voting
- [ ] Add round history log
- [ ] Manual chorus override (waveform scrubber)
- [ ] QR code room sharing

// lib/spotify.ts
// Core Spotify API wrapper - handles OAuth tokens and API calls

const SPOTIFY_BASE = 'https://api.spotify.com/v1'
const ACCOUNTS_BASE = 'https://accounts.spotify.com'

// Scopes required for Power Hour
// - streaming: Web Playback SDK
// - user-read-email + user-read-private: Required for Playback SDK
// - user-modify-playback-state: Play, pause, seek, queue
// - user-read-playback-state: Get current track state
export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-currently-playing',
].join(' ')

// --- Auth URL Generation ---
export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: SPOTIFY_SCOPES,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    state,
    show_dialog: 'false',
  })
  return `${ACCOUNTS_BASE}/authorize?${params}`
}

// --- Token Exchange ---
export async function exchangeCodeForTokens(code: string) {
  const response = await fetch(`${ACCOUNTS_BASE}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    }),
  })

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`)
  }

  const data = await response.json()
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

// --- Token Refresh ---
export async function refreshAccessToken(refreshToken: string) {
  const response = await fetch(`${ACCOUNTS_BASE}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`)
  }

  const data = await response.json()
  return {
    accessToken: data.access_token as string,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

// --- API Helper ---
async function spotifyFetch(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
) {
  const response = await fetch(`${SPOTIFY_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Spotify API error ${response.status}: ${error}`)
  }

  // Some endpoints return 204 No Content
  if (response.status === 204) return null
  return response.json()
}

// --- Playback Control ---
export async function playTrack(
  accessToken: string,
  deviceId: string,
  trackUri: string,
  positionMs: number
) {
  return spotifyFetch(`/me/player/play?device_id=${deviceId}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({
      uris: [trackUri],
      position_ms: positionMs,
    }),
  })
}

export async function pausePlayback(accessToken: string) {
  return spotifyFetch('/me/player/pause', accessToken, { method: 'PUT' })
}

export async function seekToPosition(accessToken: string, positionMs: number) {
  return spotifyFetch(
    `/me/player/seek?position_ms=${positionMs}`,
    accessToken,
    { method: 'PUT' }
  )
}

export async function getCurrentPlayback(accessToken: string) {
  return spotifyFetch('/me/player', accessToken)
}

// --- Search ---
export async function searchTracks(accessToken: string, query: string) {
  const params = new URLSearchParams({ q: query, type: 'track', limit: '10' })
  return spotifyFetch(`/search?${params}`, accessToken)
}

// --- Audio Analysis (for chorus detection) ---
export async function getAudioAnalysis(accessToken: string, trackId: string) {
  return spotifyFetch(`/audio-analysis/${trackId}`, accessToken)
}

// --- User Profile ---
export async function getUserProfile(accessToken: string) {
  return spotifyFetch('/me', accessToken)
}

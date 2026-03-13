'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

export interface PlayerState {
  isReady: boolean
  deviceId: string | null
  isPlaying: boolean
  error: string | null
}

export function useSpotifyPlayer(accessToken: string | null) {
  const playerRef = useRef<Spotify.Player | null>(null)
  const [state, setState] = useState<PlayerState>({
    isReady: false,
    deviceId: null,
    isPlaying: false,
    error: null,
  })

  useEffect(() => {
    if (!accessToken) return

    const initPlayer = () => {
      const player = new window.Spotify.Player({
        name: 'Power Hour 🍺',
        getOAuthToken: (cb: (token: string) => void) => cb(accessToken),
        volume: 0.8,
      })

      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        console.log('Spotify player ready, device:', device_id)
        setState(prev => ({ ...prev, isReady: true, deviceId: device_id, error: null }))
      })

      player.addListener('not_ready', () => {
        setState(prev => ({ ...prev, isReady: false }))
      })

      player.addListener('initialization_error', ({ message }: { message: string }) => {
        setState(prev => ({ ...prev, error: `Init error: ${message}` }))
      })
      player.addListener('authentication_error', ({ message }: { message: string }) => {
        setState(prev => ({ ...prev, error: `Auth error: ${message}` }))
      })
      player.addListener('account_error', ({ message }: { message: string }) => {
        setState(prev => ({ ...prev, error: `${message} (Spotify Premium required)` }))
      })
      player.addListener('playback_error', ({ message }: { message: string }) => {
        setState(prev => ({ ...prev, error: `Playback error: ${message}` }))
      })

      player.connect()
      playerRef.current = player
    }

    if (window.Spotify) {
      initPlayer()
    } else {
      const script = document.createElement('script')
      script.src = 'https://sdk.scdn.co/spotify-player.js'
      script.async = true
      document.body.appendChild(script)
      window.onSpotifyWebPlaybackSDKReady = initPlayer
    }

    return () => { playerRef.current?.disconnect() }
  }, [accessToken])

  const play = useCallback(async (trackUri: string, positionMs: number) => {
    if (!state.deviceId || !accessToken) return

    console.log(`[Player] Starting ${trackUri} then seeking to ${positionMs}ms`)

    // Step 1: Start playback from beginning
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${state.deviceId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris: [trackUri] }),
    })

    // Step 2: Wait briefly for playback to start, then seek to chorus
    await new Promise(res => setTimeout(res, 800))

    await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${positionMs}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    console.log(`[Player] Seeked to ${positionMs}ms (${Math.round(positionMs/1000)}s)`)
  }, [state.deviceId, accessToken])

  const pause = useCallback(async () => {
    if (!accessToken) return
    await fetch('https://api.spotify.com/v1/me/player/pause', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  }, [accessToken])

  return { state, play, pause }
}

declare global {
  interface Window {
    Spotify: typeof Spotify
    onSpotifyWebPlaybackSDKReady: () => void
  }
}

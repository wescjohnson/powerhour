'use client'
// hooks/useSpotifyPlayer.ts
// Manages the Spotify Web Playback SDK lifecycle

import { useEffect, useRef, useState, useCallback } from 'react'

export interface PlayerState {
  isReady: boolean
  deviceId: string | null
  isPlaying: boolean
  currentTrack: {
    id: string
    name: string
    artist: string
    albumArt: string
    durationMs: number
    positionMs: number
  } | null
  error: string | null
}

export function useSpotifyPlayer(accessToken: string | null) {
  const playerRef = useRef<Spotify.Player | null>(null)
  const [state, setState] = useState<PlayerState>({
    isReady: false,
    deviceId: null,
    isPlaying: false,
    currentTrack: null,
    error: null,
  })

  useEffect(() => {
    if (!accessToken) return

    // Load Spotify SDK script if not already loaded
    if (!window.Spotify) {
      const script = document.createElement('script')
      script.src = 'https://sdk.scdn.co/spotify-player.js'
      script.async = true
      document.body.appendChild(script)
    }

    // SDK calls this when ready
    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: 'Power Hour 🍺',
        getOAuthToken: (cb: (token: string) => void) => cb(accessToken),
        volume: 0.8,
      })

      // Ready - we have a device ID
      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        console.log('Spotify player ready, device:', device_id)
        setState(prev => ({ ...prev, isReady: true, deviceId: device_id, error: null }))
      })

      // Not ready
      player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
        console.warn('Spotify player offline:', device_id)
        setState(prev => ({ ...prev, isReady: false }))
      })

      // State changes (track changes, play/pause, etc.)
      player.addListener('player_state_changed', (playerState: Spotify.PlaybackState | null) => {
        if (!playerState) return

        const track = playerState.track_window?.current_track
        setState(prev => ({
          ...prev,
          isPlaying: !playerState.paused,
          currentTrack: track ? {
            id: track.id ?? '',
            name: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            albumArt: track.album.images[0]?.url ?? '',
            durationMs: track.duration_ms,
            positionMs: playerState.position,
          } : prev.currentTrack,
        }))
      })

      // Errors
      player.addListener('initialization_error', ({ message }: { message: string }) => {
        setState(prev => ({ ...prev, error: `Init error: ${message}` }))
      })
      player.addListener('authentication_error', ({ message }: { message: string }) => {
        setState(prev => ({ ...prev, error: `Auth error: ${message}` }))
      })
      player.addListener('account_error', ({ message }: { message: string }) => {
        // Most common: user doesn't have Spotify Premium
        setState(prev => ({ ...prev, error: `Account error: ${message} (Spotify Premium required)` }))
      })
      player.addListener('playback_error', ({ message }: { message: string }) => {
        setState(prev => ({ ...prev, error: `Playback error: ${message}` }))
      })

      player.connect()
      playerRef.current = player
    }

    // If SDK already loaded, trigger manually
    if (window.Spotify) {
      window.onSpotifyWebPlaybackSDKReady()
    }

    return () => {
      playerRef.current?.disconnect()
    }
  }, [accessToken])

  const play = useCallback(async (trackUri: string, positionMs: number) => {
    if (!state.deviceId || !accessToken) return

    await fetch(`/api/player/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackUri, positionMs, deviceId: state.deviceId }),
    })
  }, [state.deviceId, accessToken])

  const pause = useCallback(() => {
    playerRef.current?.pause()
  }, [])

  const resume = useCallback(() => {
    playerRef.current?.resume()
  }, [])

  const getPosition = useCallback(async (): Promise<number> => {
    const state = await playerRef.current?.getCurrentState()
    return state?.position ?? 0
  }, [])

  return { state, play, pause, resume, getPosition }
}

// Spotify SDK types
declare global {
  interface Window {
    Spotify: typeof Spotify
    onSpotifyWebPlaybackSDKReady: () => void
  }
}

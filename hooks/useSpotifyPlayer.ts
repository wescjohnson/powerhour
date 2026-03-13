'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

export interface PlayerState {
  isReady: boolean
  deviceId: string | null
  isPlaying: boolean
  error: string | null
  isMobile: boolean
}

function detectMobile() {
  if (typeof window === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export function useSpotifyPlayer(accessToken: string | null) {
  const playerRef = useRef<Spotify.Player | null>(null)
  const [state, setState] = useState<PlayerState>({
    isReady: false, deviceId: null, isPlaying: false, error: null, isMobile: false,
  })

  useEffect(() => {
    if (!accessToken) return
    const mobile = detectMobile()
    setState(prev => ({ ...prev, isMobile: mobile }))

    if (mobile) {
      // On mobile: poll for an active Spotify device instead of using SDK
      let attempts = 0
      const maxAttempts = 20
      const poll = setInterval(async () => {
        attempts++
        try {
          const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
            headers: { Authorization: `Bearer ${accessToken}` }
          })
          const data = await res.json()
          const activeDevice = data.devices?.find((d: any) => d.is_active) || data.devices?.[0]
          if (activeDevice) {
            clearInterval(poll)
            setState(prev => ({ ...prev, isReady: true, deviceId: activeDevice.id, error: null }))
          } else if (attempts >= maxAttempts) {
            clearInterval(poll)
            setState(prev => ({ ...prev, error: 'No Spotify device found. Open the Spotify app and play something first.' }))
          }
        } catch {
          if (attempts >= maxAttempts) {
            clearInterval(poll)
            setState(prev => ({ ...prev, error: 'Could not reach Spotify. Check your connection.' }))
          }
        }
      }, 2000)
      return () => clearInterval(poll)
    } else {
      // Desktop: use Web Playback SDK as before
      const initPlayer = () => {
        const player = new window.Spotify.Player({
          name: 'Power Hour 🍺',
          getOAuthToken: (cb: (token: string) => void) => cb(accessToken),
          volume: 0.8,
        })
        player.addListener('ready', ({ device_id }: { device_id: string }) => {
          setState(prev => ({ ...prev, isReady: true, deviceId: device_id, error: null }))
        })
        player.addListener('not_ready', () => setState(prev => ({ ...prev, isReady: false })))
        player.addListener('initialization_error', ({ message }: { message: string }) => setState(prev => ({ ...prev, error: `Init error: ${message}` })))
        player.addListener('authentication_error', ({ message }: { message: string }) => setState(prev => ({ ...prev, error: `Auth error: ${message}` })))
        player.addListener('account_error', ({ message }: { message: string }) => setState(prev => ({ ...prev, error: `${message} (Spotify Premium required)` })))
        player.addListener('playback_error', ({ message }: { message: string }) => setState(prev => ({ ...prev, error: `Playback error: ${message}` })))
        player.connect()
        playerRef.current = player
      }
      if (window.Spotify) { initPlayer() } else {
        const script = document.createElement('script')
        script.src = 'https://sdk.scdn.co/spotify-player.js'
        script.async = true
        document.body.appendChild(script)
        window.onSpotifyWebPlaybackSDKReady = initPlayer
      }
      return () => { playerRef.current?.disconnect() }
    }
  }, [accessToken])

  const play = useCallback(async (trackUri: string, positionMs: number) => {
    if (!state.deviceId || !accessToken) return
    console.log(`[Player] Starting ${trackUri} then seeking to ${positionMs}ms on device ${state.deviceId}`)
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${state.deviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [trackUri] }),
    })
    await new Promise(res => setTimeout(res, 800))
    await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${positionMs}&device_id=${state.deviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    console.log(`[Player] Seeked to ${positionMs}ms`)
  }, [state.deviceId, accessToken])

  const pause = useCallback(async () => {
    if (!accessToken) return
    await fetch('https://api.spotify.com/v1/me/player/pause', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  }, [accessToken])

  const refreshMobileDevice = useCallback(async () => {
    if (!accessToken) return
    setState(prev => ({ ...prev, isReady: false, deviceId: null, error: null }))
    try {
      const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      const data = await res.json()
      const activeDevice = data.devices?.find((d: any) => d.is_active) || data.devices?.[0]
      if (activeDevice) {
        setState(prev => ({ ...prev, isReady: true, deviceId: activeDevice.id, error: null }))
      } else {
        setState(prev => ({ ...prev, error: 'No Spotify device found. Open the Spotify app and play something first.' }))
      }
    } catch {
      setState(prev => ({ ...prev, error: 'Could not reach Spotify.' }))
    }
  }, [accessToken])

  return { state, play, pause, refreshMobileDevice }
}

declare global {
  interface Window {
    Spotify: typeof Spotify
    onSpotifyWebPlaybackSDKReady: () => void
  }
}

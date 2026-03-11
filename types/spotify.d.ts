// types/spotify.d.ts
// Type declarations for the Spotify Web Playback SDK
// The SDK is loaded via script tag, not npm package

declare namespace Spotify {
  interface Player {
    connect(): Promise<boolean>
    disconnect(): void
    addListener(event: 'ready', cb: (data: { device_id: string }) => void): boolean
    addListener(event: 'not_ready', cb: (data: { device_id: string }) => void): boolean
    addListener(event: 'player_state_changed', cb: (state: PlaybackState | null) => void): boolean
    addListener(event: 'initialization_error', cb: (data: { message: string }) => void): boolean
    addListener(event: 'authentication_error', cb: (data: { message: string }) => void): boolean
    addListener(event: 'account_error', cb: (data: { message: string }) => void): boolean
    addListener(event: 'playback_error', cb: (data: { message: string }) => void): boolean
    pause(): Promise<void>
    resume(): Promise<void>
    togglePlay(): Promise<void>
    seek(positionMs: number): Promise<void>
    previousTrack(): Promise<void>
    nextTrack(): Promise<void>
    setVolume(volume: number): Promise<void>
    getCurrentState(): Promise<PlaybackState | null>
    getVolume(): Promise<number>
  }

  interface PlayerConstructorOptions {
    name: string
    getOAuthToken: (callback: (token: string) => void) => void
    volume?: number
  }

  interface PlaybackState {
    context: { uri: string; metadata: any }
    disallows: { [key: string]: boolean }
    duration: number
    paused: boolean
    position: number
    repeat_mode: number
    shuffle: boolean
    track_window: {
      current_track: Track
      previous_tracks: Track[]
      next_tracks: Track[]
    }
  }

  interface Track {
    id: string | null
    uri: string
    type: 'track' | 'episode' | 'ad'
    media_type: 'audio' | 'video'
    name: string
    is_playable: boolean
    album: {
      uri: string
      name: string
      images: { url: string }[]
    }
    artists: { uri: string; name: string }[]
    duration_ms: number
  }

  const Player: {
    new (options: PlayerConstructorOptions): Player
  }
}

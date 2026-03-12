'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSpotifyPlayer } from '@/hooks/useSpotifyPlayer'

async function fetchChorusPosition(trackId: string, durationMs: number): Promise<number> {
  return Math.floor(durationMs * 0.40)
}

interface Track {
  id: string
  name: string
  artists: { name: string }[]
  album: { name: string; images: { url: string }[] }
  uri: string
  duration_ms: number
}

interface QueuedTrack extends Track {
  chorusMs?: number
  analysisReady?: boolean
}

type RoomPhase = 'waiting' | 'analyzing' | 'playing' | 'between'

export default function RoomPage() {
  const [user, setUser] = useState<{ displayName: string; accessToken: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [queue, setQueue] = useState<QueuedTrack[]>([])
  const [currentTrack, setCurrentTrack] = useState<QueuedTrack | null>(null)
  const [roundNumber, setRoundNumber] = useState(0)
  const [phase, setPhase] = useState<RoomPhase>('waiting')
  const [timeLeft, setTimeLeft] = useState(60)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Track[]>([])
  const [searching, setSearching] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const roundStartRef = useRef<number>(0)
  const startNextRoundRef = useRef<(() => Promise<void>) | null>(null)
  const queueRef = useRef<QueuedTrack[]>([])

  const { state: playerState, play, pause } = useSpotifyPlayer(user?.accessToken ?? null)

  useEffect(() => { queueRef.current = queue }, [queue])

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data.authenticated) {
          setUser({ displayName: data.displayName, accessToken: data.accessToken })
        } else {
          window.location.href = '/'
        }
        setLoading(false)
      })
  }, [])

  const startNextRound = useCallback(async () => {
    let q = queueRef.current

    if (q.length === 0) {
      setPhase('analyzing')
      try {
        const res = await fetch('/api/player/liked')
        const data = await res.json()
        if (data.tracks && data.tracks.length > 0) {
          const refill = data.tracks.slice(0, 10).map((t: any) => ({
            ...t,
            analysisReady: false,
          }))
          setQueue(refill)
          queueRef.current = refill
          q = refill
          refill.forEach((track: any) => {
            fetchChorusPosition(track.id, track.duration_ms).then(chorusMs => {
              setQueue(prev => prev.map(t =>
                t.id === track.id && !t.analysisReady
                  ? { ...t, chorusMs, analysisReady: true }
                  : t
              ))
            })
          })
        } else {
          setPhase('waiting')
          setCurrentTrack(null)
          return
        }
      } catch {
        setPhase('waiting')
        setCurrentTrack(null)
        return
      }
    }

    const next = q[0]
    setQueue(prev => prev.slice(1))
    setCurrentTrack(next)
    setRoundNumber(n => n + 1)

    setPhase('analyzing')
    const chorusMs = next.chorusMs ?? await fetchChorusPosition(next.id, next.duration_ms)

    console.log(`[PowerHour] Playing "${next.name}" from ${chorusMs}ms (${Math.round(chorusMs / 1000)}s) — duration_ms: ${next.duration_ms}`)

    setPhase('playing')
    await play(next.uri, chorusMs)

    roundStartRef.current = Date.now()
    setTimeLeft(60)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - roundStartRef.current) / 1000
      const le

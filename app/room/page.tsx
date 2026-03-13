'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSpotifyPlayer } from '@/hooks/useSpotifyPlayer'

async function fetchChorusPosition(trackId: string, durationMs: number): Promise<number> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(`/api/analysis/${trackId}`, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) throw new Error('Analysis failed')
    const data = await res.json()
    const positionMs = data.chorus?.positionMs
    if (typeof positionMs === 'number' && positionMs > 0) return positionMs
    return Math.floor(durationMs * 0.40)
  } catch {
    return Math.floor(durationMs * 0.40)
  }
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
type MobileTab = 'player' | 'queue' | 'add'

export default function RoomPage() {
  const [user, setUser] = useState<{ displayName: string; accessToken: string; roomId: string } | null>(null)
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
  const [mobileTab, setMobileTab] = useState<MobileTab>('player')
  const [showQR, setShowQR] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [guestUrl, setGuestUrl] = useState<string>('')

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const roundStartRef = useRef<number>(0)
  const startNextRoundRef = useRef<(() => Promise<void>) | null>(null)
  const queueRef = useRef<QueuedTrack[]>([])
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { state: playerState, play, pause, refreshMobileDevice } = useSpotifyPlayer(user?.accessToken ?? null)

  useEffect(() => { queueRef.current = queue }, [queue])

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data.authenticated) {
          setUser({ displayName: data.displayName, accessToken: data.accessToken, roomId: data.roomId })
          const url = `${window.location.origin}/guest?room=${data.roomId}`
          setGuestUrl(url)
          generateQR(url)
        } else {
          window.location.href = '/'
        }
        setLoading(false)
      })
  }, [])

  const generateQR = async (url: string) => {
    try {
      const QRCode = (await import('qrcode')).default
      const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 2, color: { dark: '#ffffff', light: '#0a0a0a' } })
      setQrDataUrl(dataUrl)
    } catch {}
  }

  // Sync state to room API so guests can see it
  const syncRoomState = useCallback(async (roomId: string, q: QueuedTrack[], ct: QueuedTrack | null, ph: RoomPhase, tl: number) => {
    try {
      await fetch(`/api/room/queue?roomId=${roomId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue: q, currentTrack: ct, phase: ph, timeLeft: tl }),
      })
    } catch {}
  }, [])

  // Poll for guest-added songs every 3 seconds
  useEffect(() => {
    if (!user?.roomId) return
    const poll = async () => {
      try {
        const res = await fetch(`/api/room/queue?roomId=${user.roomId}`)
        const data = await res.json()
        // Merge guest additions into our queue (avoid dupes)
        if (data.queue && data.queue.length > 0) {
          setQueue(prev => {
            const existingIds = new Set(prev.map((t: any) => t.id))
            const newTracks = data.queue.filter((t: any) => !existingIds.has(t.id))
            if (newTracks.length === 0) return prev
            return [...prev, ...newTracks]
          })
        }
      } catch {}
    }
    syncIntervalRef.current = setInterval(poll, 3000)
    return () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current) }
  }, [user?.roomId])

  // Push current state to room API whenever it changes
  useEffect(() => {
    if (!user?.roomId) return
    syncRoomState(user.roomId, queue, currentTrack, phase, timeLeft)
  }, [queue, currentTrack, phase, timeLeft, user?.roomId, syncRoomState])

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
            analysisReady: true,
            chorusMs: Math.floor(t.duration_ms * 0.40),
          }))
          setQueue(refill)
          queueRef.current = refill
          q = refill
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
    setMobileTab('player')

    const chorusMs = next.chorusMs ?? Math.floor(next.duration_ms * 0.40)
    console.log(`[PowerHour] Playing "${next.name}" from ${chorusMs}ms`)

    setPhase('playing')
    await play(next.uri, chorusMs)

    roundStartRef.current = Date.now()
    setTimeLeft(60)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - roundStartRef.current) / 1000
      const left = Math.max(0, 60 - elapsed)
      setTimeLeft(Math.ceil(left))
      if (left <= 0) {
        clearInterval(timerRef.current!)
        pause()
        setPhase('between')
        setTimeout(() => {
          if (startNextRoundRef.current) startNextRoundRef.current()
        }, 2000)
      }
    }, 250)
  }, [play, pause])

  useEffect(() => { startNextRoundRef.current = startNextRound }, [startNextRound])

  const addToQueue = async (track: Track) => {
    const chorusMs = Math.floor(track.duration_ms * 0.40)
    const queued: QueuedTrack = { ...track, chorusMs, analysisReady: true }
    setQueue(prev => [...prev, queued])
    setSearchOpen(false)
    setSearchQuery('')
    setMobileTab('queue')
  }

  const skipSong = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    pause()
    setPhase('between')
    setTimeout(() => startNextRound(), 500)
  }

  useEffect(() => {
    if (!searchQuery.trim() || !user) { setSearchResults([]); return }
    const timeout = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/player/search?q=${encodeURIComponent(searchQuery)}`)
        const data = await res.json()
        setSearchResults(data.tracks?.items ?? [])
      } finally { setSearching(false) }
    }, 400)
    return () => clearTimeout(timeout)
  }, [searchQuery, user])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
      Loading...
    </div>
  )

  const TimerCircle = ({ size = 160, fontSize = 52 }: { size?: number; fontSize?: number }) => {
    const r = 45
    const circ = 2 * Math.PI * r
    const offset = circ * (1 - timeLeft / 60)
    return (
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--mid)" strokeWidth="3" />
          <circle cx="50" cy="50" r={r} fill="none"
            stroke={timeLeft <= 10 ? '#ff4444' : 'var(--green)'}
            strokeWidth="3" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 0.25s linear, stroke 0.3s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize, lineHeight: 1, color: timeLeft <= 10 ? '#ff4444' : '#fff', transition: 'color 0.3s ease' }}>
            {phase === 'playing' ? timeLeft : phase === 'analyzing' ? '~' : '60'}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
            {phase === 'analyzing' ? 'LOADING' : 'SECONDS'}
          </span>
        </div>
      </div>
    )
  }

  const QRModal = () => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={() => setShowQR(false)}>
      <div style={{ background: '#111', border: '1px solid #333', borderRadius: '16px', padding: '2rem', textAlign: 'center', maxWidth: '280px' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ color: '#fff', fontSize: '16px', fontWeight: 500, marginBottom: '4px' }}>Invite Guests</div>
        <div style={{ color: '#666', fontSize: '12px', marginBottom: '1.25rem' }}>Scan to add songs to the queue</div>
        {qrDataUrl && <img src={qrDataUrl} alt="QR Code" style={{ width: '180px', height: '180px', borderRadius: '8px', marginBottom: '1rem' }} />}
        <div style={{ color: '#555', fontSize: '11px', wordBreak: 'break-all', marginBottom: '1.25rem' }}>{guestUrl}</div>
        <button onClick={() => { navigator.clipboard.writeText(guestUrl); }}
          style={{ background: 'var(--green)', color: '#000', border: 'none', padding: '10px 24px', borderRadius: '20px', fontFamily: 'var(--font-mono)', fontSize: '13px', cursor: 'pointer', marginBottom: '8px', width: '100%' }}>
          Copy Link
        </button>
        <button onClick={() => setShowQR(false)}
          style={{ background: 'transparent', color: '#666', border: 'none', padding: '8px', fontSize: '13px', cursor: 'pointer', width: '100%' }}>
          Close
        </button>
      </div>
    </div>
  )

  const SearchPanel = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <input type="text" placeholder="Search for a song..." value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true) }}
            onFocus={() => setSearchOpen(true)}
            autoFocus
            style={{ width: '100%', background: 'var(--mid)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
          {searching && <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '11px' }}>...</div>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {searchResults.length === 0 && (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            {searchQuery.trim() ? 'No results' : 'Type to search Spotify'}
          </div>
        )}
        {searchResults.map(track => (
          <button key={track.id} onClick={() => addToQueue(track)}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
            <img src={track.album.images[2]?.url || track.album.images[0]?.url} alt=""
              style={{ width: '44px', height: '44px', borderRadius: '4px', flexShrink: 0 }} />
            <div style={{ overflow: 'hidden', minWidth: 0, flex: 1 }}>
              <div style={{ color: 'var(--text)', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artists.map((a: any) => a.name).join(', ')}</div>
            </div>
            <div style={{ marginLeft: 'auto', color: 'var(--green)', fontSize: '22px', flexShrink: 0 }}>+</div>
          </button>
        ))}
      </div>
    </div>
  )

  const QueuePanel = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '11px', letterSpacing: '0.1em', flexShrink: 0 }}>
        UP NEXT — {queue.length} song{queue.length !== 1 ? 's' : ''}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {queue.length === 0 && (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>No songs in queue</div>
        )}
        {queue.map((track, i) => (
          <div key={`${track.id}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '11px', width: '16px', flexShrink: 0 }}>{i + 1}</span>
            <img src={track.album.images[2]?.url || track.album.images[0]?.url} alt=""
              style={{ width: '40px', height: '40px', borderRadius: '4px', flexShrink: 0 }} />
            <div style={{ overflow: 'hidden', minWidth: 0, flex: 1 }}>
              <div style={{ color: 'var(--text)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artists.map((a: any) => a.name).join(', ')}</div>
            </div>
            <button onClick={() => setQueue(prev => prev.filter((_, idx) => idx !== i))}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '20px', flexShrink: 0, padding: '0 4px' }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )

  const MobileDeviceStatus = () => {
    if (playerState.isReady) return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--green)', fontSize: '12px' }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)' }} />
        Spotify connected
      </div>
    )
    if (playerState.error) return (
      <div style={{ textAlign: 'center', maxWidth: '280px' }}>
        <div style={{ color: '#ff6b6b', fontSize: '13px', marginBottom: '12px' }}>{playerState.error}</div>
        <button onClick={refreshMobileDevice}
          style={{ background: 'var(--green)', color: '#000', border: 'none', padding: '10px 24px', borderRadius: '20px', fontFamily: 'var(--font-mono)', fontSize: '13px', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    )
    return (
      <div style={{ textAlign: 'center', maxWidth: '280px' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '4px' }}>Open Spotify, play any song,</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>then come back here.</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '11px', opacity: 0.6 }}>Searching for device...</div>
      </div>
    )
  }

  const tabStyle = (tab: MobileTab) => ({
    flex: 1,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '3px',
    padding: '10px 0 calc(10px + env(safe-area-inset-bottom))',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: mobileTab === tab ? 'var(--green)' : 'var(--text-muted)',
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.05em',
  })

  return (
    <>
      <style>{`
        html, body { height: 100%; margin: 0; }
        .ph-root { height: 100dvh; display: flex; flex-direction: column; background: var(--black); overflow: hidden; }
        .ph-layout { display: grid; grid-template-columns: 1fr 360px; flex: 1; overflow: hidden; }
        .ph-sidebar { display: flex; flex-direction: column; overflow: hidden; border-left: 1px solid var(--border); }
        .ph-mobile-wrap { display: none; }
        @media (max-width: 768px) {
          .ph-layout { display: none; }
          .ph-mobile-wrap { display: flex; flex-direction: column; flex: 1; overflow: hidden; min-height: 0; }
          .ph-mobile-body { flex: 1; overflow: hidden; min-height: 0; display: flex; flex-direction: column; }
          .ph-tab-bar { flex-shrink: 0; display: flex; border-top: 1px solid var(--border); background: var(--dark); }
        }
      `}</style>

      {showQR && <QRModal />}

      <div className="ph-root">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>🍺</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', letterSpacing: '0.05em', color: 'var(--green)' }}>POWER HOUR</span>
            {phase === 'playing' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>LIVE</span>
              </div>
            )}
            {phase === 'analyzing' && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Loading...</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Round <span style={{ color: 'var(--green)' }}>{roundNumber}</span></span>
            <button onClick={() => setShowQR(true)}
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '5px 12px', borderRadius: '20px', fontFamily: 'var(--font-mono)', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              Invite
            </button>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{user?.displayName}</span>
          </div>
        </header>

        {/* Desktop */}
        <div className="ph-layout">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 2rem', borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
            <div style={{ marginBottom: '2rem' }}><TimerCircle size={160} fontSize={52} /></div>
            {currentTrack ? (
              <div style={{ textAlign: 'center', maxWidth: '380px' }}>
                {currentTrack.album.images[0] && (
                  <img src={currentTrack.album.images[0].url} alt={currentTrack.album.name}
                    style={{ width: '120px', height: '120px', borderRadius: '8px', marginBottom: '1.25rem', opacity: phase === 'analyzing' ? 0.6 : 1, transition: 'opacity 0.3s ease' }} />
                )}
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: '#fff', marginBottom: '4px' }}>{currentTrack.name}</div>
                <div style={{ color: 'var(--text-mid)', fontSize: '13px', marginBottom: '1.5rem' }}>{currentTrack.artists.map((a: any) => a.name).join(', ')}</div>
                {phase === 'playing' && (
                  <button onClick={skipSong} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '8px 20px', borderRadius: '20px', fontFamily: 'var(--font-mono)', fontSize: '12px', cursor: 'pointer' }}>Skip →</button>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '48px', marginBottom: '1rem' }}>🎵</div>
                <div style={{ fontSize: '14px', marginBottom: '0.5rem' }}>Queue is empty</div>
                <div style={{ fontSize: '12px' }}>Add songs or share the invite link</div>
              </div>
            )}
            {phase === 'waiting' && queue.length > 0 && (
              <button onClick={startNextRound}
                style={{ marginTop: '2rem', background: 'var(--green)', color: '#000', border: 'none', padding: '14px 40px', borderRadius: '40px', fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: '14px', cursor: 'pointer', letterSpacing: '0.05em' }}>
                Start Power Hour 🍺
              </button>
            )}
            {playerState.error && (
              <div style={{ marginTop: '1rem', background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.2)', borderRadius: '6px', padding: '10px 16px', color: '#ff6b6b', fontSize: '12px', maxWidth: '380px', textAlign: 'center' }}>
                {playerState.error}
              </div>
            )}
            {!playerState.isReady && !playerState.error && (
              <div style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '12px' }}>Connecting to Spotify...</div>
            )}
          </div>
          <div className="ph-sidebar">
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <input type="text" placeholder="Search for a song..." value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true) }}
                  onFocus={() => setSearchOpen(true)}
                  style={{ width: '100%', background: 'var(--mid)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                {searching && <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '11px' }}>...</div>}
              </div>
              {searchOpen && searchResults.length > 0 && (
                <div style={{ marginTop: '8px', background: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', maxHeight: '280px', overflowY: 'auto' }}>
                  {searchResults.map(track => (
                    <button key={track.id} onClick={() => addToQueue(track)}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                      <img src={track.album.images[2]?.url || track.album.images[0]?.url} alt=""
                        style={{ width: '36px', height: '36px', borderRadius: '4px', flexShrink: 0 }} />
                      <div style={{ overflow: 'hidden', minWidth: 0 }}>
                        <div style={{ color: 'var(--text)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artists.map((a: any) => a.name).join(', ')}</div>
                      </div>
                      <div style={{ marginLeft: 'auto', color: 'var(--green)', fontSize: '16px', flexShrink: 0 }}>+</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ padding: '8px 16px 4px', color: 'var(--text-muted)', fontSize: '11px', letterSpacing: '0.1em' }}>
                UP NEXT — {queue.length} song{queue.length !== 1 ? 's' : ''}
              </div>
              {queue.length === 0 && (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Search for songs or share the invite link</div>
              )}
              {queue.map((track, i) => (
                <div key={`${track.id}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', width: '16px', flexShrink: 0 }}>{i + 1}</span>
                  <img src={track.album.images[2]?.url || track.album.images[0]?.url} alt=""
                    style={{ width: '36px', height: '36px', borderRadius: '4px', flexShrink: 0 }} />
                  <div style={{ overflow: 'hidden', minWidth: 0, flex: 1 }}>
                    <div style={{ color: 'var(--text)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artists.map((a: any) => a.name).join(', ')}</div>
                  </div>
                  <button onClick={() => setQueue(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px', flexShrink: 0, padding: '0 4px' }}>×</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile */}
        <div className="ph-mobile-wrap">
          <div className="ph-mobile-body">
            {mobileTab === 'player' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem', overflowY: 'auto', gap: '1.25rem' }}>
                <TimerCircle size={140} fontSize={44} />
                <MobileDeviceStatus />
                {currentTrack ? (
                  <div style={{ textAlign: 'center', width: '100%', maxWidth: '300px' }}>
                    {currentTrack.album.images[0] && (
                      <img src={currentTrack.album.images[0].url} alt={currentTrack.album.name}
                        style={{ width: '96px', height: '96px', borderRadius: '8px', marginBottom: '0.875rem', opacity: phase === 'analyzing' ? 0.6 : 1, transition: 'opacity 0.3s ease' }} />
                    )}
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: '#fff', marginBottom: '4px' }}>{currentTrack.name}</div>
                    <div style={{ color: 'var(--text-mid)', fontSize: '13px', marginBottom: '1rem' }}>{currentTrack.artists.map((a: any) => a.name).join(', ')}</div>
                    {phase === 'playing' && (
                      <button onClick={skipSong} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '10px 24px', borderRadius: '20px', fontFamily: 'var(--font-mono)', fontSize: '13px', cursor: 'pointer' }}>Skip →</button>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '36px', marginBottom: '0.5rem' }}>🎵</div>
                    <div style={{ fontSize: '14px', marginBottom: '4px' }}>Queue is empty</div>
                    <div style={{ fontSize: '12px' }}>Tap Add or share the invite</div>
                  </div>
                )}
                {phase === 'waiting' && queue.length > 0 && playerState.isReady && (
                  <button onClick={startNextRound}
                    style={{ background: 'var(--green)', color: '#000', border: 'none', padding: '14px 40px', borderRadius: '40px', fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: '14px', cursor: 'pointer', letterSpacing: '0.05em' }}>
                    Start Power Hour 🍺
                  </button>
                )}
              </div>
            )}
            {mobileTab === 'queue' && <QueuePanel />}
            {mobileTab === 'add' && <SearchPanel />}
          </div>
          <div className="ph-tab-bar">
            <button style={tabStyle('player')} onClick={() => setMobileTab('player')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              Player
            </button>
            <button style={tabStyle('queue')} onClick={() => setMobileTab('queue')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              Queue {queue.length > 0 ? `(${queue.length})` : ''}
            </button>
            <button style={tabStyle('add')} onClick={() => setMobileTab('add')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              Add
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

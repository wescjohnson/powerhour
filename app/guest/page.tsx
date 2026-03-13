'use client'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

interface Track {
  id: string
  name: string
  artists: { name: string }[]
  album: { name: string; images: { url: string }[] }
  uri: string
  duration_ms: number
}

function GuestRoom() {
  const searchParams = useSearchParams()
  const roomId = searchParams.get('room')

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Track[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)
  const [roomState, setRoomState] = useState<{
    queue: Track[]
    currentTrack: Track | null
    phase: string
    timeLeft: number
  }>({ queue: [], currentTrack: null, phase: 'waiting', timeLeft: 60 })

  // Poll room state every 3 seconds
  useEffect(() => {
    if (!roomId) return
    const poll = async () => {
      try {
        const res = await fetch(`/api/room/queue?roomId=${roomId}`)
        const data = await res.json()
        setRoomState(data)
      } catch {}
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [roomId])

  // Search debounce
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    const timeout = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/player/search?q=${encodeURIComponent(searchQuery)}`)
        const data = await res.json()
        setSearchResults(data.tracks?.items ?? [])
      } finally { setSearching(false) }
    }, 400)
    return () => clearTimeout(timeout)
  }, [searchQuery])

  const addToQueue = async (track: Track) => {
    if (!roomId) return
    setAdding(track.id)
    try {
      await fetch(`/api/room/queue?roomId=${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track: {
          id: track.id,
          name: track.name,
          artists: track.artists,
          album: track.album,
          uri: track.uri,
          duration_ms: track.duration_ms,
          chorusMs: Math.floor(track.duration_ms * 0.40),
          analysisReady: true,
        }})
      })
      setAdded(track.id)
      setSearchQuery('')
      setSearchResults([])
      setTimeout(() => setAdded(null), 3000)
    } finally { setAdding(null) }
  }

  if (!roomId) return (
    <div style={{ minHeight: '100dvh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontFamily: 'monospace' }}>
      No room ID found.
    </div>
  )

  const circumference = 2 * Math.PI * 45
  const dashOffset = circumference * (1 - roomState.timeLeft / 60)

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <header style={{ borderBottom: '1px solid #222', padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>🍺</span>
          <span style={{ fontSize: '16px', letterSpacing: '0.05em', color: '#1db954', fontWeight: 600 }}>POWER HOUR</span>
        </div>
        <span style={{ fontSize: '11px', color: '#555', letterSpacing: '0.05em' }}>GUEST</span>
      </header>

      {/* Now playing */}
      <div style={{ borderBottom: '1px solid #222', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        {roomState.currentTrack ? (
          <>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <svg width="44" height="44" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="#222" strokeWidth="6" />
                <circle cx="50" cy="50" r="45" fill="none"
                  stroke={roomState.timeLeft <= 10 ? '#ff4444' : '#1db954'}
                  strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={dashOffset}
                  style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 0.25s linear' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: roomState.timeLeft <= 10 ? '#ff4444' : '#fff' }}>
                  {roomState.phase === 'playing' ? roomState.timeLeft : '—'}
                </span>
              </div>
            </div>
            {roomState.currentTrack.album.images[0] && (
              <img src={roomState.currentTrack.album.images[0].url} alt=""
                style={{ width: '44px', height: '44px', borderRadius: '6px', flexShrink: 0 }} />
            )}
            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <div style={{ color: '#fff', fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{roomState.currentTrack.name}</div>
              <div style={{ color: '#888', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{roomState.currentTrack.artists.map((a: any) => a.name).join(', ')}</div>
            </div>
            {roomState.phase === 'playing' && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    width: '3px', background: '#1db954', borderRadius: '2px',
                    animation: `bar${i} 0.8s ease-in-out infinite alternate`,
                    height: `${12 + i * 6}px`,
                    animationDelay: `${i * 0.15}s`
                  }} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: '#555', fontSize: '13px' }}>
            {roomState.phase === 'waiting' ? 'Waiting for host to start...' : 'Loading next song...'}
          </div>
        )}
      </div>

      {/* Search */}
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #222', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search for a song to add..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', background: '#1a1a1a', border: '1px solid #333', borderRadius: '10px', padding: '12px 16px', color: '#fff', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
          />
          {searching && <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: '#555', fontSize: '12px' }}>...</div>}
        </div>

        {searchResults.length > 0 && (
          <div style={{ marginTop: '8px', background: '#111', border: '1px solid #222', borderRadius: '10px', overflow: 'hidden' }}>
            {searchResults.slice(0, 6).map(track => (
              <button key={track.id} onClick={() => addToQueue(track)} disabled={!!adding}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px 14px', background: added === track.id ? 'rgba(29,185,84,0.1)' : 'transparent', border: 'none', borderBottom: '1px solid #1a1a1a', cursor: 'pointer', textAlign: 'left', opacity: adding === track.id ? 0.6 : 1 }}>
                <img src={track.album.images[2]?.url || track.album.images[0]?.url} alt=""
                  style={{ width: '44px', height: '44px', borderRadius: '6px', flexShrink: 0 }} />
                <div style={{ overflow: 'hidden', minWidth: 0, flex: 1 }}>
                  <div style={{ color: added === track.id ? '#1db954' : '#fff', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</div>
                  <div style={{ color: '#777', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artists.map((a: any) => a.name).join(', ')}</div>
                </div>
                <div style={{ marginLeft: 'auto', color: added === track.id ? '#1db954' : '#444', fontSize: '22px', flexShrink: 0, fontWeight: 300 }}>
                  {added === track.id ? '✓' : adding === track.id ? '...' : '+'}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Queue */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '10px 16px 6px', color: '#555', fontSize: '11px', letterSpacing: '0.1em' }}>
          UP NEXT — {roomState.queue.length} song{roomState.queue.length !== 1 ? 's' : ''}
        </div>
        {roomState.queue.length === 0 && (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#444', fontSize: '13px' }}>Queue is empty — add a song above</div>
        )}
        {roomState.queue.map((track: any, i: number) => (
          <div key={`${track.id}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
            <span style={{ color: '#444', fontSize: '11px', width: '16px', flexShrink: 0 }}>{i + 1}</span>
            <img src={track.album.images[2]?.url || track.album.images[0]?.url} alt=""
              style={{ width: '40px', height: '40px', borderRadius: '4px', flexShrink: 0 }} />
            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <div style={{ color: '#ccc', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</div>
              <div style={{ color: '#666', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artists.map((a: any) => a.name).join(', ')}</div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes bar0 { from { height: 8px; } to { height: 18px; } }
        @keyframes bar1 { from { height: 14px; } to { height: 6px; } }
        @keyframes bar2 { from { height: 10px; } to { height: 20px; } }
      `}</style>
    </div>
  )
}

export default function GuestPage() {
  return (
    <Suspense>
      <GuestRoom />
    </Suspense>
  )
}

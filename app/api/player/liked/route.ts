import { NextResponse } from 'next/server'
import { getSession, isTokenExpired } from '@/lib/session'
import { refreshAccessToken } from '@/lib/spotify'

export async function GET() {
  const session = await getSession()

  if (!session.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (await isTokenExpired(session)) {
    try {
      const refreshed = await refreshAccessToken(session.refreshToken!)
      session.accessToken = refreshed.accessToken
      session.expiresAt = refreshed.expiresAt
      await session.save()
    } catch {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }
  }

  try {
    const totalRes = await fetch('https://api.spotify.com/v1/me/tracks?limit=1', {
      headers: { Authorization: `Bearer ${session.accessToken}` }
    })
    const totalData = await totalRes.json()
    const total = totalData.total ?? 50
    const maxOffset = Math.max(0, total - 50)
    const offset = Math.floor(Math.random() * maxOffset)

    const res = await fetch(
      `https://api.spotify.com/v1/me/tracks?limit=50&offset=${offset}`,
      { headers: { Authorization: `Bearer ${session.accessToken}` } }
    )

    if (!res.ok) throw new Error('Failed to fetch liked songs')
    const data = await res.json()

    const tracks = data.items
      .map((item: any) => item.track)
      .filter((t: any) => t && t.id && t.uri)
      .map((t: any) => ({
        id: t.id,
        name: t.name,
        uri: t.uri,
        duration_ms: t.duration_ms,
        artists: t.artists,
        album: t.album,
      }))

    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]]
    }

    return NextResponse.json({ tracks })
  } catch (err) {
    console.error('Liked songs error:', err)
    return NextResponse.json({ error: 'Failed to fetch liked songs' }, { status: 500 })
  }
}

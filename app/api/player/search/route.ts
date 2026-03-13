import { NextRequest, NextResponse } from 'next/server'
import { getSession, isTokenExpired } from '@/lib/session'
import { searchTracks, refreshAccessToken } from '@/lib/spotify'

export async function GET(request: NextRequest) {
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

  const query = request.nextUrl.searchParams.get('q')
  const playlistId = request.nextUrl.searchParams.get('playlistId')

  if (playlistId) {
    try {
      const res = await fetch(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`,
        { headers: { Authorization: `Bearer ${session.accessToken}` } }
      )
      if (!res.ok) {
        const err = await res.text()
        console.error('Spotify playlist error:', res.status, err)
        return NextResponse.json({ error: `Spotify error: ${res.status}` }, { status: 500 })
      }
      const data = await res.json()
      const tracks = (data.items ?? [])
        .map((item: any) => item?.track)
        .filter((t: any) => t && t.id && t.uri)
        .map((t: any) => ({
          id: t.id,
          name: t.name,
          uri: t.uri,
          duration_ms: t.duration_ms,
          artists: t.artists,
          album: t.album,
        }))
      return NextResponse.json({ tracks })
    } catch (err) {
      console.error('Playlist fetch error:', err)
      return NextResponse.json({ error: 'Failed to fetch playlist' }, { status: 500 })
    }
  }

  if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 })

  try {
    const results = await searchTracks(session.accessToken, query)
    return NextResponse.json({
      tracks: { items: (results.tracks?.items ?? []).filter(Boolean) },
      playlists: { items: (results.playlists?.items ?? []).filter(Boolean) },
    })
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

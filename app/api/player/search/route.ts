// app/api/player/search/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, isTokenExpired } from '@/lib/session'
import { searchTracks, refreshAccessToken } from '@/lib/spotify'

export async function GET(request: NextRequest) {
  const session = await getSession()

  if (!session.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Refresh if needed
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
  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 })
  }

  try {
    const results = await searchTracks(session.accessToken, query)
    return NextResponse.json(results)
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

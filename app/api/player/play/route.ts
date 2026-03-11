// app/api/player/play/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, isTokenExpired } from '@/lib/session'
import { playTrack, refreshAccessToken } from '@/lib/spotify'

export async function POST(request: NextRequest) {
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

  const { trackUri, positionMs, deviceId } = await request.json()

  if (!trackUri || positionMs === undefined || !deviceId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    await playTrack(session.accessToken, deviceId, trackUri, positionMs)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Play error:', err)
    return NextResponse.json({ error: 'Playback failed' }, { status: 500 })
  }
}

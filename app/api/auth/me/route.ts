// app/api/auth/me/route.ts
import { NextResponse } from 'next/server'
import { getSession, isTokenExpired } from '@/lib/session'
import { refreshAccessToken } from '@/lib/spotify'

export async function GET() {
  const session = await getSession()

  if (!session.accessToken) {
    return NextResponse.json({ authenticated: false })
  }

  // Refresh token if needed
  if (await isTokenExpired(session)) {
    try {
      const refreshed = await refreshAccessToken(session.refreshToken!)
      session.accessToken = refreshed.accessToken
      session.expiresAt = refreshed.expiresAt
      await session.save()
    } catch {
      return NextResponse.json({ authenticated: false })
    }
  }

  return NextResponse.json({
    authenticated: true,
    userId: session.userId,
    displayName: session.displayName,
    // Send token to client for Web Playback SDK
    accessToken: session.accessToken,
  })
}

export async function DELETE() {
  const session = await getSession()
  session.destroy()
  return NextResponse.json({ success: true })
}

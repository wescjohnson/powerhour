// app/api/auth/login/route.ts
import { NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/spotify'
import { randomBytes } from 'crypto'

export async function GET() {
  // Generate random state to prevent CSRF
  const state = randomBytes(16).toString('hex')

  // Store state in a short-lived cookie for validation in callback
  const authUrl = getAuthUrl(state)

  const response = NextResponse.redirect(authUrl)
  response.cookies.set('spotify_auth_state', state, {
    httpOnly: true,
    maxAge: 600, // 10 minutes
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}

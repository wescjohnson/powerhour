// app/api/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, getUserProfile } from '@/lib/spotify'
import { getSession } from '@/lib/session'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Handle user denial
  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/?error=access_denied`
    )
  }

  // Validate state to prevent CSRF
  const storedState = request.cookies.get('spotify_auth_state')?.value
  if (!state || state !== storedState) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/?error=state_mismatch`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/?error=no_code`
    )
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    // Fetch user profile
    const profile = await getUserProfile(tokens.accessToken)

    // Save to session
    const session = await getSession()
    session.accessToken = tokens.accessToken
    session.refreshToken = tokens.refreshToken
    session.expiresAt = tokens.expiresAt
    session.userId = profile.id
    session.displayName = profile.display_name
    await session.save()

    // Clear state cookie
    const response = NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/room`
    )
    response.cookies.delete('spotify_auth_state')

    return response
  } catch (err) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/?error=auth_failed`
    )
  }
}

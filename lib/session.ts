// lib/session.ts
import { getIronSession, IronSession, SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  userId?: string
  displayName?: string
}

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'powerhour_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  },
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies()
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions)
  return session
}

export async function isTokenExpired(session: SessionData): Promise<boolean> {
  if (!session.expiresAt) return true
  return Date.now() > session.expiresAt - 5 * 60 * 1000
}

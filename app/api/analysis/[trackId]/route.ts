import { NextRequest, NextResponse } from 'next/server'
import { getSession, isTokenExpired } from '@/lib/session'
import { getAudioAnalysis, refreshAccessToken } from '@/lib/spotify'
import { detectChorus, getChorusCandidates } from '@/lib/chorus-detection'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> }
) {
  const { trackId } = await params
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
    const analysis = await getAudioAnalysis(session.accessToken, trackId)
    const totalDuration = analysis.track.duration
    const chorus = detectChorus(analysis.sections, totalDuration)
    const candidates = getChorusCandidates(analysis.sections, totalDuration)

    return NextResponse.json({
      trackId,
      duration: totalDuration,
      chorus,
      candidates,
      sections: analysis.sections.map((s: any) => ({
        start: s.start,
        duration: s.duration,
        loudness: s.loudness,
        confidence: s.confidence,
      })),
    })
  } catch (err) {
    console.error('Analysis error:', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}

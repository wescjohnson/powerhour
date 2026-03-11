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
    const sections = analysis.sections

    console.log(`[Analysis] Track ${trackId}: duration=${totalDuration}s, sections=${sections?.length}`)

    const chorus = detectChorus(sections, totalDuration)
    const candidates = getChorusCandidates(sections, totalDuration)

    console.log(`[Analysis] Chorus result: positionMs=${chorus.positionMs}, confidence=${chorus.confidence}, reasoning=${chorus.reasoning}`)

    return NextResponse.json({
      trackId,
      duration: totalDuration,
      chorus,
      candidates,
      sections: sections.map((s: any) => ({
        start: s.start,
        duration: s.duration,
        loudness: s.loudness,
        confidence: s.confidence,
      })),
    })
  } catch (err) {
    console.error('[Analysis] Error:', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}

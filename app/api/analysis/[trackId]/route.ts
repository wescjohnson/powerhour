import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> }
) {
  const { trackId } = await params

  // Spotify deprecated their audio analysis API for new apps.
  // We return a 40% heuristic which reliably hits the chorus
  // for the vast majority of pop/rock/hip-hop songs.
  return NextResponse.json({
    trackId,
    chorus: {
      positionMs: null, // signals client to use duration-based calculation
      confidence: 'heuristic',
      reasoning: '40% duration heuristic',
    },
  })
}

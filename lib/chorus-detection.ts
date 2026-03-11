// lib/chorus-detection.ts
// Detects the most likely chorus position using Spotify's audio analysis data

export interface Section {
  start: number       // seconds
  duration: number    // seconds
  loudness: number    // dB, typically -60 to 0
  tempo: number
  key: number
  mode: number
  time_signature: number
  confidence: number
}

export interface ChorusResult {
  positionMs: number        // Where to start playback
  confidence: 'high' | 'medium' | 'low'
  sectionIndex: number
  reasoning: string
}

/**
 * Detect the best 60-second window to play for a Power Hour.
 * Strategy:
 * 1. Find sections that are significantly louder than the track average (chorus candidates)
 * 2. Skip the first ~20% of the track (avoid intros)
 * 3. Prefer sections that occur between 20-70% through the track
 * 4. Among candidates, pick the loudest/most energetic
 */
export function detectChorus(sections: Section[], totalDuration: number): ChorusResult {
  if (!sections || sections.length === 0) {
    // Fallback: start at 25% of track
    return {
      positionMs: Math.floor(totalDuration * 0.25 * 1000),
      confidence: 'low',
      sectionIndex: -1,
      reasoning: 'No section data available, using 25% heuristic',
    }
  }

  // Calculate average loudness across all sections
  const avgLoudness = sections.reduce((sum, s) => sum + s.loudness, 0) / sections.length

  // Define the "sweet zone" - between 20% and 70% of the track
  const sweetStart = totalDuration * 0.20
  const sweetEnd = totalDuration * 0.70

  // Score each section
  const scored = sections.map((section, index) => {
    let score = 0

    // Loudness above average is the strongest chorus signal
    const loudnessBonus = section.loudness - avgLoudness
    score += loudnessBonus * 3

    // Strong preference for sections in the sweet zone
    const sectionMid = section.start + section.duration / 2
    if (sectionMid >= sweetStart && sectionMid <= sweetEnd) {
      score += 15
    }

    // Slight penalty for very early sections (likely intros)
    if (section.start < totalDuration * 0.15) {
      score -= 20
    }

    // Penalty for very late sections (likely outros)
    if (section.start > totalDuration * 0.80) {
      score -= 10
    }

    // Prefer sections with high confidence
    score += section.confidence * 5

    return { section, index, score, loudnessBonus }
  })

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  const best = scored[0]
  const section = best.section

  // Determine confidence based on how clear the winner is
  const scoreDiff = best.score - (scored[1]?.score ?? 0)
  const confidence: ChorusResult['confidence'] =
    scoreDiff > 10 ? 'high' :
    scoreDiff > 4  ? 'medium' : 'low'

  // Start slightly before the detected chorus for context
  const startOffset = Math.max(0, section.start - 0.5)

  return {
    positionMs: Math.floor(startOffset * 1000),
    confidence,
    sectionIndex: best.index,
    reasoning: `Section at ${formatTime(section.start)}s, loudness ${section.loudness.toFixed(1)}dB (avg: ${avgLoudness.toFixed(1)}dB), score: ${best.score.toFixed(1)}`,
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Given a track's audio analysis, return all viable chorus candidates
 * sorted by likelihood. Useful for letting users pick manually.
 */
export function getChorusCandidates(
  sections: Section[],
  totalDuration: number,
  count = 3
): Array<{ positionMs: number; label: string; confidence: number }> {
  if (!sections || sections.length === 0) return []

  const avgLoudness = sections.reduce((sum, s) => sum + s.loudness, 0) / sections.length
  const sweetStart = totalDuration * 0.15
  const sweetEnd = totalDuration * 0.80

  return sections
    .filter(s => {
      const mid = s.start + s.duration / 2
      return mid >= sweetStart && mid <= sweetEnd
    })
    .map(section => ({
      positionMs: Math.floor(section.start * 1000),
      label: formatTime(section.start),
      confidence: Math.max(0, Math.min(1, (section.loudness - avgLoudness + 10) / 20)),
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, count)
}

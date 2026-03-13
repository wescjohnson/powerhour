import { NextRequest, NextResponse } from 'next/server'

const rooms: Record<string, {
  queue: any[]
  currentTrack: any | null
  phase: string
  timeLeft: number
  updatedAt: number
}> = {}

export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get('roomId')
  if (!roomId) return NextResponse.json({ error: 'Missing roomId' }, { status: 400 })
  const room = rooms[roomId]
  if (!room) return NextResponse.json({ queue: [], currentTrack: null, phase: 'waiting', timeLeft: 60 })
  return NextResponse.json(room)
}

export async function POST(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get('roomId')
  if (!roomId) return NextResponse.json({ error: 'Missing roomId' }, { status: 400 })
  const { track } = await req.json()
  if (!track) return NextResponse.json({ error: 'Missing track' }, { status: 400 })
  if (!rooms[roomId]) {
    rooms[roomId] = { queue: [], currentTrack: null, phase: 'waiting', timeLeft: 60, updatedAt: Date.now() }
  }
  rooms[roomId].queue.push(track)
  rooms[roomId].updatedAt = Date.now()
  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get('roomId')
  if (!roomId) return NextResponse.json({ error: 'Missing roomId' }, { status: 400 })
  const body = await req.json()
  if (!rooms[roomId]) {
    rooms[roomId] = { queue: [], currentTrack: null, phase: 'waiting', timeLeft: 60, updatedAt: Date.now() }
  }
  rooms[roomId] = { ...rooms[roomId], ...body, updatedAt: Date.now() }
  return NextResponse.json({ ok: true })
}

const startNextRound = useCallback(async () => {
    let q = queueRef.current

    // Queue is empty — pull from liked songs
    if (q.length === 0) {
      setPhase('analyzing')
      try {
        const res = await fetch('/api/player/liked')
        const data = await res.json()
        if (data.tracks && data.tracks.length > 0) {
          // Take 10 songs from liked songs and add to queue
          const refill = data.tracks.slice(0, 10).map((t: any) => ({
            ...t,
            analysisReady: false,
          }))
          setQueue(refill)
          queueRef.current = refill
          q = refill

          // Pre-fetch chorus for all refilled songs in background
          refill.forEach((track: any) => {
            fetchChorusPosition(track.id, track.duration_ms).then(chorusMs => {
              setQueue(prev => prev.map(t =>
                t.id === track.id && !t.analysisReady
                  ? { ...t, chorusMs, analysisReady: true }
                  : t
              ))
            })
          })
        } else {
          setPhase('waiting')
          setCurrentTrack(null)
          return
        }
      } catch {
        setPhase('waiting')
        setCurrentTrack(null)
        return
      }
    }

    const next = q[0]
    setQueue(prev => prev.slice(1))
    setCurrentTrack(next)
    setRoundNumber(n => n + 1)

    setPhase('analyzing')
    const chorusMs = next.chorusMs ?? await fetchChorusPosition(next.id, next.duration_ms)

    setPhase('playing')
    await play(next.uri, chorusMs)

    roundStartRef.current = Date.now()
    setTimeLeft(60)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - roundStartRef.current) / 1000
      const left = Math.max(0, 60 - elapsed)
      setTimeLeft(Math.ceil(left))
      if (left <= 0) {
        clearInterval(timerRef.current!)
        pause()
        setPhase('between')
        setTimeout(() => { if (startNextRoundRef.current) startNextRoundRef.current() }, 2000)
      }
    }, 250)
  }, [play, pause])

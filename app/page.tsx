import Link from 'next/link'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const error = params.error

  const errorMessages: Record<string, string> = {
    access_denied: 'Spotify access was denied.',
    state_mismatch: 'Security check failed. Try again.',
    auth_failed: 'Authentication failed. Try again.',
    no_premium: 'Spotify Premium is required for playback.',
  }

  const errorMessage = error ? errorMessages[error] : null

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(29,185,84,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(29,185,84,0.03) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(29,185,84,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', textAlign: 'center', maxWidth: '480px' }}>
        <div style={{ fontSize: '64px', marginBottom: '1rem' }}>🍺</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(72px, 12vw, 120px)', lineHeight: 0.9, letterSpacing: '0.02em', color: '#fff', marginBottom: '0.25rem' }}>POWER</h1>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(72px, 12vw, 120px)', lineHeight: 0.9, letterSpacing: '0.02em', color: 'var(--green)', marginBottom: '2rem' }}>HOUR</h1>
        <p style={{ color: 'var(--text-mid)', marginBottom: '2.5rem', lineHeight: 1.6, fontSize: '13px' }}>
          60 songs. 60 seconds each.<br />Chorus only. No intros. No mercy.
        </p>
        {errorMessage && (
          <div style={{ background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.3)', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1.5rem', color: '#ff6b6b', fontSize: '13px' }}>
            {errorMessage}
          </div>
        )}
        <Link href="/api/auth/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'var(--green)', color: '#000', padding: '14px 32px', borderRadius: '40px', fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: '14px', textDecoration: 'none', letterSpacing: '0.05em' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Connect with Spotify
        </Link>
        <p style={{ marginTop: '1.5rem', color: 'var(--text-muted)', fontSize: '11px' }}>Spotify Premium required for playback</p>
      </div>
    </main>
  )
}

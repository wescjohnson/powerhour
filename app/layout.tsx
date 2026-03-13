import type { Metadata } from 'next'
import type { Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Power Hour',
  description: 'Spotify-powered power hour — one minute, chorus only',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

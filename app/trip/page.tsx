'use client'
import { useEffect, useState } from 'react'
import LZString from 'lz-string'
import TripView, { Itinerary } from './TripView'

export default function TripPage() {
  const [itin, setItin] = useState<Itinerary | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) { setError(true); return }
    try {
      const decompressed = LZString.decompressFromEncodedURIComponent(hash)
      const json = decompressed ?? decodeURIComponent(hash)
      setItin(JSON.parse(json))
    } catch {
      setError(true)
    }
  }, [])

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Georgia, serif', color: '#aaa' }}>
      This link doesn&apos;t look right.
    </div>
  )

  if (!itin) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Georgia, serif', color: '#aaa' }}>
      Loading…
    </div>
  )

  return <TripView itin={itin} />
}

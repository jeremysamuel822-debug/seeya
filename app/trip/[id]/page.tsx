import { notFound } from 'next/navigation'
import TripView from '../TripView'

export default async function TripIdPage({ params }: { params: { id: string } }) {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  const res = await fetch(`${base}/api/trips?id=${params.id}`, { cache: 'force-cache' })
  if (!res.ok) notFound()

  const itin = await res.json()
  return <TripView itin={itin} />
}

import { notFound } from 'next/navigation'
import TripView from '../TripView'
import { getTrip } from '@/lib/trips'

export default async function TripIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const itin = await getTrip(id)
  if (!itin) notFound()
  return <TripView itin={itin} />
}

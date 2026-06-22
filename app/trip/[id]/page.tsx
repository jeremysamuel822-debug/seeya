import { notFound } from 'next/navigation'
import TripView from '../TripView'
import { getTrip } from '@/lib/trips'

export default async function TripIdPage({ params }: { params: { id: string } }) {
  const itin = await getTrip(params.id)
  if (!itin) notFound()
  return <TripView itin={itin} />
}

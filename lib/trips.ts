const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY!

export async function saveTrip(data: unknown): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trips`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ data }),
  })

  if (!res.ok) throw new Error(await res.text())
  const [row] = await res.json()
  return row.id
}

export async function getTrip(id: string): Promise<any | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/trips?id=eq.${encodeURIComponent(id)}&select=data`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      cache: 'no-store',
    }
  )

  if (!res.ok) throw new Error(await res.text())
  const rows = await res.json()
  return rows?.length ? rows[0].data : null
}

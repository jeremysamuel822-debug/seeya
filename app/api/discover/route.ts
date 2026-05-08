import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const { destination, vibe, tripType, budget } = await req.json()
  if (!destination) return NextResponse.json({ error: 'Destination required' }, { status: 400 })

  const query = [destination, vibe, tripType, 'travel guide'].filter(Boolean).join(' ')

  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?q=${encodeURIComponent(query)}&type=video&maxResults=6&part=snippet&key=${process.env.YOUTUBE_API_KEY}`
  )
  const searchData = await searchRes.json()

  if (!searchData.items?.length) {
    return NextResponse.json({ error: 'No results found' }, { status: 404 })
  }

  const results = await Promise.all(
    searchData.items.map(async (item: any) => {
      const videoId = item.id?.videoId
      if (!videoId) return null
      const snippet = item.snippet
      const channelName = snippet.channelTitle
      const channelHandle = '@' + channelName.replace(/\s+/g, '').toLowerCase()

      const prompt = [
        `Extract travel locations from this YouTube video about ${destination}.`,
        '',
        'Title: ' + snippet.title,
        'Description: ' + (snippet.description || '').slice(0, 800),
        '',
        'Return ONLY valid JSON, no other text:',
        '{',
        '  "destination_city": "main city",',
        '  "destination_country": "country",',
        '  "vibe_tags": ["tag1", "tag2", "tag3"],',
        '  "locations": [',
        '    {',
        '      "name": "place name",',
        '      "type": "restaurant or attraction or hotel or experience",',
        '      "city": "city",',
        '      "notes": "one line about this place",',
        '      "estimated_cost": "free or $ or $$ or $$$"',
        '    }',
        '  ]',
        '}'
      ].join('\n')

      try {
        const msg = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }]
        })
        const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
        const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim()
        const extracted = JSON.parse(cleaned)
        return {
          videoId,
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          title: snippet.title,
          channelName,
          channelHandle,
          thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
          destination_city: extracted.destination_city || destination,
          destination_country: extracted.destination_country || '',
          vibe_tags: extracted.vibe_tags || [],
          locations: (extracted.locations || []).map((l: any) => ({ ...l, creator: channelHandle }))
        }
      } catch {
        return null
      }
    })
  )

  return NextResponse.json(results.filter(Boolean))
}

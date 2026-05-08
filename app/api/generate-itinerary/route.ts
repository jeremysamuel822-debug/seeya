import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const { locations, city, country, vibe_tags, days = 3 } = await req.json()

  if (!locations || locations.length === 0) {
    return NextResponse.json({ error: 'No locations provided' }, { status: 400 })
  }

  const locationList = locations
    .map((l: any) => `- ${l.name} (${l.type}, ${l.estimated_cost})${l.creator ? ` [via ${l.creator}]` : ''}: ${l.notes}`)
    .join('\n')

  const prompt = [
    `You are a travel itinerary planner. Create a ${days}-day itinerary for ${city}, ${country}.`,
    '',
    'Vibe: ' + (vibe_tags?.join(', ') || 'general travel'),
    '',
    "Known locations from the user's saved content:",
    locationList,
    '',
    'Instructions:',
    '- Organize the known locations into logical days (by proximity, meal timing, etc.)',
    '- Fill gaps with 1-2 real additional suggestions per day that match the vibe',
    '- Each day should have morning, afternoon, and evening slots',
    '- Keep it practical and fun',
    '',
    'Return ONLY valid JSON, no other text:',
    '{',
    '  "title": "trip title",',
    '  "city": "' + city + '",',
    '  "country": "' + country + '",',
    '  "days": [',
    '    {',
    '      "day": 1,',
    '      "theme": "one line theme for the day",',
    '      "slots": [',
    '        {',
    '          "time": "Morning",',
    '          "name": "place name",',
    '          "type": "restaurant or attraction or hotel or experience",',
    '          "notes": "what to do / order / see",',
    '          "estimated_cost": "free or $ or $$ or $$$",',
    '          "from_saved": true,',
    '          "creator": "copy @handle from location [via tag] if present, else null"',
    '        }',
    '      ]',
    '    }',
    '  ]',
    '}'
  ].join('\n')

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }]
  })

  try {
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim()
    const itinerary = JSON.parse(cleaned)
    return NextResponse.json(itinerary)
  } catch (err) {
    console.log('Parse error:', err)
    return NextResponse.json({ error: 'Could not generate itinerary' }, { status: 500 })
  }
}
import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const { locations, city, country, vibe_tags, days = 3, travelers, budget, focus, priorities, vibe } = await req.json()

  if (!locations || locations.length === 0) {
    return NextResponse.json({ error: 'No locations provided' }, { status: 400 })
  }

  const savedNames = new Set(locations.map((l: any) => l.name.toLowerCase()))

  const locationList = locations
    .map((l: any) => {
      const time = l.suggested_time ? ` [creator says: ${l.suggested_time}]` : ''
      return `- ${l.name} (${l.type}, ${l.estimated_cost})${time}${l.creator ? ` [via ${l.creator}]` : ''}: ${l.notes}`
    })
    .join('\n')

  const profileLines = [
    travelers  && `Traveling with: ${travelers}`,
    budget     && `Budget: ${budget}`,
    vibe       && `Vibe: ${vibe}`,
    focus?.length   && `Trip focus: ${focus.join(', ')}`,
    priorities?.length && `Planning priorities: ${priorities.join(', ')}`,
  ].filter(Boolean).join('\n')

  const prompt = [
    `You are a travel itinerary planner. Create a ${days}-day itinerary for ${city}, ${country}.`,
    '',
    'Traveler profile:',
    profileLines || 'No profile provided — use general travel preferences.',
    '',
    'Content vibe tags: ' + (vibe_tags?.join(', ') || 'general travel'),
    '',
    "Known locations from the user's saved content:",
    locationList,
    '',
    'Instructions:',
    '- Schedule every saved location across the days before adding anything yourself.',
    '- Saved restaurants and cafes are the priority for meal slots — place them at the time the creator specified (use [creator says: X] tags).',
    '- Only add an AI-suggested restaurant (from_saved: false) for a specific meal slot (breakfast, lunch, or dinner) if that day has NO saved restaurant covering that slot. Do not add AI restaurants just to fill space.',
    '- If a day has saved restaurants covering lunch and dinner, do not add any more restaurants — use only what the creator recommended.',
    '- Keep each day to a realistic pace: roughly 4-6 stops total.',
    '- Respect the budget level for any AI-added places.',
    `- Tailor AI additions to a ${travelers || 'general'} trip — e.g. girls trips get aesthetic cafes, honeymoons get romantic dinners, families get kid-friendly spots.`,
    '- Each day should flow naturally: morning activity, lunch, afternoon activity, dinner.',
    '- IMPORTANT: set "from_saved" to true ONLY for places that appear exactly in the known locations list above. Set it to false for every place you add yourself.',
    '- IMPORTANT: if a location has a [creator says: X] tag, you MUST schedule it at that time of day (e.g. "lunch" → midday slot, "dinner" → evening slot). Never move it.',
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

    // Enforce from_saved — Claude sometimes gets this wrong
    for (const day of itinerary.days ?? []) {
      for (const slot of day.slots ?? []) {
        slot.from_saved = savedNames.has(slot.name?.toLowerCase())
      }
    }

    return NextResponse.json(itinerary)
  } catch (err) {
    console.log('Parse error:', err)
    return NextResponse.json({ error: 'Could not generate itinerary' }, { status: 500 })
  }
}
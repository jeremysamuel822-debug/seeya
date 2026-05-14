import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const { locations, city, country, vibe_tags, days = 3, travelers, budget, focus, priorities, vibe } = await req.json()

  if (!locations || locations.length === 0) {
    return NextResponse.json({ error: 'No locations provided' }, { status: 400 })
  }

  const savedNames = new Set(locations.map((l: any) => l.name.toLowerCase()))

  const savedRestaurants = locations.filter((l: any) => l.type === 'restaurant' || l.type === 'cafe')
  const savedAttractions = locations.filter((l: any) => l.type !== 'restaurant' && l.type !== 'cafe' && l.type !== 'hotel')
  const savedHotels = locations.filter((l: any) => l.type === 'hotel')

  const fmtLocation = (l: any) => {
    const time = l.suggested_time ? ` [creator says: ${l.suggested_time}]` : ''
    return `- ${l.name} (${l.type}, ${l.estimated_cost})${time}${l.creator ? ` [via ${l.creator}]` : ''}: ${l.notes}`
  }

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
    'Saved restaurants/cafes from the user\'s content:',
    savedRestaurants.length > 0 ? savedRestaurants.map(fmtLocation).join('\n') : '(none)',
    '',
    'Saved attractions/neighborhoods from the user\'s content:',
    savedAttractions.length > 0 ? savedAttractions.map(fmtLocation).join('\n') : '(none)',
    '',
    savedHotels.length > 0 ? 'Saved hotels:\n' + savedHotels.map(fmtLocation).join('\n') : '',
    '',
    'OUTPUT STRUCTURE: Return three sections — hotels, restaurants, and days.',
    '',
    'HOTELS section:',
    '- Suggest 2–3 hotel options at different price points that fit the traveler profile.',
    '- If a hotel appears in the saved list above, include it and mark from_saved: true. Fill remaining options with AI picks.',
    '- Each hotel needs a name, neighborhood/area, brief notes on why it\'s a good fit, and estimated_cost.',
    '',
    'RESTAURANTS section:',
    '- Include ALL saved restaurants/cafes — every single one, no skipping.',
    '- For each, assign a meal tag: "breakfast", "lunch", "dinner", or "any".',
    '- Use [creator says: X] hints to assign the right meal. If no hint, use your best judgment based on the type of place.',
    '- Add AI-suggested restaurants (from_saved: false) to ensure each meal type (breakfast, lunch, dinner) has at least 2 options.',
    '- RESERVATION URL: set "reservation_url" to "resy" or "opentable" ONLY if you are 100% certain this exact restaurant is on that platform. Otherwise null.',
    '',
    'DAYS section (activity-focused itinerary):',
    '- EVERY saved attraction/neighborhood MUST appear in the day plan.',
    '- Focus day slots on activities, attractions, neighborhoods, and experiences — NOT restaurants (those are in the restaurants section).',
    '- You may add a light food note in a slot\'s notes field (e.g. "great area for lunch after") but do not create dedicated restaurant slots.',
    '- Exception: if a saved restaurant has a [creator says: X] time tag, you may include it as a day slot at that time.',
    '- Every day must have 4–6 slots. Fill gaps with genuinely excellent AI-suggested attractions for the city.',
    '- Each day should flow naturally by area/neighborhood to minimize travel.',
    `- Tailor AI additions to a ${travelers || 'general'} trip.`,
    '- IMPORTANT: set from_saved: true ONLY for places from the saved lists above.',
    '',
    'Return ONLY valid JSON, no other text:',
    '{',
    '  "title": "trip title",',
    '  "city": "' + city + '",',
    '  "country": "' + country + '",',
    '  "hotels": [',
    '    {',
    '      "name": "hotel name",',
    '      "area": "neighborhood or district",',
    '      "notes": "why it\'s a good pick",',
    '      "estimated_cost": "$ or $$ or $$$",',
    '      "from_saved": false',
    '    }',
    '  ],',
    '  "restaurants": [',
    '    {',
    '      "name": "restaurant name",',
    '      "meal": "breakfast or lunch or dinner or any",',
    '      "notes": "what to order / vibe",',
    '      "estimated_cost": "free or $ or $$ or $$$",',
    '      "from_saved": true,',
    '      "creator": "@handle or null",',
    '      "reservation_url": "resy or opentable or null"',
    '    }',
    '  ],',
    '  "days": [',
    '    {',
    '      "day": 1,',
    '      "theme": "one line theme for the day",',
    '      "slots": [',
    '        {',
    '          "time": "Morning",',
    '          "name": "place name",',
    '          "type": "attraction or experience or neighborhood",',
    '          "notes": "what to do / see",',
    '          "estimated_cost": "free or $ or $$ or $$$",',
    '          "from_saved": true,',
    '          "creator": "@handle or null"',
    '        }',
    '      ]',
    '    }',
    '  ]',
    '}'
  ].join('\n')

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }]
  })

  try {
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim()
    const itinerary = JSON.parse(cleaned)

    // Build a name→creator lookup from saved locations
    const creatorByName: Record<string, string> = {}
    for (const l of locations) {
      if (l.creator) creatorByName[l.name.toLowerCase()] = l.creator
    }

    // Enforce from_saved + creator on restaurants
    for (const r of itinerary.restaurants ?? []) {
      const key = r.name?.toLowerCase()
      r.from_saved = savedNames.has(key)
      if (r.from_saved && creatorByName[key]) r.creator = creatorByName[key]
    }

    // Enforce from_saved + creator on day slots + sort + dedup
    const TIME_ORDER = ['Morning', 'Lunch', 'Noon', 'Afternoon', 'Dinner', 'Evening']

    for (const day of itinerary.days ?? []) {
      for (const slot of day.slots ?? []) {
        const key = slot.name?.toLowerCase()
        slot.from_saved = savedNames.has(key)
        if (slot.from_saved && creatorByName[key]) slot.creator = creatorByName[key]
      }

      day.slots.sort((a: any, b: any) => {
        const ai = TIME_ORDER.indexOf(a.time)
        const bi = TIME_ORDER.indexOf(b.time)
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      })

      const usedTimes = new Set<string>()
      for (const slot of day.slots ?? []) {
        if (usedTimes.has(slot.time)) {
          const idx = TIME_ORDER.indexOf(slot.time)
          for (let i = idx + 1; i < TIME_ORDER.length; i++) {
            if (!usedTimes.has(TIME_ORDER[i])) { slot.time = TIME_ORDER[i]; break }
          }
        }
        usedTimes.add(slot.time)
      }
    }

    return NextResponse.json(itinerary)
  } catch (err) {
    console.log('Parse error:', err)
    return NextResponse.json({ error: 'Could not generate itinerary' }, { status: 500 })
  }
}

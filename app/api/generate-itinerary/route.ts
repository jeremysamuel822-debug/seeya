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
    `- Target exactly ${days * 3} restaurants total (3 per day — one breakfast, one lunch, one dinner per day).`,
    '- Include ALL saved restaurants/cafes first. If there are more than the target, still include all of them.',
    '- Fill remaining slots with AI-suggested restaurants (from_saved: false) to reach the target, ensuring a good mix of breakfast, lunch, and dinner across all days.',
    '- For each, assign a meal tag: "breakfast", "lunch", "dinner", or "any".',
    '- Use [creator says: X] hints to assign the right meal. If no hint, use your best judgment based on the type of place.',
    '- SUGGESTED DAY: for each restaurant, set "suggested_day" to the day number (1, 2, 3…) whose activities are nearest to that restaurant by neighborhood. Match based on geography — a restaurant in Vesterbro should get the day where the day plan is in Vesterbro.',
    '- RESERVATION URL: set "reservation_url" to "resy" or "opentable" ONLY if you are 100% certain this exact restaurant is on that platform. Otherwise null.',
    '',
    `DAYS section (activity-focused itinerary — ${days} days × 4 slots = ${days * 4} total activity slots):`,
    `- You have ${savedAttractions.length} saved attractions/neighborhoods to place. Spread them evenly across all ${days} days — do NOT cluster them all in the first few days.`,
    `- Aim for roughly ${Math.floor(savedAttractions.length / days)}–${Math.ceil(savedAttractions.length / days)} saved attractions per day, filling remaining slots with AI-suggested places.`,
    '- EVERY saved attraction/neighborhood MUST appear — no skipping, no dropping.',
    '- Day slots are for activities, attractions, neighborhoods, and experiences ONLY. Never add a restaurant or hotel as a day slot.',
    '- Each day has exactly 4 slots: Morning, Midday, Afternoon, Evening. No more, no less.',
    '- TIME VALUES: use ONLY these four values: Morning, Midday, Afternoon, Evening. Never use Lunch, Dinner, Late Morning, Late Afternoon, Noon, Night, or anything else.',
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
    '      "suggested_day": 1,',
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
    '          "time": "Morning or Midday or Afternoon or Evening",',
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

    // Normalize any time value Claude invents to one of our four valid values
    function normalizeTime(t: string): 'Morning' | 'Midday' | 'Afternoon' | 'Evening' {
      const lower = (t ?? '').toLowerCase()
      if (lower.includes('evening') || lower.includes('dinner') || lower.includes('night')) return 'Evening'
      if (lower.includes('afternoon') || lower.includes('late')) return 'Afternoon'
      if (lower.includes('midday') || lower.includes('lunch') || lower.includes('noon')) return 'Midday'
      return 'Morning'
    }

    // Enforce from_saved + creator + time on day slots, then sort + dedup
    const TIME_ORDER = ['Morning', 'Midday', 'Afternoon', 'Evening']

    for (const day of itinerary.days ?? []) {
      for (const slot of day.slots ?? []) {
        const key = slot.name?.toLowerCase()
        slot.from_saved = savedNames.has(key)
        if (slot.from_saved && creatorByName[key]) slot.creator = creatorByName[key]
        slot.time = normalizeTime(slot.time)
      }

      day.slots.sort((a: any, b: any) => {
        const ai = TIME_ORDER.indexOf(a.time)
        const bi = TIME_ORDER.indexOf(b.time)
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      })

      // Keep only the first slot per time bucket — drop any overflow
      const usedTimes = new Set<string>()
      day.slots = day.slots.filter((slot: any) => {
        if (usedTimes.has(slot.time)) return false
        usedTimes.add(slot.time)
        return true
      })
    }

    return NextResponse.json(itinerary)
  } catch (err) {
    console.log('Parse error:', err)
    return NextResponse.json({ error: 'Could not generate itinerary' }, { status: 500 })
  }
}

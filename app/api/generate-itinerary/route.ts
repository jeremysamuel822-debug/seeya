import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const { locations, city, country, vibe_tags, days = 3, travelers, budget, focus, priorities, vibe } = await req.json()

  if (!locations || locations.length === 0) {
    return NextResponse.json({ error: 'No locations provided' }, { status: 400 })
  }

  const savedNames = new Set(locations.map((l: any) => l.name.toLowerCase()))
  const requiredTimes: Record<string, string> = {}
  for (const l of locations) {
    if (l.suggested_time) requiredTimes[l.name.toLowerCase()] = l.suggested_time
  }

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
    '- EVERY saved location MUST appear in the itinerary — no exceptions, no skipping. This is mandatory.',
    '- If multiple saved restaurants are in the same area and would normally share a meal slot (e.g. three Chinatown spots for lunch), use the most notable one as the slot name and list the others as alternatives in the notes field. Do NOT drop them.',
    '- Neighborhoods and areas from the saved list must appear as their own slot — use them as afternoon or morning exploration stops.',
    '- Saved restaurants and cafes are the priority for meal slots — place them at the time the creator specified (use [creator says: X] tags).',
    '- Only add an AI-suggested restaurant (from_saved: false) for a specific meal slot (breakfast, lunch, or dinner) if that day has NO saved restaurant covering that slot. Do not add AI restaurants just to fill space.',
    '- If a day has saved restaurants covering lunch and dinner, do not add any more restaurants — use only what the creator recommended.',
    '- Keep each day to a realistic pace: roughly 4-6 stops total.',
    '- Respect the budget level for any AI-added places.',
    `- Tailor AI additions to a ${travelers || 'general'} trip — e.g. girls trips get aesthetic cafes, honeymoons get romantic dinners, families get kid-friendly spots.`,
    '- Each day should flow naturally: morning activity, lunch, afternoon activity, dinner.',
    '- HOTEL RULE: Every itinerary must include exactly one hotel as a "Check in" slot on Day 1 Morning. If a hotel appears in the known locations list, use that one (from_saved: true). If not, suggest a real hotel near the main activity areas for the trip (from_saved: false). The hotel should be well-located relative to the day\'s other stops — same neighborhood or district where possible.',
    '- IMPORTANT: set "from_saved" to true ONLY for places that appear exactly in the known locations list above. Set it to false for every place you add yourself.',
    '- IMPORTANT: if a location has a [creator says: X] tag, you MUST schedule it at that time of day (e.g. "lunch" → midday slot, "dinner" → evening slot). Never move it.',
    '- RESERVATION URL RULE: For restaurant slots only, set "reservation_url" to the booking platform the restaurant uses: "resy" if they take reservations on Resy, "opentable" if they use OpenTable, or null if the restaurant is casual/walk-in only, is a market stall, or you are not confident which platform they use. Do NOT invent or guess a URL — only return a platform name or null.',
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
    '          "creator": "copy @handle from location [via tag] if present, else null",',
    '          "reservation_url": "resy or opentable or null"',
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

    // Enforce from_saved and creator-specified times server-side
    const timeLabel: Record<string, string> = {
      morning: 'Morning', lunch: 'Lunch', afternoon: 'Afternoon',
      dinner: 'Dinner', evening: 'Evening'
    }
    const TIME_ORDER = ['Morning', 'Lunch', 'Noon', 'Afternoon', 'Dinner', 'Evening']

    for (const day of itinerary.days ?? []) {
      for (const slot of day.slots ?? []) {
        const key = slot.name?.toLowerCase()
        slot.from_saved = savedNames.has(key)
        if (key && requiredTimes[key]) {
          slot.time = timeLabel[requiredTimes[key]] ?? slot.time
        }
      }

      // Sort slots by canonical time order
      day.slots.sort((a: any, b: any) => {
        const ai = TIME_ORDER.indexOf(a.time)
        const bi = TIME_ORDER.indexOf(b.time)
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      })

      // Deduplicate: bump second slot with same time to next available slot
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
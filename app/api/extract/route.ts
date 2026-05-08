import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic()

function detectPlatform(url: string) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('instagram.com')) return 'instagram'
  if (url.includes('tiktok.com')) return 'tiktok'
  if (url.includes('pinterest.com') || url.includes('pin.it')) return 'pinterest'
  return 'blog'
}

async function getYouTubeData(url: string) {
  const videoId = url.match(/(?:shorts\/|v=|youtu\.be\/)([^&?/]+)/)?.[1]
  if (!videoId) return null
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${process.env.YOUTUBE_API_KEY}`
  )
  const data = await res.json()
  const snippet = data.items?.[0]?.snippet
  return snippet ? { title: snippet.title, description: snippet.description } : null
}

export async function POST(req: NextRequest) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 })

  const platform = detectPlatform(url)
  let title = ''
  let content = ''

  if (platform === 'youtube') {
    const data = await getYouTubeData(url)
    title = data?.title || ''
    content = data?.description || ''
  }

  if (!content && !title) {
    return NextResponse.json({ error: 'Could not read this link' }, { status: 422 })
  }

  const prompt = [
    'You are a travel content analyst. Extract travel locations from this video/post.',
    '',
    'Title: ' + title,
    'Content: ' + content.slice(0, 2000),
    '',
    'Instructions:',
    '- If specific places are named (restaurants, hotels, attractions), extract them exactly.',
    '- If NO specific places are named but a city/country is mentioned or implied, suggest 3-5 real, well-known places that match the vibe of the content.',
    '- Always populate the locations array — never return it empty.',
    '- Infer vibe_tags from the tone and content style.',
    '',
    'Return ONLY valid JSON, no other text:',
    '{',
    '  "destination_city": "main city",',
    '  "destination_country": "country",',
    '  "vibe_tags": ["foodie", "aesthetic", "budget", "hidden gem"],',
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

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  })

  try {
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim()
    const extracted = JSON.parse(cleaned)
    return NextResponse.json({ platform, title, ...extracted })
  } catch (err) {
    console.log('Parse error:', err)
    return NextResponse.json({ error: 'Could not extract locations' }, { status: 500 })
  }
}
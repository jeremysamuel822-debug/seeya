import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

const client = new Anthropic()


function detectPlatform(url: string) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('instagram.com')) return 'instagram'
  if (url.includes('tiktok.com')) return 'tiktok'
  if (url.includes('pinterest.com') || url.includes('pin.it')) return 'pinterest'
  return 'blog'
}

async function getTikTokData(url: string) {
  const apiKey = process.env.SUPADATA_API_KEY
  if (!apiKey) return null

  const [transcriptRes, metadataRes] = await Promise.allSettled([
    fetch(`https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(url)}&text=true`, {
      headers: { 'x-api-key': apiKey }
    }).then(r => r.ok ? r.json() : null),
    fetch(`https://api.supadata.ai/v1/metadata?url=${encodeURIComponent(url)}`, {
      headers: { 'x-api-key': apiKey }
    }).then(r => r.ok ? r.json() : null)
  ])

  const transcriptData = transcriptRes.status === 'fulfilled' ? transcriptRes.value : null
  const metadata = metadataRes.status === 'fulfilled' ? metadataRes.value : null

  const rawText: string = transcriptData?.content ?? ''
  const text = rawText.length >= 100 ? rawText.replace(/\[.*?\]/g, ' ').replace(/\s+/g, ' ').trim() : ''

  const description: string = metadata?.description ?? ''
  const title: string = metadata?.title || description.slice(0, 80) || ''
  const creator: string = metadata?.author?.username || metadata?.author?.displayName || ''

  return { title, creator, transcript: text, description, isTranscript: text.length > 0 }
}

function extractVideoId(url: string) {
  return url.match(/(?:shorts\/|v=|youtu\.be\/)([^&?/]+)/)?.[1] ?? null
}

async function fetchTranscript(videoId: string): Promise<string> {
  const apiKey = process.env.SUPADATA_API_KEY
  if (!apiKey) return ''

  const res = await fetch(`https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=true`, {
    headers: { 'x-api-key': apiKey }
  })
  if (!res.ok) return ''

  const data = await res.json()
  const text: string = data?.content ?? ''
  return text.replace(/\[.*?\]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function getYouTubeData(url: string) {
  const videoId = extractVideoId(url)
  if (!videoId) return null

  const [apiRes, transcriptText] = await Promise.allSettled([
    fetch(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${process.env.YOUTUBE_API_KEY}`)
      .then(r => r.json()),
    fetchTranscript(videoId)
  ])

  const snippet = apiRes.status === 'fulfilled' ? apiRes.value?.items?.[0]?.snippet : null
  const rawText = transcriptText.status === 'fulfilled' ? transcriptText.value : ''
  // Discard transcripts that are just music/noise (under 100 chars after cleaning)
  const text = rawText.length >= 100 ? rawText : ''

  return snippet ? {
    title: snippet.title as string,
    creator: snippet.channelTitle as string,
    transcript: text,
    description: snippet.description as string || '',
    isTranscript: text.length > 0
  } : null
}

export async function POST(req: NextRequest) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 })

  const platform = detectPlatform(url)
  let title = ''
  let isTranscript = false
  let creator = ''
  let transcript = ''
  let description = ''
  if (platform === 'youtube') {
    const data = await getYouTubeData(url)
    title = data?.title ?? ''
    creator = data?.creator ?? ''
    transcript = data?.transcript ?? ''
    description = data?.description ?? ''
    isTranscript = data?.isTranscript ?? false
  } else if (platform === 'tiktok') {
    const data = await getTikTokData(url)
    title = data?.title ?? ''
    creator = data?.creator ?? ''
    transcript = data?.transcript ?? ''
    description = data?.description ?? ''
    isTranscript = data?.isTranscript ?? false
  }

  const content = transcript || description
  if (!content && !title) {
    return NextResponse.json({ error: 'Could not read this link', debugPlatform: platform, debugHasKey: !!process.env.SUPADATA_API_KEY }, { status: 422 })
  }

  const contentSection = [
    transcript ? 'Transcript (spoken words — may contain speech-to-text errors): ' + transcript.slice(0, 6000) : '',
    description ? 'Description (written by creator — use this to verify spelling of place names): ' + description.slice(0, 3000) : '',
  ].filter(Boolean).join('\n\n')

  const prompt = [
    'You are a travel content analyst. Extract every place a creator explicitly names in this video.',
    '',
    'Title: ' + title,
    contentSection,
    '',
    'RULES:',
    '- Include EVERY place the creator names — restaurants, bars, cafes, landmarks, museums, parks, neighborhoods, bridges, observation decks, experiences. All of them.',
    '- Use the description to verify the correct spelling of place names — transcripts may contain speech-to-text errors (e.g. "Ater September" in transcript → "Atelier September" in description → use "Atelier September").',
    '- DO NOT invent names for vague descriptions. "A famous pizza spot" with no name → skip. But "Joe\'s Pizza" → include.',
    '- For each place, capture the time context: "have breakfast at X" → morning, "lunch at Y" → lunch, "dinner at Z" → dinner, "cap off the night at W" → evening, "afternoon stop at V" → afternoon. Use: morning, lunch, afternoon, dinner, evening, or null.',
    '- If no places are named at all, suggest 3-5 real places matching the city and vibe.',
    '- Always return a non-empty locations array.',
    '- Infer vibe_tags from tone and content.',
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
    '      "estimated_cost": "free or $ or $$ or $$$",',
    '      "suggested_time": "morning or lunch or afternoon or dinner or evening or null"',
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
    const extracted = JSON.parse(cleaned)
    return NextResponse.json({ platform, title, creator: creator || undefined, _isTranscript: isTranscript, ...extracted })
  } catch (err) {
    console.log('Parse error:', err)
    return NextResponse.json({ error: 'Could not extract locations' }, { status: 500 })
  }
}

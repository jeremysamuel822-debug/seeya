import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic()

const ANDROID_VERSION = '20.10.38'
const ANDROID_UA = `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 14)`

function detectPlatform(url: string) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('instagram.com')) return 'instagram'
  if (url.includes('tiktok.com')) return 'tiktok'
  if (url.includes('pinterest.com') || url.includes('pin.it')) return 'pinterest'
  return 'blog'
}

function extractVideoId(url: string) {
  return url.match(/(?:shorts\/|v=|youtu\.be\/)([^&?/]+)/)?.[1] ?? null
}

async function fetchTranscript(videoId: string): Promise<string> {
  // Use InnerTube player API with Android client — not blocked by YouTube on server-side
  const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': ANDROID_UA },
    body: JSON.stringify({
      context: { client: { clientName: 'ANDROID', clientVersion: ANDROID_VERSION } },
      videoId,
    })
  })
  if (!playerRes.ok) return ''

  const data = await playerRes.json()
  const captionTracks: Array<{ baseUrl: string; languageCode: string; kind?: string }> =
    data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
  if (captionTracks.length === 0) return ''

  const track = captionTracks[0]
  const xmlRes = await fetch(track.baseUrl, { headers: { 'User-Agent': ANDROID_UA } })
  if (!xmlRes.ok) return ''
  const xml = await xmlRes.text()

  // Format 3: <p t="ms"><s>word</s>...</p> — used by Android InnerTube response
  const pMatches = [...xml.matchAll(/<p\s[^>]*>([\s\S]*?)<\/p>/g)]  // [\s\S] used instead of . with s-flag (ES2018+)
  let texts: string
  if (pMatches.length > 0) {
    texts = pMatches.map(m => {
      const inner = m[1]
      const words = [...inner.matchAll(/<s[^>]*>([^<]*)<\/s>/g)].map(s => s[1])
      return words.length > 0 ? words.join('') : inner.replace(/<[^>]+>/g, '')
    }).join(' ')
  } else {
    // Classic format fallback: <text start="s" dur="s">content</text>
    texts = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map(m => m[1]).join(' ')
  }

  const decoded = texts
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  return decoded.replace(/\[.*?\]/g, ' ').replace(/\s+/g, ' ').trim()
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
  const text = transcriptText.status === 'fulfilled' ? transcriptText.value : ''

  return snippet ? {
    title: snippet.title as string,
    content: text || snippet.description || '',
    isTranscript: text.length > 0
  } : null
}

export async function POST(req: NextRequest) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 })

  const platform = detectPlatform(url)
  let title = ''
  let content = ''
  let isTranscript = false

  if (platform === 'youtube') {
    const data = await getYouTubeData(url)
    title = data?.title ?? ''
    content = data?.content ?? ''
    isTranscript = data?.isTranscript ?? false
  }

  if (!content && !title) {
    return NextResponse.json({ error: 'Could not read this link' }, { status: 422 })
  }

  const sourceLabel = isTranscript ? 'Transcript (spoken words from the creator)' : 'Description'

  const prompt = [
    'You are a travel content analyst. Extract every place a creator explicitly names in this video.',
    '',
    'Title: ' + title,
    sourceLabel + ': ' + content.slice(0, 8000),
    '',
    'RULES:',
    '- Include EVERY place the creator names — restaurants, bars, cafes, landmarks, museums, parks, neighborhoods, bridges, observation decks, experiences. All of them.',
    '- Extract the name exactly as spoken. Do not paraphrase or substitute.',
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
    return NextResponse.json({ platform, title, ...extracted })
  } catch (err) {
    console.log('Parse error:', err)
    return NextResponse.json({ error: 'Could not extract locations' }, { status: 500 })
  }
}

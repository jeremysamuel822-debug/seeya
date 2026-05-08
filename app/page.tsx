'use client'
import { useState, useEffect } from 'react'

const LENGTH_OPTIONS = ['Weekend', '3–4 days', '5–7 days', '2+ weeks']
const TRAVELER_OPTIONS = ['Solo', 'Couple', 'Girls Trip', 'Honeymoon', 'Family', 'Friends']
const BUDGET_OPTIONS = ['Budget', 'Mid-range', 'Luxury']

type TripDetails = { destination: string; tripLength: string; travelers: string; budget: string; vibe: string }
type Location = { name: string; type: string; city: string; notes: string; estimated_cost: string; creator?: string }
type Save = { url: string; platform: string; title: string; destination_city: string; destination_country: string; vibe_tags: string[]; locations: Location[]; status: 'loading' | 'done' | 'error'; creator?: string }
type ItinerarySlot = { time: string; name: string; type: string; notes: string; estimated_cost: string; from_saved: boolean; creator?: string }
type ItineraryDay = { day: number; theme: string; slots: ItinerarySlot[] }
type Itinerary = { title: string; city: string; country: string; days: ItineraryDay[] }
type DiscoverResult = { videoId: string; videoUrl: string; title: string; channelName: string; channelHandle: string; thumbnail: string; destination_city: string; destination_country: string; vibe_tags: string[]; locations: Location[] }

const BLANK_TRIP: TripDetails = { destination: '', tripLength: '', travelers: '', budget: '', vibe: '' }

export default function SeeYa() {
  const [mobileTab, setMobileTab] = useState<'saves' | 'discover' | 'itin'>('saves')
  const [url, setUrl] = useState('')
  const [saves, setSaves] = useState<Save[]>([])
  const [trip, setTrip] = useState<TripDetails>(BLANK_TRIP)
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [building, setBuilding] = useState(false)
  const [tripOpen, setTripOpen] = useState(false)
  const [discoverForm, setDiscoverForm] = useState({ destination: '', vibe: '', tripType: '' })
  const [discoverResults, setDiscoverResults] = useState<DiscoverResult[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [discoverError, setDiscoverError] = useState('')
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [creatorLinks, setCreatorLinks] = useState<Record<string, string>>({})

  useEffect(() => {
    const savedTrip = localStorage.getItem('seeya_trip')
    if (savedTrip) try { setTrip(JSON.parse(savedTrip)) } catch {}
    const savedSaves = localStorage.getItem('seeya_saves')
    if (savedSaves) try {
      const parsed = JSON.parse(savedSaves)
      setSaves(parsed)
      const links: Record<string, string> = {}
      parsed.forEach((s: Save) => { if (s.creator) links[s.creator] = s.url })
      setCreatorLinks(links)
    } catch {}
  }, [])

  function persistTrip(t: TripDetails) {
    setTrip(t)
    localStorage.setItem('seeya_trip', JSON.stringify(t))
  }

  function persistSaves(updated: Save[]) {
    setSaves(updated)
    localStorage.setItem('seeya_saves', JSON.stringify(updated.filter(s => s.status === 'done')))
  }

  async function addSave() {
    const trimmed = url.trim()
    if (!trimmed) return
    setUrl('')
    const placeholder: Save = { url: trimmed, platform: 'youtube', title: trimmed, destination_city: '', destination_country: '', vibe_tags: [], locations: [], status: 'loading' }
    setSaves(prev => [placeholder, ...prev])
    try {
      const res = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: trimmed }) })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSaves(prev => {
        const updated = prev.map((s, i) => i === 0 ? { ...s, ...data, status: 'done' as const } : s)
        localStorage.setItem('seeya_saves', JSON.stringify(updated.filter(s => s.status === 'done')))
        return updated
      })
      if (data.destination_city) {
        setTrip(prev => {
          if (!prev.destination) {
            const updated = { ...prev, destination: data.destination_city }
            localStorage.setItem('seeya_trip', JSON.stringify(updated))
            return updated
          }
          return prev
        })
      }
    } catch {
      setSaves(prev => prev.map((s, i) => i === 0 ? { ...s, status: 'error' as const } : s))
    }
  }

  async function buildItinerary() {
    const done = saves.filter(s => s.status === 'done')
    if (done.length === 0) return
    setBuilding(true)
    setMobileTab('itin')

    const allLocations = done.flatMap(s => s.locations.map(l => ({ ...l, creator: s.creator || l.creator })))
    const city = trip.destination || done[0].destination_city
    const country = done[0].destination_country
    const vibe_tags = [...new Set(done.flatMap(s => s.vibe_tags))]
    const tripDays = trip.tripLength === 'Weekend' ? 2 : trip.tripLength === '3–4 days' ? 3 : trip.tripLength === '5–7 days' ? 6 : 3
    const links: Record<string, string> = {}
    done.forEach(s => { if (s.creator) links[s.creator] = s.url })
    setCreatorLinks(links)

    try {
      const res = await fetch('/api/generate-itinerary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: allLocations, city, country, vibe_tags, days: tripDays, travelers: trip.travelers, budget: trip.budget, vibe: trip.vibe })
      })
      setItinerary(await res.json())
    } catch {}
    setBuilding(false)
  }

  async function runDiscover() {
    if (!discoverForm.destination.trim()) return
    setDiscovering(true)
    setDiscoverError('')
    setDiscoverResults([])
    try {
      const res = await fetch('/api/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(discoverForm) })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setDiscoverResults(data)
    } catch (e: any) { setDiscoverError(e.message || 'Something went wrong') }
    setDiscovering(false)
  }

  function addCreatorToPlan(r: DiscoverResult) {
    if (addedIds.has(r.videoId)) return
    const save: Save = { url: r.videoUrl, platform: 'youtube', title: r.title, destination_city: r.destination_city, destination_country: r.destination_country, vibe_tags: r.vibe_tags, locations: r.locations, status: 'done', creator: r.channelHandle }
    persistSaves([save, ...saves])
    setAddedIds(prev => new Set(prev).add(r.videoId))
    if (!trip.destination && r.destination_city) persistTrip({ ...trip, destination: r.destination_city })
  }

  function removeSave(i: number) { persistSaves(saves.filter((_, idx) => idx !== i)) }

  const doneSaves = saves.filter(s => s.status === 'done').length
  const totalPlaces = saves.filter(s => s.status === 'done').flatMap(s => s.locations).length

  const tripSummaryTags = [
    trip.destination && `📍 ${trip.destination}`,
    trip.tripLength,
    trip.travelers,
    trip.budget,
  ].filter(Boolean) as string[]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --cream:      #fffcf8;
          --bg:         #f5ede3;
          --lav:        #a98fd4;
          --lav-pale:   #ede5f8;
          --lav-dark:   #7d60aa;
          --blush:      #e8837e;
          --blush-pale: #faeae9;
          --teal:       #6a9e8f;
          --teal-dark:  #4e7d70;
          --teal-pale:  #c8e6de;
          --gold:       #e8b83a;
          --gold-pale:  #fdf2ce;
          --sky:        #5aaed4;
          --sky-pale:   #daf0fb;
          --text:       #3a3028;
          --mid:        #7a6a5a;
          --light:      #b0a090;
          --grad:       linear-gradient(135deg, #a98fd4, #e8837e);
          --font-serif: 'DM Serif Display', serif;
          --font-sans:  'DM Sans', sans-serif;
        }
        html, body {
          font-family: var(--font-sans);
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          -webkit-font-smoothing: antialiased;
        }

        /* ── APP SHELL ── */
        .mobile-shell {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          width: 100%;
          max-width: 620px;
          margin: 0 auto;
          background: var(--cream);
        }
        @media (min-width: 620px) {
          .mobile-shell {
            margin: 0 auto;
            box-shadow: 0 0 0 1px rgba(58,48,40,.06), 0 20px 60px rgba(58,48,40,.1);
          }
          body { background: var(--bg); }
        }

        /* ── GRADIENT HEADER ── */
        .app-header {
          background: var(--grad);
          padding: 12px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }
        .header-logo { width: 44px; height: 44px; object-fit: contain; display: block; filter: drop-shadow(0 1px 4px rgba(58,48,40,.15)); }
        .header-right { display: flex; align-items: center; gap: 8px; }
        .header-pill {
          background: rgba(255,255,255,.25); color: white;
          font-size: 10px; font-weight: 600; letter-spacing: .8px;
          padding: 4px 11px; border-radius: 100px;
        }

        /* ── NAV TABS ── */
        .nav-tabs {
          display: flex;
          background: var(--lav-pale);
          border-bottom: 1px solid rgba(169,143,212,.2);
          flex-shrink: 0;
        }
        .nav-tab {
          flex: 1; text-align: center;
          font-size: 9px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase;
          color: var(--lav); opacity: .45;
          padding: 9px 4px; border: none; background: none; cursor: pointer;
          transition: opacity .15s;
        }
        .nav-tab.on { opacity: 1; border-bottom: 2.5px solid var(--lav); }

        /* ── BODY ── */
        .tab-body { padding: 18px 16px; flex: 1; overflow-y: auto; }

        /* ── SECTION LABEL ── */
        .sec-label {
          font-size: 9px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase;
          color: var(--light); display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
        }
        .sec-label::after { content: ''; flex: 1; height: 1px; background: var(--lav-pale); }

        /* ── PASTE INPUT ── */
        .paste-card {
          background: var(--cream); border: 1.5px solid var(--lav-pale);
          border-radius: 14px; padding: 13px 14px; margin-bottom: 14px;
        }
        .paste-card-label {
          font-size: 9px; font-weight: 600; letter-spacing: 2.5px; text-transform: uppercase;
          color: var(--lav-dark); margin-bottom: 8px; display: block;
        }
        .paste-row { display: flex; gap: 8px; }
        .paste-input {
          flex: 1; border: 1.5px solid var(--lav-pale); border-radius: 10px;
          background: var(--bg); font-family: var(--font-sans);
          font-size: 13px; color: var(--text); padding: 9px 12px; outline: none;
          transition: border-color .15s;
        }
        .paste-input:focus { border-color: var(--lav); }
        .paste-input::placeholder { color: var(--light); }
        .paste-btn {
          background: var(--grad); border: none; border-radius: 10px;
          color: white; font-family: var(--font-sans);
          font-size: 11px; font-weight: 600; letter-spacing: .8px;
          padding: 9px 16px; cursor: pointer; white-space: nowrap;
          transition: opacity .15s;
        }
        .paste-btn:hover { opacity: .85; }

        /* ── TRIP DETAILS ── */
        .trip-card {
          background: var(--cream); border: 1.5px solid var(--lav-pale);
          border-radius: 14px; margin-bottom: 14px; overflow: hidden;
        }
        .trip-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 11px 14px; cursor: pointer; user-select: none;
          transition: background .15s;
        }
        .trip-header:hover { background: var(--lav-pale); }
        .trip-header-left { display: flex; align-items: center; gap: 7px; }
        .trip-header-label {
          font-size: 9px; font-weight: 600; letter-spacing: 2.5px;
          text-transform: uppercase; color: var(--lav-dark);
        }
        .trip-tags { display: flex; flex-wrap: wrap; gap: 4px; }
        .trip-tag {
          font-size: 9px; font-weight: 500; padding: 2px 8px;
          border-radius: 100px; background: var(--lav-pale); color: var(--lav-dark);
        }
        .trip-chevron { font-size: 11px; color: var(--light); transition: transform .2s; }
        .trip-chevron.open { transform: rotate(180deg); }
        .trip-body { padding: 0 14px 14px; }
        .field-label {
          display: block; font-size: 9px; font-weight: 600; letter-spacing: 2.5px;
          text-transform: uppercase; color: var(--lav-dark); margin: 12px 0 6px;
        }
        .field-input {
          width: 100%; border: 1.5px solid var(--lav-pale); border-radius: 10px;
          background: var(--bg); font-family: var(--font-sans);
          font-size: 13px; color: var(--text); padding: 9px 12px; outline: none;
          transition: border-color .15s;
        }
        .field-input:focus { border-color: var(--lav); }
        .field-input::placeholder { color: var(--light); }
        .chips { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 2px; }
        .chip {
          font-size: 11px; font-weight: 500; padding: 5px 13px;
          border: 1.5px solid var(--lav-pale); border-radius: 100px;
          color: var(--mid); cursor: pointer; background: transparent;
          transition: all .15s;
        }
        .chip:hover { border-color: var(--lav); color: var(--lav); }
        .chip.on { background: var(--grad); border-color: transparent; color: white; }

        /* ── CTA BUTTON ── */
        .cta-btn {
          display: block; width: 100%; border: none; border-radius: 100px;
          background: var(--grad); color: white; font-family: var(--font-sans);
          font-size: 13px; font-weight: 600; letter-spacing: .5px;
          padding: 13px; cursor: pointer;
          box-shadow: 0 4px 16px rgba(169,143,212,.4);
          transition: opacity .15s; margin-bottom: 16px;
        }
        .cta-btn:hover { opacity: .88; }
        .cta-btn:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }

        /* ── SAVE CARDS ── */
        .save-card {
          background: var(--cream); border: 1.5px solid var(--lav-pale);
          border-radius: 14px; padding: 11px 12px;
          display: flex; gap: 10px; align-items: flex-start; margin-bottom: 8px;
        }
        .card-icon {
          width: 36px; height: 36px; border-radius: 9px;
          background: var(--lav-pale); border: 1px solid rgba(169,143,212,.25);
          display: flex; align-items: center; justify-content: center;
          font-size: 17px; flex-shrink: 0;
        }
        .card-info { flex: 1; min-width: 0; }
        .card-title { font-size: 12px; font-weight: 600; color: var(--text); display: block; margin-bottom: 2px; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .card-loc { font-size: 10px; color: var(--lav); font-weight: 500; display: block; margin-bottom: 5px; }
        .tag-row { display: flex; gap: 4px; flex-wrap: wrap; }
        .tag { font-size: 9px; font-weight: 500; padding: 2px 7px; border-radius: 100px; background: var(--lav-pale); color: var(--lav-dark); }
        .tag.blush { background: var(--blush-pale); color: var(--blush); }
        .tag.teal { background: var(--teal-pale); color: var(--teal-dark); }
        .tag.gold { background: var(--gold-pale); color: #a07820; }
        .card-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
        .watch-link {
          font-size: 9px; font-weight: 600; letter-spacing: .5px;
          color: var(--lav-dark); background: var(--lav-pale);
          padding: 4px 9px; border-radius: 100px; text-decoration: none;
          transition: opacity .12s; white-space: nowrap;
        }
        .watch-link:hover { opacity: .75; }
        .status-tag {
          font-size: 8px; font-weight: 600; letter-spacing: .5px;
          padding: 2px 7px; border-radius: 100px;
        }
        .status-loading { background: var(--gold-pale); color: #a07820; }
        .status-done { background: var(--teal-pale); color: var(--teal-dark); }
        .status-error { background: var(--blush-pale); color: var(--blush); }
        .remove-btn {
          background: none; border: none; font-size: 10px;
          color: var(--light); cursor: pointer; padding: 2px;
          transition: color .12s; line-height: 1;
        }
        .remove-btn:hover { color: var(--blush); }

        /* ── EMPTY STATE ── */
        .empty { text-align: center; padding: 48px 20px; }
        .empty-icon { font-size: 38px; margin-bottom: 12px; }
        .empty-title { font-family: var(--font-serif); font-size: 18px; color: var(--text); margin-bottom: 6px; }
        .empty-sub { font-size: 12px; font-weight: 300; color: var(--mid); line-height: 1.6; }

        /* ── ITINERARY ── */
        .itin-header {
          background: var(--lav-pale); border: 1.5px solid var(--lav);
          border-radius: 14px; padding: 14px 15px; margin-bottom: 18px;
        }
        .itin-header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .btn-download {
          font-size: 10px; font-weight: 600; letter-spacing: .5px;
          background: white; color: var(--lav-dark);
          border: 1.5px solid var(--lav); border-radius: 100px;
          padding: 5px 12px; cursor: pointer; white-space: nowrap;
          flex-shrink: 0; transition: background .15s;
        }
        .btn-download:hover { background: var(--lav-pale); }
        .itin-eyebrow {
          font-size: 9px; font-weight: 600; letter-spacing: 2.5px;
          text-transform: uppercase; color: var(--lav-dark); margin-bottom: 4px;
        }
        .itin-title { font-family: var(--font-serif); font-size: 18px; font-style: italic; color: var(--text); margin-bottom: 3px; line-height: 1.2; }
        .itin-meta { font-size: 10px; font-weight: 400; color: var(--mid); }
        .day-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; margin-top: 18px; }
        .day-label { font-size: 9px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: var(--lav-dark); white-space: nowrap; }
        .day-line { flex: 1; height: 1px; background: var(--lav-pale); }
        .stop-row { display: flex; gap: 10px; margin-bottom: 8px; }
        .stop-left { display: flex; flex-direction: column; align-items: center; width: 36px; flex-shrink: 0; }
        .stop-time { font-size: 8px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--lav); }
        .stop-time.pm { color: var(--blush); }
        .stop-time.eve { color: var(--teal); }
        .stop-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--lav); flex-shrink: 0; margin: 4px 0; }
        .stop-dot.pm { background: var(--blush); }
        .stop-dot.eve { background: var(--teal); }
        .stop-line { flex: 1; width: 1.5px; background: var(--lav-pale); }
        .stop-card {
          flex: 1; background: var(--cream); border: 1.5px solid var(--lav-pale);
          border-radius: 14px; padding: 11px 12px;
        }
        .stop-name { font-family: var(--font-serif); font-size: 14px; color: var(--text); display: block; margin-bottom: 1px; }
        .stop-type { font-size: 9px; font-weight: 500; letter-spacing: 1.5px; text-transform: uppercase; color: var(--light); display: block; margin-bottom: 5px; }
        .stop-notes { font-size: 10px; font-weight: 300; color: var(--mid); line-height: 1.5; margin-bottom: 7px; font-style: italic; }
        .stop-foot { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
        .badge { font-size: 9px; font-weight: 500; padding: 2px 7px; border-radius: 100px; background: var(--lav-pale); color: var(--lav-dark); }
        .badge.blush { background: var(--blush-pale); color: var(--blush); }
        .badge.teal { background: var(--teal-pale); color: var(--teal-dark); }
        .badge-link { text-decoration: none; }
        .badge-link:hover { opacity: .75; }
        .price { font-size: 9px; font-weight: 700; color: var(--gold); }
        .price.free { color: var(--teal-dark); }
        .price.budget { color: var(--teal-dark); }
        .price.mid { color: #a07820; }
        .price.lux { color: var(--blush); }

        /* ── INSPIRED BY ── */
        .inspired-card {
          background: var(--cream); border: 1.5px solid var(--lav-pale);
          border-radius: 14px; padding: 13px 14px; margin-bottom: 18px;
        }
        .inspired-row { display: flex; align-items: center; gap: 10px; text-decoration: none; margin-bottom: 8px; }
        .inspired-row:last-child { margin-bottom: 0; }
        .inspired-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--blush-pale); display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; }
        .inspired-name { font-size: 11px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
        .inspired-handle { font-size: 10px; color: var(--lav-dark); font-weight: 500; }
        .inspired-arrow { font-size: 10px; color: var(--light); flex-shrink: 0; }

        /* ── LOADING ── */
        .loading-wrap { text-align: center; padding: 48px 20px; }
        .paper-plane { display: block; margin: 0 auto 16px; animation: float 2.4s ease-in-out infinite; }
        @keyframes float {
          0%   { transform: translateY(0)   rotate(-8deg); }
          40%  { transform: translateY(-14px) rotate(2deg); }
          60%  { transform: translateY(-16px) rotate(-2deg); }
          100% { transform: translateY(0)   rotate(-8deg); }
        }
        .loading-title { font-family: var(--font-serif); font-size: 18px; font-style: italic; color: var(--text); margin-bottom: 5px; }
        .loading-sub { font-size: 11px; font-weight: 300; color: var(--mid); }

        /* ── DISCOVER ── */
        .disc-card {
          background: var(--cream); border: 1.5px solid var(--lav-pale);
          border-radius: 14px; padding: 14px; margin-bottom: 14px;
        }
        .disc-input {
          width: 100%; border: 1.5px solid var(--lav-pale); border-radius: 10px;
          background: var(--bg); font-family: var(--font-sans);
          font-size: 13px; color: var(--text); padding: 9px 12px; outline: none;
          transition: border-color .15s; margin-bottom: 8px;
        }
        .disc-input:focus { border-color: var(--lav); }
        .disc-input::placeholder { color: var(--light); }
        .disc-select {
          width: 100%; border: 1.5px solid var(--lav-pale); border-radius: 10px;
          background: var(--bg); font-family: var(--font-sans);
          font-size: 13px; color: var(--text); padding: 9px 12px; outline: none;
          -webkit-appearance: none; transition: border-color .15s; margin-bottom: 8px;
        }
        .disc-select:focus { border-color: var(--lav); }
        .disc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
        .creator-card {
          background: var(--cream); border: 1.5px solid var(--lav-pale);
          border-radius: 14px; overflow: hidden; margin-bottom: 10px;
        }
        .creator-thumb { width: 100%; height: 155px; object-fit: cover; display: block; border-bottom: 1.5px solid var(--lav-pale); }
        .creator-body { padding: 12px; }
        .creator-channel { font-family: var(--font-serif); font-size: 15px; color: var(--text); margin-bottom: 1px; }
        .creator-handle { font-size: 10px; color: var(--lav-dark); font-weight: 500; margin-bottom: 5px; }
        .creator-ttl { font-size: 11px; color: var(--mid); font-weight: 400; margin-bottom: 8px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .creator-foot { display: flex; align-items: center; justify-content: space-between; }
        .creator-count { font-size: 10px; font-weight: 500; color: var(--light); }
        .btn-add { font-size: 10px; font-weight: 600; letter-spacing: .5px; background: var(--grad); color: white; border: none; border-radius: 100px; padding: 5px 14px; cursor: pointer; transition: opacity .15s; }
        .btn-add:hover { opacity: .85; }
        .btn-added { font-size: 10px; font-weight: 600; background: var(--teal-pale); color: var(--teal-dark); border: none; border-radius: 100px; padding: 5px 14px; cursor: default; }
        .error-box { background: var(--blush-pale); border: 1.5px solid var(--blush); border-radius: 12px; padding: 11px 13px; font-size: 12px; font-weight: 500; color: var(--blush); margin-bottom: 14px; }

      `}</style>

      {/* ═══════════════ MOBILE ═══════════════ */}
      <div className="mobile-shell">
        <div className="app-header">
          <img src="/logo.png" alt="SeeYa" className="header-logo" />
          <div className="header-right">
            {totalPlaces > 0 && <span className="header-pill">{totalPlaces} places</span>}
            {doneSaves > 0 && <span className="header-pill">{doneSaves} video{doneSaves > 1 ? 's' : ''}</span>}
          </div>
        </div>

        <div className="nav-tabs">
          {(['saves', 'discover', 'itin'] as const).map(t => (
            <button key={t} className={`nav-tab${mobileTab === t ? ' on' : ''}`} onClick={() => setMobileTab(t)}>
              {t === 'saves' ? 'Inspiration' : t === 'discover' ? 'Inspire Me' : 'Itinerary'}
            </button>
          ))}
        </div>

        {mobileTab === 'saves' && (
          <div className="tab-body">
            <SavesPanel
              url={url} setUrl={setUrl} addSave={addSave}
              trip={trip} tripOpen={tripOpen} setTripOpen={setTripOpen}
              persistTrip={persistTrip} tripSummaryTags={tripSummaryTags}
              saves={saves} doneSaves={doneSaves} totalPlaces={totalPlaces}
              building={building} buildItinerary={buildItinerary} removeSave={removeSave}
            />
          </div>
        )}

        {mobileTab === 'discover' && (
          <div className="tab-body">
            <DiscoverPanel
              form={discoverForm} setForm={setDiscoverForm}
              run={runDiscover} discovering={discovering}
              results={discoverResults} error={discoverError}
              addedIds={addedIds} addCreator={addCreatorToPlan}
            />
          </div>
        )}

        {mobileTab === 'itin' && (
          <div className="tab-body">
            <ItinPanel building={building} itinerary={itinerary} saves={saves} creatorLinks={creatorLinks} doneSaves={doneSaves} totalPlaces={totalPlaces} />
          </div>
        )}
      </div>

    </>
  )
}

/* ── SUB-COMPONENTS ── */

function SavesPanel({ url, setUrl, addSave, trip, tripOpen, setTripOpen, persistTrip, tripSummaryTags, saves, doneSaves, totalPlaces, building, buildItinerary, removeSave }: {
  url: string; setUrl: (v: string) => void; addSave: () => void
  trip: TripDetails; tripOpen: boolean; setTripOpen: (v: boolean | ((p: boolean) => boolean)) => void
  persistTrip: (t: TripDetails) => void; tripSummaryTags: string[]
  saves: Save[]; doneSaves: number; totalPlaces: number
  building: boolean; buildItinerary: () => void; removeSave: (i: number) => void
}) {
  const platformIcon = (p: string) => p === 'youtube' ? '▶' : p === 'instagram' ? '◈' : p === 'tiktok' ? '♪' : '✍'

  return (
    <>
      {/* Paste input */}
      <div className="paste-card">
        <span className="paste-card-label">Drop a Short to get started</span>
        <div className="paste-row">
          <input className="paste-input" placeholder="Paste a YouTube Short, TikTok, Reel…" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSave()} />
          <button className="paste-btn" onClick={addSave}>Add</button>
        </div>
      </div>

      {/* Trip details */}
      <div className="trip-card">
        <div className="trip-header" onClick={() => setTripOpen(o => !o)}>
          <div className="trip-header-left">
            <span style={{ fontSize: 14 }}>✈</span>
            <span className="trip-header-label">Trip details</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!tripOpen && tripSummaryTags.length > 0 && (
              <div className="trip-tags">
                {tripSummaryTags.map((t, i) => <span key={i} className="trip-tag">{t}</span>)}
              </div>
            )}
            {!tripOpen && tripSummaryTags.length === 0 && (
              <span style={{ fontSize: 10, color: 'var(--light)' }}>Tap to fill in</span>
            )}
            <span className={`trip-chevron${tripOpen ? ' open' : ''}`}>▾</span>
          </div>
        </div>

        {tripOpen && (
          <div className="trip-body">
            <label className="field-label">Where are you going?</label>
            <input className="field-input" placeholder="Tokyo, Amalfi Coast, Bali…" value={trip.destination} onChange={e => persistTrip({ ...trip, destination: e.target.value })} />

            <label className="field-label">How long?</label>
            <div className="chips">
              {['Weekend', '3–4 days', '5–7 days', '2+ weeks'].map(o => (
                <button key={o} className={`chip${trip.tripLength === o ? ' on' : ''}`} onClick={() => persistTrip({ ...trip, tripLength: o })}>{o}</button>
              ))}
            </div>

            <label className="field-label">Traveling with</label>
            <div className="chips">
              {['Solo', 'Couple', 'Girls Trip', 'Honeymoon', 'Family', 'Friends'].map(o => (
                <button key={o} className={`chip${trip.travelers === o ? ' on' : ''}`} onClick={() => persistTrip({ ...trip, travelers: o })}>{o}</button>
              ))}
            </div>

            <label className="field-label">Budget</label>
            <div className="chips">
              {['Budget', 'Mid-range', 'Luxury'].map(o => (
                <button key={o} className={`chip${trip.budget === o ? ' on' : ''}`} onClick={() => persistTrip({ ...trip, budget: o })}>{o}</button>
              ))}
            </div>

            <label className="field-label">Your vibe</label>
            <input className="field-input" placeholder="dreamy, adventurous, low-key luxe…" value={trip.vibe} onChange={e => persistTrip({ ...trip, vibe: e.target.value })} />
          </div>
        )}
      </div>

      {/* Plan trip CTA */}
      {doneSaves > 0 && (
        <button className="cta-btn" onClick={buildItinerary} disabled={building}>
          {building ? '✈ Building your itinerary…' : `Plan my trip ✈  ·  ${totalPlaces} places from ${doneSaves} video${doneSaves > 1 ? 's' : ''}`}
        </button>
      )}

      {/* Saves list */}
      {saves.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🎬</div>
          <div className="empty-title">Drop your favourite Shorts here</div>
          <div className="empty-sub">Paste any YouTube Short above — we'll pull out all the places and build your day-by-day itinerary.</div>
        </div>
      ) : (
        <>
          <div className="sec-label">{saves.length} video{saves.length > 1 ? 's' : ''} saved</div>
          {saves.map((s, i) => (
            <div key={i} className="save-card">
              <div className="card-icon">{platformIcon(s.platform)}</div>
              <div className="card-info">
                <span className="card-title">{s.title || s.url}</span>
                <span className="card-loc">
                  {s.status === 'loading' ? 'Extracting places…' : s.status === 'error' ? 'Could not extract' : `${s.destination_city}${s.destination_country ? ', ' + s.destination_country : ''}`}
                </span>
                {s.status === 'done' && (
                  <div className="tag-row">
                    {s.creator && <span className="tag blush">🎥 {s.creator}</span>}
                    <span className="tag teal">📍 {s.locations.length} places</span>
                    {s.vibe_tags.slice(0, 2).map((t, j) => <span key={j} className="tag">{t}</span>)}
                  </div>
                )}
              </div>
              <div className="card-actions">
                <a href={s.url} target="_blank" rel="noreferrer" className="watch-link">Watch ↗</a>
                <span className={`status-tag ${s.status === 'loading' ? 'status-loading' : s.status === 'error' ? 'status-error' : 'status-done'}`}>
                  {s.status === 'loading' ? '…' : s.status === 'error' ? 'Error' : '✓'}
                </span>
                {s.status !== 'loading' && <button className="remove-btn" onClick={() => removeSave(i)}>✕</button>}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  )
}

function downloadItinerary(itinerary: Itinerary, saves: Save[]) {
  const lines: string[] = []
  lines.push(`${itinerary.title}`)
  lines.push(`${itinerary.city}, ${itinerary.country} · ${itinerary.days.length} days`)
  lines.push('')

  // Debug: show what was extracted from each save
  const allLocations = saves.filter(s => s.status === 'done').flatMap(s =>
    s.locations.map(l => `  - ${l.name} (${(l as any).suggested_time ?? 'no time'}) — ${l.type}`)
  )
  if (allLocations.length > 0) {
    lines.push('EXTRACTED FROM YOUR SHORTS:')
    allLocations.forEach(l => lines.push(l))
    lines.push('')
  }

  for (const day of itinerary.days) {
    lines.push(`DAY ${day.day} — ${day.theme.toUpperCase()}`)
    lines.push('')
    for (const slot of day.slots) {
      lines.push(`[${slot.time.toUpperCase()}] ${slot.name}`)
      lines.push(`${slot.type} · ${slot.estimated_cost}`)
      lines.push(slot.notes)
      const source = slot.from_saved ? '✦ From your Shorts' : '+ Added by AI'
      const creator = slot.creator ? ` · 🎥 ${slot.creator}` : ''
      lines.push(`${source}${creator}`)
      lines.push('')
    }
  }

  const inspiredSaves = saves.filter(s => s.creator)
  if (inspiredSaves.length > 0) {
    lines.push('INSPIRED BY')
    inspiredSaves.forEach(s => lines.push(`${s.creator} — ${s.url}`))
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${itinerary.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.txt`
  a.click()
  URL.revokeObjectURL(a.href)
}

function ItinPanel({ building, itinerary, saves, creatorLinks, doneSaves, totalPlaces }: {
  building: boolean; itinerary: Itinerary | null; saves: Save[]
  creatorLinks: Record<string, string>; doneSaves: number; totalPlaces: number
}) {
  const timeClass = (time: string) => {
    const t = time.toLowerCase()
    if (t.includes('evening') || t.includes('night')) return 'eve'
    if (t.includes('afternoon') || t.includes('pm')) return 'pm'
    return ''
  }
  const priceClass = (c: string) => {
    if (c === 'free') return 'free'
    if (c === '$') return 'budget'
    if (c === '$$') return 'mid'
    if (c === '$$$') return 'lux'
    return ''
  }

  if (building) return (
    <div className="loading-wrap">
      <svg className="paper-plane" width="48" height="48" viewBox="0 0 24 24" fill="none">
        <path d="M22 2L11 13" stroke="#a98fd4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#a98fd4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="#ede5f8"/>
      </svg>
      <div className="loading-title">Building your itinerary…</div>
      <div className="loading-sub">Pulling together {totalPlaces} places from {doneSaves} video{doneSaves > 1 ? 's' : ''}</div>
    </div>
  )

  if (!itinerary) return (
    <div className="empty">
      <div className="empty-icon">🗺️</div>
      <div className="empty-title">Your itinerary will appear here</div>
      <div className="empty-sub">Save some Shorts, fill in your trip details, then tap "Plan my trip" to see your day-by-day plan.</div>
    </div>
  )

  const inspiredSaves = saves.filter(s => s.creator && creatorLinks[s.creator])

  return (
    <>
      <div className="itin-header">
        <div className="itin-header-row">
          <div>
            <div className="itin-eyebrow">Your Itinerary</div>
            <div className="itin-title">{itinerary.title}</div>
            <div className="itin-meta">{itinerary.city}, {itinerary.country} · {itinerary.days.length} days · {totalPlaces} places from your Shorts</div>
          </div>
          <button className="btn-download" onClick={() => downloadItinerary(itinerary, saves)}>↓ Download</button>
        </div>
      </div>

      {inspiredSaves.length > 0 && (
        <div className="inspired-card">
          <div className="sec-label" style={{ marginBottom: 10 }}>Inspired by</div>
          {inspiredSaves.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noreferrer" className="inspired-row">
              <div className="inspired-icon">▶</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="inspired-name">{s.title}</div>
                <div className="inspired-handle">{s.creator}</div>
              </div>
              <span className="inspired-arrow">↗</span>
            </a>
          ))}
        </div>
      )}

      {itinerary.days.map(day => (
        <div key={day.day}>
          <div className="day-row">
            <span className="day-label">Day {String(day.day).padStart(2, '0')} — {day.theme}</span>
            <div className="day-line" />
          </div>
          {day.slots.map((slot, j) => {
            const tc = timeClass(slot.time)
            return (
              <div key={j} className="stop-row">
                <div className="stop-left">
                  <span className={`stop-time${tc ? ' ' + tc : ''}`}>{slot.time}</span>
                  <div className={`stop-dot${tc ? ' ' + tc : ''}`} />
                  {j < day.slots.length - 1 && <div className="stop-line" />}
                </div>
                <div className="stop-card">
                  <span className="stop-name">{slot.name}</span>
                  <span className="stop-type">{slot.type}</span>
                  <p className="stop-notes">{slot.notes}</p>
                  <div className="stop-foot">
                    <span className={`badge${slot.from_saved ? ' teal' : ''}`}>{slot.from_saved ? '✦ From your Shorts' : '+ Added by AI'}</span>
                    {slot.creator && (
                      creatorLinks[slot.creator]
                        ? <a href={creatorLinks[slot.creator]} target="_blank" rel="noreferrer" className="badge blush badge-link">🎥 {slot.creator} ↗</a>
                        : <span className="badge blush">🎥 {slot.creator}</span>
                    )}
                    <span className={`price ${priceClass(slot.estimated_cost)}`}>{slot.estimated_cost}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}

function DiscoverPanel({ form, setForm, run, discovering, results, error, addedIds, addCreator }: {
  form: { destination: string; vibe: string; tripType: string }
  setForm: (f: any) => void; run: () => void; discovering: boolean
  results: DiscoverResult[]; error: string
  addedIds: Set<string>; addCreator: (r: DiscoverResult) => void
}) {
  return (
    <>
      <div className="disc-card">
        <div className="sec-label">Find inspiration</div>
        <input className="disc-input" placeholder="Destination (Tokyo, Amalfi Coast…)" value={form.destination} onChange={e => setForm((f: any) => ({ ...f, destination: e.target.value }))} onKeyDown={(e: any) => e.key === 'Enter' && run()} />
        <div className="disc-grid">
          <select className="disc-select" value={form.vibe} onChange={e => setForm((f: any) => ({ ...f, vibe: e.target.value }))}>
            <option value="">Any vibe</option>
            <option value="aesthetic dreamy">Aesthetic & Dreamy</option>
            <option value="foodie">Foodie</option>
            <option value="adventure outdoors">Adventure</option>
            <option value="culture history">Culture & History</option>
            <option value="nightlife party">Nightlife</option>
            <option value="wellness slow travel">Wellness</option>
          </select>
          <select className="disc-select" value={form.tripType} onChange={e => setForm((f: any) => ({ ...f, tripType: e.target.value }))}>
            <option value="">Any trip</option>
            <option value="solo">Solo</option>
            <option value="girls trip">Girls Trip</option>
            <option value="couple">Couple</option>
            <option value="honeymoon">Honeymoon</option>
            <option value="family">Family</option>
          </select>
        </div>
        <button className="cta-btn" style={{ marginBottom: 0 }} onClick={run} disabled={discovering || !form.destination.trim()}>
          {discovering ? '✈ Searching…' : '✨ Find inspiration'}
        </button>
      </div>

      {error && <div className="error-box">⚠ {error}</div>}

      {discovering && (
        <div className="loading-wrap">
          <svg className="paper-plane" width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke="#a98fd4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#a98fd4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="#ede5f8"/>
          </svg>
          <div className="loading-title">Searching for creators…</div>
          <div className="loading-sub">Finding the best {form.destination} content</div>
        </div>
      )}

      {!discovering && results.length === 0 && !error && (
        <div className="empty">
          <div className="empty-icon">✨</div>
          <div className="empty-title">Get inspired</div>
          <div className="empty-sub">Enter a destination to discover creator Shorts and add them to your trip plan.</div>
        </div>
      )}

      {!discovering && results.length > 0 && (
        <>
          <div className="sec-label">{results.length} creators found</div>
          {results.map(r => (
            <div key={r.videoId} className="creator-card">
              {r.thumbnail && <img className="creator-thumb" src={r.thumbnail} alt={r.title} />}
              <div className="creator-body">
                <div className="creator-channel">{r.channelName}</div>
                <div className="creator-handle">{r.channelHandle}</div>
                <div className="creator-ttl">{r.title}</div>
                {r.vibe_tags.length > 0 && (
                  <div className="tag-row" style={{ marginBottom: 8 }}>
                    {r.vibe_tags.slice(0, 3).map((t, j) => <span key={j} className="tag">{t}</span>)}
                  </div>
                )}
                <div className="creator-foot">
                  <span className="creator-count">📍 {r.locations.length} places</span>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <a href={r.videoUrl} target="_blank" rel="noreferrer" className="watch-link">Watch ↗</a>
                    {addedIds.has(r.videoId)
                      ? <span className="btn-added">Added ✓</span>
                      : <button className="btn-add" onClick={() => addCreator(r)}>Add to plan</button>
                    }
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  )
}

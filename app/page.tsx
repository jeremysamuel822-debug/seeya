'use client'
import { useState, useEffect } from 'react'

const PM: Record<string, { label: string; bg: string; tc: string; icon: string; pname: string; btnLabel: string }> = {
  youtube:   { label:'YouTube Short',    bg:'#FFF0EE', tc:'#B83A22', icon:'▶', pname:'YouTube\nShort',    btnLabel:'Watch Short ↗' },
  instagram: { label:'Instagram Reel',   bg:'#F0EEFF', tc:'#5B21B6', icon:'◈', pname:'Instagram\nReel',   btnLabel:'Watch Reel ↗'  },
  tiktok:    { label:'TikTok Video',     bg:'#EEF5FF', tc:'#0369A1', icon:'♪', pname:'TikTok\nVideo',    btnLabel:'Watch Video ↗' },
  pinterest: { label:'Pinterest Board',  bg:'#FFF0F3', tc:'#9F1239', icon:'✦', pname:'Pinterest\nBoard', btnLabel:'View Board ↗'  },
  blog:      { label:'Blog Post',        bg:'#EEFAF2', tc:'#166534', icon:'✍', pname:'Blog\nPost',       btnLabel:'Read Post ↗'   },
}

const FOCUS_OPTIONS = ['Foodie spots & restaurants','Relaxing & unwinding','Going out & nightlife','History & sightseeing','Shopping','Unique experiences','Photo-worthy spots']
const PRIORITY_OPTIONS = ['Close & walkable','Budget-conscious','Fit in as much as possible','Keep it relaxed','Focus on must-dos','Plan ahead for reservations','Easy logistics']
const LENGTH_OPTIONS = ['Weekend','4-6 days','1-2 weeks','2+ weeks']
const TRAVELER_OPTIONS = ['Solo','Girls Trip','Couple','Honeymoon','Family','Friends']
const BUDGET_OPTIONS = ['Budget (<$100/day)','Mid-range ($100–250)','Luxury ($250+)']

type TripProfile = { name: string; destination: string; notSureYet: boolean; tripLength: string; travelers: string; budget: string; focus: string[]; priorities: string[]; vibe: string; email: string }
type Location = { name: string; type: string; city: string; notes: string; estimated_cost: string; creator?: string }
type Save = { url: string; platform: string; title: string; destination_city: string; destination_country: string; vibe_tags: string[]; locations: Location[]; status: 'loading' | 'done' | 'error'; creator?: string }
type ItinerarySlot = { time: string; name: string; type: string; notes: string; estimated_cost: string; from_saved: boolean; creator?: string }
type ItineraryDay = { day: number; theme: string; slots: ItinerarySlot[] }
type Itinerary = { title: string; city: string; country: string; days: ItineraryDay[] }
type DiscoverResult = { videoId: string; videoUrl: string; title: string; channelName: string; channelHandle: string; thumbnail: string; destination_city: string; destination_country: string; vibe_tags: string[]; locations: Location[] }

const BLANK_PROFILE: TripProfile = { name: '', destination: '', notSureYet: false, tripLength: '', travelers: '', budget: '', focus: [], priorities: [], vibe: '', email: '' }

export default function SeeYa() {
  const [onboardingDone, setOnboardingDone] = useState(true)
  const [obStep, setObStep] = useState(1)
  const [profile, setProfile] = useState<TripProfile>(BLANK_PROFILE)

  const [tab, setTab] = useState<'saves' | 'discover' | 'itin' | 'map'>('saves')
  const [url, setUrl] = useState('')
  const [saves, setSaves] = useState<Save[]>([])
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [building, setBuilding] = useState(false)
  const [discoverForm, setDiscoverForm] = useState({ destination: '', vibe: '', tripType: '', budget: '' })
  const [discoverResults, setDiscoverResults] = useState<DiscoverResult[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [discoverError, setDiscoverError] = useState('')
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const done = localStorage.getItem('seeya_onboarding_done')
    if (!done) setOnboardingDone(false)
    const saved = localStorage.getItem('seeya_profile')
    if (saved) try { setProfile(JSON.parse(saved)) } catch {}
  }, [])

  function completeOnboarding() {
    localStorage.setItem('seeya_onboarding_done', '1')
    localStorage.setItem('seeya_profile', JSON.stringify(profile))
    setOnboardingDone(true)
    if (profile.destination && !profile.notSureYet) {
      setDiscoverForm(f => ({ ...f, destination: profile.destination, tripType: profile.travelers, budget: profile.budget }))
    }
  }

  function skipOnboarding() {
    localStorage.setItem('seeya_onboarding_done', '1')
    setOnboardingDone(true)
  }

  function toggleFocus(opt: string) {
    setProfile(p => ({
      ...p,
      focus: p.focus.includes(opt) ? p.focus.filter(x => x !== opt) : p.focus.length < 3 ? [...p.focus, opt] : p.focus
    }))
  }

  function togglePriority(opt: string) {
    setProfile(p => ({
      ...p,
      priorities: p.priorities.includes(opt) ? p.priorities.filter(x => x !== opt) : p.priorities.length < 3 ? [...p.priorities, opt] : p.priorities
    }))
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
      setSaves(prev => prev.map((s, i) => i === 0 ? { ...s, ...data, status: 'done' } : s))
    } catch {
      setSaves(prev => prev.map((s, i) => i === 0 ? { ...s, status: 'error' } : s))
    }
  }

  async function buildItinerary() {
    const done = saves.filter(s => s.status === 'done')
    if (done.length === 0) return
    setBuilding(true)
    setTab('itin')
    const allLocations = done.flatMap(s => s.locations)
    const city = done[0].destination_city || profile.destination
    const country = done[0].destination_country
    const vibe_tags = [...new Set(done.flatMap(s => s.vibe_tags))]
    const tripDays = profile.tripLength === 'Weekend' ? 2 : profile.tripLength === '4-6 days' ? 5 : 3
    try {
      const res = await fetch('/api/generate-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: allLocations, city, country, vibe_tags, days: tripDays, travelers: profile.travelers, budget: profile.budget, focus: profile.focus, priorities: profile.priorities, vibe: profile.vibe })
      })
      const data = await res.json()
      setItinerary(data)
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

  function addCreatorToPlan(result: DiscoverResult) {
    if (addedIds.has(result.videoId)) return
    const save: Save = { url: result.videoUrl, platform: 'youtube', title: result.title, destination_city: result.destination_city, destination_country: result.destination_country, vibe_tags: result.vibe_tags, locations: result.locations, status: 'done', creator: result.channelHandle }
    setSaves(prev => [save, ...prev])
    setAddedIds(prev => new Set(prev).add(result.videoId))
  }

  const costColor = (c: string) => c === 'free' ? '#166534' : c === '$' ? '#166534' : c === '$$' ? '#854D0E' : '#B83A22'
  const doneSaves = saves.filter(s => s.status === 'done').length
  const canAdvance1 = profile.name.trim().length > 0
  const greeting = profile.name ? `Hi, ${profile.name.split(' ')[0]} ✈` : 'SeeYa ✈'

  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        :root{
          --coral:#E8735A;--coral-light:#F5C4B3;--coral-dark:#C4523B;
          --cream:#FAF6F0;--cream2:#F5EDE3;--cream3:#EDE0D0;
          --sage:#7BAE8B;--sage-light:#B8D4C0;--sage-dark:#4E7D60;
          --amber:#F2B447;--amber-light:#FAD98A;--amber-dark:#C4882A;
          --sky:#7BB8D4;--sky-light:#C8E4F0;
          --brown:#2C1810;--brown2:#5C3320;--brown3:#8B5E3C;
          --pink:#F0A0A8;--pink-light:#FAD4D8;
          --font-h:'Fredoka One',cursive;--font-b:'Nunito',sans-serif;
        }
        html,body{font-family:var(--font-b);background:var(--cream3);color:var(--brown);min-height:100vh;-webkit-font-smoothing:antialiased;}
        .app-shell{max-width:480px;margin:0 auto;background:var(--cream);min-height:100vh;display:flex;flex-direction:column;box-shadow:0 0 0 0.5px rgba(0,0,0,.1);}
        @media(min-width:700px){.app-shell{margin:24px auto;min-height:calc(100vh - 48px);border-radius:16px;overflow:hidden;}body{padding:0 16px;}}

        /* ── ONBOARDING ── */
        .ob-shell{flex:1;display:flex;flex-direction:column;padding:28px 24px 32px;min-height:100vh;}
        .ob-progress{display:flex;gap:6px;margin-bottom:36px;}
        .ob-dot{flex:1;height:5px;border-radius:3px;background:var(--cream3);transition:background .3s;}
        .ob-dot.done{background:var(--coral);}
        .ob-logo{display:block;margin:0 auto 20px;height:90px;width:auto;}
        .ob-emoji{font-size:52px;text-align:center;margin-bottom:14px;}
        .ob-title{font-family:var(--font-h);font-size:26px;color:var(--brown);text-align:center;margin-bottom:6px;}
        .ob-subtitle{font-size:13px;font-weight:600;color:var(--brown3);text-align:center;margin-bottom:28px;line-height:1.5;}
        .ob-field{margin-bottom:16px;}
        .ob-label{font-family:var(--font-h);font-size:11px;letter-spacing:.06em;color:var(--brown2);text-transform:uppercase;margin-bottom:7px;display:block;}
        .ob-input{width:100%;font-family:var(--font-b);font-size:14px;background:var(--cream2);border:2px solid var(--brown3);border-radius:14px;padding:12px 16px;color:var(--brown);outline:none;transition:border-color .15s;}
        .ob-input:focus{border-color:var(--brown);}
        .ob-input::placeholder{color:var(--brown3);}
        .ob-input:disabled{opacity:.4;cursor:not-allowed;}
        .ob-toggle{display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer;width:fit-content;}
        .ob-toggle input{accent-color:var(--coral);width:17px;height:17px;cursor:pointer;}
        .ob-toggle span{font-size:13px;font-weight:700;color:var(--brown2);}
        .pill-grid{display:flex;flex-wrap:wrap;gap:8px;}
        .pill{font-family:var(--font-h);font-size:13px;padding:8px 16px;border-radius:20px;border:2px solid var(--brown3);background:var(--cream2);color:var(--brown2);cursor:pointer;transition:all .15s;line-height:1.2;}
        .pill:hover{border-color:var(--coral);color:var(--coral);}
        .pill.sel{background:var(--coral);border-color:var(--coral);color:#fff;}
        .pill.dis{opacity:.4;cursor:not-allowed;}
        .ob-section-lbl{font-family:var(--font-h);font-size:12px;letter-spacing:.06em;color:var(--brown2);text-transform:uppercase;margin:18px 0 10px;}
        .ob-footer{margin-top:auto;padding-top:28px;}
        .btn-ob-next{width:100%;font-family:var(--font-h);font-size:16px;background:var(--coral);color:#fff;border:2px solid var(--brown);border-radius:16px;padding:14px;cursor:pointer;transition:background .15s;margin-bottom:12px;}
        .btn-ob-next:hover{background:var(--coral-dark);}
        .btn-ob-next:disabled{opacity:.45;cursor:not-allowed;}
        .btn-ob-back{background:none;border:none;font-family:var(--font-h);font-size:13px;color:var(--brown3);cursor:pointer;padding:4px 0;display:block;margin-bottom:8px;}
        .btn-ob-skip{width:100%;background:none;border:none;font-family:var(--font-h);font-size:13px;color:var(--brown3);cursor:pointer;padding:8px;transition:color .15s;}
        .btn-ob-skip:hover{color:var(--brown2);}

        /* ── MAIN APP ── */
        .nav{background:var(--cream);border-bottom:2.5px solid var(--brown);padding:8px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;}
        .nav-logo{height:36px;width:auto;display:block;}
        .nav-right{display:flex;align-items:center;gap:8px;}
        .saves-pill{font-family:var(--font-h);font-size:12px;background:var(--amber-light);color:var(--brown2);border:2px solid var(--brown);border-radius:20px;padding:3px 12px;}
        .btn-build{font-family:var(--font-h);font-size:12px;background:var(--coral);color:#fff;border:2px solid var(--brown);border-radius:20px;padding:6px 16px;cursor:pointer;transition:background .15s;}
        .btn-build:hover{background:var(--coral-dark);}
        .btn-build:disabled{opacity:.5;cursor:not-allowed;}
        .tabs{display:flex;background:var(--cream2);border-bottom:2.5px solid var(--brown);padding:0 16px;overflow-x:auto;}
        .tab{font-family:var(--font-h);font-size:12px;color:var(--brown3);padding:11px 0;margin-right:20px;background:none;border:none;border-bottom:3px solid transparent;cursor:pointer;transition:all .15s;white-space:nowrap;flex-shrink:0;}
        .tab.on{color:var(--brown);border-bottom-color:var(--coral);}
        .body{padding:18px 20px;flex:1;}
        .input-card{background:var(--cream2);border:2.5px solid var(--brown);border-radius:18px;padding:16px;margin-bottom:20px;}
        .card-lbl{font-family:var(--font-h);font-size:12px;letter-spacing:.06em;color:var(--brown2);margin-bottom:10px;text-transform:uppercase;}
        .input-row{display:flex;gap:8px;}
        .url-field{flex:1;font-family:var(--font-b);font-size:13px;background:var(--cream);border:2px solid var(--brown3);border-radius:12px;padding:9px 14px;color:var(--brown);outline:none;transition:border-color .15s;}
        .url-field:focus{border-color:var(--brown);}
        .url-field::placeholder{color:var(--brown3);}
        .btn-save{font-family:var(--font-h);font-size:13px;background:var(--sage);color:#fff;border:2px solid var(--brown);border-radius:12px;padding:9px 18px;cursor:pointer;white-space:nowrap;}
        .btn-save:hover{background:var(--sage-dark);}
        .sec-lbl{font-family:var(--font-h);font-size:12px;letter-spacing:.08em;color:var(--brown2);text-transform:uppercase;margin-bottom:12px;}
        .saves-list{display:flex;flex-direction:column;gap:8px;margin-bottom:20px;}
        .save-card{background:var(--cream2);border:2px solid var(--brown);border-radius:14px;display:flex;overflow:hidden;}
        .save-platform{width:54px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:10px 6px;border-right:2px solid var(--brown);}
        .plat-icon{font-size:18px;line-height:1;}
        .plat-name{font-size:8px;font-weight:700;text-align:center;line-height:1.2;}
        .save-body{flex:1;padding:10px 12px;min-width:0;}
        .save-title{font-size:12px;font-weight:700;color:var(--brown);line-height:1.3;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .save-location{display:flex;align-items:center;gap:4px;font-size:10px;font-weight:600;color:var(--brown3);}
        .loc-dot{width:5px;height:5px;border-radius:50%;background:var(--coral);flex-shrink:0;}
        .save-actions{display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;padding:10px 12px;gap:6px;flex-shrink:0;}
        .src-link{display:inline-flex;align-items:center;gap:4px;font-family:var(--font-b);font-size:10px;font-weight:700;padding:4px 9px;border-radius:10px;border:1.5px solid var(--brown);text-decoration:none;transition:opacity .12s;white-space:nowrap;}
        .status-badge{font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;border:1.5px solid var(--brown);white-space:nowrap;}
        .vibe-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;}
        .vibe-tag{font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;background:var(--sky-light);color:var(--sky);border:1.5px solid var(--sky);}
        .empty-state{text-align:center;padding:40px 20px;color:var(--brown3);}
        .empty-icon{font-size:40px;margin-bottom:12px;}
        .empty-title{font-family:var(--font-h);font-size:16px;color:var(--brown2);margin-bottom:6px;}
        .empty-sub{font-size:12px;font-weight:600;}
        .day-block{margin-bottom:24px;}
        .day-lbl{font-family:var(--font-h);font-size:14px;color:var(--brown);margin-bottom:10px;padding:6px 12px;background:var(--amber-light);border:2px solid var(--brown);border-radius:10px;display:inline-block;}
        .stop{display:flex;gap:10px;margin-bottom:8px;}
        .stop-l{display:flex;flex-direction:column;align-items:center;width:36px;flex-shrink:0;}
        .stop-t{font-size:9px;font-weight:700;color:var(--brown3);white-space:nowrap;}
        .stop-nd{width:10px;height:10px;border-radius:50%;background:var(--coral);border:2px solid var(--brown);margin:3px 0;flex-shrink:0;}
        .stop-stem{flex:1;width:2px;background:var(--cream3);}
        .stop-card{flex:1;background:var(--cream2);border:2px solid var(--brown);border-radius:12px;padding:10px 12px;}
        .stop-name{font-size:12px;font-weight:700;color:var(--brown);margin-bottom:2px;}
        .stop-type{font-size:10px;color:var(--brown3);font-weight:600;margin-bottom:6px;}
        .chips{display:flex;flex-wrap:wrap;gap:4px;}
        .chip{font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;border:1.5px solid;}
        .chip-saved{background:#EEFAF2;color:#166534;border-color:#166534;}
        .chip-added{background:var(--sky-light);color:var(--sky);border-color:var(--sky);}
        .chip-cost{background:var(--cream);border-color:var(--brown3);color:var(--brown2);}
        .chip-creator{background:#FFF0EE;color:var(--coral-dark);border-color:var(--coral-dark);}
        .itin-header{background:var(--amber-light);border:2.5px solid var(--brown);border-radius:18px;padding:16px;margin-bottom:20px;}
        .itin-title{font-family:var(--font-h);font-size:18px;color:var(--brown);margin-bottom:4px;}
        .itin-sub{font-size:11px;font-weight:600;color:var(--brown3);}
        .loading-state{text-align:center;padding:40px 20px;}
        .loading-icon{font-size:32px;margin-bottom:12px;animation:spin 1.5s linear infinite;display:inline-block;}
        @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
        .discover-form{background:var(--cream2);border:2.5px solid var(--brown);border-radius:18px;padding:16px;margin-bottom:20px;}
        .form-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;}
        .form-group{display:flex;flex-direction:column;gap:4px;}
        .form-lbl{font-family:var(--font-h);font-size:10px;letter-spacing:.06em;color:var(--brown2);text-transform:uppercase;}
        .form-input,.form-select{font-family:var(--font-b);font-size:13px;background:var(--cream);border:2px solid var(--brown3);border-radius:12px;padding:9px 12px;color:var(--brown);outline:none;width:100%;-webkit-appearance:none;}
        .form-input:focus,.form-select:focus{border-color:var(--brown);}
        .btn-discover{font-family:var(--font-h);font-size:14px;background:var(--coral);color:#fff;border:2px solid var(--brown);border-radius:12px;padding:11px;cursor:pointer;width:100%;margin-top:4px;transition:background .15s;}
        .btn-discover:hover{background:var(--coral-dark);}
        .btn-discover:disabled{opacity:.5;cursor:not-allowed;}
        .creator-list{display:flex;flex-direction:column;gap:12px;}
        .creator-card{background:var(--cream2);border:2px solid var(--brown);border-radius:14px;overflow:hidden;}
        .creator-thumb{width:100%;height:160px;object-fit:cover;display:block;border-bottom:2px solid var(--brown);}
        .creator-body{padding:12px;}
        .creator-channel{font-family:var(--font-h);font-size:14px;color:var(--brown);margin-bottom:1px;}
        .creator-handle{font-size:10px;color:var(--coral-dark);font-weight:700;margin-bottom:6px;}
        .creator-title{font-size:11px;color:var(--brown2);font-weight:600;margin-bottom:8px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
        .creator-footer{display:flex;align-items:center;justify-content:space-between;}
        .creator-count{font-size:10px;font-weight:700;color:var(--brown3);}
        .btn-add-idle{font-family:var(--font-h);font-size:11px;background:var(--sage);color:#fff;border:2px solid var(--brown);border-radius:10px;padding:5px 14px;cursor:pointer;transition:all .15s;}
        .btn-add-idle:hover{background:var(--sage-dark);}
        .btn-add-done{font-family:var(--font-h);font-size:11px;background:#EEFAF2;color:#166534;border:2px solid #166534;border-radius:10px;padding:5px 14px;cursor:default;}
        .error-msg{background:#FEE2E2;border:2px solid #B91C1C;border-radius:12px;padding:12px;font-size:12px;font-weight:600;color:#B91C1C;margin-bottom:16px;}
        .profile-banner{background:var(--amber-light);border:2px solid var(--brown);border-radius:14px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px;}
        .profile-banner-text{flex:1;font-size:11px;font-weight:700;color:var(--brown2);line-height:1.5;}
        .profile-banner-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;}
      `}</style>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div className="app-shell">

        {/* ── ONBOARDING ── */}
        {!onboardingDone && (
          <div className="ob-shell">
            {/* Progress bar */}
            <div className="ob-progress">
              {[1,2,3,4].map(n => (
                <div key={n} className={`ob-dot${obStep >= n ? ' done' : ''}`} />
              ))}
            </div>

            {/* Step 1 — Destination */}
            {obStep === 1 && (
              <>
                <img src="/logo.png" alt="SeeYa Travel" className="ob-logo" />
                <div className="ob-title">Let's plan your trip</div>
                <div className="ob-subtitle">Tell us a little about your adventure so we can make it perfect</div>

                <div className="ob-field">
                  <label className="ob-label">Your name</label>
                  <input className="ob-input" placeholder="What should we call you?" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
                </div>

                <div className="ob-field">
                  <label className="ob-label">Where do you want to go?</label>
                  <input className="ob-input" placeholder="Tokyo, Amalfi Coast, Bali…" value={profile.destination} disabled={profile.notSureYet} onChange={e => setProfile(p => ({ ...p, destination: e.target.value }))} />
                  <label className="ob-toggle">
                    <input type="checkbox" checked={profile.notSureYet} onChange={e => setProfile(p => ({ ...p, notSureYet: e.target.checked, destination: e.target.checked ? '' : p.destination }))} />
                    <span>Not sure yet — inspire me!</span>
                  </label>
                </div>

                <div className="ob-field">
                  <label className="ob-label">How long is the trip?</label>
                  <div className="pill-grid">
                    {LENGTH_OPTIONS.map(o => (
                      <button key={o} className={`pill${profile.tripLength === o ? ' sel' : ''}`} onClick={() => setProfile(p => ({ ...p, tripLength: o }))}>{o}</button>
                    ))}
                  </div>
                </div>

                <div className="ob-footer">
                  <button className="btn-ob-next" disabled={!canAdvance1} onClick={() => setObStep(2)}>Continue →</button>
                  <button className="btn-ob-skip" onClick={skipOnboarding}>Skip for now</button>
                </div>
              </>
            )}

            {/* Step 2 — Crew & Budget */}
            {obStep === 2 && (
              <>
                <img src="/logo.png" alt="SeeYa Travel" className="ob-logo" />
                <div className="ob-title">Who's coming?</div>
                <div className="ob-subtitle">We'll tailor your itinerary to your group and budget</div>

                <div className="ob-field">
                  <label className="ob-label">Traveling with</label>
                  <div className="pill-grid">
                    {TRAVELER_OPTIONS.map(o => (
                      <button key={o} className={`pill${profile.travelers === o ? ' sel' : ''}`} onClick={() => setProfile(p => ({ ...p, travelers: o }))}>{o}</button>
                    ))}
                  </div>
                </div>

                <div className="ob-field">
                  <label className="ob-label">Budget per day</label>
                  <div className="pill-grid">
                    {BUDGET_OPTIONS.map(o => (
                      <button key={o} className={`pill${profile.budget === o ? ' sel' : ''}`} onClick={() => setProfile(p => ({ ...p, budget: o }))}>{o}</button>
                    ))}
                  </div>
                </div>

                <div className="ob-footer">
                  <button className="btn-ob-next" onClick={() => setObStep(3)}>Continue →</button>
                  <button className="btn-ob-back" onClick={() => setObStep(1)}>← Back</button>
                  <button className="btn-ob-skip" onClick={skipOnboarding}>Skip for now</button>
                </div>
              </>
            )}

            {/* Step 3 — Focus & Priorities */}
            {obStep === 3 && (
              <>
                <img src="/logo.png" alt="SeeYa Travel" className="ob-logo" />
                <div className="ob-title">What matters most?</div>
                <div className="ob-subtitle">Pick up to 3 for each — this shapes your whole trip</div>

                <div className="ob-section-lbl">Trip focus</div>
                <div className="pill-grid" style={{ marginBottom: 4 }}>
                  {FOCUS_OPTIONS.map(o => {
                    const sel = profile.focus.includes(o)
                    const dis = !sel && profile.focus.length >= 3
                    return <button key={o} className={`pill${sel ? ' sel' : ''}${dis ? ' dis' : ''}`} onClick={() => !dis && toggleFocus(o)}>{o}</button>
                  })}
                </div>
                <div style={{ fontSize: 10, color: 'var(--brown3)', fontWeight: 600, marginBottom: 16 }}>{profile.focus.length}/3 selected</div>

                <div className="ob-section-lbl">Planning priorities</div>
                <div className="pill-grid" style={{ marginBottom: 4 }}>
                  {PRIORITY_OPTIONS.map(o => {
                    const sel = profile.priorities.includes(o)
                    const dis = !sel && profile.priorities.length >= 3
                    return <button key={o} className={`pill${sel ? ' sel' : ''}${dis ? ' dis' : ''}`} onClick={() => !dis && togglePriority(o)}>{o}</button>
                  })}
                </div>
                <div style={{ fontSize: 10, color: 'var(--brown3)', fontWeight: 600 }}>{profile.priorities.length}/3 selected</div>

                <div className="ob-footer">
                  <button className="btn-ob-next" onClick={() => setObStep(4)}>Continue →</button>
                  <button className="btn-ob-back" onClick={() => setObStep(2)}>← Back</button>
                  <button className="btn-ob-skip" onClick={skipOnboarding}>Skip for now</button>
                </div>
              </>
            )}

            {/* Step 4 — Vibe & Email */}
            {obStep === 4 && (
              <>
                <img src="/logo.png" alt="SeeYa Travel" className="ob-logo" />
                <div className="ob-title">Almost there!</div>
                <div className="ob-subtitle">Last few details — both optional but super helpful</div>

                <div className="ob-field">
                  <label className="ob-label">Your ideal vibe</label>
                  <input className="ob-input" placeholder="dreamy, adventurous, low-key luxe, chaotic fun…" value={profile.vibe} onChange={e => setProfile(p => ({ ...p, vibe: e.target.value }))} />
                </div>

                <div className="ob-field">
                  <label className="ob-label">Email — we'll send your itinerary here</label>
                  <input className="ob-input" type="email" placeholder="you@email.com" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} />
                </div>

                <div className="ob-footer">
                  <button className="btn-ob-next" onClick={completeOnboarding}>Let's go! ✈</button>
                  <button className="btn-ob-back" onClick={() => setObStep(3)}>← Back</button>
                  <button className="btn-ob-skip" onClick={skipOnboarding}>Skip for now</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── MAIN APP ── */}
        {onboardingDone && (
          <>
            <nav className="nav">
              <img src="/logo.png" alt="SeeYa Travel" className="nav-logo" />
              <div className="nav-right">
                <span className="saves-pill">{doneSaves} saves ✦</span>
                <button className="btn-build" onClick={buildItinerary} disabled={building || doneSaves === 0}>
                  {building ? 'Building…' : 'Plan trip ✈'}
                </button>
              </div>
            </nav>

            <div className="tabs">
              {(['saves', 'discover', 'itin', 'map'] as const).map(t => (
                <button key={t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                  {t === 'saves' ? 'Inspiration' : t === 'discover' ? '✨ Inspire Me' : t === 'itin' ? 'Itinerary' : 'Map'}
                </button>
              ))}
            </div>

            {/* SAVES TAB */}
            {tab === 'saves' && (
              <div className="body">
                {profile.name && (profile.travelers || profile.focus.length > 0) && (
                  <div className="profile-banner">
                    <span style={{ fontSize: 20 }}>🧳</span>
                    <div>
                      <div className="profile-banner-text">
                        {profile.travelers && `${profile.travelers} · `}{profile.tripLength && `${profile.tripLength} · `}{profile.destination || 'Destination TBD'}
                      </div>
                      {profile.focus.length > 0 && (
                        <div className="profile-banner-tags">
                          {profile.focus.map((f, i) => <span key={i} className="vibe-tag">{f}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="input-card">
                  <div className="card-lbl">Paste a link to save</div>
                  <div className="input-row">
                    <input className="url-field" placeholder="YouTube, TikTok, Instagram, blog…" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSave()} />
                    <button className="btn-save" onClick={addSave}>Save</button>
                  </div>
                </div>

                {saves.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">🌍</div>
                    <div className="empty-title">No saves yet</div>
                    <div className="empty-sub">Paste a YouTube Short, TikTok, or blog link above to get started</div>
                  </div>
                ) : (
                  <div className="saves-list">
                    {saves.map((s, i) => {
                      const p = PM[s.platform] || PM.blog
                      const pl = p.pname.split('\n')
                      return (
                        <div key={i} className="save-card">
                          <div className="save-platform" style={{ background: p.bg }}>
                            <div className="plat-icon">{p.icon}</div>
                            <div className="plat-name" style={{ color: p.tc }}>{pl[0]}<br />{pl[1] || ''}</div>
                          </div>
                          <div className="save-body">
                            <div className="save-title">{s.title || s.url}</div>
                            <div className="save-location">
                              <div className="loc-dot" />
                              {s.status === 'loading' ? 'Extracting location…' : s.status === 'error' ? 'Could not extract' : `${s.destination_city}, ${s.destination_country}`}
                            </div>
                            {s.status === 'done' && (
                              <div className="vibe-tags">
                                {s.creator && <span className="vibe-tag" style={{ background:'#FFF0EE', color:'var(--coral-dark)', borderColor:'var(--coral-dark)' }}>🎥 {s.creator}</span>}
                                {s.vibe_tags.slice(0, s.creator ? 2 : 3).map((tag, j) => <span key={j} className="vibe-tag">{tag}</span>)}
                              </div>
                            )}
                          </div>
                          <div className="save-actions">
                            <a href={s.url} target="_blank" rel="noreferrer" className="src-link" style={{ background: p.bg, color: p.tc, borderColor: p.tc }}>{p.btnLabel}</a>
                            <span className="status-badge" style={
                              s.status === 'loading' ? { background: '#FEF9C3', color: '#854D0E', borderColor: '#854D0E' } :
                              s.status === 'error'   ? { background: '#FEE2E2', color: '#B91C1C', borderColor: '#B91C1C' } :
                              { background: p.bg, color: p.tc, borderColor: p.tc }
                            }>
                              {s.status === 'loading' ? 'Processing…' : s.status === 'error' ? 'Error ✗' : 'Extracted ✓'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* INSPIRE ME TAB */}
            {tab === 'discover' && (
              <div className="body">
                <div className="discover-form">
                  <div className="card-lbl">Find your inspiration</div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <div className="form-lbl">Destination</div>
                    <input className="form-input" placeholder="Tokyo, Amalfi Coast, Bali…" value={discoverForm.destination} onChange={e => setDiscoverForm(f => ({ ...f, destination: e.target.value }))} onKeyDown={e => e.key === 'Enter' && runDiscover()} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <div className="form-lbl">Vibe</div>
                      <select className="form-select" value={discoverForm.vibe} onChange={e => setDiscoverForm(f => ({ ...f, vibe: e.target.value }))}>
                        <option value="">Any vibe</option>
                        <option value="aesthetic dreamy">Aesthetic & Dreamy</option>
                        <option value="foodie">Foodie Heaven</option>
                        <option value="adventure outdoors">Adventure</option>
                        <option value="culture history">Culture & History</option>
                        <option value="nightlife party">Nightlife</option>
                        <option value="wellness slow travel">Wellness</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <div className="form-lbl">Trip type</div>
                      <select className="form-select" value={discoverForm.tripType} onChange={e => setDiscoverForm(f => ({ ...f, tripType: e.target.value }))}>
                        <option value="">Any</option>
                        <option value="solo">Solo</option>
                        <option value="girls trip">Girls Trip</option>
                        <option value="couple">Couple</option>
                        <option value="honeymoon">Honeymoon</option>
                        <option value="family">Family</option>
                        <option value="friends">Friends</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <div className="form-lbl">Budget</div>
                    <select className="form-select" value={discoverForm.budget} onChange={e => setDiscoverForm(f => ({ ...f, budget: e.target.value }))}>
                      <option value="">Any budget</option>
                      <option value="budget under $100 per day">Budget (under $100/day)</option>
                      <option value="mid-range $100-250 per day">Mid-range ($100–250/day)</option>
                      <option value="luxury $250+ per day">Luxury ($250+/day)</option>
                    </select>
                  </div>
                  <button className="btn-discover" onClick={runDiscover} disabled={discovering || !discoverForm.destination.trim()}>
                    {discovering ? '✈ Finding inspiration…' : '✨ Find inspiration'}
                  </button>
                </div>

                {discoverError && <div className="error-msg">⚠ {discoverError}</div>}

                {discovering && (
                  <div className="loading-state">
                    <div className="loading-icon">✈</div>
                    <div style={{ fontFamily: 'var(--font-h)', fontSize: 16, color: 'var(--brown)' }}>Searching for creators…</div>
                    <div style={{ fontSize: 12, color: 'var(--brown3)', marginTop: 6 }}>Finding the best {discoverForm.destination} content</div>
                  </div>
                )}

                {!discovering && discoverResults.length > 0 && (
                  <>
                    <div className="sec-lbl">{discoverResults.length} creators found</div>
                    <div className="creator-list">
                      {discoverResults.map(r => (
                        <div key={r.videoId} className="creator-card">
                          {r.thumbnail && <img className="creator-thumb" src={r.thumbnail} alt={r.title} />}
                          <div className="creator-body">
                            <div className="creator-channel">{r.channelName}</div>
                            <div className="creator-handle">{r.channelHandle}</div>
                            <div className="creator-title">{r.title}</div>
                            {r.vibe_tags.length > 0 && (
                              <div className="vibe-tags" style={{ marginBottom: 10 }}>
                                {r.vibe_tags.slice(0, 3).map((tag, j) => <span key={j} className="vibe-tag">{tag}</span>)}
                              </div>
                            )}
                            <div className="creator-footer">
                              <span className="creator-count">📍 {r.locations.length} places</span>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <a href={r.videoUrl} target="_blank" rel="noreferrer" className="src-link" style={{ background: '#FFF0EE', color: '#B83A22', borderColor: '#B83A22' }}>Watch ↗</a>
                                {addedIds.has(r.videoId)
                                  ? <span className="btn-add-done">Added ✓</span>
                                  : <button className="btn-add-idle" onClick={() => addCreatorToPlan(r)}>Add to plan +</button>
                                }
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {!discovering && discoverResults.length === 0 && !discoverError && (
                  <div className="empty-state">
                    <div className="empty-icon">✨</div>
                    <div className="empty-title">Get inspired</div>
                    <div className="empty-sub">Enter a destination above to discover creator content and build your trip</div>
                  </div>
                )}
              </div>
            )}

            {/* ITINERARY TAB */}
            {tab === 'itin' && (
              <div className="body">
                {building ? (
                  <div className="loading-state">
                    <div className="loading-icon">✈</div>
                    <div style={{ fontFamily: 'var(--font-h)', fontSize: 16, color: 'var(--brown)' }}>Building your itinerary…</div>
                    <div style={{ fontSize: 12, color: 'var(--brown3)', marginTop: 6 }}>Claude is planning your trip</div>
                  </div>
                ) : !itinerary ? (
                  <div className="empty-state">
                    <div className="empty-icon">🗺️</div>
                    <div className="empty-title">No itinerary yet</div>
                    <div className="empty-sub">Save some inspiration links or discover creators, then tap "Plan trip" to build your itinerary</div>
                  </div>
                ) : (
                  <>
                    <div className="itin-header">
                      <div className="itin-title">{itinerary.title}</div>
                      <div className="itin-sub">{itinerary.city}, {itinerary.country} · {itinerary.days.length} days</div>
                    </div>
                    {itinerary.days.map(day => (
                      <div key={day.day} className="day-block">
                        <div className="day-lbl">Day {day.day} — {day.theme}</div>
                        {day.slots.map((slot, j) => (
                          <div key={j} className="stop">
                            <div className="stop-l">
                              <div className="stop-t">{slot.time}</div>
                              <div className="stop-nd" />
                              {j < day.slots.length - 1 && <div className="stop-stem" />}
                            </div>
                            <div className="stop-card">
                              <div className="stop-name">{slot.name}</div>
                              <div className="stop-type">{slot.type}</div>
                              <div style={{ fontSize: 11, color: 'var(--brown2)', marginBottom: 6 }}>{slot.notes}</div>
                              <div className="chips">
                                <span className={`chip ${slot.from_saved ? 'chip-saved' : 'chip-added'}`}>{slot.from_saved ? '✦ From your saves' : '+ Added by AI'}</span>
                                {slot.creator && <span className="chip chip-creator">🎥 {slot.creator}</span>}
                                <span className="chip chip-cost" style={{ color: costColor(slot.estimated_cost) }}>{slot.estimated_cost}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* MAP TAB */}
            {tab === 'map' && (
              <div className="body">
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--cream2)', borderRadius: 18, border: '2px solid var(--brown)', marginBottom: 20 }}>
                  <div style={{ fontSize: 28 }}>🗾</div>
                  <div style={{ fontFamily: 'var(--font-h)', fontSize: 15, color: 'var(--brown)', marginTop: 8 }}>
                    {itinerary ? `${itinerary.days.reduce((a, d) => a + d.slots.length, 0)} pins across ${itinerary.city}` : 'Build an itinerary to see your map'}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--brown3)', marginTop: 4 }}>Google Maps integration coming soon</div>
                </div>
                {itinerary && (
                  <>
                    <div className="sec-lbl">All stops</div>
                    {itinerary.days.map(day =>
                      day.slots.map((slot, j) => (
                        <div key={`${day.day}-${j}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--cream2)', border: '2px solid var(--brown)', borderRadius: 12, marginBottom: 8 }}>
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{j + 1}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{slot.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--brown3)', fontWeight: 600 }}>Day {day.day} · {slot.time}{slot.creator ? ` · 🎥 ${slot.creator}` : ''}</div>
                          </div>
                          <span className={`chip ${slot.from_saved ? 'chip-saved' : 'chip-added'}`}>{slot.from_saved ? 'Saved' : 'AI'}</span>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

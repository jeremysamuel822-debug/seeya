'use client'
import { useState } from 'react'

type HotelRec = { name: string; area: string; notes: string; estimated_cost: string; from_saved: boolean }
type RestaurantRec = { name: string; meal: string; suggested_day?: number; notes: string; estimated_cost: string; from_saved: boolean; creator?: string }
type ItinerarySlot = { time: string; name: string; type: string; notes: string; estimated_cost: string; from_saved: boolean; creator?: string }
type ItineraryDay = { day: number; theme: string; slots: ItinerarySlot[] }
export type Itinerary = { title: string; city: string; country: string; hotels: HotelRec[]; restaurants: RestaurantRec[]; days: ItineraryDay[] }

const MEAL_STYLE: Record<string, { bg: string; color: string }> = {
  breakfast: { bg: '#f5f0dc', color: '#8a7a2a' },
  lunch:     { bg: '#d6f0ec', color: '#1a6b5e' },
  dinner:    { bg: '#fde8e8', color: '#c45a5a' },
  any:       { bg: '#ede8f5', color: '#5a4a8a' },
}

export default function TripView({ itin }: { itin: Itinerary }) {
  const [shared, setShared] = useState(false)
  const hotels = itin.hotels ?? []
  const restaurants = [...(itin.restaurants ?? [])].sort((a, b) => (a.suggested_day ?? 999) - (b.suggested_day ?? 999))

  async function handleShare() {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: itin.title, text: `Check out my ${itin.city} itinerary on SeeYa!\n${url}` })
        return
      } catch {}
    }
    await navigator.clipboard.writeText(url)
    setShared(true)
    setTimeout(() => setShared(false), 2500)
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #faf8f5; }
        .wrap { font-family: Georgia, serif; color: #2a2a2a; max-width: 760px; margin: 0 auto; padding: 48px 24px 80px; }
        @media print {
          body { background: white; }
          .no-print { display: none !important; }
          .wrap { padding: 32px 24px; }
        }
        h1 { font-size: 28px; font-weight: 700; line-height: 1.25; margin-bottom: 6px; }
        .meta { font-size: 13px; color: #aaa; margin-bottom: 40px; }
        .sec { font-size: 9px; font-weight: 700; letter-spacing: 2.5px; color: #bbb; text-transform: uppercase; border-bottom: 1px solid #e8e4f0; padding-bottom: 8px; margin: 36px 0 18px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 540px) { .grid { grid-template-columns: 1fr; } }
        .card { background: white; border: 1px solid #ede9f8; border-radius: 14px; padding: 18px; }
        .card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
        .card-name { font-weight: 700; font-size: 15px; line-height: 1.3; }
        .area { font-size: 11px; color: #bbb; margin-bottom: 8px; }
        .notes { font-style: italic; font-size: 12px; color: #666; line-height: 1.6; margin-bottom: 12px; }
        .card-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .meal-pill { font-size: 9px; font-weight: 700; letter-spacing: .5px; padding: 4px 10px; border-radius: 20px; flex-shrink: 0; }
        .day-tag { font-size: 9px; font-weight: 600; color: #bbb; }
        .badge { font-size: 9px; font-weight: 600; padding: 3px 8px; border-radius: 20px; }
        .badge-saved { background: #d6f0ec; color: #1a6b5e; }
        .badge-ai { background: #ede8f5; color: #5a4a8a; }
        .creator { font-size: 10px; color: #c45a8a; }
        .cost { font-size: 11px; font-weight: 600; color: #c8a84b; margin-left: auto; }
        .day-block { margin-bottom: 32px; }
        .day-hd { display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px; }
        .day-num { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; color: #7c6cdc; }
        .day-theme { font-size: 14px; font-weight: 600; }
        .slot { display: flex; gap: 16px; margin-bottom: 14px; padding-left: 12px; border-left: 2px solid #ede9f8; }
        .slot-time { font-size: 9px; font-weight: 700; letter-spacing: 1px; color: #bbb; width: 62px; flex-shrink: 0; padding-top: 3px; text-transform: uppercase; }
        .slot-body { flex: 1; }
        .slot-name { font-weight: 700; font-size: 14px; margin-bottom: 3px; }
        .slot-notes { font-style: italic; font-size: 12px; color: #666; line-height: 1.55; margin-bottom: 8px; }
        .slot-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .logo { font-family: Georgia, serif; font-size: 13px; font-weight: 700; color: #7c6cdc; display: inline-block; }
        .top-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 32px; }
        .top-bar-actions { display: flex; gap: 8px; }
        .btn-share { font-size: 11px; font-weight: 600; letter-spacing: .3px; background: #7c6cdc; color: white; border: none; border-radius: 100px; padding: 8px 16px; cursor: pointer; }
        .btn-pdf { font-size: 11px; font-weight: 600; letter-spacing: .3px; background: white; color: #7c6cdc; border: 1.5px solid #7c6cdc; border-radius: 100px; padding: 8px 16px; cursor: pointer; }
        @media (max-width: 540px) { .btn-pdf { display: none; } }
      `}</style>
      <div className="wrap">
        <div className="top-bar no-print">
          <div className="logo">SeeYa ✦</div>
          <div className="top-bar-actions">
            <button className="btn-share" onClick={handleShare}>{shared ? '✓ Copied!' : '↗ Share'}</button>
            <button className="btn-pdf" onClick={() => window.print()}>↓ Save as PDF</button>
          </div>
        </div>
        <h1>{itin.title}</h1>
        <div className="meta">{itin.city}, {itin.country} · {itin.days.length} days</div>

        {hotels.length > 0 && (
          <>
            <div className="sec">Where to stay</div>
            <div className="grid">
              {hotels.map((h, i) => (
                <div key={i} className="card">
                  <div className="card-top">
                    <div className="card-name">{h.name}</div>
                    <div className="cost">{h.estimated_cost}</div>
                  </div>
                  <div className="area">{h.area}</div>
                  <div className="notes">{h.notes}</div>
                  <span className={`badge ${h.from_saved ? 'badge-saved' : 'badge-ai'}`}>{h.from_saved ? '✦ From your Shorts' : '+ AI pick'}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {restaurants.length > 0 && (
          <>
            <div className="sec">Where to eat</div>
            <div className="grid">
              {restaurants.map((r, i) => {
                const ms = MEAL_STYLE[r.meal] ?? MEAL_STYLE.any
                return (
                  <div key={i} className="card">
                    <div className="card-top">
                      <div className="card-name">{r.name}</div>
                      <span className="meal-pill" style={{ background: ms.bg, color: ms.color }}>{r.meal.toUpperCase()}</span>
                    </div>
                    <div className="notes">{r.notes}</div>
                    <div className="card-foot">
                      {r.suggested_day && <span className="day-tag">Day {r.suggested_day}</span>}
                      <span className={`badge ${r.from_saved ? 'badge-saved' : 'badge-ai'}`}>{r.from_saved ? '✦ From your Shorts' : '+ AI pick'}</span>
                      {r.creator && <span className="creator">🎥 {r.creator}</span>}
                      <span className="cost">{r.estimated_cost}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="sec">Day by day</div>
        {itin.days.map(day => (
          <div key={day.day} className="day-block">
            <div className="day-hd">
              <span className="day-num">DAY {String(day.day).padStart(2, '0')}</span>
              <span className="day-theme">{day.theme}</span>
            </div>
            {day.slots.map((slot, i) => (
              <div key={i} className="slot">
                <div className="slot-time">{slot.time}</div>
                <div className="slot-body">
                  <div className="slot-name">{slot.name}</div>
                  <div className="slot-notes">{slot.notes}</div>
                  <div className="slot-foot">
                    <span className={`badge ${slot.from_saved ? 'badge-saved' : 'badge-ai'}`}>{slot.from_saved ? '✦ From your Shorts' : '+ AI pick'}</span>
                    {slot.creator && <span className="creator">🎥 {slot.creator}</span>}
                    <span className="cost">{slot.estimated_cost}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

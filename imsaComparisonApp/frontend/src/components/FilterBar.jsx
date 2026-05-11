import { Link } from 'react-router-dom'
import { useFilters } from '../FilterContext'

export default function FilterBar({ showClass = true }) {
  const { seriesList, universe, events, series, year, event, session, cls, setFilter } = useFilters()

  return (
    <div className="filter-bar">
      <label>
        Series
        <select value={series} onChange={(e) => setFilter('series', e.target.value)}>
          {seriesList.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
      </label>

      <label>
        Year
        <select value={year || ''} onChange={(e) => setFilter('year', e.target.value)} disabled={!universe}>
          {universe?.years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>

      <label>
        Event
        <select value={event} onChange={(e) => setFilter('event', e.target.value)} disabled={!year}>
          <option value="">All events</option>
          {events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
        </select>
      </label>

      {event && (
        <Link
          to={`/circuits/${encodeURIComponent(event)}?${new URLSearchParams({ series, session, class: cls }).toString()}`}
          className="circuit-link"
          title="View circuit profile"
        >
          View circuit →
        </Link>
      )}

      <label>
        Session
        <select value={session} onChange={(e) => setFilter('session', e.target.value)} disabled={!universe}>
          {universe?.sessions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>

      {showClass && (
        <label>
          Class
          <select value={cls} onChange={(e) => setFilter('class', e.target.value)} disabled={!universe}>
            <option value="">All classes</option>
            {universe?.classes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useFilters } from '../FilterContext'
import FilterBar from '../components/FilterBar'
import { api } from '../api'
import LoadingSpinner from '../components/LoadingSpinner'

export default function DriversSearch() {
  const { series, year, event, session, cls } = useFilters()
  const [searchParams] = useSearchParams()
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!year || !event || !session || !cls) return
    setLoading(true)
    api.drivers(series, year, event, session, cls)
      .then(setDrivers)
      .catch(() => setDrivers([]))
      .finally(() => setLoading(false))
  }, [series, year, event, session, cls])

  const filtered = drivers.filter((d) =>
    d.driver_name.toLowerCase().includes(query.toLowerCase()) ||
    (d.team_name ?? '').toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="page">
      <FilterBar />
      <input
        className="driver-search-input"
        placeholder="Search driver or team..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading && <LoadingSpinner />}
      <div className="driver-list">
        {filtered.map((d) => (
          <Link
            key={d.driver_id}
            to={`/drivers/${encodeURIComponent(d.driver_id)}?${searchParams}`}
            className="driver-list-item"
          >
            <span className="driver-list-name">{d.driver_name}</span>
            <span className="driver-list-meta">#{d.car} · {d.team_name}</span>
          </Link>
        ))}
        {!loading && !filtered.length && drivers.length > 0 && (
          <p className="hint">No drivers match "{query}"</p>
        )}
        {!loading && !drivers.length && <p className="hint">Select an event and class to browse drivers.</p>}
      </div>
    </div>
  )
}

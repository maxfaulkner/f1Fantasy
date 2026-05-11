import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useFilters } from '../FilterContext'
import { DRIVER_COLORS } from '../constants'

export default function EntitySelector({ selected, onChange }) {
  const { series, year, event, session, cls } = useFilters()
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (!year || !event || !session || !cls) return
    setLoading(true)
    setOptions([])
    setQuery('')
    api.drivers(series, year, event, session, cls)
      .then((data) =>
        setOptions(data.map((d) => ({
          value: d.driver_id,
          label: `${d.driver_name} (#${d.car})`,
          team: d.team_name,
        })))
      )
      .catch(() => setOptions([]))
      .finally(() => setLoading(false))
  }, [series, year, event, session, cls])

  function toggle(value) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else if (selected.length < 4) {
      onChange([...selected, value])
    }
  }

  if (loading) return <div className="entity-selector loading">Loading drivers...</div>
  if (!options.length) return <div className="entity-selector empty">No drivers found for current filters.</div>

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()) || o.team?.toLowerCase().includes(query.toLowerCase()))
    : options

  return (
    <div className="entity-selector">
      <div className="entity-selector-header">
        <span>Select up to 4 drivers</span>
        {selected.length > 0 && (
          <button className="clear-btn" onClick={() => onChange([])}>Clear</button>
        )}
      </div>
      <input
        className="entity-search"
        placeholder="Search drivers..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="entity-list">
        {filtered.map(({ value, label, team }) => {
          const idx = selected.indexOf(value)
          const isSelected = idx !== -1
          const color = isSelected ? DRIVER_COLORS[idx] : null
          return (
            <button
              key={value}
              className={`entity-item ${isSelected ? 'selected' : ''}`}
              style={isSelected ? { background: color, borderColor: color, color: '#fff' } : {}}
              onClick={() => toggle(value)}
              disabled={!isSelected && selected.length >= 4}
              title={team}
            >
              {label}
              {isSelected && (
                <span
                  style={{ marginLeft: 6, opacity: 0.8, cursor: 'pointer', fontSize: 11 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/drivers/${encodeURIComponent(value)}?${searchParams}`)
                  }}
                  title="View driver profile"
                >
                  ↗
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

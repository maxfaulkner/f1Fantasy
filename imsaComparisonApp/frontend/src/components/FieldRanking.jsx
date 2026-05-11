import { useEffect, useState } from 'react'
import { api } from '../api'

function DeltaBar({ value, maxAbs }) {
  if (value == null) return <span style={{ color: 'var(--faint)' }}>—</span>
  const isPos = value >= 0
  const width = Math.min(Math.abs(value) / maxAbs * 100, 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 80, height: 4, background: 'var(--raised)', position: 'relative', flexShrink: 0 }}>
        <div style={{
          position: 'absolute',
          top: 0, bottom: 0,
          left: isPos ? '50%' : `${50 - width / 2}%`,
          width: `${width / 2}%`,
          background: isPos ? 'var(--green)' : 'var(--red)',
        }} />
        <div style={{ position: 'absolute', top: -1, bottom: -1, left: '50%', width: 1, background: 'var(--line-hi)' }} />
      </div>
      <span style={{
        fontFamily: 'var(--mono)',
        fontSize: 12,
        color: isPos ? 'var(--green)' : value < -0.05 ? 'var(--red)' : 'var(--muted)',
        minWidth: 52,
      }}>
        {value > 0 ? '+' : ''}{value.toFixed(2)}%
      </span>
    </div>
  )
}

export default function FieldRanking({ event, series, cls }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sortKey, setSortKey] = useState('vs_field_pct')

  useEffect(() => {
    if (!event || !cls) return
    setLoading(true)
    setData(null)
    api.circuitFieldRanking(event, series, cls)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [event, series, cls])

  if (loading) return <div className="hint">Loading field ranking...</div>
  if (!data?.length) return <div className="hint">Not enough data (need 3+ laps per driver).</div>

  const sorted = [...data].sort((a, b) => b[sortKey] - a[sortKey])
  const maxFieldAbs = Math.max(...data.map(d => Math.abs(d.vs_field_pct)))
  const maxTeamAbs = Math.max(...data.map(d => Math.abs(d.vs_team_pct ?? 0)))

  // Group by team for team-relative coloring
  const teamBest = {}
  for (const d of data) {
    if (teamBest[d.team_name] == null || d.vs_field_pct > teamBest[d.team_name]) {
      teamBest[d.team_name] = d.vs_field_pct
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--faint)', marginRight: 4 }}>Sort:</span>
        {[
          { key: 'vs_field_pct', label: 'vs Field' },
          { key: 'vs_team_pct', label: 'vs Teammate' },
          { key: 'appearances', label: 'Experience' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            style={{
              padding: '4px 10px',
              background: sortKey === key ? 'var(--red)' : 'var(--raised)',
              border: '1px solid ' + (sortKey === key ? 'transparent' : 'var(--line-hi)'),
              color: sortKey === key ? '#fff' : 'var(--muted)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.5px',
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            {label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--faint)' }}>
          {data.length} drivers
        </span>
      </div>

      <table className="summary-table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th>Driver</th>
            <th>Team</th>
            <th style={{ width: 36 }}>Races</th>
            <th style={{ width: 160 }}>vs Field</th>
            <th style={{ width: 160 }}>vs Teammates</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d, i) => {
            const isTeamBest = teamBest[d.team_name] === d.vs_field_pct
            return (
              <tr key={d.driver_id}>
                <td style={{ color: 'var(--faint)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                  {i + 1}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>{d.driver_name}</span>
                    {isTeamBest && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '1px',
                        background: 'var(--green)', color: '#fff',
                        padding: '1px 5px', textTransform: 'uppercase',
                      }}>
                        ★ Best in team
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ color: 'var(--muted)', fontFamily: 'inherit', fontSize: 13 }}>
                  {d.team_name}
                </td>
                <td style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                  {d.appearances}
                </td>
                <td>
                  <DeltaBar value={d.vs_field_pct} maxAbs={maxFieldAbs} />
                </td>
                <td>
                  <DeltaBar value={d.vs_team_pct} maxAbs={maxTeamAbs} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

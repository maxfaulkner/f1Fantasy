import { useEffect, useState } from 'react'
import { api } from '../api'
import { useFilters } from '../FilterContext'
import { DRIVER_COLORS } from '../constants'

function fmtLap(s) {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toFixed(3).padStart(6, '0')}`
}

export default function H2HRecord({ drivers }) {
  const { series, event, cls } = useFilters()
  const [records, setRecords] = useState(null)

  useEffect(() => {
    if (!drivers || drivers.length !== 2 || !event || !cls) { setRecords(null); return }
    setRecords(null)
    api.h2h(drivers[0].driver_id, drivers[1].driver_id, event, series, cls)
      .then(setRecords)
      .catch(() => setRecords([]))
  }, [drivers, series, event, cls])

  if (!records?.length) return null

  const aWins = records.filter((r) => r.winner_id === drivers[0].driver_id).length
  const bWins = records.filter((r) => r.winner_id === drivers[1].driver_id).length

  return (
    <div className="chart-box">
      <div className="section-label" style={{ marginBottom: 12 }}>
        H2H at this circuit · {records.length} meeting{records.length !== 1 ? 's' : ''}
      </div>
      <table className="summary-table">
        <thead>
          <tr>
            <th>Year</th>
            <th style={{ color: DRIVER_COLORS[0] }}>{drivers[0].driver_name.split(' ').pop()}</th>
            <th style={{ color: DRIVER_COLORS[1] }}>{drivers[1].driver_name.split(' ').pop()}</th>
            <th>Winner</th>
            <th>Margin</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const isATie = r.winner_id === null
            const isAWinner = r.winner_id === drivers[0].driver_id
            return (
              <tr key={r.year}>
                <td>{r.year}</td>
                <td style={{ color: DRIVER_COLORS[0] }}>{fmtLap(r.lap_a)}</td>
                <td style={{ color: DRIVER_COLORS[1] }}>{fmtLap(r.lap_b)}</td>
                <td style={{ color: isATie ? 'var(--text-muted)' : (isAWinner ? DRIVER_COLORS[0] : DRIVER_COLORS[1]), fontWeight: 600 }}>
                  {isATie ? 'Tie' : (isAWinner ? drivers[0].driver_name : drivers[1].driver_name).split(' ').pop()}
                </td>
                <td>{r.margin.toFixed(3)}s</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="h2h-record-summary">
        <span style={{ color: DRIVER_COLORS[0] }}>{drivers[0].driver_name.split(' ').pop()} {aWins}</span>
        {' – '}
        <span style={{ color: DRIVER_COLORS[1] }}>{bWins} {drivers[1].driver_name.split(' ').pop()}</span>
        <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>at this circuit</span>
      </div>
    </div>
  )
}

function fmtLap(seconds) {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(3).padStart(6, '0')
  return `${m}:${s}`
}

export default function SummaryTable({ data, nameKey = 'driver_name', nameLabel = 'Driver' }) {
  if (!data?.length) return null

  return (
    <table className="summary-table">
      <thead>
        <tr>
          <th>{nameLabel}</th>
          <th>Best Lap</th>
          <th>Median Lap</th>
          <th>P75 Lap</th>
          <th>Laps</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row[nameKey]}>
            <td>{row[nameKey]}</td>
            <td>{fmtLap(row.stats?.best_lap)}</td>
            <td>{fmtLap(row.stats?.median_lap)}</td>
            <td>{fmtLap(row.stats?.p75_lap)}</td>
            <td>{row.stats?.lap_count ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

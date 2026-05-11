export default function CircuitSpecialists({ specialists }) {
  if (!specialists?.length) return null
  return (
    <table className="summary-table">
      <thead>
        <tr><th>#</th><th>Driver</th><th>Appearances</th><th>Avg margin vs field</th></tr>
      </thead>
      <tbody>
        {specialists.map((s, i) => (
          <tr key={s.driver_id}>
            <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
            <td>{s.driver_name}</td>
            <td>{s.appearances}</td>
            <td style={{ color: s.margin_pct > 0 ? '#4caf50' : 'var(--accent)', fontFamily: 'monospace' }}>
              {s.margin_pct > 0 ? '+' : ''}{s.margin_pct.toFixed(2)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

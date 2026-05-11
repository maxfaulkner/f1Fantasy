import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useFilters } from '../FilterContext'
import FingerprintRadar from '../components/FingerprintRadar'
import CareerArc from '../components/CareerArc'
import LoadingSpinner from '../components/LoadingSpinner'

const DIM_LABELS = [
  { key: 'qualifying_pace', label: 'Qualifying Pace' },
  { key: 'race_pace', label: 'Race Pace' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'tire_management', label: 'Tire Management' },
  { key: 'quali_race_delta', label: 'Race Boost' },
  { key: 'wet_pace', label: 'Wet Pace' },
]

const LICENSE_COLOR = {
  Platinum: '#b0c4de',
  Gold: '#ffd700',
  Silver: '#c0c0c0',
  Bronze: '#cd7f32',
}

export default function DriverProfile() {
  const { driverId } = useParams()
  const { series, cls } = useFilters()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!driverId) return
    setLoading(true)
    api.driverProfile(driverId, series, cls)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
  }, [driverId, series, cls])

  if (loading) return <div className="page"><LoadingSpinner /></div>
  if (!profile?.driver_name) return <div className="page"><p className="hint">Driver not found.</p></div>

  const initials = profile.driver_name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2)

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>

      <div className="profile-header">
        <div className="profile-avatar">{initials}</div>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>{profile.driver_name}</h2>
          <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {profile.driver_country && <span className="tag">{profile.driver_country}</span>}
            {profile.license && (
              <span
                className="tag"
                style={{
                  borderColor: LICENSE_COLOR[profile.license] ?? 'var(--border)',
                  color: LICENSE_COLOR[profile.license] ?? 'var(--text-muted)',
                }}
              >
                {profile.license}
              </span>
            )}
            {cls && <span className="tag">{cls}</span>}
            {series && <span className="tag">{series.toUpperCase()}</span>}
          </div>
        </div>
      </div>

      <div>
        <div className="section-label" style={{ marginBottom: 8 }}>Performance Fingerprint</div>
        <FingerprintRadar profiles={[profile]} />
        <div className="dimension-bars" style={{ marginTop: 16 }}>
          {DIM_LABELS.map(({ key, label }) => {
            const val = profile.fingerprint?.[key]
            return (
              <div key={key} className="dim-row">
                <span className="dim-label">{label}</span>
                <div className="dim-bar-track">
                  {val != null && <div className="dim-bar-fill" style={{ width: `${val}%` }} />}
                </div>
                <span className="dim-val">{val != null ? val.toFixed(0) : '—'}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <div className="section-label" style={{ marginBottom: 8 }}>Career Arc — pace percentile by year</div>
        <CareerArc profiles={[profile]} />
      </div>

      {profile.best_circuits?.length > 0 && (
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>Best Circuits</div>
          <table className="summary-table">
            <thead>
              <tr><th>Circuit</th><th>Appearances</th><th>Avg margin vs field</th></tr>
            </thead>
            <tbody>
              {profile.best_circuits.map((c) => (
                <tr key={c.event}>
                  <td>{c.event}</td>
                  <td>{c.appearances}</td>
                  <td style={{ color: c.margin_pct > 0 ? '#4caf50' : 'var(--accent)', fontFamily: 'monospace' }}>
                    {c.margin_pct > 0 ? '+' : ''}{c.margin_pct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        className="cta-button"
        onClick={() => navigate(`/compare?${searchParams.toString()}`)}
      >
        Compare this driver →
      </button>
    </div>
  )
}

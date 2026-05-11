import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useFilters } from '../FilterContext'
import CircuitSpecialists from '../components/CircuitSpecialists'
import ManufacturerAffinity from '../components/ManufacturerAffinity'
import FieldRanking from '../components/FieldRanking'
import LoadingSpinner from '../components/LoadingSpinner'

function fmtLap(s) {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toFixed(3).padStart(6, '0')}`
}

export default function CircuitProfile() {
  const { event } = useParams()
  const decodedEvent = decodeURIComponent(event)
  const { series, cls, universe } = useFilters()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [profileCls, setProfileCls] = useState(cls || 'GTP')
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!decodedEvent) return
    setLoading(true)
    api.circuitProfile(decodedEvent, series, profileCls)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
  }, [decodedEvent, series, profileCls])

  const top2 = profile?.specialists?.slice(0, 2) ?? []

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>{decodedEvent}</h2>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {universe?.classes.map((c) => (
              <button
                key={c}
                className="tag"
                style={{
                  cursor: 'pointer',
                  background: c === profileCls ? 'var(--accent)' : undefined,
                  color: c === profileCls ? '#fff' : undefined,
                  border: c === profileCls ? '1px solid var(--accent)' : undefined,
                }}
                onClick={() => setProfileCls(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        {profile?.record && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)' }}>
              {fmtLap(profile.record.lap_time)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {profileCls} record · {profile.record.driver_name} · {profile.record.year}
              {profile.record.wet ? ' · Wet' : ' · Dry'}
            </div>
          </div>
        )}
      </div>

      {loading && <LoadingSpinner />}

      {profile && !loading && (
        <>
          <div>
            <div className="section-label" style={{ marginBottom: 8 }}>Track Specialists</div>
            <CircuitSpecialists specialists={profile.specialists} />
            {!profile.specialists?.length && <p className="hint" style={{ padding: 0 }}>Not enough data yet (need 3+ appearances per driver).</p>}
          </div>

          <div>
            <div className="section-label" style={{ marginBottom: 8 }}>Manufacturer Affinity</div>
            <ManufacturerAffinity data={profile.manufacturer_affinity} />
            {!profile.manufacturer_affinity?.length && <p className="hint" style={{ padding: 0 }}>Not enough data.</p>}
          </div>

          {profile.weather_sensitivity?.circuit_rain_delta_s != null && (
            <div>
              <div className="section-label" style={{ marginBottom: 8 }}>Weather Sensitivity</div>
              <div className="chart-box" style={{ display: 'flex', gap: 40 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Rain impact here</div>
                  <div style={{ fontSize: 24, fontFamily: 'monospace', fontWeight: 700 }}>
                    +{profile.weather_sensitivity.circuit_rain_delta_s.toFixed(2)}s
                  </div>
                </div>
                {profile.weather_sensitivity.series_rain_delta_s != null && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Series average</div>
                    <div style={{ fontSize: 24, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                      +{profile.weather_sensitivity.series_rain_delta_s.toFixed(2)}s
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="section-label" style={{ marginBottom: 12 }}>Field Ranking — All Drivers</div>
            <FieldRanking event={decodedEvent} series={series} cls={profileCls} />
          </div>

          {top2.length === 2 && (
            <button
              className="cta-button"
              onClick={() => navigate(`/compare?${new URLSearchParams({
                ...Object.fromEntries(searchParams),
                driver_id: `${top2[0].driver_id},${top2[1].driver_id}`,
              })}`)}
            >
              Compare top 2 specialists →
            </button>
          )}
        </>
      )}
    </div>
  )
}

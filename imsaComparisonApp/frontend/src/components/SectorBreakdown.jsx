import { DRIVER_COLORS } from '../constants'

function bestLapWithSectors(driver) {
  const laps = driver.laps.filter(
    (l) => l.lap_time_s1 != null && l.lap_time_s2 != null && l.lap_time_s3 != null
  )
  if (!laps.length) return null
  return laps.reduce((best, l) => l.lap_time < best.lap_time ? l : best)
}

export default function SectorBreakdown({ drivers }) {
  if (!drivers?.length) return null
  const sectorData = drivers.map((d) => ({ driver: d, best: bestLapWithSectors(d) }))
  if (sectorData.some((s) => !s.best)) return null

  const sectorKeys = ['lap_time_s1', 'lap_time_s2', 'lap_time_s3']
  const sectorLabels = ['Sector 1', 'Sector 2', 'Sector 3']

  return (
    <div className="sector-grid">
      {sectorKeys.map((key, i) => {
        const times = sectorData.map((s) => s.best[key])
        const minTime = Math.min(...times)
        const maxTime = Math.max(...times)
        const fastest = sectorData.reduce((a, b) =>
          a.best[key] < b.best[key] ? a : b
        )
        const delta = maxTime - minTime

        return (
          <div key={key} className="sector-card">
            <div className="sector-label">{sectorLabels[i]}</div>
            {sectorData.map(({ driver, best }, idx) => {
              const t = best[key]
              const barWidth = maxTime > minTime
                ? 40 + 60 * (1 - (t - minTime) / (maxTime - minTime))
                : 100
              return (
                <div key={driver.driver_id} className="sector-row">
                  <span className="sector-dot" style={{ background: DRIVER_COLORS[idx] }} />
                  <div className="sector-bar-track">
                    <div className="sector-bar-fill" style={{ width: `${barWidth}%`, background: DRIVER_COLORS[idx] }} />
                  </div>
                  <span className="sector-time">{t.toFixed(3)}</span>
                </div>
              )
            })}
            <div className="sector-winner" style={{ color: DRIVER_COLORS[sectorData.indexOf(fastest)] }}>
              {fastest.driver.driver_name.split(' ').pop()} +{delta.toFixed(3)}s faster
            </div>
          </div>
        )
      })}
    </div>
  )
}

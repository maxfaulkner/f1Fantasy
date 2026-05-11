import { useEffect, useRef, useState } from 'react'
import Plotly from 'plotly.js-dist-min'
import { DRIVER_COLORS } from '../constants'

function buildTraces(drivers) {
  return drivers.map((driver, idx) => {
    const byStintLap = {}
    for (const lap of driver.laps) {
      if (lap.stint_lap == null || lap.flags === 'FCY' || lap.flags === 'SF') continue
      if (!byStintLap[lap.stint_lap]) byStintLap[lap.stint_lap] = []
      byStintLap[lap.stint_lap].push(Number(lap.lap_time))
    }
    const stintLaps = Object.keys(byStintLap).map(Number).sort((a, b) => a - b)
    const medians = stintLaps.map((sl) => {
      const times = byStintLap[sl].sort((a, b) => a - b)
      return times[Math.floor(times.length / 2)]
    })
    return {
      x: stintLaps,
      y: medians,
      name: driver.driver_name,
      mode: 'lines+markers',
      marker: { size: 5, color: DRIVER_COLORS[idx] },
      line: { color: DRIVER_COLORS[idx] },
      hovertemplate: 'Stint lap %{x}<br>%{y:.3f}s<extra>%{fullData.name}</extra>',
    }
  })
}

export default function TireDegChart({ drivers }) {
  const ref = useRef(null)
  const [hasData, setHasData] = useState(false)

  useEffect(() => {
    if (!ref.current || !drivers?.length) { setHasData(false); return }
    const traces = buildTraces(drivers)
    if (traces.every((t) => t.x.length === 0)) { setHasData(false); return }
    setHasData(true)
    Plotly.react(ref.current, traces, {
      xaxis: { title: 'Stint Lap', zeroline: false, dtick: 1 },
      yaxis: { title: 'Median Lap Time (s)', autorange: true },
      legend: { orientation: 'h', y: -0.2 },
      margin: { t: 10, r: 20, b: 60, l: 70 },
      hovermode: 'x unified',
    }, { responsive: true, displayModeBar: false })
  }, [drivers])

  if (!drivers?.length || !hasData) return null
  return (
    <div>
      <div className="section-label" style={{ marginBottom: 8 }}>Tire Degradation</div>
      <div ref={ref} className="chart" />
    </div>
  )
}

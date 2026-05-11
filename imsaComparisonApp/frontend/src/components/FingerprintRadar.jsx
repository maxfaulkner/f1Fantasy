import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import { DRIVER_COLORS } from '../constants'

const DIMS = [
  { key: 'qualifying_pace', label: 'Qualifying' },
  { key: 'race_pace', label: 'Race Pace' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'tire_management', label: 'Tire Mgmt' },
  { key: 'quali_race_delta', label: 'Race Boost' },
  { key: 'wet_pace', label: 'Wet Pace' },
]

export default function FingerprintRadar({ profiles }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !profiles?.length) return
    const theta = [...DIMS.map((d) => d.label), DIMS[0].label]
    const traces = profiles.map((p, idx) => ({
      type: 'scatterpolar',
      r: [...DIMS.map((d) => p.fingerprint?.[d.key] ?? null), p.fingerprint?.[DIMS[0].key] ?? null],
      connectgaps: false,
      theta,
      name: p.driver_name,
      fill: 'toself',
      fillcolor: `${DRIVER_COLORS[idx]}33`,
      line: { color: DRIVER_COLORS[idx], width: 2 },
    }))
    Plotly.react(ref.current, traces, {
      polar: {
        radialaxis: { visible: true, range: [0, 100], tickfont: { size: 10 } },
        angularaxis: { tickfont: { size: 11 } },
      },
      legend: { orientation: 'h', y: -0.15 },
      margin: { t: 20, r: 40, b: 60, l: 40 },
    }, { responsive: true, displayModeBar: false })
  }, [profiles])

  if (!profiles?.length) return null
  return <div ref={ref} style={{ height: 340 }} />
}

import { useEffect, useRef, useState } from 'react'
import Plotly from 'plotly.js-dist-min'
import { DRIVER_COLORS } from '../constants'

export default function CareerArc({ profiles }) {
  const ref = useRef(null)
  const [hasData, setHasData] = useState(false)

  useEffect(() => {
    if (!ref.current || !profiles?.length) { setHasData(false); return }
    const traces = profiles.map((p, idx) => ({
      x: p.career_arc?.map((r) => r.year) ?? [],
      y: p.career_arc?.map((r) => r.percentile) ?? [],
      name: p.driver_name,
      type: 'bar',
      marker: { color: DRIVER_COLORS[idx] },
      hovertemplate: '%{x}: %{y:.1f}th percentile<extra>%{fullData.name}</extra>',
    }))
    if (traces.every((t) => t.x.length === 0)) { setHasData(false); return }
    setHasData(true)
    Plotly.react(ref.current, traces, {
      barmode: 'group',
      xaxis: { title: 'Year', type: 'category' },
      yaxis: { title: 'Pace Percentile', range: [0, 100] },
      legend: { orientation: 'h', y: -0.2 },
      margin: { t: 10, r: 20, b: 60, l: 60 },
    }, { responsive: true, displayModeBar: false })
  }, [profiles])

  if (!profiles?.length || !hasData) return null
  return <div ref={ref} className="chart" />
}

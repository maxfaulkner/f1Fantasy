import { useEffect, useRef, useState } from 'react'
import Plotly from 'plotly.js-dist-min'

export default function ManufacturerAffinity({ data }) {
  const ref = useRef(null)
  const [hasData, setHasData] = useState(false)

  useEffect(() => {
    if (!ref.current || !data?.length) { setHasData(false); return }
    const sorted = [...data].sort((a, b) => b.delta_pct - a.delta_pct)
    setHasData(true)
    Plotly.react(ref.current, [{
      x: sorted.map((d) => d.delta_pct),
      y: sorted.map((d) => d.manufacturer),
      type: 'bar',
      orientation: 'h',
      marker: { color: sorted.map((d) => d.delta_pct > 0 ? '#4caf50' : '#e44') },
      hovertemplate: '%{y}: %{x:+.2f}%<extra></extra>',
    }], {
      xaxis: { title: 'vs class median (%)', zeroline: true, zerolinecolor: '#444' },
      yaxis: { automargin: true },
      margin: { t: 10, r: 20, b: 50, l: 120 },
    }, { responsive: true, displayModeBar: false })
  }, [data])

  if (!data?.length || !hasData) return null
  return <div ref={ref} className="chart" style={{ height: 200 }} />
}

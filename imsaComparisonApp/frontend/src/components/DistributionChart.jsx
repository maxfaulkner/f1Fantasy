import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'

function fmtLap(seconds) {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(3).padStart(6, '0')
  return `${m}:${s}`
}

export default function DistributionChart({ data, nameKey = 'driver_name', timesKey = null, colors }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !data?.length) return

    const traces = data.map((entity, idx) => {
      const times = timesKey ? entity[timesKey] : entity.laps.map((l) => l.lap_time)
      return {
        y: times,
        name: entity[nameKey],
        type: 'box',
        boxpoints: 'outliers',
        marker: { color: colors?.[idx] ?? '#888' },
        hovertemplate: '%{y:.3f}s<extra>%{fullData.name}</extra>',
      }
    })

    const layout = {
      yaxis: { title: 'Lap Time (s)', autorange: true },
      legend: { orientation: 'h', y: -0.15 },
      margin: { t: 20, r: 20, b: 80, l: 80 },
    }

    Plotly.react(ref.current, traces, layout, { responsive: true, displayModeBar: false })
  }, [data])

  if (!data?.length) return null

  return <div ref={ref} className="chart" />
}

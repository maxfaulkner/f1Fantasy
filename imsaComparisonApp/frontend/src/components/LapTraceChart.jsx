import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'

export function fmtLap(seconds) {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(3).padStart(6, '0')
  return `${m}:${s}`
}

export default function LapTraceChart({ data, colors }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !data?.length) return

    const traces = data.map((driver, idx) => ({
      x: driver.laps.map((l) => l.lap),
      y: driver.laps.map((l) => l.lap_time),
      text: driver.laps.map((l) => fmtLap(l.lap_time)),
      name: driver.driver_name,
      mode: 'lines+markers',
      line: { color: colors?.[idx] ?? '#888' },
      marker: { size: 4, color: colors?.[idx] ?? '#888' },
      hovertemplate: 'Lap %{x}<br>%{text}<extra>%{fullData.name}</extra>',
    }))

    const layout = {
      xaxis: { title: 'Lap', zeroline: false },
      yaxis: { title: 'Lap Time (s)', autorange: true },
      legend: { orientation: 'h', y: -0.15 },
      margin: { t: 20, r: 20, b: 80, l: 80 },
      hovermode: 'closest',
    }

    Plotly.react(ref.current, traces, layout, { responsive: true, displayModeBar: false })
  }, [data])

  if (!data?.length) return null

  return <div ref={ref} className="chart" />
}

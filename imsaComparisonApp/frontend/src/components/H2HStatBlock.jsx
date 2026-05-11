import { DRIVER_COLORS } from '../constants'

function fmtLap(s) {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toFixed(3).padStart(6, '0')}`
}

function fmtPct(v) {
  if (v == null) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

export default function H2HStatBlock({ drivers, fieldMedian }) {
  if (!drivers || drivers.length !== 2) return null
  const [a, b] = drivers

  const aFaster = a.stats.best_lap != null && b.stats.best_lap != null && a.stats.best_lap <= b.stats.best_lap
  const bFaster = !aFaster && a.stats.best_lap != null && b.stats.best_lap != null

  const rows = [
    {
      key: 'MEDIAN',
      a: fmtLap(a.stats.median_lap),
      b: fmtLap(b.stats.median_lap),
      winner: a.stats.median_lap != null && b.stats.median_lap != null
        ? (a.stats.median_lap <= b.stats.median_lap ? 'a' : 'b') : null,
    },
    {
      key: 'VS FIELD',
      a: fieldMedian ? fmtPct((a.stats.median_lap - fieldMedian) / fieldMedian * 100) : '—',
      b: fieldMedian ? fmtPct((b.stats.median_lap - fieldMedian) / fieldMedian * 100) : '—',
      winner: a.stats.median_lap != null && b.stats.median_lap != null
        ? (a.stats.median_lap <= b.stats.median_lap ? 'a' : 'b') : null,
    },
    {
      key: 'CONSISTENCY σ',
      a: a.stats.sigma != null ? `${a.stats.sigma.toFixed(3)}s` : '—',
      b: b.stats.sigma != null ? `${b.stats.sigma.toFixed(3)}s` : '—',
      winner: a.stats.sigma != null && b.stats.sigma != null
        ? (a.stats.sigma <= b.stats.sigma ? 'a' : 'b') : null,
    },
  ]

  return (
    <>
      {/* Hero duel */}
      <div className="duel">
        <div className="duel-driver" style={{ '--c': DRIVER_COLORS[0] }}>
          <div className="duel-car">#{a.car} · {a.team_name?.split(' ').slice(0, 2).join(' ')}</div>
          <div className="duel-name">{a.driver_name}</div>
          <div className={`duel-lap ${!aFaster ? 'dim' : ''}`}>{fmtLap(a.stats.best_lap)}</div>
          {aFaster && <div className="duel-winner-tag">▲ Faster</div>}
        </div>

        <div className="duel-center">
          <div className="duel-vs">VS</div>
          <div className="duel-lap-label">Best Lap</div>
        </div>

        <div className="duel-driver right" style={{ '--c': DRIVER_COLORS[1] }}>
          <div className="duel-car">#{b.car} · {b.team_name?.split(' ').slice(0, 2).join(' ')}</div>
          <div className="duel-name">{b.driver_name}</div>
          <div className={`duel-lap ${!bFaster ? 'dim' : ''}`}>{fmtLap(b.stats.best_lap)}</div>
          {bFaster && <div className="duel-winner-tag">▲ Faster</div>}
        </div>
      </div>

      {/* Stat rows */}
      <div className="stat-rows">
        {rows.map((r) => (
          <div key={r.key} className="stat-row">
            <div
              className={`stat-val ${r.winner === 'a' ? 'winner' : ''}`}
              style={{ '--c': DRIVER_COLORS[0] }}
            >
              {r.winner === 'a' && <span className="win-dot" style={{ '--c': DRIVER_COLORS[0] }} />}
              {r.a}
            </div>
            <div className="stat-key">{r.key}</div>
            <div
              className={`stat-val right ${r.winner === 'b' ? 'winner' : ''}`}
              style={{ '--c': DRIVER_COLORS[1] }}
            >
              {r.b}
              {r.winner === 'b' && <span className="win-dot" style={{ '--c': DRIVER_COLORS[1] }} />}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

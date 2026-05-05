import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import Navbar from '../components/Navbar';
import LeagueNav from '../components/LeagueNav';
import { teamColor } from '../constants/teamColors';

/* ── Info tooltip ────────────────────────────────────────────── */
function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle', marginLeft: 5 }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          width: 15, height: 15, borderRadius: '50%',
          background: open ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.2)',
          color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: 700,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, lineHeight: 1, fontFamily: 'serif',
          transition: 'all 0.15s', flexShrink: 0,
        }}
        title={text}
      >
        i
      </button>
      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)',
          background: '#1c1c1f', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, padding: '8px 12px',
          fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5,
          width: 220, zIndex: 999, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}>
          {text}
          <div style={{
            position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)',
            width: 8, height: 8, background: '#1c1c1f',
            border: '1px solid rgba(255,255,255,0.12)', borderTop: 'none', borderLeft: 'none',
            transform: 'translateX(-50%) rotate(45deg)',
          }} />
        </div>
      )}
    </span>
  );
}

/* ── Mini bar chart ─────────────────────────────────────────── */
function MiniBarChart({ data, color = '#e10600', label = '' }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.value), 1);

  return (
    <div>
      {label && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>{d.value}</div>
            <div
              style={{
                width: '100%', minHeight: 2,
                height: `${(d.value / max) * 52}px`,
                background: d.highlight ? '#fbbf24' : color,
                borderRadius: '2px 2px 0 0',
                opacity: d.value === 0 ? 0.2 : 1,
                transition: 'height 0.3s ease',
              }}
            />
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>R{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Cumulative line chart (pure CSS/SVG) ───────────────────── */
function CumulativeChart({ rounds }) {
  if (!rounds || rounds.length === 0) return (
    <div style={{ textAlign: 'center', padding: 30, color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
      No data yet
    </div>
  );

  const width = 500;
  const height = 120;
  const pad = { top: 10, right: 10, bottom: 20, left: 32 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const maxCum = Math.max(...rounds.map(r => r.cumulative), 1);
  const minCum = 0;

  const xScale = i => pad.left + (i / Math.max(rounds.length - 1, 1)) * innerW;
  const yScale = v => pad.top + innerH - ((v - minCum) / (maxCum - minCum)) * innerH;

  const points = rounds.map((r, i) => `${xScale(i)},${yScale(r.cumulative)}`).join(' ');
  const areaPoints = [
    `${xScale(0)},${pad.top + innerH}`,
    ...rounds.map((r, i) => `${xScale(i)},${yScale(r.cumulative)}`),
    `${xScale(rounds.length - 1)},${pad.top + innerH}`,
  ].join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
      {/* Area fill */}
      <polygon points={areaPoints} fill="rgba(225,6,0,0.08)" />
      {/* Line */}
      <polyline points={points} fill="none" stroke="#e10600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Points */}
      {rounds.map((r, i) => (
        <g key={i}>
          <circle cx={xScale(i)} cy={yScale(r.cumulative)} r="3" fill="#e10600" />
          <text x={xScale(i)} y={height - 4} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.35)">
            R{r.week}
          </text>
        </g>
      ))}
      {/* Y axis labels */}
      <text x={pad.left - 4} y={pad.top + 4} textAnchor="end" fontSize="8" fill="rgba(255,255,255,0.35)">{maxCum}</text>
      <text x={pad.left - 4} y={pad.top + innerH + 4} textAnchor="end" fontSize="8" fill="rgba(255,255,255,0.35)">0</text>
    </svg>
  );
}

/* ── Stat card ──────────────────────────────────────────────── */
function StatCard({ label, value, sub, color = '#fff', icon, info }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 20px',
    }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'flex', alignItems: 'center' }}>
        {icon && <span style={{ marginRight: 4 }}>{icon}</span>}{label}
        {info && <InfoTooltip text={info} />}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ── Driver row in points breakdown ────────────────────────── */
function DriverRow({ name, isCaptain, points, color }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 3, height: 20, borderRadius: 2, background: color || '#e10600' }} />
        <span style={{ fontSize: 13 }}>{name}</span>
        {isCaptain && <span style={{ fontSize: 10, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', padding: '1px 5px', borderRadius: 4 }}>C</span>}
      </div>
      <span style={{ fontWeight: 700, fontSize: 14, color: points > 0 ? '#22c55e' : points < 0 ? '#f87171' : 'rgba(255,255,255,0.4)' }}>
        {points > 0 ? '+' : ''}{points}
      </span>
    </div>
  );
}

export default function Stats() {
  const { leagueId } = useParams();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [leagueName, setLeagueName] = useState('');
  const [selectedRound, setSelectedRound] = useState(null);
  const [optimalTeam, setOptimalTeam] = useState(null);
  const [optimalLoading, setOptimalLoading] = useState(false);
  const [optimalOpen, setOptimalOpen] = useState(false);
  const [optimalError, setOptimalError] = useState(null);
  const [tab, setTab] = useState('my-stats');
  const [ctorStandings, setCtorStandings] = useState(null);
  const [ctorLoading, setCtorLoading] = useState(false);
  const [ctorWeek, setCtorWeek] = useState(null);
  const [ctorSortBy, setCtorSortBy] = useState('wccPosition');
  const [ctorSortDir, setCtorSortDir] = useState('asc');
  const [ctorError, setCtorError] = useState(null);

  function selectRound(round) {
    setSelectedRound(round);
    setOptimalTeam(null);
    setOptimalError(null);
    setOptimalOpen(false);
  }

  useEffect(() => {
    api.getLeagues().then(leagues => {
      const l = leagues.find(l => l.id === leagueId);
      if (l) setLeagueName(l.name);
    }).catch(() => {});

    api.getStats(leagueId)
      .then(data => {
        setStats(data);
        if (data.rounds?.length > 0) {
          const latest = data.rounds[data.rounds.length - 1];
          setSelectedRound(latest);
          setCtorWeek(latest.week);
        } else {
          setCtorWeek(1);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [leagueId]);

  useEffect(() => {
    if (!selectedRound) return;
    setOptimalTeam(null);
    setOptimalError(null);
    setOptimalOpen(false);
    setOptimalLoading(true);
    api.getOptimalTeam(leagueId, selectedRound.week)
      .then(data => setOptimalTeam(data))
      .catch(e => { if (e?.status !== 404) setOptimalError(e?.message || 'Failed to load Dream Team'); })
      .finally(() => setOptimalLoading(false));
  }, [leagueId, selectedRound?.week]);

  useEffect(() => {
    if (ctorWeek === null) return;
    setCtorLoading(true);
    setCtorError(null);
    api.getConstructorStandings(leagueId, ctorWeek)
      .then(data => setCtorStandings(data))
      .catch(e => setCtorError(e.message || 'Failed to load constructor standings'))
      .finally(() => setCtorLoading(false));
  }, [leagueId, ctorWeek]);

  function handleCtorSort(key) {
    if (ctorSortBy === key) {
      setCtorSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setCtorSortBy(key);
      setCtorSortDir(['wccPosition', 'name'].includes(key) ? 'asc' : 'desc');
    }
  }

  const currentWeek = stats?.rounds?.length > 0
    ? stats.rounds[stats.rounds.length - 1].week
    : 1;

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-root)' }}>
      <Navbar />
      <LeagueNav leagueId={leagueId} week={1} leagueName={leagueName} />
      <div style={{ textAlign: 'center', paddingTop: 80 }}><div className="spinner" /></div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-root)' }}>
      <Navbar />
      <LeagueNav leagueId={leagueId} week={1} leagueName={leagueName} />
      <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 16px' }}>
        <div style={{ background: 'rgba(225,6,0,0.1)', border: '1px solid rgba(225,6,0,0.3)', borderRadius: 8, padding: 16, color: '#fca5a5' }}>{error}</div>
      </div>
    </div>
  );

  if (!stats || stats.roundsPlayed === 0) {
    const hasResults = stats?.resultsExist;
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-root)' }}>
        <Navbar />
        <LeagueNav leagueId={leagueId} week={1} leagueName={leagueName} />
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{hasResults ? '🏎️' : '📊'}</div>
          <h2 style={{ color: '#fff', fontFamily: 'var(--font-display)' }}>No Stats Yet</h2>
          {hasResults ? (
            <>
              <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>
                Race results are in, but you haven't submitted a team for any rounds in this league yet.
              </p>
              <Link
                to={`/leagues/${leagueId}/pick`}
                style={{
                  display: 'inline-block',
                  background: '#e10600', color: '#fff',
                  padding: '10px 24px', borderRadius: 10,
                  fontWeight: 700, fontSize: 14, textDecoration: 'none',
                }}
              >
                Pick your team →
              </Link>
            </>
          ) : (
            <p style={{ color: 'rgba(255,255,255,0.5)' }}>
              Stats will appear after your first race result is imported.
            </p>
          )}
        </div>
      </div>
    );
  }

  const barData = stats.rounds.map(r => ({ label: r.week, value: r.points, highlight: r.week === stats.bestRound?.week }));

  const captainHitRate = stats.rounds.filter(r => r.captainId && r.captainBonus > 0).length;
  const captainRounds = stats.rounds.filter(r => r.captainId).length;
  const captainPct = captainRounds > 0 ? Math.round((captainHitRate / captainRounds) * 100) : 0;

  const totalCaptainBonus = stats.rounds.reduce((s, r) => s + (r.captainBonus || 0), 0);

  const captainFreq = {};
  for (const r of stats.rounds) {
    if (r.captainName) {
      captainFreq[r.captainName] = (captainFreq[r.captainName] || 0) + 1;
    }
  }
  const goToCaptain = Object.entries(captainFreq).sort((a, b) => b[1] - a[1])[0];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-root)' }}>
      <Navbar />
      <LeagueNav leagueId={leagueId} week={currentWeek} leagueName={leagueName} />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: '4px 0 0', fontSize: 30, fontFamily: 'var(--font-display)', fontWeight: 800 }}>Stats</h1>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {[['my-stats', 'My Stats'], ['constructors', 'Constructors']].map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? 'var(--red)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${tab === t ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: 8, padding: '6px 16px', cursor: 'pointer',
                color: tab === t ? '#fff' : 'var(--text-3)',
                fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
              }}
            >{label}</button>
          ))}
        </div>

        {tab === 'my-stats' && (<>
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard label="Total Points" value={stats.totalPoints} icon="🏆" color="#fff"
            info="Your cumulative score across all rounds this season, based on your drivers' and constructor's finishing positions." />
          <StatCard label="Rounds Played" value={stats.roundsPlayed} icon="🏁" color="rgba(255,255,255,0.8)"
            info="Number of race weekends where you submitted a team. Missing a round scores 0 pts for that week." />
          <StatCard label="Avg Per Round" value={stats.avgPoints} sub="points" icon="📈" color="rgba(255,255,255,0.8)"
            info="Your mean score per round — Total Points ÷ Rounds Played. A useful measure of consistency across the season." />
          <StatCard label="Best Round" value={stats.bestRound?.points || 0} sub={`Round ${stats.bestRound?.week}`} icon="⚡" color="#22c55e"
            info="Your highest single-round score this season. This round is highlighted in gold on the bar chart below." />
          <StatCard label="Captain Bonus" value={`+${totalCaptainBonus}`} sub={goToCaptain ? `${captainPct}% hit rate · ${goToCaptain[0]}` : `${captainPct}% hit rate`} icon="👑" color="#fbbf24"
            info="Extra points earned from your captain picks. Your captain scores 2× points (3× with Triple Captain chip). Hit rate = % of rounds your captain finished with a positive score." />
        </div>

        {/* Cumulative line chart */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 20, marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center' }}>
            📈 Cumulative Points Over Season
            <InfoTooltip text="Your running total score as the season progresses. A steeper upward slope means a stronger streak of high-scoring rounds." />
          </div>
          <CumulativeChart rounds={stats.rounds} />
        </div>

        {/* Bar chart - points per round */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 20, marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center' }}>
            📊 Points Per Round <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 400, marginLeft: 6 }}>(gold = best round)</span>
            <InfoTooltip text="Each bar = one round's score. Gold bar = your best round. Green bars are above your season average; red bars are below." />
          </div>
          <MiniBarChart data={barData} />
        </div>

        {/* Round-by-round breakdown */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 20, marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center' }}>
            🏎️ Round Breakdown
            <InfoTooltip text="Click any row to see the full driver & constructor breakdown for that round. Rnd = round number, Pts = your score, Cumulative = running season total." />
          </div>

          {/* Rounds summary table */}
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 10 }}>Rnd</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 10 }}>Pts</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 10 }}>Cumulative</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 10 }}>Captain</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 10 }}>Chip</th>
                </tr>
              </thead>
              <tbody>
                {stats.rounds.map(round => (
                  <tr
                    key={round.week}
                    onClick={() => selectRound(round)}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      cursor: 'pointer',
                      background: selectedRound?.week === round.week ? 'rgba(225,6,0,0.07)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '7px 10px', fontWeight: 700, color: selectedRound?.week === round.week ? '#f87171' : '#fff' }}>R{round.week}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: round.points >= stats.avgPoints ? '#22c55e' : '#f87171' }}>
                      {round.points}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>{round.cumulative}</td>
                    <td style={{ padding: '7px 10px', color: '#fbbf24', fontSize: 11 }}>
                      {round.captainName ? `👑 ${round.captainName}` : <span style={{ color: '#3f3f46' }}>—</span>}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      {round.chipUsed ? (
                        <span style={{
                          fontSize: 10, background: 'rgba(251,191,36,0.15)', color: '#fbbf24',
                          padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                        }}>
                          {round.chipUsed === 'wildcard' ? '🃏' : round.chipUsed === 'triple_captain' ? '👑' : round.chipUsed === 'no_negative' ? '🛡' : '💺'}
                          {' '}{round.chipUsed.replace('_', ' ')}
                        </span>
                      ) : <span style={{ color: '#3f3f46' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Round selector */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {stats.rounds.map(r => (
              <button
                key={r.week}
                onClick={() => selectRound(r)}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: selectedRound?.week === r.week ? 'var(--red)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${selectedRound?.week === r.week ? 'var(--red)' : 'var(--border)'}`,
                  color: '#fff', cursor: 'pointer',
                }}
              >R{r.week}</button>
            ))}
          </div>

          {selectedRound && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Round {selectedRound.week}</span>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                    Budget: <strong style={{ color: '#fff' }}>${selectedRound.budgetUsed?.toFixed(1)}M</strong>
                  </span>
                  {selectedRound.chipUsed && (
                    <span style={{ fontSize: 12, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', padding: '2px 8px', borderRadius: 4 }}>
                      ⚡ {selectedRound.chipUsed}
                    </span>
                  )}
                  <span style={{
                    fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-display)',
                    color: selectedRound.points >= stats.avgPoints ? '#22c55e' : '#f87171',
                  }}>
                    {selectedRound.points} pts
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                {selectedRound.drivers?.map(d => (
                  <DriverRow
                    key={d.id}
                    name={d.name}
                    isCaptain={d.isCaptain}
                    points={d.isCaptain ? d.points * (selectedRound.chipUsed === 'triple_captain' ? 3 : 2) : d.points}
                  />
                ))}
                {selectedRound.constructor && (
                  <DriverRow
                    name={`${selectedRound.constructor.name} (Constructor)`}
                    points={selectedRound.constructor.points}
                    color="#6692ff"
                  />
                )}
              </div>

              {selectedRound.captainName && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: '#fbbf24', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    👑 Captain: {selectedRound.captainName} · +{selectedRound.captainBonus} bonus pts
                    <InfoTooltip text="The bonus points earned from your captain's 2× multiplier (or 3× with Triple Captain chip). The bar below shows what % of your total round score this bonus represents." />
                  </div>
                  {selectedRound.points > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: 4,
                          width: `${Math.min(100, Math.round((selectedRound.captainBonus / selectedRound.points) * 100))}%`,
                          background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                          borderRadius: 2,
                        }} />
                      </div>
                      <span style={{ fontSize: 10, color: '#fbbf24', fontWeight: 700, minWidth: 36 }}>
                        {Math.round((selectedRound.captainBonus / selectedRound.points) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Hindsight: Best Possible Team */}
              {!optimalLoading && optimalTeam && (
                <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                  <button
                    onClick={() => setOptimalOpen(o => !o)}
                    style={{
                      width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: 0,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      🏆 Best Possible Team
                      <InfoTooltip text="The highest-scoring 5-driver + 1-constructor combination that could have been picked within the league budget. No captain or chip effects applied." />
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{optimalOpen ? '▲' : '▼'}</span>
                  </button>

                  <div style={{
                    marginTop: 8, fontSize: 12,
                    color: (() => {
                      const delta = optimalTeam.totalPoints - selectedRound.points;
                      return delta > 0 ? '#f87171' : '#22c55e';
                    })(),
                    fontWeight: 600,
                  }}>
                    You scored {selectedRound.points} pts · Best possible: {optimalTeam.totalPoints} pts
                    {optimalTeam.totalPoints !== selectedRound.points && (
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>
                        {' '}({Math.abs(optimalTeam.totalPoints - selectedRound.points)} pts {optimalTeam.totalPoints > selectedRound.points ? 'left on the table' : 'above Dream Team'})
                      </span>
                    )}
                  </div>

                  {optimalOpen && (
                    <div style={{ marginTop: 10 }}>
                      {optimalTeam.drivers.map(d => (
                        <DriverRow key={d.id} name={d.name} points={d.points} />
                      ))}
                      <DriverRow
                        name={`${optimalTeam.constructor.name} (Constructor)`}
                        points={optimalTeam.constructor.points}
                        color="#6692ff"
                      />
                    </div>
                  )}
                </div>
              )}
              {optimalLoading && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                  Loading Dream Team…
                </div>
              )}
              {!optimalLoading && optimalError && (
                <div style={{ marginTop: 12, fontSize: 12, color: '#f87171' }}>
                  {optimalError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Best/worst */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, color: '#22c55e', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'flex', alignItems: 'center' }}>⚡ Best Round <InfoTooltip text="Your highest single-round score this season. The gold bar on the chart above marks this round." /></div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)' }}>Round {stats.bestRound?.week}</div>
            <div style={{ fontSize: 18, color: '#22c55e', fontWeight: 700 }}>{stats.bestRound?.points} pts</div>
          </div>
          <div style={{ background: 'rgba(225,6,0,0.06)', border: '1px solid rgba(225,6,0,0.15)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, color: '#f87171', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, display: 'flex', alignItems: 'center' }}>💀 Worst Round <InfoTooltip text="Your lowest single-round score this season. Don't stress — one bad weekend doesn't define a season." /></div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)' }}>Round {stats.worstRound?.week}</div>
            <div style={{ fontSize: 18, color: '#f87171', fontWeight: 700 }}>{stats.worstRound?.points} pts</div>
          </div>
        </div>

        {/* Most used drivers */}
        {stats.rounds.length > 0 && (() => {
          const freq = {};
          for (const r of stats.rounds) {
            for (const d of (r.drivers || [])) {
              if (!freq[d.name]) freq[d.name] = { name: d.name, count: 0, totalPts: 0 };
              freq[d.name].count++;
              freq[d.name].totalPts += d.points || 0;
            }
          }
          const sorted = Object.values(freq).sort((a, b) => b.count - a.count || b.totalPts - a.totalPts).slice(0, 8);
          if (sorted.length === 0) return null;
          return (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center' }}>
                🔄 Your Most-Picked Drivers
                <InfoTooltip text="Drivers you've selected most frequently across the season. Total pts = combined points scored by that driver in all rounds you picked them." />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sorted.map((d, i) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', width: 16, textAlign: 'right' }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#fff' }}>{d.name}</span>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <div style={{ height: 6, width: `${(d.count / stats.rounds.length) * 80}px`, background: '#e10600', borderRadius: 3, minWidth: 4 }} />
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', minWidth: 60, textAlign: 'right' }}>
                        {d.count}/{stats.rounds.length} rounds
                      </span>
                      <span style={{ fontSize: 11, color: d.totalPts > 0 ? '#22c55e' : 'rgba(255,255,255,0.3)', minWidth: 50, textAlign: 'right', fontWeight: 600 }}>
                        {d.totalPts > 0 ? '+' : ''}{d.totalPts} pts
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        </>)}

        {tab === 'constructors' && (() => {
          const ctorSorted = [...(ctorStandings?.constructors ?? [])].sort((a, b) => {
            let cmp;
            if (ctorSortBy === 'name') cmp = b.name.localeCompare(a.name);
            else if (ctorSortBy === 'wccPosition') cmp = (b.wccPosition ?? 99) - (a.wccPosition ?? 99);
            else if (ctorSortBy === 'wccPoints') cmp = (b.wccPoints ?? -1) - (a.wccPoints ?? -1);
            else if (ctorSortBy === 'fantasyPoints') cmp = b.fantasyPoints - a.fantasyPoints;
            else if (ctorSortBy === 'price') cmp = (b.price ?? -1) - (a.price ?? -1);
            else cmp = b.ownershipPct - a.ownershipPct;
            return ctorSortDir === 'asc' ? -cmp : cmp;
          });

          return (
            <div>
              {/* Week nav */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 10px', width: 'fit-content', marginBottom: 20 }}>
                <button onClick={() => setCtorWeek(w => Math.max(1, w - 1))} style={sNavBtn} disabled={(ctorWeek ?? 1) <= 1}>‹</button>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, minWidth: 80, textAlign: 'center' }}>Round {ctorWeek ?? 1}</span>
                <button onClick={() => setCtorWeek(w => (w ?? 1) + 1)} style={sNavBtn}>›</button>
              </div>

              {ctorError ? (
                <div style={{ background: 'rgba(225,6,0,0.1)', border: '1px solid rgba(225,6,0,0.3)', borderRadius: 8, padding: 16, color: '#fca5a5' }}>{ctorError}</div>
              ) : ctorLoading ? (
                <div style={{ textAlign: 'center', paddingTop: 40 }}><div className="spinner" /></div>
              ) : ctorSorted.length === 0 ? (
                <div style={{ background: 'var(--bg-card)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 14, padding: '48px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 14 }}>🏎️</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#a1a1aa', marginBottom: 8 }}>
                    No constructor data for Round {ctorWeek ?? 1}
                  </div>
                  <div style={{ fontSize: 13, color: '#52525b', maxWidth: 360, margin: '0 auto' }}>
                    WCC standings appear once race results have been imported.
                  </div>
                </div>
              ) : (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ ...sTh, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCtorSort('wccPosition')}>
                          WCC {ctorSortBy === 'wccPosition' ? (ctorSortDir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.3 }}>⇅</span>}
                        </th>
                        <th style={{ ...sTh, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCtorSort('name')}>
                          Constructor {ctorSortBy === 'name' ? (ctorSortDir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.3 }}>⇅</span>}
                        </th>
                        <th style={{ ...sTh, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCtorSort('wccPoints')}>
                          WCC Pts {ctorSortBy === 'wccPoints' ? (ctorSortDir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.3 }}>⇅</span>}
                        </th>
                        <th style={{ ...sTh, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCtorSort('fantasyPoints')}>
                          Fantasy Pts {ctorSortBy === 'fantasyPoints' ? (ctorSortDir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.3 }}>⇅</span>}
                        </th>
                        <th style={{ ...sTh, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCtorSort('price')}>
                          Price {ctorSortBy === 'price' ? (ctorSortDir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.3 }}>⇅</span>}
                        </th>
                        <th style={{ ...sTh, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCtorSort('ownershipPct')}>
                          Ownership {ctorSortBy === 'ownershipPct' ? (ctorSortDir === 'asc' ? '▲' : '▼') : <span style={{ opacity: 0.3 }}>⇅</span>}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ctorSorted.map((c, i) => (
                        <tr key={c.id} style={{ borderBottom: i < ctorSorted.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                          <td style={sTd}>
                            {c.wccPosition != null
                              ? <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: c.wccPosition <= 3 ? '#fbbf24' : '#fff' }}>P{c.wccPosition}</span>
                              : <span style={{ color: 'var(--text-4)', fontSize: 12 }}>—</span>}
                          </td>
                          <td style={sTd}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 3, height: 28, borderRadius: 2, background: teamColor(c.name), flexShrink: 0 }} />
                              <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{c.name}</span>
                            </div>
                          </td>
                          <td style={{ ...sTd, textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: 16 }}>
                            {c.wccPoints != null ? c.wccPoints : <span style={{ color: 'var(--text-4)', fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ ...sTd, textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: 16 }}>
                            {c.fantasyPoints}
                          </td>
                          <td style={{ ...sTd, textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: 16 }}>
                            {c.price != null ? `$${c.price.toFixed(1)}M` : <span style={{ color: 'var(--text-4)', fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ ...sTd, textAlign: 'right' }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: c.ownershipPct >= 50 ? '#22c55e' : 'rgba(255,255,255,0.6)' }}>
                              {c.ownershipPct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

const sTh = {
  padding: '10px 14px', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--text-3)', textAlign: 'left',
};
const sTd = { padding: '11px 14px', fontSize: 13, color: 'var(--text-2)', verticalAlign: 'middle' };
const sNavBtn = {
  background: 'none', border: 'none', color: 'var(--text-3)',
  cursor: 'pointer', fontSize: 18, padding: '2px 6px', lineHeight: 1,
};

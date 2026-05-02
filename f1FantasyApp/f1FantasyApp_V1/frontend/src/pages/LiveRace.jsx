import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useLiveTiming } from '../contexts/LiveTimingContext';
import { api } from '../api';

const POLL_INTERVAL_S = 5;

// ── Constants ────────────────────────────────────────────────────

const COMPOUND_COLORS = {
  SOFT: '#e10600',
  MEDIUM: '#fbbf24',
  HARD: '#e4e4e7',
  INTERMEDIATE: '#22c55e',
  WET: '#3b82f6',
};

const COMPOUND_ABBR = {
  SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W',
};

const RC_FLAG_COLORS = {
  YELLOW: '#fbbf24',
  DOUBLE_YELLOW: '#fbbf24',
  RED: '#e10600',
  SC: '#fbbf24',
  VSC: '#fbbf24',
  CLEAR: '#22c55e',
  CHEQUERED: '#fff',
  BLUE: '#3b82f6',
};

function formatLapTime(seconds) {
  if (!seconds || seconds <= 0) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3).padStart(6, '0');
  return mins > 0 ? `${mins}:${secs}` : `${secs}s`;
}

function formatGap(gap) {
  if (!gap) return '—';
  if (typeof gap === 'string') return gap;
  const v = parseFloat(gap);
  if (isNaN(v)) return gap;
  return v === 0 ? 'LEADER' : `+${v.toFixed(3)}`;
}

function TyreBadge({ compound, age }) {
  if (!compound) return <span style={{ color: 'var(--text-4)', fontSize: 11 }}>—</span>;
  const color = COMPOUND_COLORS[compound] ?? '#fff';
  const abbr = COMPOUND_ABBR[compound] ?? compound[0];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: 11, fontWeight: 800, letterSpacing: '0.03em',
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: '50%',
        background: color === '#e4e4e7' ? 'transparent' : `${color}22`,
        border: `2px solid ${color}`,
        color, fontSize: 10, fontWeight: 900,
      }}>{abbr}</span>
      {age != null && <span style={{ color: 'var(--text-4)', fontSize: 10 }}>{age}</span>}
    </span>
  );
}

function PositionBadge({ pos }) {
  const color = pos === 1 ? '#fbbf24' : pos === 2 ? '#a1a1aa' : pos === 3 ? '#cd7f32' : 'var(--text-4)';
  return (
    <span style={{
      fontFamily: 'var(--font-display)', fontWeight: 800,
      fontSize: 15, color, minWidth: 24, textAlign: 'right',
    }}>{pos === 99 ? '—' : pos}</span>
  );
}

function LiveDot() {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: 'var(--red)', marginRight: 6,
      animation: 'pulseDot 1.4s ease-in-out infinite',
    }} />
  );
}

function RaceControlBanner({ messages }) {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!messages.length) return;
    setIdx(0);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setIdx(i => (i + 1) % messages.length), 6000);
    return () => clearInterval(timerRef.current);
  }, [messages]);

  if (!messages.length) return null;
  const msg = messages[idx];
  const flagColor = RC_FLAG_COLORS[msg.flag] ?? RC_FLAG_COLORS[msg.category] ?? 'var(--text-2)';
  const isAlert = ['RED', 'SC', 'VSC', 'YELLOW', 'DOUBLE_YELLOW'].includes(msg.flag);

  return (
    <div style={{
      padding: '8px 18px',
      background: isAlert ? `${flagColor}12` : 'var(--bg-card)',
      border: `1px solid ${isAlert ? `${flagColor}35` : 'var(--border)'}`,
      borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10,
      animation: 'fadeUp 0.2s ease',
      overflow: 'hidden',
    }}>
      {msg.flag && (
        <span style={{
          fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: flagColor, flexShrink: 0,
          padding: '2px 6px', border: `1px solid ${flagColor}50`, borderRadius: 4,
        }}>
          {msg.flag.replace('_', ' ')}
        </span>
      )}
      <span style={{ fontSize: 12, color: isAlert ? flagColor : 'var(--text-2)', flex: 1, minWidth: 0 }}>
        {msg.message}
      </span>
      {messages.length > 1 && (
        <span style={{ fontSize: 10, color: 'var(--text-4)', flexShrink: 0 }}>
          {idx + 1}/{messages.length}
        </span>
      )}
    </div>
  );
}

function DriverRow({ driver, isMyDriver, isCaptain, isConstructor }) {
  const teamColor = driver.team_colour ? `#${driver.team_colour.replace('#', '')}` : '#666';
  const isLeader = driver.position === 1;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '28px 4px 44px 1fr 90px 90px 44px',
      alignItems: 'center',
      gap: 8,
      padding: '7px 14px',
      background: isMyDriver
        ? 'rgba(225,6,0,0.06)'
        : isLeader ? 'rgba(251,191,36,0.04)' : 'transparent',
      borderLeft: isMyDriver
        ? '2px solid var(--red)'
        : isLeader ? '2px solid rgba(251,191,36,0.4)' : '2px solid transparent',
      borderRadius: 4,
      transition: 'background 0.2s',
    }}>
      {/* Position */}
      <PositionBadge pos={driver.position} />

      {/* Team colour bar */}
      <div style={{
        width: 4, height: 28, borderRadius: 2,
        background: teamColor, flexShrink: 0,
      }} />

      {/* Driver acronym */}
      <span style={{
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14,
        color: isMyDriver ? '#fff' : 'var(--text-2)',
        letterSpacing: '0.05em',
      }}>
        {driver.name_acronym ?? '???'}
        {isCaptain && <span style={{ color: 'var(--gold)', fontSize: 9, marginLeft: 3 }}>★</span>}
        {isConstructor && <span style={{ color: '#93c5fd', fontSize: 9, marginLeft: 3 }}>C</span>}
      </span>

      {/* Team name (collapsed on narrow screens) */}
      <span style={{
        fontSize: 11, color: 'var(--text-4)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {driver.team_name ?? ''}
      </span>

      {/* Gap to leader */}
      <span style={{
        fontSize: 12, color: isLeader ? '#fbbf24' : 'var(--text-3)',
        fontFamily: 'monospace', textAlign: 'right',
      }}>
        {isLeader ? 'LEADER' : formatGap(driver.gap_to_leader)}
      </span>

      {/* Last lap */}
      <span style={{
        fontSize: 12, color: 'var(--text-3)',
        fontFamily: 'monospace', textAlign: 'right',
      }}>
        {formatLapTime(driver.last_lap_duration)}
      </span>

      {/* Tyre */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <TyreBadge compound={driver.compound} age={driver.tyre_age} />
      </div>
    </div>
  );
}

function WeatherBar({ weather }) {
  if (!weather) return null;
  const { air_temperature, track_temperature, humidity, rainfall, wind_speed } = weather;
  return (
    <div style={{
      display: 'flex', gap: 16, flexWrap: 'wrap',
      padding: '6px 0', fontSize: 11, color: 'var(--text-4)',
    }}>
      {air_temperature != null && <span>🌡 Air {air_temperature}°C</span>}
      {track_temperature != null && <span>Track {track_temperature}°C</span>}
      {humidity != null && <span>💧 {humidity}%</span>}
      {wind_speed != null && <span>💨 {wind_speed} m/s</span>}
      {rainfall ? <span style={{ color: '#93c5fd' }}>🌧 Rain</span> : null}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────

export default function LiveRace() {
  const { leagueId } = useParams();
  const { session, standings, raceControl, weather, isLive, isLoading, error, currentLap } = useLiveTiming();

  const [myTeam, setMyTeam] = useState(null);
  const [myTeamLoading, setMyTeamLoading] = useState(false);

  // Fetch the user's fantasy team if we have league context
  useEffect(() => {
    if (!leagueId) return;
    async function loadTeam() {
      setMyTeamLoading(true);
      try {
        const league = await api.getLeague(leagueId);
        const week = league.currentWeek ?? league.currentRound ?? null;
        if (!week) return;
        const team = await api.getTeam(leagueId, week);
        setMyTeam(team);
      } catch {
        // Non-fatal — live timing still works without team context
      } finally {
        setMyTeamLoading(false);
      }
    }
    loadTeam();
  }, [leagueId]);

  // Build a set of driver numbers owned by the user, matched by driver number
  const myDriverNumbers = new Set();
  let myCaptainNumber = null;
  let myConstructorDriverNumbers = new Set();

  if (myTeam) {
    const teamDrivers = myTeam.drivers ?? myTeam.teamDrivers ?? [];
    teamDrivers.forEach(d => {
      const num = d.number ?? d.driver?.number;
      if (num) myDriverNumbers.add(Number(num));
    });
    const captainId = myTeam.captainId ?? myTeam.captain_id;
    if (captainId) {
      const cap = teamDrivers.find(d => (d.id ?? d.driverId) === captainId);
      const capNum = cap?.number ?? cap?.driver?.number;
      if (capNum) myCaptainNumber = Number(capNum);
    }
    // Constructor drivers (all drivers from user's constructor)
    const constructorName = myTeam.constructor?.name ?? myTeam.constructorSelection?.name;
    if (constructorName) {
      standings.forEach(d => {
        if (d.team_name && d.team_name.toLowerCase().includes(constructorName.toLowerCase().split(' ')[0])) {
          myConstructorDriverNumbers.add(d.driver_number);
        }
      });
    }
  }

  const sessionType = session?.session_name ?? session?.session_type ?? 'SESSION';
  const circuitName = session?.circuit_short_name ?? session?.location ?? '';
  const countryName = session?.country_name ?? '';
  const sessionLabel = `${circuitName}${countryName ? ` · ${countryName}` : ''}`.toUpperCase();

  const isRace = sessionType?.toLowerCase().includes('race');
  const hasData = standings.length > 0;

  // My team's drivers visible in the standings
  const myStandings = standings.filter(d => myDriverNumbers.has(d.driver_number));

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-root)' }}>
      <Navbar />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>

        {/* ── Session header ── */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12, marginBottom: 16,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              {isLive && <LiveDot />}
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
                color: isLive ? 'var(--red)' : 'var(--text-4)',
                fontFamily: 'var(--font-display)',
              }}>
                {isLive ? 'LIVE' : 'LAST SESSION'}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--text-3)',
              }}>
                {sessionType}
              </span>
            </div>
            <h1 style={{
              margin: 0, fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 800,
              letterSpacing: '0.04em',
            }}>
              {sessionLabel || 'LIVE TIMING'}
            </h1>
            <WeatherBar weather={weather} />
          </div>

          {/* Lap counter */}
          {isRace && currentLap > 0 && (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '10px 18px', textAlign: 'center',
            }}>
              <div style={{
                fontSize: 32, fontFamily: 'var(--font-display)', fontWeight: 900,
                color: isLive ? 'var(--red)' : 'var(--text-2)',
                lineHeight: 1,
              }}>
                {currentLap}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>
                LAP
              </div>
            </div>
          )}
        </div>

        {/* ── Race control banner ── */}
        {raceControl.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <RaceControlBanner messages={raceControl} />
          </div>
        )}

        {/* ── Error / loading states ── */}
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div className="spinner" />
            <p style={{ color: 'var(--text-4)', fontSize: 13, marginTop: 12 }}>
              Connecting to live timing…
            </p>
          </div>
        )}

        {!isLoading && error && (
          <div style={{
            background: 'rgba(225,6,0,0.08)', border: '1px solid rgba(225,6,0,0.25)',
            borderRadius: 10, padding: '20px 24px', color: '#f87171',
            fontSize: 14, textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {!isLoading && !error && !session && (
          <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--text-4)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📡</div>
            <p style={{ fontSize: 15 }}>No F1 session data available right now.</p>
            <p style={{ fontSize: 12, marginTop: 8 }}>Check back during a race weekend.</p>
          </div>
        )}

        {!isLoading && !error && session && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: myTeam ? 'minmax(0,1fr) 280px' : '1fr',
            gap: 16,
            alignItems: 'start',
          }}>

            {/* ── Driver tower ── */}
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              overflow: 'hidden',
            }}>
              {/* Column headers */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '28px 4px 44px 1fr 90px 90px 44px',
                gap: 8,
                padding: '8px 14px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-card-2)',
              }}>
                {['POS', '', 'DRV', 'TEAM', 'GAP', 'LAST LAP', 'TYRE'].map((h, i) => (
                  <span key={i} style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: 'var(--text-4)',
                    textAlign: i >= 4 ? 'right' : 'left',
                  }}>
                    {h}
                  </span>
                ))}
              </div>

              {/* Driver rows */}
              {!hasData ? (
                <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                  <div className="spinner-sm" />
                  <p style={{ color: 'var(--text-4)', fontSize: 12, marginTop: 10 }}>
                    Waiting for session data…
                  </p>
                </div>
              ) : (
                <div>
                  {standings.map(driver => (
                    <DriverRow
                      key={driver.driver_number}
                      driver={driver}
                      isMyDriver={myDriverNumbers.has(driver.driver_number)}
                      isCaptain={driver.driver_number === myCaptainNumber}
                      isConstructor={myConstructorDriverNumbers.has(driver.driver_number) && !myDriverNumbers.has(driver.driver_number)}
                    />
                  ))}
                </div>
              )}

              {/* Footer legend */}
              <div style={{
                padding: '8px 14px',
                borderTop: '1px solid var(--border)',
                background: 'var(--bg-card-2)',
                display: 'flex', gap: 16, flexWrap: 'wrap',
              }}>
                {Object.entries(COMPOUND_COLORS).map(([name, color]) => (
                  <span key={name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      border: `2px solid ${color}`,
                      background: color === '#e4e4e7' ? 'transparent' : `${color}33`,
                      display: 'inline-block',
                    }} />
                    <span style={{ fontSize: 9, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {name[0]}
                    </span>
                  </span>
                ))}
                {isLive && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-4)' }}>
                    Updates every {POLL_INTERVAL_S}s
                  </span>
                )}
              </div>
            </div>

            {/* ── Your Team panel ── */}
            {leagueId && (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'hidden',
                position: 'sticky',
                top: 16,
              }}>
                <div style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--bg-card-2)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--red)',
                  }} />
                  <span style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: 'var(--text-2)',
                    fontFamily: 'var(--font-display)',
                  }}>
                    Your Team
                  </span>
                </div>

                {myTeamLoading && (
                  <div style={{ padding: '32px', textAlign: 'center' }}>
                    <div className="spinner-sm" />
                  </div>
                )}

                {!myTeamLoading && !myTeam && (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
                    Team not set for this week
                  </div>
                )}

                {!myTeamLoading && myTeam && myStandings.length === 0 && hasData && (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
                    Your drivers aren't in the session data yet
                  </div>
                )}

                {!myTeamLoading && myTeam && myStandings.length > 0 && (
                  <div style={{ padding: '8px 0' }}>
                    {myStandings.map(driver => (
                      <div key={driver.driver_number} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 16px',
                        borderLeft: driver.driver_number === myCaptainNumber
                          ? '2px solid var(--gold)'
                          : '2px solid transparent',
                      }}>
                        <PositionBadge pos={driver.position} />
                        <div style={{
                          width: 3, height: 24, borderRadius: 2, flexShrink: 0,
                          background: driver.team_colour ? `#${driver.team_colour.replace('#', '')}` : '#555',
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {driver.name_acronym}
                            {driver.driver_number === myCaptainNumber && (
                              <span style={{
                                fontSize: 8, background: 'rgba(245,158,11,0.15)',
                                color: '#fbbf24', padding: '1px 4px', borderRadius: 3,
                                fontWeight: 800, textTransform: 'uppercase',
                              }}>CAP</span>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 1 }}>
                            {driver.team_name}
                          </div>
                        </div>
                        <TyreBadge compound={driver.compound} age={driver.tyre_age} />
                      </div>
                    ))}

                    {/* Constructor row */}
                    {myConstructorDriverNumbers.size > 0 && (
                      <div style={{
                        margin: '8px 16px 8px',
                        padding: '8px 12px',
                        background: 'rgba(147,197,253,0.05)',
                        border: '1px solid rgba(147,197,253,0.12)',
                        borderRadius: 8,
                      }}>
                        <div style={{
                          fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
                          textTransform: 'uppercase', color: '#93c5fd', marginBottom: 4,
                        }}>
                          Constructor
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
                          {myTeam.constructor?.name ?? myTeam.constructorSelection?.name ?? '—'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
                          P{standings.filter(d => myConstructorDriverNumbers.has(d.driver_number)).map(d => d.position).join(' · P')}
                        </div>
                      </div>
                    )}

                    <div style={{
                      padding: '8px 16px',
                      borderTop: '1px solid var(--border)',
                      marginTop: 4,
                      fontSize: 10, color: 'var(--text-4)', textAlign: 'center',
                    }}>
                      Official points calculated after race ends
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Offline / non-live note ── */}
        {!isLoading && session && !isLive && (
          <div style={{
            marginTop: 16, padding: '10px 16px',
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
            fontSize: 12, color: 'var(--text-4)', textAlign: 'center',
          }}>
            Showing final data from <strong style={{ color: 'var(--text-2)' }}>{session.session_name}</strong>.
            Live updates resume when the next session begins.
          </div>
        )}
      </div>
    </div>
  );
}


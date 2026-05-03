import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import Navbar from '../components/Navbar';

const ACHIEVEMENT_ICONS = {
  first_win: '🏆',
  podium_finish: '🥈',
  perfect_round: '🤖',
  on_fire: '🔥',
  top_pick: '💎',
  veteran: '🏁',
  big_spender: '💸',
  champion: '👑',
  captain_call: '🎯',
  early_bird: '✅',
  social_butterfly: '🗣️',
  rocket_start: '🚀',
};

const CHIP_LABELS = {
  wildcard: { icon: '🃏', label: 'Wildcard' },
  triple_captain: { icon: '👑', label: 'Triple Captain' },
  no_negative: { icon: '🛡', label: 'No Negative' },
  free_hit: { icon: '💺', label: 'Free Hit' },
  bench_boost: { icon: '⬆️', label: 'Bench Boost' },
};

function AvatarCircle({ name, color, size = 72 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color || '#e10600',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 900, fontSize: size * 0.4,
      color: '#fff', fontFamily: 'var(--font-display)',
      boxShadow: `0 0 20px ${color || '#e10600'}40`,
      flexShrink: 0,
    }}>
      {name?.[0]?.toUpperCase()}
    </div>
  );
}

function AchievementBadge({ achievement }) {
  const icon = ACHIEVEMENT_ICONS[achievement.type] || '🏅';
  return (
    <div
      title={achievement.description}
      style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '10px 12px', textAlign: 'center',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(225,6,0,0.4)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{achievement.title}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
        {new Date(achievement.unlockedAt).toLocaleDateString()}
      </div>
    </div>
  );
}

export default function PublicProfile() {
  const { userId } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [seasonLoading, setSeasonLoading] = useState(false);

  useEffect(() => {
    api.getPublicProfile(userId)
      .then(prof => {
        setProfile(prof);
        setSelectedSeason(prof.currentSeason || null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleSeasonChange = (season) => {
    if (season === selectedSeason) return;
    setSelectedSeason(season);
    setSeasonLoading(true);
    api.getPublicProfile(userId, season)
      .then(prof => setProfile(prev => ({ ...prev, stats: prof.stats, currentSeason: prof.currentSeason })))
      .catch(e => console.error(e))
      .finally(() => setSeasonLoading(false));
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-root)' }}>
      <Navbar />
      <div style={{ textAlign: 'center', paddingTop: 80 }}><div className="spinner" /></div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-root)' }}>
      <Navbar />
      <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 16px' }}>
        <div style={{ background: 'rgba(225,6,0,0.1)', border: '1px solid rgba(225,6,0,0.3)', borderRadius: 8, padding: 16, color: '#fca5a5' }}>{error}</div>
      </div>
    </div>
  );

  if (!profile) return null;

  const stats = profile.stats;
  const hasSeasons = profile.availableSeasons?.length > 1;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-root)' }}>
      <Navbar />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32, padding: 24, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16 }}>
          <AvatarCircle name={profile.name} color={profile.avatarColor} size={72} />
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: '0 0 4px', fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 800 }}>{profile.name}</h1>
            {profile.bio && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 6 }}>{profile.bio}</div>}
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
              Member since {new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Season selector */}
        {hasSeasons && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginRight: 4 }}>Season:</span>
            {profile.availableSeasons.map(s => (
              <button
                key={s}
                onClick={() => handleSeasonChange(s)}
                style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: selectedSeason === s ? 'var(--red)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${selectedSeason === s ? 'var(--red)' : 'var(--border)'}`,
                  color: '#fff', cursor: 'pointer',
                }}
              >{s}</button>
            ))}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div style={{ opacity: seasonLoading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Season Total', value: stats.totalPoints, icon: '🏆' },
                { label: 'Rounds Played', value: stats.roundsPlayed, icon: '🏁' },
                { label: 'Avg / Round', value: stats.roundsPlayed > 0 ? (stats.totalPoints / stats.roundsPlayed).toFixed(1) : '—', icon: '📈' },
                { label: 'Best Round', value: stats.bestRoundPoints, icon: '⚡' },
                { label: 'Worst Round', value: stats.roundsPlayed > 0 ? stats.worstRoundPoints : '—', icon: '💀' },
                { label: 'Leagues', value: stats.leagueCount, icon: '🏎️' },
                { label: 'Achievements', value: stats.achievementCount, icon: '🎖️' },
              ].map(s => (
                <div key={s.label} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '12px 14px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)' }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Favourite driver */}
            {stats.favouriteDriver && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 28 }}>🏎️</div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Favourite Driver</div>
                  <div style={{ fontWeight: 800, fontSize: 16, fontFamily: 'var(--font-display)' }}>{stats.favouriteDriver.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>Selected {stats.favouriteDriver.count} {stats.favouriteDriver.count === 1 ? 'round' : 'rounds'} this season</div>
                </div>
              </div>
            )}

            {/* Chips used timeline */}
            {stats.chipsUsed?.length > 0 && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginBottom: 12 }}>Chips Used</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {stats.chipsUsed.map((c, i) => {
                    const chip = CHIP_LABELS[c.chip] || { icon: '⚡', label: c.chip };
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', minWidth: 40 }}>R{c.week}</div>
                        <span style={{
                          fontSize: 11, background: 'rgba(251,191,36,0.15)', color: '#fbbf24',
                          padding: '3px 9px', borderRadius: 5, fontWeight: 700,
                        }}>
                          {chip.icon} {chip.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Leagues */}
        {profile.leagues?.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontFamily: 'var(--font-display)', marginBottom: 12, color: 'rgba(255,255,255,0.8)' }}>
              Leagues
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {profile.leagues.map(lu => (
                <div
                  key={lu.leagueId}
                  style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '12px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{lu.league.name}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Season {lu.league.season}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Achievements */}
        <div>
          <h2 style={{ fontSize: 16, fontFamily: 'var(--font-display)', marginBottom: 12, color: 'rgba(255,255,255,0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Achievements
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 400, fontFamily: 'inherit' }}>
              {profile.achievements?.length || 0} unlocked
            </span>
          </h2>

          {!profile.achievements?.length ? (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
              padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)',
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🎖️</div>
              <div style={{ fontSize: 14 }}>No achievements yet</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {profile.achievements.map(a => <AchievementBadge key={a.id} achievement={a} />)}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

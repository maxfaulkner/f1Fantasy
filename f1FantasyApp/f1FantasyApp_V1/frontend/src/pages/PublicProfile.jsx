import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import Navbar from '../components/Navbar';

const CHIP_LABELS = {
  wildcard: { icon: '🃏', label: 'Wildcard' },
  triple_captain: { icon: '👑', label: 'Triple Captain' },
  no_negative: { icon: '🛡', label: 'No Negative' },
  bench_boost: { icon: '💺', label: 'Bench Boost' },
};

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

export default function PublicProfile() {
  const { userId } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSeason, setSelectedSeason] = useState(null);

  function loadProfile(season) {
    setLoading(true);
    api.getPublicProfile(userId, season)
      .then(p => {
        setProfile(p);
        setSelectedSeason(p.stats?.currentSeason ?? null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadProfile(null); }, [userId]);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-root)' }}>
      <Navbar />
      <div style={{ textAlign: 'center', paddingTop: 80 }}><div className="spinner" /></div>
    </div>
  );

  if (error || !profile) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-root)' }}>
      <Navbar />
      <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 16px' }}>
        <div style={{ background: 'rgba(225,6,0,0.1)', border: '1px solid rgba(225,6,0,0.3)', borderRadius: 8, padding: 16, color: '#fca5a5' }}>
          {error || 'User not found'}
        </div>
      </div>
    </div>
  );

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
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
              Member since {new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Season selector */}
        {profile.stats?.seasons?.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {profile.stats.seasons.map(s => (
              <button
                key={s}
                onClick={() => loadProfile(s)}
                style={{
                  padding: '5px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: selectedSeason === s ? 'var(--red)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${selectedSeason === s ? 'var(--red)' : 'var(--border)'}`,
                  color: '#fff', cursor: 'pointer',
                }}
              >{s}</button>
            ))}
          </div>
        )}

        {/* Stats overview */}
        {profile.stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 24 }}>
            {[
              { label: 'Total Points', value: profile.stats.totalPoints, icon: '🏆' },
              { label: 'Rounds Played', value: profile.stats.roundsPlayed, icon: '🏁' },
              { label: 'Avg / Round', value: profile.stats.avgPoints ?? 0, icon: '📈' },
              { label: 'Best Round', value: profile.stats.bestRoundPoints, icon: '⚡' },
              { label: 'Worst Round', value: profile.stats.worstRoundPoints ?? 0, icon: '💀' },
              { label: 'Leagues', value: profile.stats.leagueCount, icon: '🏎️' },
              { label: 'Achievements', value: profile.stats.achievementCount, icon: '🎖️' },
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
        )}

        {/* Favourite driver */}
        {profile.stats?.favouriteDriver && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '14px 18px', marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{ fontSize: 28 }}>🏎️</div>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Favourite Driver</div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-display)' }}>{profile.stats.favouriteDriver.name}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                Picked in {profile.stats.favouriteDriver.rounds} round{profile.stats.favouriteDriver.rounds !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        )}

        {/* Chips used timeline */}
        {profile.stats?.chipsTimeline?.length > 0 && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.8)' }}>
              Chips Used
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {profile.stats.chipsTimeline.map((c, i) => {
                const chip = CHIP_LABELS[c.type] || { icon: '⚡', label: c.type };
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16 }}>{chip.icon}</span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{chip.label}</span>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>{c.leagueName}</span>
                    </div>
                    <span style={{
                      fontSize: 11, background: 'rgba(251,191,36,0.12)', color: '#fbbf24',
                      padding: '2px 8px', borderRadius: 5, fontWeight: 600,
                    }}>R{c.week}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Achievements */}
        {profile.achievements?.length > 0 && (
          <div>
            <h2 style={{ fontSize: 16, fontFamily: 'var(--font-display)', marginBottom: 12, color: 'rgba(255,255,255,0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Achievements
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 400, fontFamily: 'inherit' }}>
                {profile.achievements.length} unlocked
              </span>
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {profile.achievements.map(a => {
                const icon = ACHIEVEMENT_ICONS[a.type] || '🏅';
                return (
                  <div
                    key={a.id}
                    title={a.description}
                    style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 10, padding: '10px 12px', textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{a.title}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                      {new Date(a.unlockedAt).toLocaleDateString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

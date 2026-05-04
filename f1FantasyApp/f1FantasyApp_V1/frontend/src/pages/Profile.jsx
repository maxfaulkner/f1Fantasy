import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { getUser } from '../auth';
import Navbar from '../components/Navbar';

const AVATAR_COLORS = [
  '#e10600', '#3671C6', '#FF8000', '#27F4D2',
  '#229971', '#FF87BC', '#64C4FF', '#fbbf24',
  '#a855f7', '#ec4899',
];

export const ACHIEVEMENT_ICONS = {
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

export function AvatarCircle({ name, color, size = 72 }) {
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

export function AchievementBadge({ achievement }) {
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

export const CHIP_LABELS = {
  wildcard: { icon: '🃏', label: 'Wildcard' },
  triple_captain: { icon: '👑', label: 'Triple Captain' },
  no_negative: { icon: '🛡', label: 'No Negative' },
  bench_boost: { icon: '💺', label: 'Bench Boost' },
};

export function SeasonSelector({ seasons, selectedSeason, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {seasons.map(s => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          style={{
            padding: '5px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: selectedSeason === s ? 'var(--red)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${selectedSeason === s ? 'var(--red)' : 'var(--border)'}`,
            color: '#fff', cursor: 'pointer',
          }}
        >{s}</button>
      ))}
    </div>
  );
}

export function StatsGrid({ stats }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 24 }}>
      {[
        { label: 'Total Points', value: stats.totalPoints, icon: '🏆' },
        { label: 'Rounds Played', value: stats.roundsPlayed, icon: '🏁' },
        { label: 'Avg / Round', value: stats.avgPoints, icon: '📈' },
        { label: 'Best Round', value: stats.bestRoundPoints, icon: '⚡' },
        { label: 'Worst Round', value: stats.worstRoundPoints, icon: '💀' },
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
  );
}

export function FavouriteDriverCard({ driver }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '14px 18px', marginBottom: 16,
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{ fontSize: 28 }}>🏎️</div>
      <div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Favourite Driver</div>
        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-display)' }}>{driver.name}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
          Picked in {driver.rounds} round{driver.rounds !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}

export function ChipsTimeline({ chips }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.8)' }}>
        Chips Used
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {chips.map(c => {
          const chip = CHIP_LABELS[c.type] || { icon: '⚡', label: c.type };
          return (
            <div key={`${c.type}-${c.leagueName}-${c.week}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const session = getUser();
  const [profile, setProfile] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editColor, setEditColor] = useState('#e10600');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [error, setError] = useState(null);

  function loadProfile(season) {
    setLoading(true);
    setError(null);
    Promise.all([
      api.getProfile(season),
      api.getAchievements(),
    ]).then(([prof, achs]) => {
      setProfile(prof);
      setAchievements(achs);
      setEditName(prof.name);
      setEditBio(prof.bio || '');
      setEditColor(prof.avatarColor || '#e10600');
      setSelectedSeason(prof.stats?.currentSeason ?? null);
    }).catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadProfile(null); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.updateProfile({
        name: editName,
        bio: editBio,
        avatarColor: editColor,
      });
      setProfile(prev => ({ ...prev, ...updated }));
      setEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      // Update local session name if changed
      if (updated.name !== session.name) {
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...stored, name: updated.name }));
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
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
        <div style={{ background: 'rgba(225,6,0,0.1)', border: '1px solid rgba(225,6,0,0.3)', borderRadius: 8, padding: 16, color: '#fca5a5' }}>
          {error}
        </div>
      </div>
    </div>
  );

  if (!profile) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-root)' }}>
      <Navbar />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32, padding: 24, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16 }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <AvatarCircle name={editName} color={editColor} size={72} />
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 100 }}>
                {AVATAR_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setEditColor(c)}
                    style={{
                      width: 20, height: 20, borderRadius: '50%', background: c,
                      border: editColor === c ? '2px solid #fff' : '2px solid transparent',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <AvatarCircle name={profile.name} color={profile.avatarColor} size={72} />
          )}

          <div style={{ flex: 1 }}>
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Your name"
                  style={{
                    background: 'var(--bg-root)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 18, fontWeight: 700,
                    outline: 'none', maxWidth: 300,
                  }}
                />
                <textarea
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  placeholder="Add a bio (optional)..."
                  rows={2}
                  maxLength={200}
                  style={{
                    background: 'var(--bg-root)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13,
                    outline: 'none', resize: 'none', maxWidth: 400, fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleSave} disabled={saving || !editName.trim()}
                    style={{
                      background: 'var(--red)', border: 'none', borderRadius: 8,
                      padding: '7px 16px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13,
                    }}
                  >{saving ? 'Saving…' : 'Save'}</button>
                  <button
                    onClick={() => setEditing(false)}
                    style={{
                      background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '7px 16px', color: '#fff', cursor: 'pointer', fontSize: 13,
                    }}
                  >Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <h1 style={{ margin: 0, fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 800 }}>{profile.name}</h1>
                  <button
                    onClick={() => setEditing(true)}
                    style={{
                      background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
                      borderRadius: 6, padding: '3px 10px', color: 'rgba(255,255,255,0.6)',
                      cursor: 'pointer', fontSize: 12,
                    }}
                  >Edit Profile</button>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 6 }}>{profile.email}</div>
                {profile.bio && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{profile.bio}</div>}
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                  Member since {new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                </div>
              </>
            )}
          </div>
        </div>

        {saveSuccess && (
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '10px 14px', color: '#86efac', marginBottom: 16, fontSize: 13 }}>
            ✅ Profile updated!
          </div>
        )}

        {profile.stats?.seasons?.length > 1 && (
          <SeasonSelector
            seasons={profile.stats.seasons}
            selectedSeason={selectedSeason}
            onSelect={s => { setSelectedSeason(s); loadProfile(s); }}
          />
        )}

        {profile.stats && <StatsGrid stats={profile.stats} />}

        {profile.stats?.favouriteDriver && (
          <FavouriteDriverCard driver={profile.stats.favouriteDriver} />
        )}

        {profile.stats?.chipsTimeline?.length > 0 && (
          <ChipsTimeline chips={profile.stats.chipsTimeline} />
        )}

        {/* Leagues */}
        {profile.leagues?.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontFamily: 'var(--font-display)', marginBottom: 12, color: 'rgba(255,255,255,0.8)' }}>
              My Leagues
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {profile.leagues.map(lu => (
                <Link
                  key={lu.leagueId}
                  to={`/leagues/${lu.leagueId}`}
                  style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '12px 16px', textDecoration: 'none',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(225,6,0,0.4)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{lu.league.name}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Season {lu.league.season}</div>
                  </div>
                  <span style={{ color: 'var(--red)', fontSize: 12 }}>→</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Achievements */}
        <div>
          <h2 style={{ fontSize: 16, fontFamily: 'var(--font-display)', marginBottom: 12, color: 'rgba(255,255,255,0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Achievements
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 400, fontFamily: 'inherit' }}>
              {achievements.length} unlocked
            </span>
          </h2>

          {achievements.length === 0 ? (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
              padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)',
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🎖️</div>
              <div style={{ fontSize: 14 }}>No achievements yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Play more rounds to earn badges!</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {achievements.map(a => <AchievementBadge key={a.id} achievement={a} />)}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

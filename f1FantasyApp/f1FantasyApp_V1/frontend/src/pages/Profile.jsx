import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { getUser } from '../auth';
import Navbar from '../components/Navbar';
import { AvatarCircle, AchievementBadge, SeasonStats } from '../components/ProfileShared';

const AVATAR_COLORS = [
  '#e10600', '#3671C6', '#FF8000', '#27F4D2',
  '#229971', '#FF87BC', '#64C4FF', '#fbbf24',
  '#a855f7', '#ec4899',
];

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
  const [seasonLoading, setSeasonLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getProfile(),
      api.getAchievements(),
    ]).then(([prof, achs]) => {
      setProfile(prof);
      setSelectedSeason(prof.currentSeason || null);
      setAchievements(achs);
      setEditName(prof.name);
      setEditBio(prof.bio || '');
      setEditColor(prof.avatarColor || '#e10600');
    }).catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const handleSeasonChange = (season) => {
    if (season === selectedSeason) return;
    const prev = selectedSeason;
    setSelectedSeason(season);
    setSeasonLoading(true);
    api.getProfile(season)
      .then(prof => setProfile(p => ({ ...p, stats: prof.stats, currentSeason: prof.currentSeason })))
      .catch(() => setSelectedSeason(prev))
      .finally(() => setSeasonLoading(false));
  };

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

  if (!profile) return null;

  const stats = profile.stats;
  const hasSeasons = profile.availableSeasons?.length > 1;

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

        {/* Stats overview */}
        <SeasonStats stats={stats} loading={seasonLoading} />

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

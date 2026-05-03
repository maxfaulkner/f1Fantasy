import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import Navbar from '../components/Navbar';
import { AvatarCircle, AchievementBadge, SeasonStats } from '../components/ProfileShared';

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
    const prev = selectedSeason;
    setSelectedSeason(season);
    setSeasonLoading(true);
    api.getPublicProfile(userId, season)
      .then(prof => setProfile(p => ({ ...p, stats: prof.stats, currentSeason: prof.currentSeason })))
      .catch(() => setSelectedSeason(prev))
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
        <SeasonStats stats={stats} loading={seasonLoading} />

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

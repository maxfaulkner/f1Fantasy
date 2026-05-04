import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import Navbar from '../components/Navbar';
import { AchievementBadge, AvatarCircle, SeasonSelector, StatsGrid, FavouriteDriverCard, ChipsTimeline } from '../components/ProfileShared';

export default function PublicProfile() {
  const { userId } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSeason, setSelectedSeason] = useState(null);

  function loadProfile(season) {
    setLoading(true);
    setError('');
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

        {profile.achievements?.length > 0 && (
          <div>
            <h2 style={{ fontSize: 16, fontFamily: 'var(--font-display)', marginBottom: 12, color: 'rgba(255,255,255,0.8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Achievements
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 400, fontFamily: 'inherit' }}>
                {profile.achievements.length} unlocked
              </span>
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {profile.achievements.map(a => <AchievementBadge key={a.id} achievement={a} />)}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

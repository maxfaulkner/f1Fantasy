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

export const CHIP_LABELS = {
  wildcard: { icon: '🃏', label: 'Wildcard' },
  triple_captain: { icon: '👑', label: 'Triple Captain' },
  no_negative: { icon: '🛡', label: 'No Negative' },
  free_hit: { icon: '💺', label: 'Free Hit' },
  bench_boost: { icon: '⬆️', label: 'Bench Boost' },
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

export function SeasonStats({ stats, loading }) {
  if (!stats) return null;
  return (
    <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
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
  );
}

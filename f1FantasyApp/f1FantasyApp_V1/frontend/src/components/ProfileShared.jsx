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
  bench_boost: { icon: '💺', label: 'Bench Boost' },
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
        { label: 'Avg / Round', value: stats.roundsPlayed > 0 ? stats.avgPoints : '—', icon: '📈' },
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

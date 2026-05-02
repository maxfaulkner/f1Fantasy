// frontend/src/components/LeagueNav.jsx
// Sticky horizontal tab bar that appears on all league-scoped pages.
import { useLocation, useNavigate } from 'react-router-dom';

const TABS = [
  { id: 'home',        icon: '🏠', label: 'Overview',    path: (id, _w) => `/leagues/${id}` },
  { id: 'live',        icon: '📡', label: 'Live',        path: (id, _w) => `/leagues/${id}/live` },
  { id: 'leaderboard', icon: '🏆', label: 'Standings',   path: (id, _w) => `/leagues/${id}/leaderboard` },
  { id: 'team',        icon: '✏️', label: 'Pick Team',  path: (id, w)  => `/leagues/${id}/team/${w}` },
  { id: 'stats',       icon: '📊', label: 'Stats',       path: (id, _w) => `/leagues/${id}/stats` },
  { id: 'chat',        icon: '💬', label: 'Chat',        path: (id, _w) => `/leagues/${id}/chat` },
  { id: 'prices',      icon: '💰', label: 'Prices',      path: (id, _w) => `/leagues/${id}/prices` },
  { id: 'members',     icon: '👥', label: 'Members',     path: (id, _w) => `/leagues/${id}/members` },
];

export default function LeagueNav({ leagueId, week = 1, leagueName }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  function isActive(tab) {
    if (tab.id === 'home')   return pathname === `/leagues/${leagueId}`;
    if (tab.id === 'team')   return pathname.startsWith(`/leagues/${leagueId}/team/`);
    if (tab.id === 'live')   return pathname === `/leagues/${leagueId}/live`;
    return pathname === tab.path(leagueId, week);
  }

  return (
    <div style={{
      background: '#0d0d0f',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      position: 'sticky',
      top: 58,
      zIndex: 90,
    }}>
      <div style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'stretch',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        {/* League name breadcrumb */}
        {leagueName && (
          <button
            onClick={() => navigate(`/leagues/${leagueId}`)}
            className="league-breadcrumb"
          >
            {leagueName}
          </button>
        )}

        {/* Tabs */}
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => navigate(tab.path(leagueId, week))}
            className={`league-tab${isActive(tab) ? ' active' : ''}`}
          >
            <span style={{ fontSize: 13 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}

        {/* Spacer + back link */}
        <div style={{ flex: 1, minWidth: 16 }} />
        <button onClick={() => navigate('/leagues')} className="league-back">
          ← Leagues
        </button>
      </div>
    </div>
  );
}

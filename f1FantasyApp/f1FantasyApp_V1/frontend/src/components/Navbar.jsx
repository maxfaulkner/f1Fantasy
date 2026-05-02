import { Link, useNavigate, useLocation } from 'react-router-dom';
import { getUser, clearSession, isLoggedIn } from '../auth';
import NotificationBell from './NotificationBell';
import { useLiveTiming } from '../contexts/LiveTimingContext';

export default function Navbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = getUser();
  const { isLive, session } = useLiveTiming();

  function navClass(path, exact = false) {
    const active = exact ? pathname === path : pathname.startsWith(path);
    return `nav-link${active ? ' nav-active' : ''}`;
  }

  const livePath = pathname.startsWith('/leagues/') ? `${pathname.split('/').slice(0, 3).join('/')}/live` : '/live';
  const liveActive = pathname.endsWith('/live') || pathname === '/live';

  return (
    <nav className="navbar">
      {/* Brand */}
      <Link to="/" className="navbar-brand">
        <div className="navbar-logo">🏁</div>
        <div className="navbar-brand-text">
          <span className="navbar-brand-name">
            <span className="navbar-brand-red">GRID</span> FANTASY
          </span>
          <span className="navbar-brand-sub">F1 FANTASY LEAGUE</span>
        </div>
      </Link>

      {/* Right side */}
      <div className="navbar-right">
        {isLoggedIn() ? (
          <>
            {/* Live Timing link */}
            <Link
              to={livePath}
              className={navClass('/live') + (liveActive ? ' nav-active' : '')}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              {isLive && (
                <span style={{
                  display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                  background: 'var(--red)',
                  animation: 'pulseDot 1.4s ease-in-out infinite',
                  flexShrink: 0,
                }} />
              )}
              Live
              {isLive && session && (
                <span style={{
                  fontSize: 8, fontWeight: 900, letterSpacing: '0.08em',
                  background: 'var(--red)', color: '#fff',
                  padding: '1px 5px', borderRadius: 3,
                  textTransform: 'uppercase',
                }}>
                  {session.session_name?.toUpperCase().replace('RACE', 'RACE') ?? 'LIVE'}
                </span>
              )}
            </Link>

            <Link to="/leagues/discover" className={navClass('/leagues/discover') + ' nav-optional'}>
              Discover
            </Link>
            <Link to="/calendar" className={navClass('/calendar', true) + ' nav-optional'}>
              Calendar
            </Link>
            <Link to="/profile" className={navClass('/profile', true)}>
              Profile
            </Link>

            <NotificationBell />

            <div className="navbar-user">
              <div className="navbar-avatar">{user?.name?.[0]?.toUpperCase() || '?'}</div>
              <span className="navbar-username">{user?.name}</span>
            </div>

            <button
              className="btn-signout"
              onClick={() => { clearSession(); navigate('/login'); }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="nav-link">Log in</Link>
            <Link to="/register" style={{
              background: 'var(--red)', color: '#fff',
              fontSize: 13, fontWeight: 700,
              padding: '6px 18px', borderRadius: 8,
              letterSpacing: '0.01em', textDecoration: 'none',
              transition: 'background var(--ease)',
            }}>
              Get started
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

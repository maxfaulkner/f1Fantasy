import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { isLoggedIn } from './auth';
import { LiveTimingProvider } from './contexts/LiveTimingContext';
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer from './components/Toast';
import Login from './pages/Login';
import Register from './pages/Register';
import Leagues from './pages/Leagues';
import LeagueHome from './pages/LeagueHome';
import TeamPicker from './pages/TeamPicker';
import Leaderboard from './pages/Leaderboard';
import AdminRace from './pages/AdminRace';
import ViewTeam from './pages/ViewTeam';
import Chat from './pages/Chat';
import Stats from './pages/Stats';
import Profile from './pages/Profile';
import PublicLeagues from './pages/PublicLeagues';
import LeagueMembers from './pages/LeagueMembers';
import Transfers from './pages/Transfers';
import H2HMatchups from './pages/H2HMatchups';
import Calendar from './pages/Calendar';
import LeagueSettings from './pages/LeagueSettings';
import PriceWatch from './pages/PriceWatch';
import Compare from './pages/Compare';
import DraftBoard from './pages/DraftBoard';
import QuickPick from './pages/QuickPick';
import LiveRace from './pages/LiveRace';

function Protected({ children }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <LiveTimingProvider>
        <ErrorBoundary>
          <ToastContainer />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/" element={<Protected><Leagues /></Protected>} />
            <Route path="/leagues" element={<Protected><Leagues /></Protected>} />
            <Route path="/leagues/discover" element={<Protected><PublicLeagues /></Protected>} />
            <Route path="/leagues/:leagueId" element={<Protected><LeagueHome /></Protected>} />
            <Route path="/leagues/:leagueId/live" element={<Protected><LiveRace /></Protected>} />
            <Route path="/leagues/:leagueId/team/:week" element={<Protected><TeamPicker /></Protected>} />
            <Route path="/leagues/:leagueId/leaderboard" element={<Protected><Leaderboard /></Protected>} />
            <Route path="/leagues/:leagueId/admin/:week" element={<Protected><AdminRace /></Protected>} />
            <Route path="/leagues/:leagueId/view/:week" element={<Protected><ViewTeam /></Protected>} />
            <Route path="/leagues/:leagueId/chat" element={<Protected><Chat /></Protected>} />
            <Route path="/leagues/:leagueId/stats" element={<Protected><Stats /></Protected>} />
            <Route path="/leagues/:leagueId/members" element={<Protected><LeagueMembers /></Protected>} />
            <Route path="/leagues/:leagueId/transfers" element={<Protected><Transfers /></Protected>} />
            <Route path="/leagues/:leagueId/h2h" element={<Protected><H2HMatchups /></Protected>} />
            <Route path="/leagues/:leagueId/settings" element={<Protected><LeagueSettings /></Protected>} />
            <Route path="/leagues/:leagueId/prices" element={<Protected><PriceWatch /></Protected>} />
            <Route path="/leagues/:leagueId/compare" element={<Protected><Compare /></Protected>} />
            <Route path="/leagues/:leagueId/draft" element={<Protected><DraftBoard /></Protected>} />
            <Route path="/leagues/:leagueId/quickpick" element={<Protected><QuickPick /></Protected>} />
            <Route path="/live" element={<Protected><LiveRace /></Protected>} />
            <Route path="/calendar" element={<Protected><Calendar /></Protected>} />
            <Route path="/profile" element={<Protected><Profile /></Protected>} />
            <Route path="/profile/:userId" element={<Protected><Profile /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </LiveTimingProvider>
    </BrowserRouter>
  );
}

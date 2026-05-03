// src/__tests__/pages/Leaderboard.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Leaderboard from '../../pages/Leaderboard';

const mockGetLeaderboard = vi.hoisted(() => vi.fn());
const mockGetLeagues = vi.hoisted(() => vi.fn());
const mockCheckResults = vi.hoisted(() => vi.fn());

vi.mock('../../api', () => ({
  api: {
    getLeaderboard: mockGetLeaderboard,
    getLeagues: mockGetLeagues,
    checkResults: mockCheckResults,
    getPlayerTeam: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../auth', () => ({
  getUser: () => ({ id: 'user1', name: 'Alice' }),
  isLoggedIn: () => true,
}));

// Prevent live race weekend polling from making real network calls
global.fetch = vi.fn().mockResolvedValue({
  json: () => Promise.resolve({ MRData: { RaceTable: { Races: [] } } }),
});

function renderLeaderboard(leagueId = 'lg1') {
  return render(
    <MemoryRouter initialEntries={[`/leagues/${leagueId}/leaderboard`]}>
      <Routes>
        <Route path="/leagues/:leagueId/leaderboard" element={<Leaderboard />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Leaderboard page', () => {
  beforeEach(() => {
    mockGetLeagues.mockResolvedValue([{ id: 'lg1', name: 'F1 Champions', startingRound: 1 }]);
  });

  test('shows loading spinner initially', () => {
    mockGetLeaderboard.mockReturnValue(new Promise(() => {})); // never resolves
    renderLeaderboard();
    expect(document.querySelector('.spinner')).toBeInTheDocument();
  });

  test('renders league name after loading', async () => {
    mockGetLeaderboard.mockResolvedValue({ standings: [], latestRound: 1 });
    renderLeaderboard();
    await waitFor(() => {
      expect(screen.getByText('F1 Champions')).toBeInTheDocument();
    });
  });

  test('renders Leaderboard heading', async () => {
    mockGetLeaderboard.mockResolvedValue({ standings: [], latestRound: 1 });
    renderLeaderboard();
    await waitFor(() => {
      expect(screen.getByText('Leaderboard')).toBeInTheDocument();
    });
  });

  test('shows "no race results yet" when standings exist but all have 0 points', async () => {
    mockGetLeaderboard.mockResolvedValue({
      standings: [
        { userId: 'user1', userName: 'Alice', totalPoints: 0, rank: 1, totalWins: 0 },
        { userId: 'user2', userName: 'Bob', totalPoints: 0, rank: 2, totalWins: 0 },
      ],
      latestRound: 1,
    });
    renderLeaderboard();
    await waitFor(() => {
      expect(screen.getByText(/no race results yet/i)).toBeInTheDocument();
    });
  });

  test('renders player names in the table when results exist', async () => {
    mockGetLeaderboard.mockResolvedValue({
      standings: [
        { userId: 'user1', userName: 'Alice', totalPoints: 150, rank: 1, totalWins: 3, rankDelta: 0 },
        { userId: 'user2', userName: 'Bob', totalPoints: 120, rank: 2, totalWins: 1, rankDelta: 0 },
      ],
      latestRound: 3,
    });
    renderLeaderboard();
    await waitFor(() => {
      expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
    });
  });

  test('shows Import Results button', async () => {
    mockGetLeaderboard.mockResolvedValue({ standings: [], latestRound: 1 });
    renderLeaderboard();
    await waitFor(() => {
      expect(screen.getByText(/import results/i)).toBeInTheDocument();
    });
  });

  test('renders season points trajectory chart when results exist', async () => {
    mockGetLeaderboard.mockResolvedValue({
      standings: [
        { userId: 'user1', userName: 'Alice', totalPoints: 150, rank: 1, totalWins: 3, rankDelta: 0, roundPoints: { 1: 80, 2: 70 } },
        { userId: 'user2', userName: 'Bob', totalPoints: 120, rank: 2, totalWins: 1, rankDelta: 0, roundPoints: { 1: 60, 2: 60 } },
      ],
      latestRound: 2,
    });
    renderLeaderboard();
    await waitFor(() => {
      expect(screen.getByText(/season points trajectory/i)).toBeInTheDocument();
    });
  });

  test('does not render season points trajectory chart when no results', async () => {
    mockGetLeaderboard.mockResolvedValue({
      standings: [
        { userId: 'user1', userName: 'Alice', totalPoints: 150, rank: 1, totalWins: 3, rankDelta: 0, roundPoints: {} },
      ],
      latestRound: 1,
    });
    renderLeaderboard();
    await waitFor(() => {
      expect(screen.queryByText(/season points trajectory/i)).not.toBeInTheDocument();
    });
  });
});

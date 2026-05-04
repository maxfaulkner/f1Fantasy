import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Profile from '../../pages/Profile';

const mockGetProfile = vi.hoisted(() => vi.fn());
const mockGetAchievements = vi.hoisted(() => vi.fn());
const mockUpdateProfile = vi.hoisted(() => vi.fn());
const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('../../api', () => ({
  api: {
    getProfile: mockGetProfile,
    getAchievements: mockGetAchievements,
    updateProfile: mockUpdateProfile,
  },
}));

vi.mock('../../auth', () => ({
  getUser: () => ({ id: 'user1', name: 'Alice' }),
  isLoggedIn: () => true,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

const baseStats = {
  totalPoints: 150,
  roundsPlayed: 3,
  bestRoundPoints: 80,
  worstRoundPoints: 30,
  avgPoints: 50,
  favouriteDriver: { name: 'Verstappen', rounds: 3 },
  chipsTimeline: [],
  seasons: [2026],
  currentSeason: 2026,
  leagueCount: 1,
  achievementCount: 0,
};

const baseProfile = {
  id: 'user1',
  name: 'Alice',
  email: 'alice@example.com',
  bio: 'F1 fan',
  avatarColor: '#e10600',
  createdAt: '2026-01-01T00:00:00.000Z',
  leagues: [{ leagueId: 'lg1', league: { id: 'lg1', name: 'Main League', season: 2026 } }],
  achievements: [],
  stats: baseStats,
};

function renderProfile() {
  return render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>
  );
}

describe('Profile page', () => {
  beforeEach(() => {
    mockGetAchievements.mockResolvedValue([]);
  });

  test('shows loading spinner initially', () => {
    mockGetProfile.mockReturnValue(new Promise(() => {}));
    renderProfile();
    expect(document.querySelector('.spinner')).toBeInTheDocument();
  });

  test('renders user name after loading', async () => {
    mockGetProfile.mockResolvedValue(baseProfile);
    renderProfile();
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
  });

  test('renders stats grid with worst round', async () => {
    mockGetProfile.mockResolvedValue(baseProfile);
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText('Total Points')).toBeInTheDocument();
      expect(screen.getByText('Best Round')).toBeInTheDocument();
      expect(screen.getByText('Worst Round')).toBeInTheDocument();
      expect(screen.getByText('Avg / Round')).toBeInTheDocument();
    });
  });

  test('shows worst round value from stats', async () => {
    mockGetProfile.mockResolvedValue(baseProfile);
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText('30')).toBeInTheDocument();
    });
  });

  test('shows favourite driver card', async () => {
    mockGetProfile.mockResolvedValue(baseProfile);
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText('Favourite Driver')).toBeInTheDocument();
      expect(screen.getByText('Verstappen')).toBeInTheDocument();
      expect(screen.getByText(/picked in 3 rounds/i)).toBeInTheDocument();
    });
  });

  test('does not show favourite driver card when stats has no favouriteDriver', async () => {
    const profileNoFav = {
      ...baseProfile,
      stats: { ...baseStats, favouriteDriver: null },
    };
    mockGetProfile.mockResolvedValue(profileNoFav);
    renderProfile();
    await waitFor(() => screen.getByText('Alice'));
    expect(screen.queryByText('Favourite Driver')).not.toBeInTheDocument();
  });

  test('shows chips timeline when chips were used', async () => {
    const profileWithChips = {
      ...baseProfile,
      stats: {
        ...baseStats,
        chipsTimeline: [
          { type: 'wildcard', week: 3, leagueName: 'Main League' },
          { type: 'triple_captain', week: 7, leagueName: 'Main League' },
        ],
      },
    };
    mockGetProfile.mockResolvedValue(profileWithChips);
    renderProfile();
    await waitFor(() => {
      expect(screen.getByText('Chips Used')).toBeInTheDocument();
      expect(screen.getByText('Wildcard')).toBeInTheDocument();
      expect(screen.getByText('Triple Captain')).toBeInTheDocument();
      expect(screen.getByText('R3')).toBeInTheDocument();
      expect(screen.getByText('R7')).toBeInTheDocument();
    });
  });

  test('does not show chips section when no chips were used', async () => {
    mockGetProfile.mockResolvedValue(baseProfile);
    renderProfile();
    await waitFor(() => screen.getByText('Alice'));
    expect(screen.queryByText('Chips Used')).not.toBeInTheDocument();
  });

  test('season selector shown when multiple seasons exist', async () => {
    const profileMultiSeason = {
      ...baseProfile,
      stats: { ...baseStats, seasons: [2025, 2026], currentSeason: 2026 },
    };
    mockGetProfile.mockResolvedValue(profileMultiSeason);
    renderProfile();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '2025' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '2026' })).toBeInTheDocument();
    });
  });

  test('season selector not shown for single season', async () => {
    mockGetProfile.mockResolvedValue(baseProfile);
    renderProfile();
    await waitFor(() => screen.getByText('Alice'));
    expect(screen.queryByRole('button', { name: '2026' })).not.toBeInTheDocument();
  });

  test('clicking season button reloads profile with that season', async () => {
    const profileMultiSeason = {
      ...baseProfile,
      stats: { ...baseStats, seasons: [2025, 2026], currentSeason: 2026 },
    };
    mockGetProfile
      .mockResolvedValueOnce(profileMultiSeason)
      .mockResolvedValueOnce({
        ...baseProfile,
        stats: { ...baseStats, totalPoints: 80, seasons: [2025, 2026], currentSeason: 2025 },
      });

    renderProfile();
    await waitFor(() => screen.getByRole('button', { name: '2025' }));

    fireEvent.click(screen.getByRole('button', { name: '2025' }));

    await waitFor(() => {
      expect(mockGetProfile).toHaveBeenCalledWith(2025);
      expect(screen.getByText('80')).toBeInTheDocument();
    });
  });
});

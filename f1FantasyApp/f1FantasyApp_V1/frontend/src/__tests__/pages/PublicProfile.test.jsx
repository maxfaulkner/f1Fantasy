import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PublicProfile from '../../pages/PublicProfile';

const mockGetPublicProfile = vi.hoisted(() => vi.fn());
const mockUseParams = vi.hoisted(() => vi.fn());

vi.mock('../../api', () => ({
  api: {
    getPublicProfile: mockGetPublicProfile,
  },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useParams: mockUseParams };
});

const baseStats = {
  totalPoints: 120,
  roundsPlayed: 2,
  bestRoundPoints: 70,
  worstRoundPoints: 50,
  avgPoints: 60,
  favouriteDriver: { name: 'Leclerc', rounds: 2 },
  chipsTimeline: [],
  seasons: [2026],
  currentSeason: 2026,
  leagueCount: 1,
  achievementCount: 0,
};

const baseProfile = {
  id: 'user2',
  name: 'Bob',
  bio: 'F1 fan',
  avatarColor: '#3671C6',
  createdAt: '2026-02-01T00:00:00.000Z',
  achievements: [],
  stats: baseStats,
};

function renderPublicProfile() {
  return render(
    <MemoryRouter>
      <PublicProfile />
    </MemoryRouter>
  );
}

describe('PublicProfile page', () => {
  beforeEach(() => {
    mockUseParams.mockReturnValue({ userId: 'user2' });
  });

  test('shows loading spinner initially', () => {
    mockGetPublicProfile.mockReturnValue(new Promise(() => {}));
    renderPublicProfile();
    expect(document.querySelector('.spinner')).toBeInTheDocument();
  });

  test('renders profile name and stats on success', async () => {
    mockGetPublicProfile.mockResolvedValue(baseProfile);
    renderPublicProfile();
    await waitFor(() => {
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Total Points')).toBeInTheDocument();
      expect(screen.getByText('Worst Round')).toBeInTheDocument();
    });
  });

  test('shows error message on fetch failure', async () => {
    mockGetPublicProfile.mockRejectedValue(new Error('User not found'));
    renderPublicProfile();
    await waitFor(() => {
      expect(screen.getByText('User not found')).toBeInTheDocument();
    });
  });

  test('clears stale error when userId changes and subsequent fetch succeeds', async () => {
    mockGetPublicProfile
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(baseProfile);

    const { rerender } = renderPublicProfile();
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());

    // Simulate navigating to a different user — same component instance, new userId
    mockUseParams.mockReturnValue({ userId: 'user3' });
    rerender(
      <MemoryRouter>
        <PublicProfile />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Network error')).not.toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });

  test('season selector not shown for single season', async () => {
    mockGetPublicProfile.mockResolvedValue(baseProfile);
    renderPublicProfile();
    await waitFor(() => screen.getByText('Bob'));
    expect(screen.queryByRole('button', { name: '2026' })).not.toBeInTheDocument();
  });

  test('season selector shown when multiple seasons exist', async () => {
    const profileMultiSeason = {
      ...baseProfile,
      stats: { ...baseStats, seasons: [2025, 2026], currentSeason: 2026 },
    };
    mockGetPublicProfile.mockResolvedValue(profileMultiSeason);
    renderPublicProfile();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '2025' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '2026' })).toBeInTheDocument();
    });
  });

  test('clicking season button reloads profile with that season and renders new stats', async () => {
    const profileMultiSeason = {
      ...baseProfile,
      stats: { ...baseStats, totalPoints: 120, seasons: [2025, 2026], currentSeason: 2026 },
    };
    mockGetPublicProfile
      .mockResolvedValueOnce(profileMultiSeason)
      .mockResolvedValueOnce({
        ...baseProfile,
        stats: { ...baseStats, totalPoints: 55, seasons: [2025, 2026], currentSeason: 2025 },
      });

    renderPublicProfile();
    await waitFor(() => screen.getByRole('button', { name: '2025' }));

    fireEvent.click(screen.getByRole('button', { name: '2025' }));

    await waitFor(() => {
      expect(mockGetPublicProfile).toHaveBeenCalledWith('user2', 2025);
      expect(screen.getByText('55')).toBeInTheDocument();
    });
  });

  test('shows avg points dash when no rounds played', async () => {
    const profileNoRounds = {
      ...baseProfile,
      stats: { ...baseStats, totalPoints: 0, roundsPlayed: 0, avgPoints: 0, bestRoundPoints: 0, worstRoundPoints: 0 },
    };
    mockGetPublicProfile.mockResolvedValue(profileNoRounds);
    renderPublicProfile();
    await waitFor(() => screen.getByText('Bob'));
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

import { clearSession } from './auth';

const BASE = import.meta.env.VITE_API_URL ?? '';

function token() {
  return localStorage.getItem('token');
}

function headers(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  const t = token();
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearSession();
    window.location.href = '/login';
    return;
  }
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  // Auth
  register: (email, name, password) =>
    request('POST', '/auth/register', { email, name, password }),
  login: (email, password) =>
    request('POST', '/auth/login', { email, password }),

  // Leagues
  getLeagues: () => request('GET', '/api/leagues'),
  getLeague: (leagueId) => request('GET', `/api/leagues/${leagueId}`),
  createLeague: (data) => request('POST', '/api/leagues', data),
  joinLeague: (leagueId) => request('POST', `/api/leagues/${leagueId}/join`),
  joinByCode: (code) => request('POST', `/api/leagues/join-code/${code}`),
  getPublicLeagues: () => request('GET', '/api/leagues/public'),
  getLeagueMembers: (leagueId) => request('GET', `/api/leagues/${leagueId}/members`),
  updateTeamName: (leagueId, teamName) =>
    request('PUT', `/api/leagues/${leagueId}/team-name`, { teamName }),

  // Prices
  getPrices: (leagueId, week) =>
    request('GET', `/api/leagues/${leagueId}/prices/${week}`),

  // Team
  getTeam: (leagueId, week) =>
    request('GET', `/api/leagues/${leagueId}/team/${week}`),
  submitTeam: (leagueId, week, drivers, constructorId, captainId, chipUsed) =>
    request('POST', `/api/leagues/${leagueId}/team/${week}`, {
      drivers, constructorId, captainId, chipUsed,
    }),

  // Leaderboard
  getLeaderboard: (leagueId) =>
    request('GET', `/api/leagues/${leagueId}/leaderboard`),
  getWeeklyLeaderboard: (leagueId, week) =>
    request('GET', `/api/leagues/${leagueId}/leaderboard/weekly/${week}`),
  getPlayerTeam: (leagueId, week, userId) =>
    request('GET', `/api/leagues/${leagueId}/team/${week}/${userId}`),
  getDriverForm: (leagueId, week) =>
    request('GET', `/api/leagues/${leagueId}/driver-form/${week}`),

  // Chips
  getChips: (leagueId) => request('GET', `/api/leagues/${leagueId}/chips`),
  getTransfers: (leagueId) => request('GET', `/api/leagues/${leagueId}/transfers`),

  // Stats
  getStats: (leagueId) => request('GET', `/api/leagues/${leagueId}/stats`),
  getConstructorStandings: (leagueId, week) =>
    request('GET', `/api/leagues/${leagueId}/constructor-standings/${week}`),

  // Chat
  getChat: (leagueId, limit = 50) =>
    request('GET', `/api/leagues/${leagueId}/chat?limit=${limit}`),
  sendMessage: (leagueId, content, replyToId = null) =>
    request('POST', `/api/leagues/${leagueId}/chat`, { content, replyToId }),
  reactToMessage: (leagueId, msgId, emoji) =>
    request('POST', `/api/leagues/${leagueId}/chat/${msgId}/react`, { emoji }),
  deleteMessage: (leagueId, msgId) =>
    request('DELETE', `/api/leagues/${leagueId}/chat/${msgId}`),
  pinMessage: (leagueId, msgId) =>
    request('POST', `/api/leagues/${leagueId}/chat/${msgId}/pin`),

  // Notifications
  getNotifications: () => request('GET', '/api/notifications'),
  markAllRead: () => request('PUT', '/api/notifications/read'),
  markOneRead: (id) => request('PUT', `/api/notifications/${id}/read`),
  deleteNotification: (id) => request('DELETE', `/api/notifications/${id}`),

  // Achievements
  getAchievements: () => request('GET', '/api/achievements'),

  // Profile
  getProfile: (season) => request('GET', season ? `/api/profile?season=${season}` : '/api/profile'),
  updateProfile: (data) => request('PUT', '/api/profile', data),
  getPublicProfile: (userId, season) => request('GET', season ? `/api/profile/${userId}?season=${season}` : `/api/profile/${userId}`),

  // H2H
  getH2HMatchups: (leagueId) => request('GET', `/api/leagues/${leagueId}/h2h`),

  // Draft
  getDraft: (leagueId) => request('GET', `/api/leagues/${leagueId}/draft`),
  startDraft: (leagueId) => request('POST', `/api/leagues/${leagueId}/draft/start`),
  submitDraftPick: (leagueId, type, itemId, itemName) =>
    request('POST', `/api/leagues/${leagueId}/draft/pick`, { type, itemId, itemName }),

  // League Settings (commissioner)
  updateLeagueSettings: (leagueId, data) =>
    request('PUT', `/api/leagues/${leagueId}/settings`, data),

  // Optimal team (hindsight)
  getOptimalTeam: (leagueId, week) =>
    request('GET', `/api/leagues/${leagueId}/optimal-team/${week}`),

  // Admin
  getAdminRaceForm: (leagueId, week) =>
    request('GET', `/admin/races/${leagueId}/${week}`),
  submitRaceResults: (leagueId, week, results) =>
    request('POST', `/api/admin/races/${leagueId}/${week}`, { results }),
  checkResults: () =>
    request('POST', '/api/admin/check-results'),
};

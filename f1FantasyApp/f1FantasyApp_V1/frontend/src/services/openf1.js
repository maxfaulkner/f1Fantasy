const BASE = 'https://api.openf1.org/v1';

async function get(path, params = {}) {
  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`OpenF1 ${path} ${res.status}`);
  return res.json();
}

export async function getLatestSession() {
  const data = await get('/sessions', { session_key: 'latest' });
  return data[0] ?? null;
}

export async function getSessionDrivers(sessionKey) {
  return get('/drivers', { session_key: sessionKey });
}

export async function getPositions(sessionKey) {
  return get('/position', { session_key: sessionKey });
}

export async function getIntervals(sessionKey) {
  return get('/intervals', { session_key: sessionKey });
}

export async function getLaps(sessionKey) {
  return get('/laps', { session_key: sessionKey });
}

export async function getStints(sessionKey) {
  return get('/stints', { session_key: sessionKey });
}

export async function getRaceControl(sessionKey) {
  return get('/race_control', { session_key: sessionKey });
}

export async function getWeather(sessionKey) {
  return get('/weather', { session_key: sessionKey });
}

// Reduce an array of time-stamped records to the latest entry per driver
export function latestPerDriver(records) {
  const map = {};
  for (const r of records) {
    const key = r.driver_number;
    if (!map[key] || r.date > map[key].date) map[key] = r;
  }
  return map;
}

// Reduce stints to the current (highest stint_number) per driver
export function currentStintPerDriver(stints) {
  const map = {};
  for (const s of stints) {
    const key = s.driver_number;
    if (!map[key] || s.stint_number > map[key].stint_number) map[key] = s;
  }
  return map;
}

export function isSessionLive(session) {
  if (!session) return false;
  const now = new Date();
  const start = new Date(session.date_start);
  const end = session.date_end
    ? new Date(new Date(session.date_end).getTime() + 30 * 60 * 1000) // 30-min buffer
    : new Date(start.getTime() + 4 * 60 * 60 * 1000);
  return start <= now && now <= end;
}

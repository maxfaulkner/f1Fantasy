import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import * as openf1 from '../services/openf1';

const LiveTimingContext = createContext(null);

const POLL_INTERVAL = 5000;

export function LiveTimingProvider({ children }) {
  const [session, setSession] = useState(null);
  const [drivers, setDrivers] = useState({});
  const [positions, setPositions] = useState({});
  const [intervals, setIntervals] = useState({});
  const [laps, setLaps] = useState({});
  const [stints, setStints] = useState({});
  const [raceControl, setRaceControl] = useState([]);
  const [weather, setWeather] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const sessionKeyRef = useRef(null);
  const pollRef = useRef(null);

  const fetchSessionData = useCallback(async (sessionKey) => {
    const [posRes, intRes, lapRes, stintRes, rcRes, wxRes] = await Promise.allSettled([
      openf1.getPositions(sessionKey),
      openf1.getIntervals(sessionKey),
      openf1.getLaps(sessionKey),
      openf1.getStints(sessionKey),
      openf1.getRaceControl(sessionKey),
      openf1.getWeather(sessionKey),
    ]);

    if (posRes.status === 'fulfilled')
      setPositions(openf1.latestPerDriver(posRes.value));
    if (intRes.status === 'fulfilled')
      setIntervals(openf1.latestPerDriver(intRes.value));
    if (lapRes.status === 'fulfilled')
      setLaps(openf1.latestPerDriver(lapRes.value));
    if (stintRes.status === 'fulfilled')
      setStints(openf1.currentStintPerDriver(stintRes.value));
    if (rcRes.status === 'fulfilled')
      setRaceControl([...rcRes.value].reverse().slice(0, 15));
    if (wxRes.status === 'fulfilled' && wxRes.value.length > 0)
      setWeather(wxRes.value[wxRes.value.length - 1]);
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const s = await openf1.getLatestSession();
        if (!s) return;

        setSession(s);
        sessionKeyRef.current = s.session_key;

        const live = openf1.isSessionLive(s);
        setIsLive(live);

        const driverList = await openf1.getSessionDrivers(s.session_key);
        const driverMap = {};
        driverList.forEach(d => { driverMap[d.driver_number] = d; });
        setDrivers(driverMap);

        await fetchSessionData(s.session_key);
      } catch (err) {
        setError('Could not load live timing data');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [fetchSessionData]);

  // Polling during live sessions
  useEffect(() => {
    if (!isLive || !sessionKeyRef.current) return;

    pollRef.current = setInterval(() => {
      // Re-check liveness on each tick
      setSession(prev => {
        if (prev && !openf1.isSessionLive(prev)) {
          setIsLive(false);
          clearInterval(pollRef.current);
          return prev;
        }
        return prev;
      });
      fetchSessionData(sessionKeyRef.current);
    }, POLL_INTERVAL);

    return () => clearInterval(pollRef.current);
  }, [isLive, fetchSessionData]);

  // Build sorted standings from the latest per-driver data
  const standings = Object.values(drivers).map(driver => {
    const num = driver.driver_number;
    const stint = stints[num];
    const lap = laps[num];
    const tyreAge = stint && lap
      ? (lap.lap_number ?? 0) - (stint.lap_start ?? 0) + (stint.tyre_age_at_start ?? 0)
      : null;

    return {
      ...driver,
      position: positions[num]?.position ?? 99,
      gap_to_leader: intervals[num]?.gap_to_leader ?? null,
      interval: intervals[num]?.interval ?? null,
      last_lap_duration: lap?.lap_duration ?? null,
      last_lap_number: lap?.lap_number ?? 0,
      compound: stint?.compound ?? null,
      tyre_age: tyreAge != null && tyreAge >= 0 ? tyreAge : null,
    };
  }).sort((a, b) => a.position - b.position);

  const currentLap = standings.reduce((m, d) => Math.max(m, d.last_lap_number ?? 0), 0);

  return (
    <LiveTimingContext.Provider value={{
      session,
      drivers,
      standings,
      raceControl,
      weather,
      isLive,
      isLoading,
      error,
      currentLap,
    }}>
      {children}
    </LiveTimingContext.Provider>
  );
}

export function useLiveTiming() {
  const ctx = useContext(LiveTimingContext);
  if (!ctx) throw new Error('useLiveTiming must be used inside LiveTimingProvider');
  return ctx;
}

import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

// Loads the full user document plus the level subpoints in parallel.
// Returns { status, user, level, error } where status ∈ loading|ready|error.
export function useStatsData(userId) {
  const [state, setState] = useState({
    status: 'loading',
    user: null,
    level: 0,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchJSON(`${API_BASE}/api/getUserProgress?userId=${encodeURIComponent(userId)}`),
      fetchJSON(`${API_BASE}/api/user/get_level?user_id=${encodeURIComponent(userId)}`),
    ])
      .then(([user, levelResp]) => {
        if (cancelled) return;
        const parsed = typeof levelResp === 'string' ? JSON.parse(levelResp) : levelResp;
        setState({
          status: 'ready',
          user,
          level: parsed?.level?.subpoints ?? 0,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ status: 'error', user: null, level: 0, error });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}

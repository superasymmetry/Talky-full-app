import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

async function fetchJSON(authFetch, url) {
  const res = await authFetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

const parseLevel = (resp) => {
  const parsed = typeof resp === 'string' ? JSON.parse(resp) : resp;
  return parsed?.level ?? null;
};

// authFetch: async (url) => Response, already carrying the caller's bearer
// token (see utils/authFetch.js). Both endpoints below require auth and
// verify the caller is either userId themself or userId's linked teacher.
export function useStatsData(userId, authFetch) {
  const [state, setState] = useState({
    status: 'loading',
    user: null,
    level: null,
    error: null,
  });

  useEffect(() => {
    // userId is null while the caller (Statistics.jsx) is still waiting on
    // Auth0 to resolve who's logged in. Skip the fetch rather than firing
    // a request for "null" and briefly flashing the wrong user's data.
    if (!userId || !authFetch) {
      setState((prev) => (prev.status === 'loading' ? prev : { status: 'loading', user: null, level: null, error: null }));
      return;
    }

    let cancelled = false;

    setState((prev) => (prev.status === 'loading' ? prev : { ...prev, status: 'loading' }));

    Promise.all([
      fetchJSON(authFetch, `${API_BASE}/api/getUserProgress?userId=${encodeURIComponent(userId)}`),
      fetchJSON(authFetch, `${API_BASE}/api/user/get_level?user_id=${encodeURIComponent(userId)}`),
    ])
      .then(([user, levelResp]) => {
        if (cancelled) return;
        setState({ status: 'ready', user, level: parseLevel(levelResp), error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ status: 'error', user: null, level: null, error });
      });

    return () => {
      cancelled = true;
    };
  }, [userId, authFetch]);

  return state;
}
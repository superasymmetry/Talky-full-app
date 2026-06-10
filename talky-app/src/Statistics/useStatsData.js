import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

const parseLevel = (resp) => {
  const parsed = typeof resp === 'string' ? JSON.parse(resp) : resp;
  return parsed?.level ?? null;
};

export function useStatsData(userId) {
  const [state, setState] = useState({
    status: 'loading',
    user: null,
    level: null,
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
        setState({ status: 'ready', user, level: parseLevel(levelResp), error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ status: 'error', user: null, level: null, error });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}

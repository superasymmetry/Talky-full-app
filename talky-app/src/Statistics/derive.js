export const HEATMAP_DAYS = 91;
export const WORD_LIST_LIMIT = 5;
export const RECENT_LIMIT = 10;
export const MIN_ATTEMPTS_FOR_RANKING = 2;

const MS_PER_DAY = 86_400_000;
const dayKey = (iso) => iso.slice(0, 10);
const daysBetween = (a, b) => Math.floor((a - b) / MS_PER_DAY);

const stamped = (history) => history.filter((h) => h?.timestamp);

export function uniqueActiveDays(history) {
  const set = new Set(stamped(history).map((h) => dayKey(h.timestamp)));
  return [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).reverse();
}

export function computeStreak(history, today = new Date()) {
  const days = uniqueActiveDays(history);
  let streak = 0;
  let cursor = today;
  for (const day of days) {
    if (daysBetween(cursor, new Date(day)) > 1) break;
    streak += 1;
    cursor = new Date(day);
  }
  return streak;
}

export function activityCells(history, days = HEATMAP_DAYS, today = new Date()) {
  const counts = new Map();
  for (const h of stamped(history)) {
    const key = dayKey(h.timestamp);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));

  const padStart = start.getDay();
  const cells = Array.from({ length: padStart }, () => null);

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ date: key, count: counts.get(key) || 0 });
  }
  return cells;
}

export function progressSeries(history, phoneme) {
  if (!phoneme) return [];
  return stamped(history)
    .map((h) => {
      const value = h.phoneme === phoneme ? h.score : h[phoneme];
      return value == null ? null : { key: new Date(h.timestamp), data: value };
    })
    .filter(Boolean);
}

export function masteryBars(phonemeScores) {
  return phonemeScores
    .filter((p) => p.attempts > 0 && p.avgScore != null)
    .sort((a, b) => a.avgScore - b.avgScore)
    .map((p) => ({ key: p.phoneme, data: Math.round(p.avgScore * 100) }));
}

function groupByWord(wordScores) {
  const map = new Map();
  for (const entry of wordScores) {
    if (!entry?.word) continue;
    const bucket = map.get(entry.word) ?? [];
    bucket.push(entry);
    map.set(entry.word, bucket);
  }
  return map;
}

const eligibleBuckets = (wordScores) =>
  [...groupByWord(wordScores).values()].filter(
    (bucket) => bucket.length >= MIN_ATTEMPTS_FOR_RANKING,
  );

const byTimestamp = (a, b) => new Date(a.timestamp) - new Date(b.timestamp);

export function hardestWords(wordScores) {
  return eligibleBuckets(wordScores)
    .map((bucket) => ({
      word: bucket[0].word,
      value: bucket.reduce((sum, e) => sum + e.score, 0) / bucket.length,
    }))
    .sort((a, b) => a.value - b.value)
    .slice(0, WORD_LIST_LIMIT);
}

export function mostImprovedWords(wordScores) {
  return eligibleBuckets(wordScores)
    .map((bucket) => {
      const sorted = [...bucket].sort(byTimestamp);
      return {
        word: bucket[0].word,
        value: sorted.at(-1).score - sorted[0].score,
      };
    })
    .filter((w) => w.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, WORD_LIST_LIMIT);
}

export function recentAttempts(wordScores) {
  return [...wordScores]
    .filter((s) => s.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, RECENT_LIMIT);
}

export function totalAttempts(phonemeScores) {
  return phonemeScores.reduce((sum, p) => sum + (p.attempts || 0), 0);
}

export function overallAccuracy(phonemeScores) {
  let weighted = 0;
  let attempts = 0;
  for (const p of phonemeScores) {
    if (!p.attempts || p.avgScore == null) continue;
    weighted += p.avgScore * p.attempts;
    attempts += p.attempts;
  }
  return attempts === 0 ? null : weighted / attempts;
}

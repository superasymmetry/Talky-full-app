export const HEATMAP_WEEKS = 26;
export const HEATMAP_MONTHS = 6;
export const HEATMAP_DAYS = HEATMAP_WEEKS * 7;
export const WORD_LIST_LIMIT = 5;
export const RECENT_LIMIT = 10;
export const MIN_ATTEMPTS_FOR_RANKING = 2;

const MS_PER_DAY = 86_400_000;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad2 = (n) => String(n).padStart(2, '0');

/* Day keys are local dates, not UTC slices — a lesson at 8pm should land on the
   day the user practised, not on tomorrow's cell west of Greenwich. */
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fromKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const dayKey = (value) => (
  typeof value === 'string' && value.length === 10 ? value : ymd(new Date(value))
);
const daysBetween = (a, b) => Math.round((a - b) / MS_PER_DAY);

const stamped = (history) => history.filter((h) => h?.timestamp);

export function uniqueActiveDays(history) {
  const set = new Set(stamped(history).map((h) => dayKey(h.timestamp)));
  return [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).reverse();
}

export function computeStreak(history, today = new Date()) {
  const days = uniqueActiveDays(history);
  let streak = 0;
  let cursor = startOfDay(today);
  for (const day of days) {
    const date = fromKey(day);
    if (daysBetween(cursor, date) > 1) break;
    streak += 1;
    cursor = date;
  }
  return streak;
}

/**
 * Activity grid as whole calendar weeks: one column per week, Sunday at the top.
 * The last column is the week containing `today`, so days after today come back
 * as `null` padding rather than empty-looking cells.
 */
export function activityCells(history, weeks = HEATMAP_WEEKS, today = new Date()) {
  const counts = new Map();
  for (const h of stamped(history)) {
    const key = dayKey(h.timestamp);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const end = startOfDay(today);
  const start = addDays(end, -(end.getDay() + (weeks - 1) * 7));

  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(start, w * 7 + d);
      if (date > end) return null;
      const key = ymd(date);
      return { date: key, count: counts.get(key) || 0 };
    }),
  );
}

/** Month tick per column where the month first appears, for the grid's top axis. */
export function activityMonths(columns) {
  const labels = [];
  let previous = null;
  columns.forEach((column, index) => {
    const first = column.find(Boolean);
    if (!first) return;
    const month = Number(first.date.slice(5, 7));
    if (month === previous) return;
    previous = month;
    labels.push({ index, label: MONTH_NAMES[month - 1] });
  });
  // Drop a leading tick that would collide with the next one.
  return labels.filter((l, i) => !labels[i + 1] || labels[i + 1].index - l.index >= 3);
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

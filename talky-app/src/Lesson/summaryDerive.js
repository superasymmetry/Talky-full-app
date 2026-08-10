export const WORD_LIST_LIMIT = 6;

function groupByWord(wordHistory) {
  const map = new Map();
  for (const entry of wordHistory || []) {
    if (!entry?.word) continue;
    const bucket = map.get(entry.word) ?? [];
    bucket.push(entry);
    map.set(entry.word, bucket);
  }
  return map;
}

export function phonemeMasteryBars(phonemeStats) {
  return (phonemeStats || [])
    .filter((p) => p.scores && p.scores.length > 0)
    .map((p) => ({
      key: p.phoneme,
      data: Math.round((p.scores.reduce((a, b) => a + b, 0) / p.scores.length) * 100),
    }))
    .sort((a, b) => a.data - b.data);
}

export function attemptWordRows(wordHistory) {
  const list = wordHistory || [];
  const groups = [...groupByWord(list).values()];

  const toughest = groups
    .map((bucket) => ({
      word: bucket[0].word,
      value: bucket.reduce((sum, e) => sum + e.score, 0) / bucket.length,
    }))
    .sort((a, b) => a.value - b.value)
    .slice(0, WORD_LIST_LIMIT);

  const improved = groups
    .filter((bucket) => bucket.length >= 2)
    .map((bucket) => ({
      word: bucket[0].word,
      value: bucket[bucket.length - 1].score - bucket[0].score,
    }))
    .filter((w) => w.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, WORD_LIST_LIMIT);

  const inOrder = list
    .map((e, i) => ({ word: e.word, value: e.score, position: i + 1 }))
    .slice(-WORD_LIST_LIMIT)
    .reverse();

  return { toughest, improved, inOrder };
}

export function prosodySeries(prosody) {
  const list = [...(prosody || [])].sort((a, b) => a.sentenceIndex - b.sentenceIndex);
  const pick = (key) =>
    list.filter((p) => p[key] != null).map((p) => ({ key: p.sentenceIndex, data: p[key] }));

  const rates = list.map((p) => p.speaking_rate).filter((r) => r != null);
  const avgSpeakingRate = rates.length
    ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10
    : null;

  return {
    monotony: pick('monotony_score'),
    rhythm: pick('rhythm_score'),
    boundary: pick('boundary_score'),
    avgSpeakingRate,
  };
}

export function scoreDeltaPct(current, comparison) {
  if (!current || !comparison) return null;
  return Math.round((current.overallScore - comparison.overallScore) * 100);
}

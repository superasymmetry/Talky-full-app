import { describe, it, expect } from 'vitest';
import {
  computeStreak,
  hardestWords,
  masteryBars,
  mostImprovedWords,
  overallAccuracy,
  progressSeries,
  totalAttempts,
} from '../src/Statistics/derive.js';

const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString();

describe('computeStreak', () => {
  it('returns 0 for no history', () => {
    expect(computeStreak([])).toBe(0);
  });

  it('counts consecutive days back from today', () => {
    const today = new Date(Date.UTC(2026, 5, 9));
    const history = [
      { timestamp: iso(2026, 6, 9) },
      { timestamp: iso(2026, 6, 8) },
      { timestamp: iso(2026, 6, 7) },
      { timestamp: iso(2026, 6, 5) },
    ];
    expect(computeStreak(history, today)).toBe(3);
  });

  it('ignores entries without a timestamp', () => {
    const today = new Date(Date.UTC(2026, 5, 9));
    expect(computeStreak([{ score: 0.5 }], today)).toBe(0);
  });
});

describe('totalAttempts / overallAccuracy', () => {
  const scores = [
    { phoneme: 'r', attempts: 4, avgScore: 0.5 },
    { phoneme: 'l', attempts: 6, avgScore: 0.8 },
    { phoneme: 's', attempts: 0, avgScore: null },
  ];

  it('sums attempts across phonemes', () => {
    expect(totalAttempts(scores)).toBe(10);
  });

  it('weights accuracy by attempt count', () => {
    const acc = overallAccuracy(scores);
    expect(acc).toBeCloseTo((4 * 0.5 + 6 * 0.8) / 10);
  });

  it('returns null when no attempts logged', () => {
    expect(overallAccuracy([{ phoneme: 'r', attempts: 0, avgScore: null }])).toBeNull();
  });
});

describe('hardestWords / mostImprovedWords', () => {
  const words = [
    { word: 'rabbit', score: 0.4, timestamp: iso(2026, 6, 1) },
    { word: 'rabbit', score: 0.5, timestamp: iso(2026, 6, 2) },
    { word: 'lion', score: 0.3, timestamp: iso(2026, 6, 1) },
    { word: 'lion', score: 0.9, timestamp: iso(2026, 6, 3) },
    { word: 'singleton', score: 0.2, timestamp: iso(2026, 6, 1) },
  ];

  it('hardestWords excludes single-attempt words', () => {
    const result = hardestWords(words);
    expect(result.map((w) => w.word)).not.toContain('singleton');
  });

  it('hardestWords sorts by average ascending', () => {
    const result = hardestWords(words);
    expect(result[0].word).toBe('rabbit');
  });

  it('mostImprovedWords reports last-minus-first delta', () => {
    const result = mostImprovedWords(words);
    expect(result[0].word).toBe('lion');
    expect(result[0].value).toBeCloseTo(0.6);
  });
});

describe('masteryBars', () => {
  it('drops untouched phonemes and sorts weakest first', () => {
    const bars = masteryBars([
      { phoneme: 'r', attempts: 5, avgScore: 0.4 },
      { phoneme: 's', attempts: 0, avgScore: null },
      { phoneme: 'l', attempts: 2, avgScore: 0.9 },
    ]);
    expect(bars).toEqual([
      { key: 'r', data: 40 },
      { key: 'l', data: 90 },
    ]);
  });
});

describe('progressSeries', () => {
  it('reads cumulative phoneme values from history dicts', () => {
    const history = [
      { timestamp: iso(2026, 6, 1), r: 0.2 },
      { timestamp: iso(2026, 6, 2), r: 0.5, l: 0.1 },
    ];
    const series = progressSeries(history, 'r');
    expect(series).toHaveLength(2);
    expect(series[1].data).toBe(0.5);
  });

  it('also reads per-attempt entries shaped { phoneme, score }', () => {
    const history = [
      { timestamp: iso(2026, 6, 1), phoneme: 'r', score: 0.6 },
      { timestamp: iso(2026, 6, 2), phoneme: 'l', score: 0.9 },
    ];
    const series = progressSeries(history, 'r');
    expect(series).toEqual([{ key: new Date(iso(2026, 6, 1)), data: 0.6 }]);
  });
});

import { Line, LineChart, LineSeries } from 'reaviz';
import { attemptWordRows, phonemeMasteryBars, prosodySeries, scoreDeltaPct } from './summaryDerive.js';

import { Card, PhonemeMastery, StatTile } from '../Statistics/components.jsx';
import '../Statistics/Statistics.css';
import { useState } from 'react';

const fmtPct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const fmtDelta = (v) => (v == null ? null : `${v > 0 ? '+' : ''}${v}%`);

const PROSODY_METRICS = [
  { key: 'monotony', label: 'Expression', hint: 'Pitch variation this sentence — higher is livelier, less monotone', color: '#AC6AFF' },
  { key: 'rhythm', label: 'Rhythm', hint: 'Naturalness of long/short syllable timing', color: '#858DFF' },
  { key: 'boundary', label: 'Sentence melody', hint: 'Voice rising for questions, falling for statements', color: '#FF98E2' },
];

const MiniTrend = ({ label, hint, color, data }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="caption text-n-3" title={hint}>{label}</span>
    </div>
    {data.length === 0 ? (
      <p className="caption text-n-4">No data yet</p>
    ) : (
      <div style={{ height: 70 }}>
        <LineChart
          height={70}
          width={undefined}
          data={data}
          series={
            <LineSeries
              line={<Line strokeWidth={2} />}
              colorScheme={color}
              interpolation="smooth"
            />
          }
        />
      </div>
    )}
  </div>
);

const ProsodyTrend = ({ prosody }) => {
  const series = prosodySeries(prosody);
  return (
    <Card title="Expression & rhythm across sentences" className="shrink-0">
      {prosody.length === 0 ? (
        <p className="body-2 text-n-4">No prosody data captured for this attempt.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {PROSODY_METRICS.map((m) => (
              <MiniTrend key={m.key} label={m.label} hint={m.hint} color={m.color} data={series[m.key]} />
            ))}
          </div>
          <p className="caption text-n-4 mt-3">
            Avg speaking rate: {series.avgSpeakingRate != null ? `${series.avgSpeakingRate} syll/s` : '—'}
          </p>
        </>
      )}
    </Card>
  );
};

const WORD_TAB_DEFS = [
  { id: 'toughest', label: 'Toughest words', empty: 'No repeated words this attempt.', valueClass: 'text-color-3', format: (r) => fmtPct(r.value) },
  { id: 'improved', label: 'Most improved', empty: 'Say a word more than once to track improvement within the lesson.', valueClass: 'text-color-4', format: (r) => fmtDelta(Math.round(r.value * 100)) },
  { id: 'inOrder', label: 'In order', empty: 'No words attempted yet.', valueClass: 'text-n-3', format: (r) => fmtPct(r.value) },
];

const AttemptWordTabs = ({ wordHistory }) => {
  const [tab, setTab] = useState('toughest');
  const rows = attemptWordRows(wordHistory);
  const active = WORD_TAB_DEFS.find((t) => t.id === tab);
  const data = rows[tab] || [];

  return (
    <Card
      title="Word breakdown"
      className="shrink-0"
      action={
        <div className="cut-group flex gap-1 p-1 bg-n-6 border border-n-1/10">
          {WORD_TAB_DEFS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`cut-chip px-2.5 py-1 text-sm transition-colors ${tab === t.id ? 'bg-n-8 text-n-1' : 'text-n-3 hover:text-n-1'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {data.length === 0 ? (
        <p className="body-2 text-n-4">{active.empty}</p>
      ) : (
        <ul className="divide-y divide-n-6">
          {data.map((row, i) => (
            <li key={`${row.word}-${i}`} className="flex justify-between items-center gap-3 py-1.5 first:pt-0 last:pb-0">
              <span className="font-mono text-n-1 truncate">{row.word}</span>
              <span className={`font-semibold shrink-0 ${active.valueClass}`}>{active.format(row)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const TAB_LABELS = { current: 'This attempt', first: 'First attempt', previous: 'Previous attempt' };

export default function LessonSummary({ status, currentAttempt, comparisonAttempts, onRetry, onHome }) {
  const { first, previous } = comparisonAttempts || {};
  const showPrevious = previous && previous.attemptNumber !== first?.attemptNumber;

  const tabs = ['current', first && 'first', showPrevious && 'previous'].filter(Boolean);
  const [activeTab, setActiveTab] = useState('current');
  const attemptsByTab = { current: currentAttempt, first, previous };
  const activeAttempt = attemptsByTab[activeTab] || currentAttempt;

  if (!currentAttempt) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0E0C15', color: '#fff' }}>
        Loading results…
      </div>
    );
  }

  const passed = status === 'completed';
  const delta = scoreDeltaPct(currentAttempt, first);
  const bars = phonemeMasteryBars(activeAttempt.phonemeStats);

  return (
    <div className="bg-n-8 text-n-1" style={{ position: 'fixed', inset: 0, overflowY: 'auto' }}>
      <div className="max-w-[70rem] mx-auto px-5 lg:px-10 py-10 flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h1 className="h4 m-0">
            {passed ? '🎉 Lesson Complete!' : '💪 Out of Attempts'}
          </h1>
          <p className="body-2 text-n-3">
            {passed ? 'Nice work — here' : "You ran out of tries this time — here"}
            {"'"}s the full breakdown of attempt #{currentAttempt.attemptNumber ?? 1}
            {currentAttempt.phoneme ? ` for the /${currentAttempt.phoneme}/ sound` : ''}.
          </p>
        </header>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 shrink-0">
          <StatTile
            label="Overall accuracy"
            value={fmtPct(currentAttempt.overallScore)}
            sub={delta == null ? 'First time trying this lesson' : `${fmtDelta(delta)} vs your first attempt`}
            accent={passed ? 'text-color-4' : 'text-color-3'}
          />
          <StatTile
            label="Lives remaining"
            value={`${currentAttempt.livesRemaining ?? 0} / ${currentAttempt.maxLives ?? 3}`}
            sub={passed ? 'Lesson passed' : 'Lesson failed'}
            accent={passed ? 'text-color-4' : 'text-color-3'}
          />
          <StatTile
            label="Words practiced"
            value={(currentAttempt.wordHistory || []).length}
            sub="Attempts logged this lesson"
            accent="text-color-1"
          />
          <StatTile
            label="Sounds tracked"
            value={(currentAttempt.phonemeStats || []).length}
            sub="Phonemes scored this lesson"
            accent="text-color-2"
          />
        </div>

        {tabs.length > 1 && (
          <div className="cut-group flex gap-1 p-1 bg-n-6 border border-n-1/10 self-start">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTab(t)}
                className={`cut-chip px-3 py-1.5 text-sm transition-colors ${activeTab === t ? 'bg-n-8 text-n-1' : 'text-n-3 hover:text-n-1'}`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="flex flex-col gap-3 min-h-0">
            <PhonemeMastery bars={bars} />
            <AttemptWordTabs wordHistory={activeAttempt.wordHistory} />
          </div>
          <div className="flex flex-col gap-3 min-h-0">
            <ProsodyTrend prosody={activeAttempt.prosody || []} />
          </div>
        </div>

        <div className="flex gap-3 justify-center pt-4 pb-8">
          {!passed && (
            <button onClick={onRetry} className="cut-chip" style={{ padding: '12px 24px', border: 'none', background: '#AC6AFF', color: '#0E0C15', fontSize: '1.1rem', fontWeight: 700, cursor: 'pointer' }}>
              Try Lesson Again
            </button>
          )}
          <button onClick={onHome} className="cut-chip" style={{ padding: '12px 24px', border: 'none', background: passed ? '#AC6AFF' : '#15131D', color: passed ? '#0E0C15' : '#FFFFFF', boxShadow: passed ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,0.1)', fontSize: '1.1rem', fontWeight: 700, cursor: 'pointer' }}>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

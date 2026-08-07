import {
  Card,
  Heatmap,
  LevelTile,
  PhonemeMastery,
  ProgressChart,
  StatTile,
  WordTabs,
} from './components.jsx';
import {
  activityCells,
  computeStreak,
  hardestWords,
  masteryBars,
  mostImprovedWords,
  overallAccuracy,
  progressSeries,
  recentAttempts,
  totalAttempts,
} from './derive.js';
import { useEffect, useMemo, useState } from 'react';

import Header from '../Header/Header.jsx';
import { useAuth0 } from '@auth0/auth0-react';
import { useStatsData } from './useStatsData.js';

// The dashboard fits one screen with no page scrolling. `position: fixed`
// (the same escape hatch SoundBank and Lesson use) is needed because the
// global `body { padding-top: 70px }` in index.css would otherwise push a
// 100vh child past the bottom of the viewport and reintroduce a scrollbar.
const Layout = ({ children }) => (
  <div className="bg-n-8 text-n-1 flex flex-col" style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
    <Header />
    <main
      className="flex-1 min-h-0 px-5 lg:px-10 pb-5"
      style={{ paddingTop: 'calc(var(--header-height, 112px) + 1rem)' }}
    >
      <div className="max-w-[87.5rem] h-full mx-auto flex flex-col min-h-0 gap-3">{children}</div>
    </main>
  </div>
);

// Collapsed to a single row — the stacked eyebrow/title/subtitle version cost
// ~160px of vertical space, which is the chart's whole height budget.
const PageHeading = () => (
  <header className="flex items-baseline gap-4 flex-wrap shrink-0">
    <h1 className="h5 m-0 text-n-1">Progress</h1>
  </header>
);

const streakSub = (streak) => {
  if (streak === 0) return 'Start a lesson today';
  if (streak === 1) return 'Great start — come back tomorrow';
  return 'Keep the momentum going';
};

export default function Statistics() {
  // Auth0 (not localStorage) is the source of truth for who's logged in —
  // every other page (App.jsx, Profile.jsx, main.jsx's UserCreator) keys
  // off user.sub || user.email, so Statistics needs to match or it just
  // silently shows a different account's data.
  const { user, isAuthenticated, isLoading: authLoading } = useAuth0();
  const userId = isAuthenticated && user ? (user.sub || user.email) : 'demo';

  const { status, user: userDoc, level, error } = useStatsData(authLoading ? null : userId);
  const [selected, setSelected] = useState('');

  const phonemes = userDoc?.progress?.phonemeScores ?? [];
  const wordScores = userDoc?.progress?.wordScores ?? [];
  const history = userDoc?.history ?? [];
  const playablePhonemes = phonemes.filter((p) => p.attempts > 0);

  useEffect(() => {
    if (playablePhonemes.length && !selected) {
      setSelected(playablePhonemes[0].phoneme);
    }
  }, [playablePhonemes, selected]);

  const streak = useMemo(() => computeStreak(history), [history]);
  const cells = useMemo(() => activityCells(history), [history]);
  const series = useMemo(() => progressSeries(history, selected), [history, selected]);
  const bars = useMemo(() => masteryBars(phonemes), [phonemes]);
  const hardest = useMemo(() => hardestWords(wordScores), [wordScores]);
  const improved = useMemo(() => mostImprovedWords(wordScores), [wordScores]);
  const recent = useMemo(() => recentAttempts(wordScores), [wordScores]);

  const total = useMemo(() => totalAttempts(phonemes), [phonemes]);
  const accuracy = useMemo(() => overallAccuracy(phonemes), [phonemes]);

  if (authLoading || status === 'loading') {
    return <Layout><Card>Loading statistics…</Card></Layout>;
  }
  if (status === 'error') {
    return (
      <Layout>
        <Card title="Couldn’t load statistics">
          <p className="body-2 text-n-3">{String(error?.message ?? error)}</p>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeading />

      <div className="flex-1 min-h-0 flex flex-col gap-3">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 shrink-0">
          <LevelTile level={level} />
          <StatTile
            label="Day streak"
            value={streak}
            sub={streakSub(streak)}
            accent="text-color-2"
          />
          <StatTile
            label="Overall accuracy"
            value={accuracy == null ? '—' : `${Math.round(accuracy * 100)}%`}
            sub={accuracy == null ? 'No attempts yet' : 'Across all sounds'}
            accent="text-color-4"
          />
          <StatTile
            label="Total attempts"
            value={total}
            sub={total === 0 ? 'Try your first lesson' : 'Sound attempts logged'}
            accent="text-color-5"
          />
        </div>

        {/* Two columns share the leftover height: the chart and the mastery
            list stretch, while the heatmap and word list keep their natural
            size. That's what absorbs viewport differences without scrolling. */}
        <div className="flex-1 min-h-0 grid gap-3 lg:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-3 min-h-0">
            <ProgressChart
              phonemes={playablePhonemes}
              selected={selected}
              onSelect={setSelected}
              series={series}
            />
            <Heatmap cells={cells} />
          </div>

          <div className="flex flex-col gap-3 min-h-0">
            <PhonemeMastery bars={bars} />
            <WordTabs hardest={hardest} improved={improved} recent={recent} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
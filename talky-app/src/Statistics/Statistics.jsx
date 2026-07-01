import { useEffect, useMemo, useState } from 'react';

import Header from '../Header/Header.jsx';
import Footer from '../Footer.jsx';

import { useStatsData } from './useStatsData.js';
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
import {
  Card,
  Heatmap,
  LevelTile,
  PhonemeMastery,
  ProgressChart,
  StatTile,
  WordTabs,
} from './components.jsx';

const VALID_USER_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const getUserId = () => {
  const id = localStorage.getItem('userId') || 'demo';
  return VALID_USER_ID.test(id) ? id : 'demo';
};

const Layout = ({ children }) => (
  <div className="min-h-screen bg-n-8 text-n-1">
    <Header />
    <main className="pt-32 pb-24 px-5 lg:px-10">
      <div className="max-w-[87.5rem] mx-auto">{children}</div>
    </main>
    <Footer />
  </div>
);

const PageHeading = () => (
  <header className="mb-10">
    <p className="tagline text-color-1">Statistics</p>
    <h1 className="h2 mt-2 text-n-1">Your progress</h1>
    <p className="body-2 mt-3 text-n-3 max-w-xl">
      A snapshot of your streaks, sounds, and the words you’re mastering.
    </p>
  </header>
);

const streakSub = (streak) => {
  if (streak === 0) return 'Start a lesson today';
  if (streak === 1) return 'Great start — come back tomorrow';
  return 'Keep the momentum going';
};

export default function Statistics() {
  const { status, user, level, error } = useStatsData(getUserId());
  const [selected, setSelected] = useState('');

  const phonemes = user?.progress?.phonemeScores ?? [];
  const wordScores = user?.progress?.wordScores ?? [];
  const history = user?.history ?? [];
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

  if (status === 'loading') {
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

      <div className="flex flex-col gap-6">
        <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
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

        <Heatmap cells={cells} />

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr] items-start">
          <ProgressChart
            phonemes={playablePhonemes}
            selected={selected}
            onSelect={setSelected}
            series={series}
          />
          <PhonemeMastery bars={bars} />
        </div>

        <WordTabs hardest={hardest} improved={improved} recent={recent} />
      </div>
    </Layout>
  );
}

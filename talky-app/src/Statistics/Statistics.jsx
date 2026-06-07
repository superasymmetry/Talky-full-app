import { useEffect, useMemo, useState } from 'react';

import Header from '../Header/Header.jsx';
import Footer from '../Footer.jsx';

import { useStatsData } from './useStatsData.js';
import {
  activityCells,
  computeStreak,
  hardestWords,
  mostImprovedWords,
  progressSeries,
  recentAttempts,
} from './derive.js';
import {
  Card,
  Heatmap,
  LevelTile,
  PhonemeGrid,
  ProgressChart,
  StreakTile,
  WordList,
} from './components.jsx';

const getUserId = () => localStorage.getItem('userId') || 'demo';

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
      Track your speech journey, daily streaks, and the sounds and words you’re mastering.
    </p>
  </header>
);

const formatPercent = ({ value }) => `${Math.round(value * 100)}% avg`;
const formatDelta = ({ value }) => `+${Math.round(value * 100)}%`;
const formatDate = ({ timestamp }) => new Date(timestamp).toLocaleDateString();

export default function Statistics() {
  const { status, user, level, error } = useStatsData(getUserId());
  const [selected, setSelected] = useState('');

  const phonemes = user?.progress?.phonemeScores ?? [];
  const wordScores = user?.progress?.wordScores ?? [];
  const history = user?.history ?? [];

  useEffect(() => {
    if (phonemes.length && !selected) setSelected(phonemes[0].phoneme);
  }, [phonemes, selected]);

  const streak = useMemo(() => computeStreak(history), [history]);
  const cells = useMemo(() => activityCells(history), [history]);
  const series = useMemo(() => progressSeries(history, selected), [history, selected]);
  const hardest = useMemo(() => hardestWords(wordScores), [wordScores]);
  const improved = useMemo(() => mostImprovedWords(wordScores), [wordScores]);
  const recent = useMemo(() => recentAttempts(wordScores), [wordScores]);

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
        <div className="grid gap-6 lg:grid-cols-[260px_260px_1fr]">
          <LevelTile level={level} />
          <StreakTile streak={streak} />
          <Heatmap cells={cells} />
        </div>

        <ProgressChart
          phonemes={phonemes}
          selected={selected}
          onSelect={setSelected}
          series={series}
        />

        <div className="grid gap-6 lg:grid-cols-[1fr_2fr] items-start">
          <div className="flex flex-col gap-6">
            <WordList
              title="Needs practice"
              rows={hardest}
              empty="Complete a few words to see the trickiest ones."
              valueClass="text-color-3"
              format={formatPercent}
            />
            <WordList
              title="Most improved"
              rows={improved}
              empty="Practice each word a couple of times to track improvement."
              valueClass="text-color-4"
              format={formatDelta}
            />
            <WordList
              title="Recent attempts"
              rows={recent}
              empty="No recent attempts yet."
              valueClass="text-n-3"
              format={formatDate}
            />
          </div>
          <PhonemeGrid scores={phonemes} />
        </div>
      </div>
    </Layout>
  );
}

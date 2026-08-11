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

import PropTypes from 'prop-types';
import { useAuth0 } from '@auth0/auth0-react';
import { useStatsData } from './useStatsData.js';
import { makeAuthFetch } from '../utils/authFetch.js';

const PageHeading = () => (
  <header className="flex items-baseline gap-4 flex-wrap">
    <h1 className="h5 m-0 text-n-1">Progress</h1>
  </header>
);

const streakSub = (streak) => {
  if (streak === 0) return 'Start a lesson today';
  if (streak === 1) return 'Great start — come back tomorrow';
  return 'Keep the momentum going';
};

// Renders the stats charts/tiles for a single user (`userId`). Used both by
// Statistics.jsx (self-view, wrapped in its own page Layout) and
// StudentDetail.jsx (teacher-view, embedded inside its own page chrome).
export default function StatisticsPanel({ userId }) {
  const { getAccessTokenSilently } = useAuth0();
  const authFetch = useMemo(() => makeAuthFetch(getAccessTokenSilently), [getAccessTokenSilently]);

  const { status, user: userDoc, level, error } = useStatsData(userId, authFetch);
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

  if (status === 'loading') {
    return <Card>Loading statistics…</Card>;
  }
  if (status === 'error') {
    return (
      <Card title="Couldn’t load statistics">
        <p className="body-2 text-n-3">{String(error?.message ?? error)}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeading />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid gap-4 items-start lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <ProgressChart
            phonemes={playablePhonemes}
            selected={selected}
            onSelect={setSelected}
            series={series}
          />
          <Heatmap columns={cells} />
        </div>

        <div className="flex flex-col gap-4">
          <PhonemeMastery bars={bars} />
          <WordTabs hardest={hardest} improved={improved} recent={recent} />
        </div>
      </div>
    </div>
  );
}

StatisticsPanel.propTypes = {
  userId: PropTypes.string,
};

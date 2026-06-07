import { LineChart, RadialGauge } from 'reaviz';
import { HEATMAP_DAYS } from './derive.js';

export const Card = ({ title, action, children, className = '' }) => (
  <section className={`p-6 lg:p-8 bg-n-7 border border-n-1/10 rounded-3xl ${className}`}>
    {(title || action) && (
      <header className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        {title && <h3 className="h6 text-n-1 m-0">{title}</h3>}
        {action}
      </header>
    )}
    {children}
  </section>
);

export const Empty = ({ children }) => (
  <p className="body-2 text-n-4">{children}</p>
);

export const LevelTile = ({ level }) => (
  <Card title="Current level" className="flex flex-col items-center">
    <RadialGauge height={180} width={180} data={[{ key: 'level', data: level }]} />
  </Card>
);

const streakMessage = (streak) => {
  if (streak === 0) return 'Start a lesson today!';
  if (streak === 1) return 'Great start — come back tomorrow.';
  return 'Keep the momentum going!';
};

export const StreakTile = ({ streak }) => (
  <Card title="Day streak" className="flex flex-col items-center justify-center text-center">
    <div className="text-6xl font-semibold text-color-2 leading-none">{streak}</div>
    <p className="mt-4 body-2 text-n-3">{streakMessage(streak)}</p>
  </Card>
);

const intensityClass = (count) => {
  if (count === 0) return 'bg-n-6';
  if (count < 3) return 'bg-color-4/40';
  if (count < 6) return 'bg-color-4/70';
  return 'bg-color-4';
};

export const Heatmap = ({ cells }) => (
  <Card title={`Activity · last ${HEATMAP_DAYS} days`} className="flex-1">
    <div className="grid grid-rows-7 grid-flow-col gap-1.5 overflow-x-auto pb-1">
      {cells.map((cell, i) =>
        cell === null ? (
          <div key={`pad-${i}`} className="w-3.5 h-3.5" aria-hidden />
        ) : (
          <div
            key={cell.date}
            title={`${cell.date}: ${cell.count} attempt${cell.count === 1 ? '' : 's'}`}
            className={`w-3.5 h-3.5 rounded-[3px] ${intensityClass(cell.count)}`}
          />
        ),
      )}
    </div>
  </Card>
);

export const ProgressChart = ({ phonemes, selected, onSelect, series }) => (
  <Card
    title="Progress over time"
    action={
      <select
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
        className="px-4 py-2 rounded-xl bg-n-6 border border-n-1/10 text-n-1 font-semibold focus:outline-none focus:border-color-1"
        aria-label="Choose sound"
      >
        {phonemes.map((p) => (
          <option key={p.phoneme} value={p.phoneme}>Sound: {p.phoneme}</option>
        ))}
      </select>
    }
  >
    <div className="h-[320px]">
      {series.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <Empty>No history yet for this sound.</Empty>
        </div>
      ) : (
        <LineChart width="100%" height={320} data={series} />
      )}
    </div>
  </Card>
);

export const PhonemeGrid = ({ scores }) => (
  <Card title="Sound mastery">
    <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3">
      {scores.map(({ phoneme, avgScore, attempts }) => {
        const started = attempts > 0;
        return (
          <div
            key={phoneme}
            className={`p-4 rounded-2xl border text-center ${
              started ? 'border-n-1/10 bg-n-6' : 'border-n-1/5 bg-n-8/60'
            }`}
          >
            <div className={`text-2xl font-semibold ${started ? 'text-color-1' : 'text-n-4'}`}>
              {phoneme}
            </div>
            {started ? (
              <>
                <div className="mt-1 text-lg font-semibold text-n-1">
                  {Math.round((avgScore ?? 0) * 100)}%
                </div>
                <div className="mt-0.5 caption text-n-3">
                  {attempts} attempt{attempts === 1 ? '' : 's'}
                </div>
              </>
            ) : (
              <div className="mt-1 caption text-n-4">Not started</div>
            )}
          </div>
        );
      })}
    </div>
  </Card>
);

export const WordList = ({ title, rows, empty, format, valueClass = 'text-n-1' }) => (
  <Card title={title}>
    {rows.length === 0 ? (
      <Empty>{empty}</Empty>
    ) : (
      <ul className="divide-y divide-n-6">
        {rows.map((row, i) => (
          <li
            key={`${row.word}-${i}`}
            className="flex justify-between items-center py-3 first:pt-0 last:pb-0"
          >
            <span className="font-mono text-n-1">{row.word}</span>
            <span className={`font-semibold ${valueClass}`}>{format(row)}</span>
          </li>
        ))}
      </ul>
    )}
  </Card>
);

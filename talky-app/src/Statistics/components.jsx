import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  AreaChart,
  AreaSeries,
  Area,
  Line,
} from 'reaviz';
import { HEATMAP_DAYS } from './derive.js';

const fmtPct = (v) => `${Math.round(v * 100)}%`;

export const Card = ({ title, action, children, className = '' }) => (
  <section className={`p-6 lg:p-8 bg-n-7 border border-n-1/10 rounded-3xl ${className}`}>
    {(title || action) && (
      <header className="flex items-center justify-between gap-3 flex-wrap mb-5">
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

export const StatTile = ({ label, value, sub, accent = 'text-n-1' }) => (
  <Card className="flex flex-col gap-2 min-h-[140px] justify-center">
    <p className="tagline text-n-3">{label}</p>
    <p className={`text-4xl lg:text-5xl font-semibold leading-none ${accent}`}>{value}</p>
    {sub && <p className="caption text-n-4">{sub}</p>}
  </Card>
);

export const LevelTile = ({ level }) => {
  const current = level?.current ?? 1;
  const subpoints = level?.subpoints ?? 0;
  const maxval = level?.maxval || 100;
  const pct = Math.min(100, Math.round((subpoints / maxval) * 100));

  return (
    <Card className="flex flex-col gap-3 min-h-[140px] justify-center">
      <div className="flex items-baseline justify-between gap-3">
        <p className="tagline text-n-3">Level</p>
        <p className="caption text-n-3">{subpoints} / {maxval} XP</p>
      </div>
      <p className="text-4xl lg:text-5xl font-semibold leading-none text-color-1">{current}</p>
      <div className="h-2 rounded-full bg-n-6 overflow-hidden">
        <div
          className="h-full bg-color-1 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Card>
  );
};

// Tailwind's opacity-slash modifier (bg-color-4/30) only compiles correctly
// for custom color tokens if the theme config defines them a specific way
// (CSS-variable RGB channels). Nothing else in this codebase exercises that
// pattern, and in practice it wasn't generating any fill at all — cells
// rendered (the border proved that) but every intensity level looked
// identical to "no activity." Inline rgba() sidesteps Tailwind's color
// pipeline entirely, so it can't silently fail to compile.
const ACCENT_RGB = '122, 219, 120'; // color-4 (#7ADB78) as r,g,b

const cellStyle = (count) => {
  if (count === 0) return undefined; // covered by the bg-n-6 class instead
  const alpha = count < 3 ? 0.35 : count < 6 ? 0.65 : 1;
  return { backgroundColor: `rgba(${ACCENT_RGB}, ${alpha})` };
};

const cellClass = (count) =>
  count === 0 ? 'bg-n-6 border border-n-1/10' : '';

const Legend = () => (
  <div className="flex items-center gap-2 mt-4 text-n-4 caption">
    <span>Less</span>
    {[0, 2, 5, 8].map((n) => (
      <span
        key={n}
        className={`w-3 h-3 rounded-[3px] ${cellClass(n)}`}
        style={cellStyle(n)}
        aria-hidden
      />
    ))}
    <span>More</span>
  </div>
);

export const Heatmap = ({ cells }) => (
  <Card title={`Activity · last ${HEATMAP_DAYS} days`}>
    <div className="grid grid-rows-7 grid-flow-col gap-1.5 overflow-x-auto pb-1">
      {cells.map((cell, i) =>
        cell === null ? (
          <div key={`pad-${i}`} className="w-3.5 h-3.5" aria-hidden />
        ) : (
          <div
            key={cell.date}
            title={`${cell.date}: ${cell.count} attempt${cell.count === 1 ? '' : 's'}`}
            className={`w-3.5 h-3.5 rounded-[3px] ${cellClass(cell.count)}`}
            style={cellStyle(cell.count)}
          />
        ),
      )}
    </div>
    <Legend />
  </Card>
);

const PhonemeChips = ({ phonemes, selected, onSelect }) => (
  <div className="flex flex-wrap gap-2">
    {phonemes.map((p) => {
      const active = p.phoneme === selected;
      return (
        <button
          key={p.phoneme}
          type="button"
          onClick={() => onSelect(p.phoneme)}
          className={`px-3 py-1.5 rounded-full font-mono text-sm border transition-colors ${
            active
              ? 'bg-color-1 text-n-8 border-color-1'
              : 'bg-n-6 text-n-2 border-n-1/10 hover:border-color-1/60'
          }`}
        >
          {p.phoneme}
        </button>
      );
    })}
  </div>
);

export const ProgressChart = ({ phonemes, selected, onSelect, series }) => (
  <Card title="Progress over time">
    <PhonemeChips phonemes={phonemes} selected={selected} onSelect={onSelect} />
    <div className="h-[280px] mt-5">
      {series.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <Empty>No history yet for this sound.</Empty>
        </div>
      ) : (
        <AreaChart
          height={280}
          width={undefined}
          data={series}
          series={
            <AreaSeries
              // Letting Area/Line keep their default gradient (rather than
              // gradient={null} mask={null}) is what gives the fill its
              // fade-to-transparent look. Forcing both to null was
              // stripping that out and leaving a flat, opaque fill instead.
              area={<Area />}
              line={<Line strokeWidth={2} />}
              colorScheme="#AC6AFF"
              interpolation="smooth"
            />
          }
        />
      )}
    </div>
  </Card>
);

// Same red → orange → green scale the phoneme chips elsewhere in the app use.
const masteryColor = (pct) => {
  if (pct >= 80) return '#7ADB78';
  if (pct >= 50) return '#FFC876';
  return '#FF776F';
};

// Built with plain Tailwind instead of reaviz's BarList — same call the
// Heatmap above already made. BarList depends on reaviz's own stylesheet
// being applied, which isn't happening reliably in this build (that's what
// was producing "undefined%" text and the collapsed, overlapping layout).
// A hand-rolled bar avoids that dependency entirely and matches the rest
// of the dashboard's look.
export const PhonemeMastery = ({ bars }) => (
  <Card title="Sound mastery">
    {bars.length === 0 ? (
      <Empty>Complete a lesson to start tracking sound mastery.</Empty>
    ) : (
      <ul className="flex flex-col gap-4">
        {bars.map((bar) => (
          <li key={bar.key} className="flex items-center gap-4">
            <span className="w-8 shrink-0 font-mono text-sm text-n-2">{bar.key}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-n-6">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${bar.data}%`, backgroundColor: masteryColor(bar.data) }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-sm font-semibold text-n-1">
              {bar.data}%
            </span>
          </li>
        ))}
      </ul>
    )}
  </Card>
);

const TAB_DEFS = [
  { id: 'hardest', label: 'Needs practice', empty: 'Complete a few words to see the trickiest ones.', valueClass: 'text-color-3', format: (r) => `${fmtPct(r.value)} avg` },
  { id: 'improved', label: 'Most improved', empty: 'Practice each word a couple of times to track improvement.', valueClass: 'text-color-4', format: (r) => `+${fmtPct(r.value)}` },
  { id: 'recent', label: 'Recent', empty: 'No recent attempts yet.', valueClass: 'text-n-3', format: (r) => new Date(r.timestamp).toLocaleDateString() },
];

export const WordTabs = ({ hardest, improved, recent }) => {
  const [tab, setTab] = useState('hardest');
  const data = { hardest, improved, recent };
  const active = TAB_DEFS.find((t) => t.id === tab);
  const rows = data[tab];

  return (
    <Card
      title="Word focus"
      action={
        <div className="flex gap-1 p-1 rounded-full bg-n-6 border border-n-1/10">
          {TAB_DEFS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                tab === t.id ? 'bg-n-8 text-n-1' : 'text-n-3 hover:text-n-1'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {rows.length === 0 ? (
        <Empty>{active.empty}</Empty>
      ) : (
        <ul className="divide-y divide-n-6">
          {rows.map((row, i) => (
            <li
              key={`${row.word}-${i}`}
              className="flex justify-between items-center py-3 first:pt-0 last:pb-0"
            >
              <span className="font-mono text-n-1">{row.word}</span>
              <span className={`font-semibold ${active.valueClass}`}>{active.format(row)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

Card.propTypes = {
  title: PropTypes.node,
  action: PropTypes.node,
  children: PropTypes.node,
  className: PropTypes.string,
};

Empty.propTypes = {
  children: PropTypes.node,
};

StatTile.propTypes = {
  label: PropTypes.node,
  value: PropTypes.node,
  sub: PropTypes.node,
  accent: PropTypes.string,
};

LevelTile.propTypes = {
  level: PropTypes.shape({
    current: PropTypes.number,
    subpoints: PropTypes.number,
    maxval: PropTypes.number,
  }),
};

Heatmap.propTypes = {
  cells: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.oneOf([null]),
      PropTypes.shape({
        date: PropTypes.string.isRequired,
        count: PropTypes.number.isRequired,
      }),
    ])
  ).isRequired,
};

PhonemeChips.propTypes = {
  phonemes: PropTypes.arrayOf(PropTypes.shape({ phoneme: PropTypes.string.isRequired })).isRequired,
  selected: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
};

ProgressChart.propTypes = {
  phonemes: PropTypes.arrayOf(PropTypes.shape({ phoneme: PropTypes.string.isRequired })).isRequired,
  selected: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  series: PropTypes.array.isRequired,
};

PhonemeMastery.propTypes = {
  bars: PropTypes.array.isRequired,
};

const wordRowShape = PropTypes.shape({
  word: PropTypes.string.isRequired,
  value: PropTypes.number,
  timestamp: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
});

WordTabs.propTypes = {
  hardest: PropTypes.arrayOf(wordRowShape).isRequired,
  improved: PropTypes.arrayOf(wordRowShape).isRequired,
  recent: PropTypes.arrayOf(wordRowShape).isRequired,
};
import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  AreaChart,
  AreaSeries,
  Area,
  Line,
  LinearYAxis,
  LinearYAxisTickSeries,
  LinearYAxisTickLabel,
} from 'reaviz';
import { HEATMAP_MONTHS, activityMonths } from './derive.js';
import './Statistics.css';

const fmtPct = (v) => `${Math.round(v * 100)}%`;

export const Card = ({ title, action, children, className = '', bodyClassName = '' }) => (
  <section
    className={`cut-card flex flex-col min-h-0 p-4 lg:p-5 ${className}`}
  >
    {(title || action) && (
      <header className="flex items-center justify-between gap-3 flex-wrap mb-3 shrink-0">
        {title && <h3 className="h6 text-n-1 m-0 text-base lg:text-lg">{title}</h3>}
        {action}
      </header>
    )}
    {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
  </section>
);

const useMeasuredHeight = () => {
  const ref = useRef(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setHeight(el.clientHeight);
    const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, height];
};

export const Empty = ({ children }) => (
  <p className="body-2 text-n-4">{children}</p>
);

export const StatTile = ({ label, value, sub, accent = 'text-n-1' }) => (
  <Card className="gap-1 justify-center">
    <p className="tagline text-n-3">{label}</p>
    <p className={`text-3xl lg:text-4xl font-semibold leading-none ${accent}`}>{value}</p>
    {sub && <p className="caption text-n-4 truncate">{sub}</p>}
  </Card>
);

export const LevelTile = ({ level }) => {
  const current = level?.current ?? 1;
  const subpoints = level?.subpoints ?? 0;
  const maxval = level?.maxval || 100;
  const pct = Math.min(100, Math.round((subpoints / maxval) * 100));

  return (
    <Card className="gap-2 justify-center">
      <div className="flex items-baseline justify-between gap-3">
        <p className="tagline text-n-3">Level</p>
        <p className="caption text-n-3">{subpoints} / {maxval} XP</p>
      </div>
      <p className="text-3xl lg:text-4xl font-semibold leading-none text-color-1">{current}</p>
      <div className="h-2 bg-n-6 overflow-hidden">
        <div
          className="h-full bg-color-1 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Card>
  );
};

const ACCENT_RGB = '122, 219, 120';

const cellStyle = (count) => {
  if (count === 0) return undefined;
  const alpha = count < 3 ? 0.35 : count < 6 ? 0.65 : 1;
  return { backgroundColor: `rgba(${ACCENT_RGB}, ${alpha})` };
};

const cellClass = (count) =>
  count === 0 ? 'bg-n-6 border border-n-1/10' : '';

const Legend = () => (
  <div className="flex items-center gap-2 text-n-4 caption shrink-0">
    <span>Less</span>
    {[0, 2, 5, 8].map((n) => (
      <span
        key={n}
        className={`w-3 h-3 rounded-[2px] ${cellClass(n)}`}
        style={cellStyle(n)}
        aria-hidden
      />
    ))}
    <span>More</span>
  </div>
);

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

export const Heatmap = ({ columns }) => {
  const months = activityMonths(columns);
  const gridColumns = { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` };

  return (
    <Card
      title={`Activity · last ${HEATMAP_MONTHS} months`}
      action={<Legend />}
    >
      <div className="flex gap-2">
        <div className="grid grid-rows-7 gap-1 shrink-0 mt-5">
          {WEEKDAY_LABELS.map((label, i) => (
            <span
              key={i}
              className="caption text-n-4 leading-none flex items-center h-full"
            >
              {label}
            </span>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <div className="grid gap-1 mb-1 h-4" style={gridColumns}>
            {months.map((month) => (
              <span
                key={month.index}
                className="caption text-n-4 leading-none whitespace-nowrap"
                style={{ gridColumnStart: month.index + 1 }}
              >
                {month.label}
              </span>
            ))}
          </div>

          <div className="grid gap-1" style={gridColumns}>
            {columns.map((week) => (
              <div key={week.find((cell) => cell)?.date ?? `empty-week-${columns.indexOf(week)}`} className="grid grid-rows-7 gap-1">
                {week.map((cell, d) =>
                  cell === null ? (
                    <div key={`pad-${d}`} className="aspect-square" aria-hidden />
                  ) : (
                    <div
                      key={cell.date}
                      title={`${cell.date}: ${cell.count} attempt${cell.count === 1 ? '' : 's'}`}
                      className={`aspect-square rounded-[2px] ${cellClass(cell.count)}`}
                      style={cellStyle(cell.count)}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};

const PhonemeChips = ({ phonemes, selected, onSelect }) => (
  <div className="flex flex-wrap gap-1.5 shrink-0">
    {phonemes.map((p) => {
      const active = p.phoneme === selected;
      return (
        <button
          key={p.phoneme}
          type="button"
          onClick={() => onSelect(p.phoneme)}
          className={`cut-chip px-2.5 py-1 font-mono text-sm border transition-colors ${
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

export const ProgressChart = ({ phonemes, selected, onSelect, series }) => {
  const [chartRef, chartHeight] = useMeasuredHeight();

  return (
    <Card title="Progress over time">
      <PhonemeChips phonemes={phonemes} selected={selected} onSelect={onSelect} />
      <div ref={chartRef} className="mt-3 h-56 lg:h-72">
        {series.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Empty>No history yet for this sound.</Empty>
          </div>
        ) : (
          chartHeight > 0 && (
            <AreaChart
              height={chartHeight}
              width={undefined}
              data={series}
              series={
                <AreaSeries
                  area={<Area />}
                  line={<Line strokeWidth={2} />}
                  colorScheme="#AC6AFF"
                  interpolation="smooth"
                />
              }
              // Scores are 0-1 fractions; reaviz's default y-axis rounds
              // raw values to ~1 decimal for its labels, which for a small
              // range (e.g. 0.28 and 0.35) rendered visually-duplicate
              // ticks like "0.3, 0.3". Formatting as whole-percent instead
              // both reads more naturally for a score and gives each tick
              // enough resolution to look distinct.
              yAxis={
                <LinearYAxis
                  type="value"
                  tickSeries={
                    <LinearYAxisTickSeries
                      label={<LinearYAxisTickLabel format={(v) => `${Math.round(v * 100)}%`} />}
                    />
                  }
                />
              }
            />
          )
        )}
      </div>
    </Card>
  );
};

const MASTERY_LIMIT = 8;
const WORD_ROW_LIMIT = 6;

const masteryColor = (pct) => {
  if (pct >= 80) return '#7ADB78';
  if (pct >= 50) return '#FFC876';
  return '#FF776F';
};

export const PhonemeMastery = ({ bars, limit = MASTERY_LIMIT }) => {
  const { tried, untried } = bars;
  const shown = tried.slice(0, limit);
  const hidden = tried.length - shown.length;

  return (
    <Card title="Sound mastery">
      {tried.length === 0 ? (
        <Empty>Complete a lesson to start tracking sound mastery.</Empty>
      ) : (
        <>
          <ul className="flex flex-col gap-2.5">
            {shown.map((bar) => (
              <li key={bar.key} className="flex items-center gap-3">
                <span className="w-8 shrink-0 font-mono text-sm text-n-2">{bar.key}</span>
                <div className="h-2 flex-1 overflow-hidden bg-n-6">
                  <div
                    className="h-full transition-[width] duration-500"
                    style={{ width: `${bar.data}%`, backgroundColor: masteryColor(bar.data) }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-semibold text-n-1">
                  {bar.data}%
                </span>
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <p className="caption text-n-4 mt-2">+{hidden} more sound{hidden === 1 ? '' : 's'}</p>
          )}
        </>
      )}
      {untried.length > 0 && (
        <p className="caption text-n-4 mt-3 pt-3 border-t border-n-1/10">
          Not tried yet: <span className="font-mono">{untried.join(', ')}</span>
        </p>
      )}
    </Card>
  );
};

const TAB_DEFS = [
  { id: 'hardest', label: 'Needs practice', empty: 'Complete a few words to see the trickiest ones.', valueClass: 'text-color-3', format: (r) => `${fmtPct(r.value)} avg` },
  { id: 'improved', label: 'Most improved', empty: 'Practice each word a couple of times to track improvement.', valueClass: 'text-color-4', format: (r) => `+${fmtPct(r.value)}` },
  { id: 'recent', label: 'Recent', empty: 'No recent attempts yet.', valueClass: 'text-n-3', format: (r) => new Date(r.timestamp).toLocaleDateString() },
];

export const WordTabs = ({ hardest, improved, recent }) => {
  const [tab, setTab] = useState('hardest');
  const data = { hardest, improved, recent };
  const active = TAB_DEFS.find((t) => t.id === tab);
  const rows = data[tab].slice(0, WORD_ROW_LIMIT);

  return (
    <Card
      title="Word focus"
      action={
        <div className="cut-group flex gap-1 p-1 bg-n-6 border border-n-1/10">
          {TAB_DEFS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`cut-chip px-2.5 py-1 text-sm transition-colors ${
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
              className="flex justify-between items-center gap-3 py-1.5 first:pt-0 last:pb-0"
            >
              <span className="font-mono text-n-1 truncate">{row.word}</span>
              <span className={`font-semibold shrink-0 ${active.valueClass}`}>
                {active.format(row)}
              </span>
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
  bodyClassName: PropTypes.string,
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
  columns: PropTypes.arrayOf(
    PropTypes.arrayOf(
      PropTypes.oneOfType([
        PropTypes.oneOf([null]),
        PropTypes.shape({
          date: PropTypes.string.isRequired,
          count: PropTypes.number.isRequired,
        }),
      ])
    )
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
  bars: PropTypes.shape({
    tried: PropTypes.arrayOf(PropTypes.shape({ key: PropTypes.string, data: PropTypes.number })).isRequired,
    untried: PropTypes.arrayOf(PropTypes.string).isRequired,
  }).isRequired,
  limit: PropTypes.number,
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

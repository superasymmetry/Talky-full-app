import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  AreaChart,
  AreaSeries,
  Area,
  Line,
} from 'reaviz';
import { HEATMAP_DAYS } from './derive.js';
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
        className={`w-3 h-3 ${cellClass(n)}`}
        style={cellStyle(n)}
        aria-hidden
      />
    ))}
    <span>More</span>
  </div>
);

export const Heatmap = ({ cells }) => (
  <Card title={`Activity · last ${HEATMAP_DAYS} days`} className="shrink-0">
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="grid grid-rows-7 grid-flow-col gap-1 overflow-x-auto">
        {cells.map((cell, i) =>
          cell === null ? (
            <div key={`pad-${i}`} className="w-3 h-3" aria-hidden />
          ) : (
            <div
              key={cell.date}
              title={`${cell.date}: ${cell.count} attempt${cell.count === 1 ? '' : 's'}`}
              className={`w-3 h-3 ${cellClass(cell.count)}`}
              style={cellStyle(cell.count)}
            />
          ),
        )}
      </div>
      <Legend />
    </div>
  </Card>
);

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
    <Card title="Progress over time" className="flex-1">
      <PhonemeChips phonemes={phonemes} selected={selected} onSelect={onSelect} />
      <div ref={chartRef} className="flex-1 min-h-0 mt-3">
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
  const shown = bars.slice(0, limit);
  const hidden = bars.length - shown.length;

  return (
    <Card title="Sound mastery" className="flex-1" bodyClassName="flex-1 min-h-0 overflow-hidden">
      {bars.length === 0 ? (
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
      className="shrink-0"
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
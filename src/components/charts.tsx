import { useId, useMemo, useState, type ReactNode } from 'react';
import { Card } from './ui';
import { fmtNum } from './data';

/**
 * Single-series charts (one hue, so no legend: the title names the series). Marks follow the
 * dataviz specs: columns ≤ 24px with 4px rounded tops, 2px gaps, hairline solid grid, a hover
 * tooltip per column, and a table view for every chart.
 */

const SERIES = '#6D84C7'; // validated against the white surface
const GRID = '#EEF0F3';
const AXIS_TEXT = '#9AA3B2';

/** Clean tick steps: 1, 2, 5 × 10ⁿ. */
function ticks(max: number, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  // Round to the step's precision (cost charts have steps below 1).
  const fix = (v: number) => Number(v.toFixed(Math.max(0, -Math.floor(Math.log10(step)))));
  for (let i = 0; i * step <= max + step * 0.001; i++) out.push(fix(i * step));
  if (out[out.length - 1] < max) out.push(fix(out[out.length - 1] + step));
  return out;
}

const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}K` : fmtNum(n));
const plain = (n: number) => fmtNum(n);

export function ColumnChart({
  title,
  subtitle,
  data,
  unit,
  formatX,
  format = plain,
  axisFormat = compact,
}: {
  title: string;
  subtitle?: ReactNode;
  data: { x: string; y: number }[];
  unit: string;
  formatX: (x: string) => string;
  /** How values read in the tooltip and table (e.g. money); the unit is then left out of the tooltip. */
  format?: (n: number) => string;
  axisFormat?: (n: number) => string;
}) {
  const custom = format !== plain;
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const titleId = useId();
  const W = 640;
  const H = 200;
  const pad = { l: 40, r: 8, t: 12, b: 26 };
  const max = Math.max(0, ...data.map((d) => d.y));
  const ys = useMemo(() => ticks(max), [max]);
  const top = ys[ys.length - 1] || 1;
  const band = (W - pad.l - pad.r) / Math.max(1, data.length);
  const barW = Math.min(24, Math.max(2, band - 2));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const base = y(0);
  const labelEvery = Math.ceil(data.length / 6);
  const total = data.reduce((s, d) => s + d.y, 0);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={titleId} className="text-[15px] font-bold">
            {title}
          </h3>
          {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
        </div>
        <button onClick={() => setTable((t) => !t)} className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-ink-2 hover:bg-soft">
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {table ? (
        <div className="mt-3 max-h-[220px] overflow-auto rounded-2xl bg-soft">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-soft text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Day</th>
                <th className="px-4 py-2 text-right font-semibold">{unit}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.x} className="border-t border-white">
                  <td className="px-4 py-1.5">{formatX(d.x)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{format(d.y)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative mt-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby={titleId} aria-describedby={`${titleId}-d`} onMouseLeave={() => setHover(null)}>
            <desc id={`${titleId}-d`}>{`${format(total)} ${unit.toLowerCase()} over ${data.length} days; highest ${format(max)}.`}</desc>
            {ys.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
                  {axisFormat(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = pad.l + band * i + band / 2;
              const h = Math.max(0, base - y(d.y));
              const r = Math.min(4, barW / 2, h);
              const x0 = cx - barW / 2;
              const top0 = base - h;
              return (
                <g key={d.x}>
                  {h > 0 ? (
                    <path
                      d={`M${x0},${base} V${top0 + r} Q${x0},${top0} ${x0 + r},${top0} H${x0 + barW - r} Q${x0 + barW},${top0} ${x0 + barW},${top0 + r} V${base} Z`}
                      fill={SERIES}
                      opacity={hover === null || hover === i ? 1 : 0.45}
                    />
                  ) : null}
                  {i % labelEvery === 0 ? (
                    <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
                      {formatX(d.x)}
                    </text>
                  ) : null}
                  {/* Hit target: the whole band, taller than the bar. */}
                  <rect x={pad.l + band * i} y={pad.t} width={band} height={base - pad.t} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              );
            })}
            <line x1={pad.l} x2={W - pad.r} y1={base} y2={base} stroke="#D7DBE1" strokeWidth={1} />
          </svg>
          {hover !== null ? (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-[12px] whitespace-nowrap text-white shadow-pop"
              style={{ left: `${((pad.l + band * hover + band / 2) / W) * 100}%` }}
            >
              <div className="text-white/70">{formatX(data[hover].x)}</div>
              <div className="font-semibold tabular-nums">
                {format(data[hover].y)}
                {custom ? '' : ` ${unit.toLowerCase()}`}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

/** A headline number with a label and an optional line underneath. */
export function StatTile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'accent' }) {
  return (
    <Card className="p-5">
      <div className="text-[13px] font-semibold text-muted">{label}</div>
      <div className={`mt-2 text-[28px] leading-none font-bold tracking-tight tabular-nums ${tone === 'accent' ? 'text-accent' : ''}`}>{value}</div>
      {sub ? <div className="mt-2 text-[13px] text-muted">{sub}</div> : null}
    </Card>
  );
}

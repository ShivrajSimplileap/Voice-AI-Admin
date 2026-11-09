import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search } from 'lucide-react';
import { Alert, Badge, Card, Spinner, cx } from './ui';

/** Loading, tables, paging and formatting shared by the monitoring pages. */

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
/** Loads with `load` whenever `deps` change; `reload` re-runs it. Keeps the old data while reloading. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const req = useRef(0);
  const run = useCallback(async () => {
    const id = ++req.current;
    setLoading(true);
    try {
      const value = await load();
      if (id === req.current) {
        setData(value);
        setError(null);
      }
    } catch (err) {
      if (id === req.current) setError(err instanceof Error ? err.message : 'Couldn’t load this.');
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, deps);
  useEffect(() => void run(), [run]);
  return { data, error, loading, reload: run, setData };
}

/** Re-runs `fn` every `ms` while the tab is visible. */
export function useInterval(fn: () => void, ms: number) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && saved.current(), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/** Shows the spinner, the error, or the content. */
export function Loaded<T>({ state, children }: { state: { data: T | null; error: string | null }; children: (data: T) => ReactNode }) {
  if (state.error && !state.data) return <Alert>{state.error}</Alert>;
  if (!state.data) return <Spinner />;
  return (
    <>
      {state.error ? (
        <div className="mb-4">
          <Alert>{state.error}</Alert>
        </div>
      ) : null}
      {children(state.data)}
    </>
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export const fmtNum = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-IN');
export const fmtPct = (n: number) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;

export function fmtDuration(sec: number) {
  if (!sec) return '0s';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString('en-IN', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}

export const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const WORKSPACE_ROLE: Record<string, string> = { owner: 'Owner', admin: 'Admin', manager: 'Manager', agent: 'Team member', viewer: 'Viewer' };
export const workspaceRole = (r: string) => WORKSPACE_ROLE[r] ?? r;

const DIRECTION: Record<string, string> = { playground: 'Playground', inbound: 'Inbound', outbound: 'Outbound' };
export const directionLabel = (d: string) => DIRECTION[d] ?? d;

const OUTCOME: Record<string, string> = {
  demo_booked: 'Demo booked',
  qualified: 'Qualified',
  callback_requested: 'Callback requested',
  information_only: 'Information only',
  not_interested: 'Not interested',
  do_not_call: 'Do not call',
  unknown: 'Unknown',
};
export const outcomeLabel = (o: string | null) => (o ? (OUTCOME[o] ?? o) : '—');

export function CallStatusBadge({ status }: { status: string }) {
  if (status === 'in_progress') return <Badge tone="accent">Live</Badge>;
  if (status === 'failed') return <Badge tone="bad">Failed</Badge>;
  return <Badge>Completed</Badge>;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  /** Server-side sort key, when sortable. */
  sort?: string;
  align?: 'right';
  className?: string;
}

export function Table<T extends { id: string }>({
  rows,
  columns,
  onRow,
  sort,
  onSort,
  empty = 'Nothing here.',
}: {
  rows: T[];
  columns: Column<T>[];
  onRow?: (row: T) => void;
  sort?: { key: string; dir: 'asc' | 'desc' };
  onSort?: (key: string) => void;
  empty?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-[12px] font-semibold tracking-wide text-muted uppercase">
              {columns.map((c) => {
                const active = sort && c.sort === sort.key;
                return (
                  <th key={c.key} className={cx('px-4 py-3 whitespace-nowrap', c.align === 'right' && 'text-right', c.className)} aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.sort && onSort ? (
                      <button onClick={() => onSort(c.sort!)} className={cx('inline-flex items-center gap-1 uppercase hover:text-ink', active && 'text-ink')}>
                        {c.label}
                        {active ? sort!.dir === 'asc' ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" /> : null}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-muted">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={onRow ? () => onRow(r) : undefined}
                  className={cx('align-middle', onRow && 'cursor-pointer hover:bg-soft/60')}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cx('px-4 py-3', c.align === 'right' && 'text-right tabular-nums', c.className)}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="mt-3 flex items-center justify-between px-1 text-[13px] text-muted">
      <span>
        {fmtNum(from)}–{fmtNum(to)} of {fmtNum(total)}
      </span>
      <div className="flex gap-1">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="grid size-8 place-items-center rounded-full hover:bg-white disabled:opacity-40" aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </button>
        <span className="grid h-8 place-items-center px-2">
          {page} / {pages}
        </span>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="grid size-8 place-items-center rounded-full hover:bg-white disabled:opacity-40" aria-label="Next page">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
/** A search box that reports after typing stops for a moment. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text), 300);
    return () => clearTimeout(t);
  }, [text, value, onChange]);
  return (
    <label className="relative min-w-[220px] flex-1">
      <span className="sr-only">Search</span>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-2" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-full bg-soft pr-4 pl-10 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue/40"
      />
    </label>
  );
}

export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx('h-10 max-w-[220px] rounded-full bg-soft px-4 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue/40', value ? 'text-ink' : 'text-ink-2')}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">{children}</Card>;
}

/** Filters kept in the address bar, so a filtered view can be shared or reloaded. */
export function useQueryState<T extends Record<string, string>>(defaults: T) {
  const read = () => {
    const p = new URLSearchParams(window.location.search);
    return Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, p.get(k) ?? v])) as T;
  };
  const [state, setState] = useState<T>(read);
  useEffect(() => {
    const onPop = () => setState(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const update = useCallback(
    (patch: Partial<T>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(next)) if (v && v !== defaults[k]) p.set(k, v);
        const q = p.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
        return next;
      });
    },
    []
  );
  return [state, update] as const;
}

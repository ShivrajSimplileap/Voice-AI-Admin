import { useMemo, useState, type FormEvent } from 'react';
import { BellRing, Download, Info } from 'lucide-react';
import { api, type Rates, type UsagePeriod, type UsageReport, type UsageWorkspace } from '../api';
import { Link, navigate, useTitle } from '../router';
import { useAdmin } from '../session';
import { Alert, Badge, Button, Card, PageHeader, TextField, cx, timeAgo } from '../components/ui';
import { ColumnChart, StatTile } from '../components/charts';
import { FilterBar, FilterSelect, Loaded, Table, fmtDay, fmtMoney, fmtNum, fmtTokens, useLoad, useQueryState, type Column } from '../components/data';
import { KIND_LABEL, Meter, PROVIDER_LABEL } from '../components/usage';

const PERIODS: { value: UsagePeriod; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: '30d', label: 'Last 30 days' },
];

const TABS = ['Usage', 'Rates'] as const;

export function UsagePage() {
  useTitle('Usage and cost');
  const [f, set] = useQueryState({ period: 'this_month', tab: 'Usage', sort: 'cost', dir: 'desc' });
  const tab = (TABS as readonly string[]).includes(f.tab) ? f.tab : 'Usage';
  return (
    <>
      <PageHeader title="Usage and cost" subtitle="What each workspace uses, what it costs the platform, and what its plan brings in." />
      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => set({ tab: t })}
            className={cx('h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition', tab === t ? 'bg-ink text-white' : 'text-ink-2 hover:bg-soft')}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Usage' ? <UsageTab f={f} set={set} /> : <RatesTab />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------
type Sort = 'name' | 'minutes' | 'tokens' | 'cost' | 'revenue' | 'margin';

function UsageTab({ f, set }: { f: { period: string; sort: string; dir: string }; set: (p: Partial<{ period: string; tab: string; sort: string; dir: string }>) => void }) {
  const canAct = useAdmin().role !== 'viewer';
  const period = (PERIODS.some((p) => p.value === f.period) ? f.period : 'this_month') as UsagePeriod;
  const state = useLoad(() => api.usage(period), [period]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      const { blob, name } = await api.exportUsage(period);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Couldn’t export.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <FilterBar>
        <FilterSelect label="Period" value={period} onChange={(p) => set({ period: p })} options={PERIODS} />
        {canAct ? (
          <Button variant="soft" size="sm" busy={exporting} icon={<Download className="size-3.5" />} onClick={() => void exportCsv()}>
            Export CSV
          </Button>
        ) : null}
      </FilterBar>
      {exportError ? (
        <div className="mb-4">
          <Alert>{exportError}</Alert>
        </div>
      ) : null}
      <Loaded state={state}>{(r) => <UsageBody r={r} sort={f.sort as Sort} dir={f.dir as 'asc' | 'desc'} onSort={(k) => set({ sort: k, dir: f.sort === k && f.dir === 'desc' ? 'asc' : 'desc' })} onRates={() => set({ tab: 'Rates' })} />}</Loaded>
    </>
  );
}

function UsageBody({ r, sort, dir, onSort, onRates }: { r: UsageReport; sort: Sort; dir: 'asc' | 'desc'; onSort: (k: string) => void; onRates: () => void }) {
  const money = (n: number) => fmtMoney(n, r.currency);
  const rows = useMemo(() => {
    const get: Record<Sort, (w: UsageWorkspace) => string | number> = {
      name: (w) => w.name.toLowerCase(),
      minutes: (w) => w.minutes,
      tokens: (w) => w.tokens,
      cost: (w) => w.cost,
      revenue: (w) => w.revenue,
      margin: (w) => w.margin,
    };
    const key = get[sort] ?? get.cost;
    const sign = dir === 'asc' ? 1 : -1;
    return [...r.workspaces].sort((a, b) => (key(a) < key(b) ? -sign : key(a) > key(b) ? sign : a.name.localeCompare(b.name)));
  }, [r.workspaces, sort, dir]);

  const columns: Column<UsageWorkspace>[] = [
    {
      key: 'name',
      label: 'Workspace',
      sort: 'name',
      render: (w) => (
        <div>
          <div className="flex items-center gap-2 font-semibold">
            {w.name}
            {w.status === 'suspended' ? <Badge tone="bad">Suspended</Badge> : null}
          </div>
          <div className="mt-0.5 text-[12px] text-muted">
            {w.plan ? (
              <>
                {w.plan}
                {w.planStatus === 'trialing' ? ` · trial${w.trialEndsAt ? (new Date(w.trialEndsAt) < new Date() ? ' ended' : ` until ${new Date(w.trialEndsAt).toLocaleDateString()}`) : ''}` : ''}
              </>
            ) : w.planStatus === 'free' ? (
              <span className={w.freeLeft === 0 ? 'text-bad' : undefined}>Free minutes · {fmtNum(w.freeLeft ?? 0)} left</span>
            ) : (
              'No plan'
            )}
          </div>
        </div>
      ),
    },
    { key: 'month', label: 'Minutes this month', render: (w) => <Meter used={w.monthMinutes} limit={w.minuteLimit} unit="min" /> },
    { key: 'minutes', label: 'Minutes', sort: 'minutes', align: 'right', render: (w) => fmtNum(w.minutes) },
    { key: 'tokens', label: 'AI tokens', sort: 'tokens', align: 'right', render: (w) => fmtTokens(w.tokens) },
    { key: 'cost', label: 'Cost', sort: 'cost', align: 'right', render: (w) => <span className="font-semibold">{money(w.cost)}</span> },
    { key: 'revenue', label: 'Plan price', sort: 'revenue', align: 'right', render: (w) => (w.revenue ? money(w.revenue) : <span className="text-muted">—</span>) },
    { key: 'collected', label: 'Collected', align: 'right', render: (w) => (w.collected ? money(w.collected) : <span className="text-muted">—</span>) },
    {
      key: 'margin',
      label: 'Margin',
      sort: 'margin',
      align: 'right',
      render: (w) => <span className={cx('font-semibold', w.margin < 0 && 'text-bad')}>{w.margin < 0 ? `−${money(-w.margin)}` : money(w.margin)}</span>,
    },
  ];

  const from = new Date(r.period.from);
  const to = new Date(r.period.to);
  const range = `${from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${to.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  return (
    <div className="space-y-6">
      {!r.ratesSet ? (
        <Alert tone="info">
          Phone rates aren’t set yet, so costs below count AI only.{' '}
          <button type="button" onClick={onRates} className="font-semibold underline">
            Set the Sinch and Plivo per-minute rates
          </button>
          .
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Cost to the platform" value={money(r.totals.cost)} sub={range} />
        <StatTile label="Plan revenue" value={money(r.totals.revenue)} sub={`${money(r.totals.collected)} collected · ${fmtNum(r.totals.paying)} paying · ${fmtNum(r.totals.trialing)} on trial`} />
        <StatTile label="Margin" value={r.totals.margin < 0 ? `−${money(-r.totals.margin)}` : money(r.totals.margin)} sub="Plan revenue minus cost" tone={r.totals.margin < 0 ? 'accent' : undefined} />
        <StatTile label="Phone minutes" value={fmtNum(r.totals.minutes)} sub={`${fmtNum(r.totals.calls)} calls · ${fmtTokens(r.totals.tokens)} AI tokens`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <ColumnChart
          title="Cost per day"
          subtitle={`Phone minutes and AI, in ${r.currency}`}
          data={r.daily.map((d) => ({ x: d.day, y: d.cost }))}
          unit={`Cost (${r.currency})`}
          formatX={fmtDay}
          format={money}
          axisFormat={(n) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        />
        <Breakdown r={r} money={money} />
      </div>

      <LimitWarnings />

      <div>
        <h2 className="mb-3 text-[15px] font-bold">By workspace</h2>
        <Table rows={rows} columns={columns} onRow={(w) => navigate(`/workspaces/${w.id}?tab=Plan`)} sort={{ key: sort, dir }} onSort={onSort} empty="No workspaces yet." />
        <p className="mt-2 px-1 text-[12px] text-muted">
          Costs use the current rates, so changing a rate changes past figures too. Plan price counts workspaces whose plan is active (not on trial); Collected is what Razorpay took in the period.
        </p>
      </div>
    </div>
  );
}

function Breakdown({ r, money }: { r: UsageReport; money: (n: number) => string }) {
  const rows: { label: string; detail: string; cost: number }[] = [
    ...r.byProvider.map((p) => ({ label: PROVIDER_LABEL[p.provider] ?? p.provider, detail: `${fmtNum(p.minutes)} min`, cost: p.cost })),
    ...r.byKind.map((k) => ({ label: KIND_LABEL[k.kind] ?? k.kind, detail: `${fmtTokens(k.total)} tokens`, cost: k.cost })),
    ...(r.totals.numbersCost ? [{ label: 'Phone numbers', detail: 'monthly rental', cost: r.totals.numbersCost }] : []),
  ].sort((a, b) => b.cost - a.cost);
  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-bold">Where the cost comes from</h3>
      {rows.length ? (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3 rounded-xl bg-soft px-3.5 py-2 text-sm">
              <span>
                <span className="font-semibold">{row.label}</span>
                <span className="ml-2 text-[12px] text-muted">{row.detail}</span>
              </span>
              <span className="font-semibold tabular-nums">{money(row.cost)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">No usage in this period.</p>
      )}
      {r.unattributed.tokens ? (
        <p className="mt-3 flex gap-1.5 text-[12px] text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Includes {money(r.unattributed.aiCost)} from signed-out Playground sessions, which belong to no workspace.
        </p>
      ) : null}
    </Card>
  );
}

function LimitWarnings() {
  const state = useLoad(() => api.usageAlerts(), []);
  const recent = state.data?.recent ?? [];
  if (!recent.length) return null;
  const text = (a: (typeof recent)[number]) =>
    a.metric === 'minutes' ? (a.level === '100' ? 'Used all its call minutes' : 'Used 80% of its call minutes') : a.level === 'ended' ? 'Trial ended' : 'Trial ends within 3 days';
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <BellRing className="size-4 text-accent" />
        <h3 className="text-[15px] font-bold">Limit warnings, last 30 days</h3>
      </div>
      <p className="mt-1 text-[13px] text-muted">Each is emailed once to the workspace’s owners (or admins when it has no owner).</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {recent.slice(0, 10).map((a) => (
          <li key={a.id}>
            <Link to={`/workspaces/${a.orgId}?tab=Plan`} className="flex items-center justify-between gap-3 rounded-2xl bg-soft px-4 py-3 text-sm hover:bg-line/60">
              <span>
                <span className="font-semibold">{a.orgName}</span> · {text(a)}
              </span>
              <span className="shrink-0 text-[12px] text-muted">
                {timeAgo(a.createdAt)}
                {a.sentTo === 0 ? ' · not emailed' : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------
const AI_ROWS: { key: keyof Rates['ai']; label: string }[] = [
  { key: 'live', label: 'Live voice (phone and browser)' },
  { key: 'analysis', label: 'Call summaries' },
  { key: 'transcription', label: 'Audio transcription' },
  { key: 'embedding', label: 'Knowledge embeddings' },
];
const TOKEN_FIELDS: { key: keyof Rates['ai']['live']; label: string }[] = [
  { key: 'textIn', label: 'Text in' },
  { key: 'audioIn', label: 'Audio in' },
  { key: 'textOut', label: 'Text out' },
  { key: 'audioOut', label: 'Audio out' },
];

function RatesTab() {
  const state = useLoad(() => api.rates(), []);
  return <Loaded state={state}>{(r) => <RatesForm key={JSON.stringify(r)} initial={r} onSaved={state.reload} />}</Loaded>;
}

function RatesForm({ initial, onSaved }: { initial: Rates & { isDefault: boolean }; onSaved: () => Promise<void> }) {
  const canEdit = useAdmin().role === 'super_admin';
  const { isDefault, ...start } = initial;
  const [rates, setRates] = useState<Rates>({ ...start, phonePerMinute: { sinch: 0, plivo: 0, ...start.phonePerMinute } });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const num = (v: string) => (v.trim() === '' ? 0 : Number(v));
  const bad = (n: number) => !Number.isFinite(n) || n < 0;
  const invalid =
    !/^[A-Z]{3}$/.test(rates.currency) ||
    bad(rates.numberPerMonth) ||
    Object.values(rates.phonePerMinute).some(bad) ||
    Object.values(rates.ai).some((t) => Object.values(t).some(bad));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    setNotice(null);
    try {
      await api.setRates(rates);
      setNotice({ tone: 'good', text: 'Rates saved. Every cost figure now uses them.' });
      await onSaved();
    } catch (err) {
      setNotice({ tone: 'bad', text: err instanceof Error ? err.message : 'Couldn’t save.' });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {!canEdit ? <Alert tone="info">Only super admins can change rates.</Alert> : null}
      {isDefault ? (
        <Alert tone="info">
          These are starting values: Google’s published per-million-token prices in USD, and no phone rates. Check them against your Google, Sinch and Plivo bills, then save.
        </Alert>
      ) : null}

      <Card className="p-5">
        <h3 className="text-[15px] font-bold">Currency and phone</h3>
        <p className="mt-1 text-sm text-muted">All costs and plan prices are in this currency. Phone calls are charged per started minute.</p>
        <fieldset disabled={!canEdit} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label="Currency" value={rates.currency} maxLength={3} onChange={(e) => setRates({ ...rates, currency: e.target.value.toUpperCase() })} hint="e.g. USD or INR" />
          {Object.keys(rates.phonePerMinute).map((p) => (
            <TextField
              key={p}
              label={`${PROVIDER_LABEL[p] ?? p}, per minute`}
              type="number"
              min={0}
              step="any"
              value={String(rates.phonePerMinute[p])}
              onChange={(e) => setRates({ ...rates, phonePerMinute: { ...rates.phonePerMinute, [p]: num(e.target.value) } })}
            />
          ))}
          <TextField label="Number rental, per month" type="number" min={0} step="any" value={String(rates.numberPerMonth)} onChange={(e) => setRates({ ...rates, numberPerMonth: num(e.target.value) })} />
        </fieldset>
      </Card>

      <Card className="p-5">
        <h3 className="text-[15px] font-bold">AI, per million tokens</h3>
        <p className="mt-1 text-sm text-muted">Live voice counts audio and text separately. Embedding tokens are estimated from text length (about 4 characters each).</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[12px] font-semibold tracking-wide text-muted uppercase">
                <th className="py-2 pr-3">Work</th>
                {TOKEN_FIELDS.map((t) => (
                  <th key={t.key} className="px-2 py-2">
                    {t.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AI_ROWS.map((row) => (
                <tr key={row.key} className="border-t border-line/70">
                  <td className="py-2 pr-3 font-semibold">{row.label}</td>
                  {TOKEN_FIELDS.map((t) => (
                    <td key={t.key} className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        disabled={!canEdit}
                        aria-label={`${row.label}: ${t.label}`}
                        value={String(rates.ai[row.key][t.key])}
                        onChange={(e) => setRates({ ...rates, ai: { ...rates.ai, [row.key]: { ...rates.ai[row.key], [t.key]: num(e.target.value) } } })}
                        className="h-10 w-full rounded-xl bg-soft px-3 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ink/20 disabled:opacity-70"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" busy={busy} disabled={invalid}>
            Save rates
          </Button>
        </div>
      ) : null}
    </form>
  );
}

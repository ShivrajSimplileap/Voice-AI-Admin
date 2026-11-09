import { useRef, useState, type FormEvent } from 'react';
import { Check, Minus, Trash2, Upload } from 'lucide-react';
import { api, type ComplianceRow, type PlatformDnd } from '../api';
import { navigate, useTitle } from '../router';
import { useAdmin } from '../session';
import { Alert, Badge, Button, Card, Confirm, PageHeader, TextField, cx, timeAgo } from '../components/ui';
import { StatTile } from '../components/charts';
import { FilterBar, FilterSelect, Loaded, Pager, SearchBox, Table, fmtNum, useLoad, useQueryState, type Column } from '../components/data';

const TABS = ['Report', 'Platform DND list'] as const;

/** Phase 5: calling compliance across workspaces, and numbers no workspace may call. */
export function CompliancePage() {
  useTitle('Compliance');
  const [f, set] = useQueryState({ tab: 'Report', days: '30', q: '', page: '1' });
  const tab = (TABS as readonly string[]).includes(f.tab) ? f.tab : 'Report';
  return (
    <>
      <PageHeader title="Compliance" subtitle="India calling rules (TRAI / DPDP) across every workspace, and the platform-wide do-not-call list." />
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
      {tab === 'Report' ? <Report days={f.days} setDays={(days) => set({ days })} /> : <DndList q={f.q} page={f.page} set={set} />}
    </>
  );
}

const on = (v: boolean, label: string) => (
  <span className={cx('inline-flex items-center gap-1 text-[12px]', v ? 'text-ink' : 'text-muted-2')} title={`${label}: ${v ? 'on' : 'off'}`}>
    {v ? <Check className="size-3.5 text-good" /> : <Minus className="size-3.5" />}
    {label}
  </span>
);

function Report({ days, setDays }: { days: string; setDays: (d: string) => void }) {
  const d = ['7', '30', '90'].includes(days) ? Number(days) : 30;
  const state = useLoad(() => api.compliance(d), [d]);

  const columns: Column<ComplianceRow>[] = [
    {
      key: 'name',
      label: 'Workspace',
      render: (w) => (
        <div>
          <div className="flex items-center gap-2 font-semibold">
            {w.name}
            {w.status === 'suspended' ? <Badge tone="bad">Suspended</Badge> : null}
          </div>
          <div className="text-[12px] text-muted">{w.regulatedFinancial ? 'Bank, NBFC or insurer' : ' '}</div>
        </div>
      ),
    },
    { key: 'on', label: 'Compliance', render: (w) => (w.enabled ? <Badge tone="good">On</Badge> : <Badge>Off</Badge>) },
    {
      key: 'rules',
      label: 'Rules',
      render: (w) =>
        w.enabled ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {on(w.rules.requireConsent, 'Consent')}
            {on(w.rules.dndCheck, 'DND')}
            {on(w.rules.callerIdSeries, '140/1600')}
            {on(w.rules.aiDisclosure, 'AI disclosure')}
          </div>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { key: 'dnd', label: 'Own DND list', align: 'right', render: (w) => fmtNum(w.dndListSize) },
    {
      key: 'skipped',
      label: 'Skipped',
      align: 'right',
      render: (w) =>
        w.skippedTotal ? (
          <span title={Object.entries(w.skipped).map(([k, v]) => `${k}: ${v}`).join('\n')} className="font-semibold">
            {fmtNum(w.skippedTotal)}
          </span>
        ) : (
          <span className="text-muted">0</span>
        ),
    },
    { key: 'callbacks', label: 'Callbacks refused', align: 'right', render: (w) => (w.callbacksRefused ? fmtNum(w.callbacksRefused) : <span className="text-muted">0</span>) },
    { key: 'retention', label: 'Recordings kept', render: (w) => (w.retentionDays ? `${w.retentionDays} days` : <span className="text-muted">Forever</span>) },
    {
      key: 'overdue',
      label: 'Past retention',
      align: 'right',
      render: (w) => (w.overdueRecordings ? <Badge tone="bad">{fmtNum(w.overdueRecordings)} not deleted</Badge> : <span className="text-muted">—</span>),
    },
  ];

  return (
    <>
      <FilterBar>
        <FilterSelect
          label="Period"
          value={String(d)}
          onChange={setDays}
          options={[
            { value: '7', label: 'Last 7 days' },
            { value: '30', label: 'Last 30 days' },
            { value: '90', label: 'Last 90 days' },
          ]}
        />
      </FilterBar>
      <Loaded state={state}>
        {(r) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Compliance on" value={`${fmtNum(r.totals.enabled)} / ${fmtNum(r.totals.workspaces)}`} sub="Workspaces with the rules switched on" />
              <StatTile label="Calls skipped by the rules" value={fmtNum(r.totals.skipped)} sub={`Campaign contacts, last ${r.days} days`} />
              <StatTile label="Platform DND list" value={fmtNum(r.platformDndSize)} sub="Numbers no workspace may call" />
              <StatTile
                label="Recordings past retention"
                value={fmtNum(r.totals.overdueRecordings)}
                sub={r.totals.overdueRecordings ? 'The hourly clean-up isn’t keeping up: check System health' : 'The clean-up is keeping up'}
                tone={r.totals.overdueRecordings ? 'accent' : undefined}
              />
            </div>
            <div>
              <Table rows={r.workspaces} columns={columns} onRow={(w) => navigate(`/workspaces/${w.id}`)} empty="No workspaces yet." />
              <p className="mt-2 px-1 text-[12px] text-muted">
                Skipped: campaign contacts not called for no consent, consent withdrawn, a DND list or do-not-call (hover for the split). Callbacks refused: AI callbacks the rules stopped. Calls placed by hand that the rules refused aren’t recorded.
              </p>
            </div>
          </div>
        )}
      </Loaded>
    </>
  );
}

function DndList({ q, page, set }: { q: string; page: string; set: (p: Partial<{ tab: string; days: string; q: string; page: string }>) => void }) {
  const canAct = useAdmin().role !== 'viewer';
  const state = useLoad(() => api.platformDnd({ q, page, pageSize: 50 }), [q, page]);
  const [numbers, setNumbers] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [removing, setRemoving] = useState<PlatformDnd | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function add(text: string, source: 'manual' | 'upload') {
    setBusy(true);
    setNotice(null);
    try {
      const r = await api.addPlatformDnd({ numbers: text, reason: reason.trim(), source });
      setNotice({
        tone: 'good',
        text: `${fmtNum(r.added)} added${r.alreadyListed ? `, ${fmtNum(r.alreadyListed)} already on the list` : ''}${r.invalid.length ? `. Not numbers: ${r.invalid.slice(0, 3).join(', ')}` : ''}.`,
      });
      setNumbers('');
      await state.reload();
    } catch (err) {
      setNotice({ tone: 'bad', text: err instanceof Error ? err.message : 'Couldn’t add.' });
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<PlatformDnd>[] = [
    { key: 'number', label: 'Number', render: (n) => <span className="font-semibold tabular-nums">{n.number}</span> },
    { key: 'reason', label: 'Reason', render: (n) => n.reason || <span className="text-muted">—</span> },
    { key: 'source', label: 'Added', render: (n) => <span className="text-muted">{n.source === 'upload' ? 'File' : 'By hand'} · {timeAgo(n.createdAt)}</span> },
    {
      key: 'remove',
      label: '',
      render: (n) =>
        canAct ? (
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setRemoving(n)} aria-label={`Remove ${n.number}`}>
            Remove
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <Alert tone="info">
        No workspace can call these numbers, whether or not its own compliance rules are on. Campaign contacts on the list are skipped, AI callbacks are marked missed, and calls placed by hand are refused.
      </Alert>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {canAct ? (
        <Card className="p-5">
          <h3 className="text-[15px] font-bold">Add numbers</h3>
          <form
            className="mt-3 space-y-3"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (numbers.trim()) void add(numbers, 'manual');
            }}
          >
            <textarea
              value={numbers}
              onChange={(e) => setNumbers(e.target.value)}
              rows={3}
              aria-label="Numbers to add"
              placeholder="One per line or comma-separated. Numbers without a country code are read as Indian."
              className="w-full rounded-2xl bg-soft px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ink/20"
            />
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
              <TextField label="Reason (optional)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Complaint to TRAI" />
              <Button type="submit" busy={busy} disabled={!numbers.trim()} className="md:mb-6">
                Add
              </Button>
              <Button type="button" variant="soft" icon={<Upload className="size-4" />} disabled={busy} onClick={() => file.current?.click()} className="md:mb-6">
                Upload a file
              </Button>
            </div>
            <input
              ref={file}
              type="file"
              accept=".txt,.csv"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (f.size > 5 * 1024 * 1024) {
                  setNotice({ tone: 'bad', text: 'Files can be up to 5 MB.' });
                  return;
                }
                await add(await f.text(), 'upload');
              }}
            />
          </form>
        </Card>
      ) : null}
      <FilterBar>
        <SearchBox value={q} onChange={(v) => set({ q: v, page: '1' })} placeholder="Search a number" />
      </FilterBar>
      <Loaded state={state}>
        {(p) => (
          <>
            <Table rows={p.data} columns={columns} empty={q ? 'No number matches.' : 'The list is empty.'} />
            <Pager page={p.page} pageSize={p.pageSize} total={p.total} onPage={(n) => set({ page: String(n) })} />
          </>
        )}
      </Loaded>
      {removing ? (
        <Confirm
          title={`Remove ${removing.number}?`}
          body={<p>Workspaces can call it again (unless it’s on their own DND list).</p>}
          confirmLabel="Remove"
          danger
          onConfirm={async () => {
            await api.removePlatformDnd(removing.id);
            await state.reload();
          }}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </div>
  );
}

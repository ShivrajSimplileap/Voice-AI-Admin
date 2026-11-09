import { useEffect, useState } from 'react';
import { ArrowLeft, Eye, Lock, RefreshCw, RotateCw } from 'lucide-react';
import { api, type CallRow, type LiveCall } from '../api';
import { Link, navigate, useTitle } from '../router';
import { useAdmin } from '../session';
import { Alert, Badge, Button, Card, PageHeader, Spinner, cx, fullTime, timeAgo } from '../components/ui';
import {
  CallStatusBadge,
  FilterBar,
  FilterSelect,
  Loaded,
  Pager,
  SearchBox,
  Table,
  directionLabel,
  fmtDuration,
  fmtNum,
  outcomeLabel,
  useInterval,
  useLoad,
  useQueryState,
  type Column,
} from '../components/data';

const ISSUES = [
  { value: '', label: 'Any calls' },
  { value: 'failed', label: 'Failed calls' },
  { value: 'analysis_failed', label: 'Summary failed' },
  { value: 'recording_failed', label: 'Recording failed' },
  { value: 'stuck', label: 'Stuck “in progress”' },
];

export function CallsPage() {
  useTitle('Calls');
  const [f, set] = useQueryState({ tab: 'all', q: '', orgId: '', direction: '', status: '', outcome: '', issue: '', page: '1' });
  const orgs = useLoad(() => api.orgOptions(), []);
  return (
    <>
      <PageHeader title="Calls" subtitle="Calls in every workspace. Opening what was said is recorded in the activity log." />
      <div className="mb-4 inline-flex gap-1 rounded-full bg-surface p-1 shadow-card" role="tablist">
        {[
          ['all', 'All calls'],
          ['live', 'Live now'],
        ].map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={f.tab === k}
            onClick={() => set({ tab: k })}
            className={cx('h-9 rounded-full px-4 text-sm font-semibold', f.tab === k ? 'bg-ink text-white' : 'text-ink-2 hover:bg-soft')}
          >
            {label}
          </button>
        ))}
      </div>
      {f.tab === 'live' ? (
        <LiveCalls />
      ) : (
        <AllCalls f={f} set={set} orgOptions={orgs.data?.data ?? []} />
      )}
    </>
  );
}

function AllCalls({
  f,
  set,
  orgOptions,
}: {
  f: Record<'q' | 'orgId' | 'direction' | 'status' | 'outcome' | 'issue' | 'page', string>;
  set: (p: Partial<Record<string, string>>) => void;
  orgOptions: { id: string; name: string }[];
}) {
  const state = useLoad(
    () => api.calls({ q: f.q, orgId: f.orgId, direction: f.direction, status: f.status, outcome: f.outcome, issue: f.issue, page: f.page, pageSize: 50 }),
    [f.q, f.orgId, f.direction, f.status, f.outcome, f.issue, f.page]
  );
  const columns: Column<CallRow>[] = [
    { key: 'when', label: 'When', render: (c) => <span className="whitespace-nowrap text-muted" title={fullTime(c.startedAt)}>{timeAgo(c.startedAt)}</span> },
    { key: 'org', label: 'Workspace', render: (c) => <span className="font-semibold">{c.org.name}</span> },
    { key: 'dir', label: 'Type', render: (c) => directionLabel(c.direction) },
    {
      key: 'who',
      label: 'Agent / number',
      render: (c) => (
        <div>
          <div>{c.agentLabel || '—'}</div>
          <div className="text-[12px] text-muted tabular-nums">{c.direction === 'inbound' ? c.fromNumber : c.direction === 'outbound' ? c.toNumber : c.userName}</div>
        </div>
      ),
    },
    { key: 'status', label: 'Status', render: (c) => <CallStatusBadge status={c.status} /> },
    { key: 'dur', label: 'Length', align: 'right', render: (c) => fmtDuration(c.durationSec) },
    { key: 'outcome', label: 'Outcome', render: (c) => outcomeLabel(c.outcome) },
    {
      key: 'issues',
      label: '',
      render: (c) => (
        <div className="flex gap-1">
          {c.analysisStatus === 'failed' ? <Badge tone="bad">Summary failed</Badge> : null}
          {c.recordingStatus === 'failed' ? <Badge tone="bad">Recording failed</Badge> : null}
        </div>
      ),
    },
  ];
  return (
    <>
      <FilterBar>
        <SearchBox value={f.q} onChange={(q) => set({ q, page: '1' })} placeholder="Search agent, number, person or workspace" />
        <FilterSelect label="Workspace" value={f.orgId} onChange={(orgId) => set({ orgId, page: '1' })} options={[{ value: '', label: 'All workspaces' }, ...orgOptions.map((o) => ({ value: o.id, label: o.name }))]} />
        <FilterSelect
          label="Type"
          value={f.direction}
          onChange={(direction) => set({ direction, page: '1' })}
          options={[{ value: '', label: 'All types' }, { value: 'outbound', label: 'Outbound' }, { value: 'inbound', label: 'Inbound' }, { value: 'playground', label: 'Playground' }]}
        />
        <FilterSelect
          label="Outcome"
          value={f.outcome}
          onChange={(outcome) => set({ outcome, page: '1' })}
          options={[{ value: '', label: 'Any outcome' }, ...['demo_booked', 'qualified', 'callback_requested', 'information_only', 'not_interested', 'do_not_call', 'unknown'].map((o) => ({ value: o, label: outcomeLabel(o) }))]}
        />
        <FilterSelect label="Problems" value={f.issue} onChange={(issue) => set({ issue, page: '1' })} options={ISSUES} />
      </FilterBar>
      <Loaded state={state}>
        {(page) => (
          <>
            <Table rows={page.data} columns={columns} onRow={(c) => navigate(`/calls/${c.id}`)} empty="No calls match." />
            <Pager page={page.page} pageSize={page.pageSize} total={page.total} onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </Loaded>
    </>
  );
}

function LiveCalls() {
  const state = useLoad(() => api.liveCalls(), []);
  useInterval(() => void state.reload(), 5000);
  const [, tick] = useState(0);
  useInterval(() => tick((t) => t + 1), 1000);
  const columns: Column<LiveCall>[] = [
    { key: 'for', label: 'Running for', render: (c) => <span className="font-semibold tabular-nums">{fmtDuration(Math.round((Date.now() - new Date(c.startedAt).getTime()) / 1000))}</span> },
    { key: 'org', label: 'Workspace', render: (c) => c.org.name },
    { key: 'dir', label: 'Type', render: (c) => directionLabel(c.direction) },
    { key: 'agent', label: 'Agent', render: (c) => c.agent || '—' },
    { key: 'number', label: 'Number / person', render: (c) => <span className="tabular-nums">{(c.direction === 'inbound' ? c.fromNumber : c.toNumber) ?? c.person ?? '—'}</span> },
    { key: 'turns', label: 'Lines so far', align: 'right', render: (c) => fmtNum(c.turns) },
    { key: 'last', label: 'Last activity', render: (c) => (c.stuck ? <Badge tone="bad">Stuck · {timeAgo(c.lastActivityAt)}</Badge> : <span className="text-muted">{timeAgo(c.lastActivityAt)}</span>) },
  ];
  return (
    <>
      <div className="mb-3 flex items-center gap-2 text-[13px] text-muted">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-accent" />
        </span>
        Updates every 5 seconds. Ending a call from here comes in Phase 3.
      </div>
      <Loaded state={state}>
        {(d) => <Table rows={d.data} columns={columns} onRow={(c) => navigate(`/calls/${c.id}`)} empty="No calls right now." />}
      </Loaded>
    </>
  );
}

// ---------------------------------------------------------------------------
// One call
// ---------------------------------------------------------------------------
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function CallDetailPage({ id }: { id: string }) {
  useTitle('Call');
  const admin = useAdmin();
  const canSee = admin.role !== 'viewer';
  const state = useLoad(() => api.callDetail(id), [id]);
  const [retrying, setRetrying] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  return (
    <>
      <button onClick={() => (window.history.length > 1 ? window.history.back() : navigate('/calls'))} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> Back
      </button>
      <Loaded state={state}>
        {(c) => (
          <>
            <PageHeader
              title={`${directionLabel(c.direction)} call · ${c.agentLabel || 'Agent'}`}
              subtitle={
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Link to={`/workspaces/${c.org.id}`} className="font-semibold text-ink hover:text-accent">
                    {c.org.name}
                  </Link>
                  · {fullTime(c.startedAt)} <CallStatusBadge status={c.status} />
                </span>
              }
              actions={
                c.status === 'in_progress' ? (
                  <Button variant="soft" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => void state.reload()}>
                    Refresh
                  </Button>
                ) : null
              }
            />
            {notice ? (
              <div className="mb-4">
                <Alert tone={notice.tone}>{notice.text}</Alert>
              </div>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
              <Card className="p-5">
                <h3 className="mb-3 text-[15px] font-bold">Details</h3>
                <dl className="space-y-2 text-sm">
                  {(
                    [
                      ['Length', fmtDuration(c.durationSec)],
                      ['From', c.fromNumber ?? '—'],
                      ['To', c.toNumber ?? '—'],
                      ['Provider', c.provider ?? (c.direction === 'playground' ? 'Browser' : '—')],
                      ['Person', c.userName ?? '—'],
                      ['Voice', c.voice || '—'],
                      ['Lines spoken', fmtNum(c.turnCount)],
                      ['Interruptions', fmtNum(c.interruptions)],
                      ['Knowledge lookups', fmtNum(c.knowledgeLookups)],
                      ['Ended because', c.hangup ? `${c.hangup.reason.replace(/_/g, ' ')}${c.hangup.agentReason ? ` (${c.hangup.agentReason})` : ''}` : '—'],
                      ['Outcome', outcomeLabel(c.outcome)],
                      ['Sentiment', c.sentiment ?? '—'],
                      ['Recording', c.recording ? 'Saved' : c.recordingStatus === 'failed' ? 'Failed' : 'None'],
                      ['Summary', c.analysisStatus === 'failed' ? 'Failed' : c.analysisStatus],
                      ['Provider call id', c.providerCallId ?? '—'],
                    ] as [string, string][]
                  ).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 rounded-xl bg-soft px-3.5 py-2">
                      <dt className="text-muted">{k}</dt>
                      <dd className="text-right font-semibold break-all">{v}</dd>
                    </div>
                  ))}
                </dl>
                {c.analysisStatus === 'failed' ? (
                  <div className="mt-4 space-y-2">
                    {c.analysisError ? <Alert>{c.analysisError}</Alert> : null}
                    {canSee && c.hasTranscript ? (
                      <Button
                        variant="soft"
                        size="sm"
                        busy={retrying}
                        icon={<RotateCw className="size-3.5" />}
                        onClick={async () => {
                          setRetrying(true);
                          try {
                            await api.retryAnalysis(c.id);
                            setNotice({ tone: 'good', text: 'The summary is queued again.' });
                            await state.reload();
                          } catch (err) {
                            setNotice({ tone: 'bad', text: err instanceof Error ? err.message : 'Couldn’t retry.' });
                          } finally {
                            setRetrying(false);
                          }
                        }}
                      >
                        Retry summary
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </Card>
              {canSee ? (
                <CallContent call={c} />
              ) : (
                <Card className="grid place-items-center p-10 text-center">
                  <div>
                    <Lock className="mx-auto size-6 text-muted" />
                    <p className="mt-3 text-sm font-semibold">What was said is hidden for viewers</p>
                    <p className="mt-1 text-[13px] text-muted">Transcripts, recordings and summaries are open to super admins and admins.</p>
                  </div>
                </Card>
              )}
            </div>
          </>
        )}
      </Loaded>
    </>
  );
}

/** Transcript, summary and recording: loaded only when asked for, and logged. */
function CallContent({ call }: { call: CallRow }) {
  const [open, setOpen] = useState(false);
  const transcript = useLoad(async () => (open ? api.callTranscript(call.id) : null), [open, call.id]);
  const [audio, setAudio] = useState<{ url?: string; error?: string; loading?: boolean }>({});

  useEffect(() => () => void (audio.url && URL.revokeObjectURL(audio.url)), [audio.url]);

  if (!open) {
    return (
      <Card className="grid place-items-center p-10 text-center">
        <div className="max-w-sm">
          <Eye className="mx-auto size-6 text-muted" />
          <p className="mt-3 text-sm font-semibold">Customer conversation</p>
          <p className="mt-1 text-[13px] text-muted">Opening the transcript and recording is recorded in the activity log with your name.</p>
          <Button className="mt-4" onClick={() => setOpen(true)} disabled={!call.hasTranscript && !call.recording}>
            {call.hasTranscript || call.recording ? 'Show transcript and recording' : 'Nothing was kept for this call'}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      {call.recording ? (
        <div className="mb-4">
          {audio.url ? (
            <audio controls src={audio.url} className="w-full" autoPlay />
          ) : (
            <Button
              variant="soft"
              size="sm"
              busy={audio.loading}
              onClick={async () => {
                setAudio({ loading: true });
                try {
                  setAudio({ url: URL.createObjectURL(await api.callRecording(call.id)) });
                } catch (err) {
                  setAudio({ error: err instanceof Error ? err.message : 'Couldn’t load the recording.' });
                }
              }}
            >
              Play recording
            </Button>
          )}
          {audio.error ? <div className="mt-2"><Alert>{audio.error}</Alert></div> : null}
        </div>
      ) : null}
      {!transcript.data ? (
        transcript.error ? <Alert>{transcript.error}</Alert> : <Spinner label="Loading transcript…" />
      ) : (
        <>
          {transcript.data.summary ? (
            <div className="mb-4 rounded-2xl bg-blue-soft p-4 text-sm">
              <div className="mb-1 text-[12px] font-semibold tracking-wide text-navy uppercase">Summary</div>
              <p>{transcript.data.summary}</p>
              {transcript.data.nextStep ? <p className="mt-2 text-ink-2">Next step: {transcript.data.nextStep}</p> : null}
            </div>
          ) : null}
          <h3 className="mb-2 text-[15px] font-bold">Transcript</h3>
          {transcript.data.transcript.length ? (
            <ol className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {transcript.data.transcript.map((t) => (
                <li key={t.seq} className={cx('flex gap-3', t.speaker === 'caller' && 'flex-row-reverse')}>
                  <div className={cx('max-w-[85%] rounded-2xl px-3.5 py-2 text-sm', t.speaker === 'agent' ? 'bg-soft' : 'bg-ink text-white')}>
                    <div className={cx('mb-0.5 text-[11px] font-semibold', t.speaker === 'agent' ? 'text-muted' : 'text-white/60')}>
                      {t.speaker === 'agent' ? 'Agent' : 'Caller'} · {clock(t.offsetMs)}
                      {t.interrupted ? ' · interrupted' : ''}
                    </div>
                    {t.text}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">No transcript was kept for this call.</p>
          )}
        </>
      )}
    </Card>
  );
}

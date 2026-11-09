import { useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, RefreshCw, RotateCw, XCircle } from 'lucide-react';
import { api, type Health } from '../api';
import { Link, useTitle } from '../router';
import { useAdmin } from '../session';
import { Alert, Badge, Button, Card, Confirm, PageHeader, cx, fullTime, timeAgo } from '../components/ui';
import { Loaded, fmtNum, useInterval, useLoad } from '../components/data';

const STATUS = {
  ok: { icon: <CheckCircle2 className="size-4" />, label: 'Working', tone: 'good' as const, text: 'text-good' },
  warn: { icon: <AlertTriangle className="size-4" />, label: 'Check', tone: 'accent' as const, text: 'text-accent' },
  down: { icon: <XCircle className="size-4" />, label: 'Down', tone: 'bad' as const, text: 'text-bad' },
  off: { icon: <CircleSlash className="size-4" />, label: 'Not set up', tone: 'neutral' as const, text: 'text-muted' },
};

const waited = (sec: number | null) => {
  if (sec === null) return '—';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  return `${Math.round(sec / 3600)} h`;
};

const FAILURE_GROUPS: { key: keyof Health['failures']; title: string; link?: (id: string) => string }[] = [
  { key: 'analyses', title: 'Call summaries (7 days)', link: (id) => `/calls/${id}` },
  { key: 'knowledge', title: 'Knowledge files' },
  { key: 'imports', title: 'Lead imports (7 days)' },
  { key: 'digests', title: 'Email digests (7 days)' },
  { key: 'campaigns', title: 'Campaigns with an error' },
];

export function HealthPage() {
  useTitle('System health');
  const admin = useAdmin();
  const canAct = admin.role !== 'viewer';
  const state = useLoad(() => api.health(), []);
  useInterval(() => void state.reload(), 60_000);
  const [confirm, setConfirm] = useState<'stuck' | 'analyses' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  async function retryFile(id: string, name: string) {
    try {
      await api.retryKnowledgeFile(id);
      setNotice({ tone: 'good', text: `${name} is queued for indexing again.` });
      await state.reload();
    } catch (err) {
      setNotice({ tone: 'bad', text: err instanceof Error ? err.message : 'Couldn’t retry.' });
    }
  }

  return (
    <>
      <PageHeader
        title="System health"
        subtitle="Services the platform depends on, and its background work. Phone providers are only checked for settings: nothing here places a call."
        actions={
          <Button variant="soft" size="sm" icon={<RefreshCw className={cx('size-3.5', state.loading && 'animate-spin')} />} onClick={() => void state.reload()}>
            Check again
          </Button>
        }
      />
      {notice ? (
        <div className="mb-4">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      ) : null}
      <Loaded state={state}>
        {(h) => {
          const stuck = h.workers.find((w) => w.key === 'stuck')?.waiting ?? 0;
          const failedAnalyses = h.workers.find((w) => w.key === 'analysis')?.failed ?? 0;
          return (
            <div className="space-y-6">
              <div>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-[15px] font-bold">Services</h2>
                  <span className="text-[12px] text-muted">Checked {timeAgo(h.checkedAt).toLowerCase()}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {h.services.map((s) => {
                    const st = STATUS[s.status];
                    return (
                      <Card key={s.key} className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold">{s.name}</div>
                          <span className={cx('inline-flex items-center gap-1 text-[12px] font-semibold', st.text)}>
                            {st.icon}
                            {st.label}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[13px] break-words text-muted">
                          {s.detail}
                          {s.ms !== undefined && s.status === 'ok' ? ` · ${s.ms} ms` : ''}
                        </p>
                      </Card>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[15px] font-bold">Background work</h2>
                  {canAct ? (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="soft" disabled={!stuck} onClick={() => setConfirm('stuck')}>
                        Close stuck calls{stuck ? ` (${stuck})` : ''}
                      </Button>
                      <Button size="sm" variant="soft" disabled={!failedAnalyses} icon={<RotateCw className="size-3.5" />} onClick={() => setConfirm('analyses')}>
                        Retry failed summaries{failedAnalyses ? ` (${failedAnalyses})` : ''}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <Card className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="text-left text-[12px] font-semibold tracking-wide text-muted uppercase">
                      <tr>
                        <th className="px-5 py-3">Worker</th>
                        <th className="px-3 py-3 text-right">Waiting</th>
                        <th className="px-3 py-3 text-right">Running</th>
                        <th className="px-3 py-3 text-right">Failed</th>
                        <th className="px-3 py-3 text-right">Oldest waiting</th>
                        <th className="px-5 py-3">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/70">
                      {h.workers.map((w) => (
                        <tr key={w.key}>
                          <td className="px-5 py-3 font-semibold">{w.name}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{w.waiting === null ? '—' : w.key === 'stuck' && w.waiting ? <Badge tone="bad">{w.waiting}</Badge> : fmtNum(w.waiting)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{w.running === null ? '—' : fmtNum(w.running)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{w.failed === null ? '—' : w.failed ? <Badge tone="bad">{w.failed}</Badge> : '0'}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{waited(w.oldestWaitingSec)}</td>
                          <td className="px-5 py-3 text-[13px] text-muted">{w.note.startsWith('Last sent ') ? `Last sent ${timeAgo(w.note.slice(10)).toLowerCase()}` : w.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>

              <div>
                <h2 className="mb-3 text-[15px] font-bold">Recent failures</h2>
                <div className="grid gap-4 lg:grid-cols-2">
                  {FAILURE_GROUPS.map((g) => {
                    const items = h.failures[g.key];
                    return (
                      <Card key={g.key} className="overflow-hidden">
                        <div className="flex items-center justify-between px-5 pt-4 pb-2">
                          <h3 className="text-sm font-bold">{g.title}</h3>
                          {items.length ? <Badge tone="bad">{items.length}</Badge> : <Badge tone="good">None</Badge>}
                        </div>
                        {items.length ? (
                          <ul className="max-h-[280px] divide-y divide-line/70 overflow-y-auto">
                            {items.map((i) => (
                              <li key={i.id} className="flex items-start justify-between gap-3 px-5 py-2.5 text-[13px]">
                                <div className="min-w-0">
                                  <div className="font-semibold">
                                    {g.link ? (
                                      <Link to={g.link(i.id)} className="hover:text-accent">
                                        {i.name || 'Call'}
                                      </Link>
                                    ) : (
                                      i.name
                                    )}
                                  </div>
                                  <div className="text-muted">
                                    <Link to={`/workspaces/${i.orgId}`} className="hover:text-ink">
                                      {i.orgName}
                                    </Link>{' '}
                                    · <span title={fullTime(i.at)}>{timeAgo(i.at)}</span>
                                  </div>
                                  {i.error ? <div className="mt-0.5 break-words text-bad">{i.error}</div> : null}
                                </div>
                                {g.key === 'knowledge' && canAct ? (
                                  <Button size="sm" variant="soft" onClick={() => void retryFile(i.id, i.name)}>
                                    Retry
                                  </Button>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="px-5 pb-4 text-[13px] text-muted">Nothing failed.</p>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>

              <Card className="p-5">
                <h2 className="mb-3 text-[15px] font-bold">Settings of this backend</h2>
                <div className="flex flex-wrap gap-2 text-[13px]">
                  <Badge tone={h.settings.environment === 'production' ? 'ink' : 'blue'}>{h.settings.environment}</Badge>
                  <Badge tone={h.settings.workersInThisProcess ? 'good' : 'neutral'}>Workers {h.settings.workersInThisProcess ? 'on' : 'off'} here</Badge>
                  {h.settings.dialerSimulated ? <Badge tone="accent">Dialer simulated</Badge> : <Badge>Dialer real</Badge>}
                  <Badge tone={h.settings.liveRequiresSignIn ? 'good' : 'accent'}>Browser voice {h.settings.liveRequiresSignIn ? 'needs sign-in' : 'open to anyone'}</Badge>
                  <Badge>Storage: {h.settings.storageDriver}</Badge>
                  <Badge>Embeddings: {h.settings.embeddingProvider}</Badge>
                  <Badge>Analysis: {h.settings.analysisProvider}</Badge>
                  <Badge>{h.settings.publicApiUrl ? `Public URL: ${h.settings.publicApiUrl}` : 'No public URL'}</Badge>
                </div>
              </Card>
            </div>
          );
        }}
      </Loaded>

      {confirm === 'stuck' ? (
        <Confirm
          title="Close stuck calls?"
          body={<p>Calls with no activity for 30+ minutes are marked ended. What was said is kept, and calls with a conversation get their summary.</p>}
          confirmLabel="Close them"
          onConfirm={async () => {
            const { closed } = await api.closeStuckCalls();
            setNotice({ tone: 'good', text: `${closed} call${closed === 1 ? '' : 's'} closed.` });
            await state.reload();
          }}
          onClose={() => setConfirm(null)}
        />
      ) : null}
      {confirm === 'analyses' ? (
        <Confirm
          title="Retry failed summaries?"
          body={<p>Every call from the last 7 days whose summary failed is queued again. This uses the AI quota once per call.</p>}
          confirmLabel="Retry all"
          onConfirm={async () => {
            const { queued } = await api.retryFailedAnalyses();
            setNotice({ tone: 'good', text: `${queued} summar${queued === 1 ? 'y' : 'ies'} queued again.` });
            await state.reload();
          }}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </>
  );
}

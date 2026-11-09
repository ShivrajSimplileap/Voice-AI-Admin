import { AlertTriangle, CheckCircle2, ChevronRight, RefreshCw, TrendingDown } from 'lucide-react';
import { api, type Overview } from '../api';
import { Link, navigate, useTitle } from '../router';
import { useAdmin } from '../session';
import { Badge, Button, Card, PageHeader } from '../components/ui';
import { ColumnChart, StatTile } from '../components/charts';
import { Loaded, fmtDay, fmtNum, fmtPct, useInterval, useLoad } from '../components/data';

/** Alerts, each with where to go to fix it. */
const ALERTS: { key: keyof Overview['alerts']; label: string; to: string }[] = [
  { key: 'stuckCalls', label: 'Calls stuck “in progress”', to: '/calls?issue=stuck' },
  { key: 'failedAnalyses7d', label: 'Call summaries failed (7 days)', to: '/calls?issue=analysis_failed' },
  { key: 'failedRecordings7d', label: 'Recordings failed (7 days)', to: '/calls?issue=recording_failed' },
  { key: 'failedKnowledgeFiles', label: 'Knowledge files failed', to: '/health' },
  { key: 'failedImports7d', label: 'Lead imports failed (7 days)', to: '/health' },
  { key: 'failedDigests7d', label: 'Email digests failed (7 days)', to: '/health' },
  { key: 'campaignErrors', label: 'Campaigns with an error', to: '/health' },
];

export function OverviewPage() {
  useTitle('Overview');
  const admin = useAdmin();
  const state = useLoad(() => api.overview(), []);
  // Live numbers stay fresh while the page is open.
  useInterval(() => void state.reload(), 30_000);
  const firstName = admin.name.split(' ')[0] || admin.name;

  return (
    <>
      <PageHeader
        title={`Hello, ${firstName}`}
        subtitle="The whole platform at a glance. Phone calls only; Playground tests are counted apart."
        actions={
          <Button variant="soft" size="sm" icon={<RefreshCw className={`size-3.5 ${state.loading ? 'animate-spin' : ''}`} />} onClick={() => void state.reload()}>
            Refresh
          </Button>
        }
      />
      <Loaded state={state}>
        {(o) => {
          const active = ALERTS.filter((a) => o.alerts[a.key] > 0);
          return (
            <div className="space-y-6">
              {/* Right now */}
              <div className="grid gap-4 sm:grid-cols-3">
                <Link to="/calls?tab=live" className="block">
                  <StatTile label="Live calls" value={fmtNum(o.now.liveCalls)} sub="In progress now" tone={o.now.liveCalls ? 'accent' : undefined} />
                </Link>
                <StatTile label="Running campaigns" value={fmtNum(o.now.runningCampaigns)} sub={`${fmtNum(o.now.dueContacts)} contacts due to be called`} />
                <Link to="/workspaces" className="block">
                  <StatTile label="Workspaces" value={fmtNum(o.totals.workspaces)} sub={`${fmtNum(o.totals.newWorkspaces30d)} new in 30 days`} />
                </Link>
              </div>

              {/* Alerts */}
              <Card className="p-5">
                <div className="flex items-center gap-2">
                  {active.length ? <AlertTriangle className="size-4 text-accent" /> : <CheckCircle2 className="size-4 text-good" />}
                  <h2 className="text-[15px] font-bold">{active.length ? 'Needs attention' : 'Nothing needs attention'}</h2>
                </div>
                {active.length ? (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {active.map((a) => (
                      <li key={a.key}>
                        <Link to={a.to} className="flex items-center justify-between gap-3 rounded-2xl bg-soft px-4 py-3 text-sm hover:bg-line/60">
                          <span>{a.label}</span>
                          <span className="flex items-center gap-1">
                            <Badge tone="bad">{fmtNum(o.alerts[a.key])}</Badge>
                            <ChevronRight className="size-4 text-muted" />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted">No stuck calls, failed summaries, imports, digests or campaign errors.</p>
                )}
              </Card>

              {/* Calls */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile label="Calls today" value={fmtNum(o.calls.today.calls)} sub={`${fmtNum(o.calls.today.minutes)} minutes`} />
                <StatTile label="Calls, 30 days" value={fmtNum(o.calls.month.calls)} sub={`${fmtNum(o.calls.month.minutes)} minutes · ${fmtNum(o.calls.week.calls)} in 7 days`} />
                <StatTile label="Connect rate, 30 days" value={fmtPct(o.calls.month.connectRate)} sub={`${fmtNum(o.calls.month.connected)} real conversations`} />
                <StatTile label="Conversions, 30 days" value={fmtNum(o.calls.month.converted)} sub={`${fmtPct(o.calls.month.conversionRate)} of connected calls`} />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <ColumnChart title="Phone calls per day" subtitle="Last 30 days" unit="Calls" data={o.series.map((d) => ({ x: d.day, y: d.calls }))} formatX={fmtDay} />
                <ColumnChart title="Minutes per day" subtitle="Last 30 days" unit="Minutes" data={o.series.map((d) => ({ x: d.day, y: d.minutes }))} formatX={fmtDay} />
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                <Card className="overflow-hidden">
                  <div className="px-5 pt-5 pb-2">
                    <h3 className="text-[15px] font-bold">Busiest workspaces</h3>
                    <p className="text-[13px] text-muted">By minutes, last 30 days</p>
                  </div>
                  {o.topWorkspaces.length ? (
                    <table className="w-full text-sm">
                      <thead className="text-left text-[12px] font-semibold tracking-wide text-muted uppercase">
                        <tr>
                          <th className="px-5 py-2">Workspace</th>
                          <th className="px-3 py-2 text-right">Calls</th>
                          <th className="px-3 py-2 text-right">Minutes</th>
                          <th className="px-5 py-2 text-right">Connect</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/70">
                        {o.topWorkspaces.map((w) => (
                          <tr key={w.id} className="cursor-pointer hover:bg-soft/60" onClick={() => navigate(`/workspaces/${w.id}`)}>
                            <td className="px-5 py-2.5 font-semibold">{w.name}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(w.calls)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(w.minutes)}</td>
                            <td className="px-5 py-2.5 text-right tabular-nums">{fmtPct(w.connectRate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="px-5 pb-6 text-sm text-muted">No phone calls in the last 30 days.</p>
                  )}
                </Card>

                <div className="space-y-4">
                  <Card className="p-5">
                    <h3 className="text-[15px] font-bold">People</h3>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-soft p-4">
                        <div className="text-[22px] font-bold tabular-nums">{fmtNum(o.totals.people)}</div>
                        <div className="text-[13px] text-muted">with a workspace</div>
                      </div>
                      <div className="rounded-2xl bg-soft p-4">
                        <div className="text-[22px] font-bold tabular-nums">{fmtNum(o.totals.activePeople7d)}</div>
                        <div className="text-[13px] text-muted">signed in, 7 days</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[13px] text-muted">
                      <span>30 days:</span>
                      <Badge>{fmtNum(o.calls.month.outbound)} outbound</Badge>
                      <Badge>{fmtNum(o.calls.month.inbound)} inbound</Badge>
                      <Badge>{fmtNum(o.calls.month.playground)} playground</Badge>
                    </div>
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="size-4 text-muted" />
                      <h3 className="text-[15px] font-bold">Calls dropping</h3>
                    </div>
                    <p className="text-[13px] text-muted">Down by half or more this week vs last</p>
                    {o.dropping.length ? (
                      <ul className="mt-3 space-y-2">
                        {o.dropping.map((d) => (
                          <li key={d.id}>
                            <Link to={`/workspaces/${d.id}`} className="flex items-center justify-between rounded-2xl bg-soft px-4 py-2.5 text-sm hover:bg-line/60">
                              <span className="font-semibold">{d.name}</span>
                              <span className="text-muted tabular-nums">
                                {fmtNum(d.lastWeek)} → {fmtNum(d.thisWeek)} <span className="font-semibold text-bad">{d.change}%</span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-muted">No workspace’s calls fell sharply.</p>
                    )}
                  </Card>
                </div>
              </div>
            </div>
          );
        }}
      </Loaded>
    </>
  );
}

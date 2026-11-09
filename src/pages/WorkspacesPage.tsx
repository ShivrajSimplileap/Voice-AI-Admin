import { useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api, type OrgDetail, type OrgRow } from '../api';
import { Link, navigate, useTitle } from '../router';
import { Badge, Card, PageHeader, cx, fullTime, timeAgo } from '../components/ui';
import { StatTile } from '../components/charts';
import {
  CallStatusBadge,
  FilterBar,
  Loaded,
  Pager,
  SearchBox,
  Table,
  directionLabel,
  fmtBytes,
  fmtDuration,
  fmtNum,
  fmtPct,
  outcomeLabel,
  useLoad,
  useQueryState,
  workspaceRole,
  type Column,
} from '../components/data';

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
export function WorkspacesPage() {
  useTitle('Workspaces');
  const [f, set] = useQueryState({ q: '', sort: 'created', dir: 'desc', page: '1' });
  const state = useLoad(() => api.orgs({ q: f.q, sort: f.sort, dir: f.dir, page: f.page, pageSize: 50 }), [f.q, f.sort, f.dir, f.page]);

  const columns: Column<OrgRow>[] = [
    {
      key: 'name',
      label: 'Workspace',
      sort: 'name',
      render: (o) => (
        <div>
          <div className="font-semibold">{o.name}</div>
          <div className="text-[12px] text-muted">{o.slug}</div>
        </div>
      ),
    },
    { key: 'members', label: 'Members', sort: 'members', align: 'right', render: (o) => fmtNum(o.members) },
    { key: 'calls', label: 'Calls 30d', sort: 'calls30d', align: 'right', render: (o) => fmtNum(o.calls30d) },
    { key: 'minutes', label: 'Minutes 30d', sort: 'minutes30d', align: 'right', render: (o) => fmtNum(o.minutes30d) },
    { key: 'connect', label: 'Connect', align: 'right', render: (o) => (o.calls30d ? fmtPct(o.connectRate30d) : '—') },
    { key: 'numbers', label: 'Numbers', align: 'right', render: (o) => fmtNum(o.numbers) },
    { key: 'storage', label: 'Storage', sort: 'storage', align: 'right', render: (o) => fmtBytes(o.storageBytes) },
    { key: 'last', label: 'Last call', sort: 'lastCall', render: (o) => <span className="text-muted">{o.lastCallAt ? timeAgo(o.lastCallAt) : 'Never'}</span> },
    { key: 'created', label: 'Created', sort: 'created', render: (o) => <span className="text-muted">{timeAgo(o.createdAt)}</span> },
  ];

  return (
    <>
      <PageHeader title="Workspaces" subtitle="Every customer workspace on the platform." />
      <FilterBar>
        <SearchBox value={f.q} onChange={(q) => set({ q, page: '1' })} placeholder="Search by name or slug" />
      </FilterBar>
      <Loaded state={state}>
        {(page) => (
          <>
            <Table
              rows={page.data}
              columns={columns}
              onRow={(o) => navigate(`/workspaces/${o.id}`)}
              sort={{ key: f.sort, dir: f.dir as 'asc' | 'desc' }}
              onSort={(key) => set({ sort: key, dir: f.sort === key && f.dir === 'desc' ? 'asc' : 'desc', page: '1' })}
              empty={f.q ? 'No workspace matches.' : 'No workspaces yet.'}
            />
            <Pager page={page.page} pageSize={page.pageSize} total={page.total} onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </Loaded>
    </>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
const TABS = ['Overview', 'Members', 'Agents', 'Campaigns', 'Numbers', 'Calls', 'Activity'] as const;
type Tab = (typeof TABS)[number];

const yes = (on: boolean, label = on ? 'On' : 'Off') => <Badge tone={on ? 'good' : 'neutral'}>{label}</Badge>;

export function WorkspaceDetailPage({ id }: { id: string }) {
  const state = useLoad(() => api.org(id), [id]);
  useTitle(state.data?.name ?? 'Workspace');
  const [tab, setTab] = useState<Tab>('Overview');
  return (
    <>
      <Link to="/workspaces" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> Workspaces
      </Link>
      <Loaded state={state}>
        {(o) => (
          <>
            <PageHeader title={o.name} subtitle={`${o.slug} · created ${fullTime(o.createdAt)} · ${o.timezone}`} />
            <div className="mb-5 flex gap-1 overflow-x-auto rounded-full bg-surface p-1 shadow-card" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cx('h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition', tab === t ? 'bg-ink text-white' : 'text-ink-2 hover:bg-soft')}
                >
                  {t}
                  {t === 'Members' ? <span className="ml-1.5 opacity-60">{o.members.filter((m) => m.isActive).length}</span> : null}
                </button>
              ))}
            </div>
            {tab === 'Overview' ? <OrgOverview o={o} /> : null}
            {tab === 'Members' ? <OrgMembers o={o} /> : null}
            {tab === 'Agents' ? <OrgAgents o={o} /> : null}
            {tab === 'Campaigns' ? <OrgCampaigns o={o} /> : null}
            {tab === 'Numbers' ? <OrgNumbers o={o} /> : null}
            {tab === 'Calls' ? <OrgCalls o={o} /> : null}
            {tab === 'Activity' ? <OrgActivity o={o} /> : null}
          </>
        )}
      </Loaded>
    </>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="space-y-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 rounded-2xl bg-soft px-4 py-2.5 text-sm">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function OrgOverview({ o }: { o: OrgDetail }) {
  const s = o.settings;
  const u = o.usage30d;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Phone calls, 30 days" value={fmtNum(u.calls)} sub={`${fmtNum(u.minutes)} minutes · ${fmtNum(u.inbound)} in / ${fmtNum(u.outbound)} out`} />
        <StatTile label="Connect rate" value={fmtPct(u.connectRate)} sub={`${fmtNum(u.connected)} conversations`} />
        <StatTile label="Conversions" value={fmtNum(u.converted)} sub={`${fmtPct(u.conversionRate)} of connected`} />
        <StatTile label="Storage" value={fmtBytes(o.stats.storageBytes)} sub="Recordings and knowledge files" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-[15px] font-bold">In this workspace</h3>
          <Rows
            rows={[
              ['Active members', fmtNum(o.members.filter((m) => m.isActive).length)],
              ['Teams', fmtNum(o.teams.length)],
              ['AI agents', fmtNum(o.agents.length)],
              ['Leads', fmtNum(o.stats.leads)],
              ['Campaigns running', fmtNum(o.stats.runningCampaigns)],
              ['Phone numbers', fmtNum(o.numbers.length)],
              ['Knowledge files', `${fmtNum(o.knowledge.files)}${o.knowledge.failed ? ` · ${o.knowledge.failed} failed` : ''}${o.knowledge.queued ? ` · ${o.knowledge.queued} indexing` : ''}`],
              ['Playground sessions, 30 days', fmtNum(u.playground)],
              ['Failed calls, 30 days', fmtNum(u.failed)],
            ]}
          />
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-[15px] font-bold">Settings</h3>
          <Rows
            rows={[
              ['Two-step verification required', yes(s.mfaRequired)],
              ['Single sign-on', s.ssoEnabled ? <Badge tone="good">{`On${s.ssoDomain ? ` · ${s.ssoDomain}` : ''}${s.ssoVerified ? '' : ' (not verified)'}`}</Badge> : yes(false)],
              ['Calling compliance (India)', yes(s.compliance)],
              ['Recordings kept', s.recordingRetentionDays ? `${s.recordingRetentionDays} days` : 'Always'],
              ['Recording notice on calls', yes(s.recordingDisclosure)],
              ['Meeting booking', yes(s.meetings)],
              ['AI callbacks', yes(s.aiCallbacks)],
              ['Email digest', s.emailDigest ? <Badge tone="good">{s.emailDigest === 'daily' ? 'Daily' : 'Weekly'}</Badge> : yes(false)],
              ['Default language', o.defaultLanguage],
            ]}
          />
        </Card>
      </div>
      {Object.keys(o.leadsByStatus).length ? (
        <Card className="p-5">
          <h3 className="mb-3 text-[15px] font-bold">Leads by stage</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(o.leadsByStatus).map(([k, v]) => (
              <Badge key={k}>
                {k.replace(/_/g, ' ')}: {fmtNum(v)}
              </Badge>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function OrgMembers({ o }: { o: OrgDetail }) {
  return (
    <Table
      rows={o.members}
      onRow={(m) => navigate(`/users/${m.id}`)}
      empty="No members."
      columns={[
        {
          key: 'name',
          label: 'Person',
          render: (m) => (
            <div className={cx(!m.isActive && 'opacity-60')}>
              <div className="font-semibold">{m.name}</div>
              <div className="text-[12px] text-muted">{m.email}</div>
            </div>
          ),
        },
        { key: 'role', label: 'Role', render: (m) => <Badge tone={m.role === 'owner' || m.role === 'admin' ? 'blue' : 'neutral'}>{workspaceRole(m.role)}</Badge> },
        { key: 'status', label: 'Status', render: (m) => (!m.isActive ? <Badge tone="bad">Removed</Badge> : !m.userActive ? <Badge tone="bad">Disabled</Badge> : <Badge tone="good">Active</Badge>) },
        { key: 'signin', label: 'Sign-in', render: (m) => (m.authProvider === 'keycloak' ? 'Keycloak' : 'Password') },
        { key: 'last', label: 'Last sign-in', render: (m) => <span className="text-muted">{timeAgo(m.lastLoginAt)}</span> },
        { key: 'joined', label: 'Joined', render: (m) => <span className="text-muted">{timeAgo(m.joinedAt)}</span> },
      ]}
    />
  );
}

function OrgAgents({ o }: { o: OrgDetail }) {
  return (
    <Table
      rows={o.agents}
      empty="No AI agents."
      columns={[
        { key: 'name', label: 'Agent', render: (a) => <div><div className="font-semibold">{a.name}</div>{a.title ? <div className="text-[12px] text-muted">{a.title}</div> : null}</div> },
        { key: 'voice', label: 'Voice', render: (a) => a.voice },
        { key: 'lang', label: 'Language', render: (a) => a.language ?? 'Workspace default' },
        { key: 'status', label: 'Status', render: (a) => (a.isActive ? <Badge tone="good">Active</Badge> : <Badge>Off</Badge>) },
        { key: 'created', label: 'Created', render: (a) => <span className="text-muted">{timeAgo(a.createdAt)}</span> },
      ]}
    />
  );
}

const CAMPAIGN_TONE: Record<string, 'accent' | 'good' | 'neutral' | 'blue'> = { running: 'accent', completed: 'good', paused: 'blue' };

function OrgCampaigns({ o }: { o: OrgDetail }) {
  return (
    <Table
      rows={o.campaigns}
      empty="No campaigns."
      columns={[
        {
          key: 'name',
          label: 'Campaign',
          render: (c) => (
            <div>
              <div className="font-semibold">{c.name}</div>
              {c.lastError ? <div className="text-[12px] text-bad">{c.lastError}</div> : null}
            </div>
          ),
        },
        { key: 'status', label: 'Status', render: (c) => <Badge tone={CAMPAIGN_TONE[c.status] ?? 'neutral'}>{c.status}</Badge> },
        { key: 'channel', label: 'Channel', render: (c) => c.channel },
        { key: 'dialed', label: 'Dialed', align: 'right', render: (c) => fmtNum(c.dialed) },
        { key: 'connected', label: 'Connected', align: 'right', render: (c) => fmtNum(c.connected) },
        { key: 'converted', label: 'Converted', align: 'right', render: (c) => fmtNum(c.converted) },
        { key: 'created', label: 'Created', render: (c) => <span className="text-muted">{timeAgo(c.createdAt)}</span> },
      ]}
    />
  );
}

function OrgNumbers({ o }: { o: OrgDetail }) {
  return (
    <>
      <Table
        rows={o.numbers}
        empty="No phone numbers. Give it one on the Phone numbers page."
        columns={[
          { key: 'number', label: 'Number', render: (n) => <span className="font-semibold tabular-nums">{n.number}</span> },
          { key: 'label', label: 'Label', render: (n) => n.label || '—' },
          { key: 'provider', label: 'Provider', render: (n) => <Badge>{n.provider}</Badge> },
          { key: 'agent', label: 'Answering agent', render: (n) => n.agentName ?? '—' },
          { key: 'inbound', label: 'Inbound', render: (n) => yes(n.inboundEnabled) },
        ]}
      />
      <p className="mt-3 text-[13px] text-muted">
        Assign or move numbers on the{' '}
        <Link to="/numbers" className="font-semibold text-ink hover:text-accent">
          Phone numbers
        </Link>{' '}
        page.
      </p>
    </>
  );
}

function OrgCalls({ o }: { o: OrgDetail }) {
  return (
    <>
      <Table
        rows={o.recentCalls}
        onRow={(c) => navigate(`/calls/${c.id}`)}
        empty="No calls yet."
        columns={[
          { key: 'when', label: 'When', render: (c) => <span className="text-muted">{timeAgo(c.startedAt)}</span> },
          { key: 'dir', label: 'Type', render: (c) => directionLabel(c.direction) },
          { key: 'agent', label: 'Agent', render: (c) => c.agentLabel || '—' },
          { key: 'status', label: 'Status', render: (c) => <CallStatusBadge status={c.status} /> },
          { key: 'dur', label: 'Length', align: 'right', render: (c) => fmtDuration(c.durationSec) },
          { key: 'outcome', label: 'Outcome', render: (c) => outcomeLabel(c.outcome) },
        ]}
      />
      <p className="mt-3 text-[13px] text-muted">
        The 10 latest.{' '}
        <Link to={`/calls?orgId=${o.id}`} className="font-semibold text-ink hover:text-accent">
          See all of this workspace’s calls
        </Link>
      </p>
    </>
  );
}

function OrgActivity({ o }: { o: OrgDetail }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5 pb-2">
        <h3 className="text-[15px] font-bold">Workspace audit log</h3>
        <p className="text-[13px] text-muted">What its own people did lately (the 20 latest).</p>
      </div>
      {o.activity.length ? (
        <ul className="divide-y divide-line/70">
          {o.activity.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-3 text-sm">
              <span className="w-[110px] shrink-0 text-[13px] text-muted" title={fullTime(a.createdAt)}>
                {timeAgo(a.createdAt)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{a.action.replace(/[._]/g, ' ')}</span>
                {a.targetLabel ? <span className="text-ink-2"> · {a.targetLabel}</span> : null}
                <span className="block text-[13px] text-muted">{a.actorName || a.actorEmail || 'System'}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 pb-6 text-sm text-muted">Nothing recorded yet.</p>
      )}
    </Card>
  );
}

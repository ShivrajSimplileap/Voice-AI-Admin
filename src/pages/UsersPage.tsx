import { ArrowLeft } from 'lucide-react';
import { api, type UserRow } from '../api';
import { Link, navigate, useTitle } from '../router';
import { Badge, Card, PageHeader, cx, fullTime, timeAgo } from '../components/ui';
import { StatTile } from '../components/charts';
import { FilterBar, FilterSelect, Loaded, Pager, SearchBox, Table, fmtNum, useLoad, useQueryState, workspaceRole, type Column } from '../components/data';

function Workspaces({ list }: { list: UserRow['workspaces'] }) {
  if (!list.length) return <span className="text-muted">None</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.slice(0, 3).map((w) => (
        <Badge key={w.id} tone={w.isActive ? 'neutral' : 'bad'}>
          {w.name} · {workspaceRole(w.role)}
        </Badge>
      ))}
      {list.length > 3 ? <Badge>+{list.length - 3}</Badge> : null}
    </div>
  );
}

export function UsersPage() {
  useTitle('Users');
  const [f, set] = useQueryState({ q: '', orgId: '', status: '', seen: '', sort: 'lastLogin', dir: 'desc', page: '1' });
  const orgs = useLoad(() => api.orgOptions(), []);
  const state = useLoad(
    () => api.users({ q: f.q, orgId: f.orgId, status: f.status, seen: f.seen, sort: f.sort, dir: f.dir, page: f.page, pageSize: 50 }),
    [f.q, f.orgId, f.status, f.seen, f.sort, f.dir, f.page]
  );

  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      label: 'Person',
      sort: 'name',
      render: (u) => (
        <div className={cx(!u.isActive && 'opacity-60')}>
          <div className="font-semibold">{u.name}</div>
          <div className="text-[12px] text-muted">{u.email}</div>
        </div>
      ),
    },
    { key: 'ws', label: 'Workspaces', render: (u) => <Workspaces list={u.workspaces} /> },
    { key: 'status', label: 'Status', render: (u) => (u.isActive ? <Badge tone="good">Active</Badge> : <Badge tone="bad">Disabled</Badge>) },
    { key: 'signin', label: 'Sign-in', render: (u) => (u.authProvider === 'keycloak' ? 'Keycloak' : 'Password') },
    { key: 'last', label: 'Last sign-in', sort: 'lastLogin', render: (u) => <span className="text-muted">{timeAgo(u.lastLoginAt)}</span> },
    { key: 'created', label: 'Joined', sort: 'created', render: (u) => <span className="text-muted">{timeAgo(u.createdAt)}</span> },
  ];

  return (
    <>
      <PageHeader title="Users" subtitle="Everyone with a customer account, across every workspace." />
      <FilterBar>
        <SearchBox value={f.q} onChange={(q) => set({ q, page: '1' })} placeholder="Search by name or email" />
        <FilterSelect
          label="Workspace"
          value={f.orgId}
          onChange={(orgId) => set({ orgId, page: '1' })}
          options={[{ value: '', label: 'All workspaces' }, ...(orgs.data?.data ?? []).map((o) => ({ value: o.id, label: o.name }))]}
        />
        <FilterSelect label="Status" value={f.status} onChange={(status) => set({ status, page: '1' })} options={[{ value: '', label: 'Any status' }, { value: 'active', label: 'Active' }, { value: 'disabled', label: 'Disabled' }]} />
        <FilterSelect
          label="Last sign-in"
          value={f.seen}
          onChange={(seen) => set({ seen, page: '1' })}
          options={[{ value: '', label: 'Any time' }, { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }, { value: 'never', label: 'Never signed in' }]}
        />
      </FilterBar>
      <Loaded state={state}>
        {(page) => (
          <>
            <Table
              rows={page.data}
              columns={columns}
              onRow={(u) => navigate(`/users/${u.id}`)}
              sort={{ key: f.sort, dir: f.dir as 'asc' | 'desc' }}
              onSort={(key) => set({ sort: key, dir: f.sort === key && f.dir === 'desc' ? 'asc' : 'desc', page: '1' })}
              empty="Nobody matches."
            />
            <Pager page={page.page} pageSize={page.pageSize} total={page.total} onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </Loaded>
    </>
  );
}

export function UserDetailPage({ id }: { id: string }) {
  const state = useLoad(() => api.user(id), [id]);
  useTitle(state.data?.name ?? 'User');
  return (
    <>
      <Link to="/users" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> Users
      </Link>
      <Loaded state={state}>
        {(u) => (
          <>
            <PageHeader
              title={u.name}
              subtitle={
                <span className="inline-flex flex-wrap items-center gap-2">
                  {u.email} {u.isActive ? <Badge tone="good">Active</Badge> : <Badge tone="bad">Disabled</Badge>}
                </span>
              }
            />
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <StatTile label="Last sign-in" value={u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'} sub={u.lastLoginAt ? fullTime(u.lastLoginAt) : undefined} />
              <StatTile label="Calls, 30 days" value={fmtNum(u.usage.calls30d)} sub={`${fmtNum(u.usage.callsTotal)} in all`} />
              <StatTile label="Signs in with" value={u.authProvider === 'keycloak' ? 'Keycloak' : 'Password'} sub={`Account created ${timeAgo(u.createdAt).toLowerCase()}`} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="mb-3 text-[15px] font-bold">Workspaces</h3>
                {u.workspaces.length ? (
                  <ul className="space-y-2">
                    {u.workspaces.map((w) => (
                      <li key={w.id}>
                        <Link to={`/workspaces/${w.id}`} className="flex items-center justify-between rounded-2xl bg-soft px-4 py-2.5 text-sm hover:bg-line/60">
                          <span className="font-semibold">{w.name}</span>
                          <span className="flex gap-1.5">
                            <Badge tone="blue">{workspaceRole(w.role)}</Badge>
                            {!w.isActive ? <Badge tone="bad">Removed</Badge> : null}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Not in any workspace.</p>
                )}
              </Card>
              <Card className="p-5">
                <h3 className="mb-3 text-[15px] font-bold">Pending invitations</h3>
                {u.pendingInvitations.length ? (
                  <ul className="space-y-2">
                    {u.pendingInvitations.map((i) => (
                      <li key={i.id} className="flex items-center justify-between rounded-2xl bg-soft px-4 py-2.5 text-sm">
                        <span className="font-semibold">{i.orgName}</span>
                        <span className="text-muted">
                          {workspaceRole(i.role)} · {timeAgo(i.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">None.</p>
                )}
              </Card>
            </div>
            <p className="mt-4 text-[13px] text-muted">Disabling, signing out and other actions on customer accounts come in Phase 3.</p>
          </>
        )}
      </Loaded>
    </>
  );
}

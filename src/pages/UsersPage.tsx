import { useState } from 'react';
import { ArrowLeft, LogOut, MailCheck, ShieldOff, UserCheck, UserX } from 'lucide-react';
import { api, type UserRow } from '../api';
import { Link, navigate, useTitle } from '../router';
import { Alert, Badge, Button, Card, Confirm, PageHeader, cx, fullTime, timeAgo } from '../components/ui';
import { useAdmin } from '../session';
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
            <UserActions user={u} onChanged={state.reload} />
          </>
        )}
      </Loaded>
    </>
  );
}

type Action = 'disable' | 'enable' | 'sign-out' | 'reset-two-step' | 'resend-verification';

const ACTIONS: Record<Action, { title: string; body: string; label: string; done: string; danger?: boolean }> = {
  disable: {
    title: 'Disable this account?',
    body: 'They can’t sign in to any workspace, and every session ends (a Keycloak sign-in can last a few more minutes until its token expires). Their data stays.',
    label: 'Disable account',
    done: 'Account disabled.',
    danger: true,
  },
  enable: { title: 'Enable this account?', body: 'They can sign in again with their usual method.', label: 'Enable account', done: 'Account enabled.' },
  'sign-out': {
    title: 'Sign them out everywhere?',
    body: 'Every session ends; they can sign in again straight away. Useful after a lost device.',
    label: 'Sign out',
    done: 'Signed out everywhere.',
  },
  'reset-two-step': {
    title: 'Reset two-step verification?',
    body: 'Their authenticator app is removed. If a workspace requires two-step verification, they set up a new one at their next sign-in. Only do this once you’re sure it’s really them.',
    label: 'Reset',
    done: 'Two-step verification reset.',
    danger: true,
  },
  'resend-verification': { title: 'Resend the verification email?', body: 'Keycloak emails them a new “verify your email” link.', label: 'Send', done: 'Verification email sent.' },
};

function UserActions({ user, onChanged }: { user: { id: string; isActive: boolean; authProvider: string }; onChanged: () => Promise<void> }) {
  const canAct = useAdmin().role !== 'viewer';
  const [action, setAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  if (!canAct) return null;
  const keycloak = user.authProvider === 'keycloak';
  return (
    <Card className="mt-4 p-5">
      <h3 className="text-[15px] font-bold">Account actions</h3>
      <p className="mt-1 text-sm text-muted">Each one is recorded in the activity log.</p>
      {notice ? (
        <div className="mt-3">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {user.isActive ? (
          <Button size="sm" variant="danger" icon={<UserX className="size-3.5" />} onClick={() => setAction('disable')}>
            Disable account
          </Button>
        ) : (
          <Button size="sm" variant="soft" icon={<UserCheck className="size-3.5" />} onClick={() => setAction('enable')}>
            Enable account
          </Button>
        )}
        <Button size="sm" variant="soft" icon={<LogOut className="size-3.5" />} onClick={() => setAction('sign-out')}>
          Sign out everywhere
        </Button>
        {keycloak ? (
          <>
            <Button size="sm" variant="soft" icon={<ShieldOff className="size-3.5" />} onClick={() => setAction('reset-two-step')}>
              Reset two-step verification
            </Button>
            <Button size="sm" variant="soft" icon={<MailCheck className="size-3.5" />} onClick={() => setAction('resend-verification')}>
              Resend verification email
            </Button>
          </>
        ) : null}
      </div>
      {!keycloak ? <p className="mt-2 text-[13px] text-muted">Two-step verification and email verification apply to Keycloak accounts only.</p> : null}
      {action ? (
        <Confirm
          title={ACTIONS[action].title}
          body={<p>{ACTIONS[action].body}</p>}
          confirmLabel={ACTIONS[action].label}
          danger={ACTIONS[action].danger}
          onConfirm={async () => {
            const res = await api.userAction(user.id, action);
            const kcNote = res.keycloak === 'failed' ? ' Keycloak didn’t answer, so their Keycloak sign-in wasn’t changed: try again.' : '';
            const extra = action === 'reset-two-step' ? ` (${res.removed ?? 0} authenticator${res.removed === 1 ? '' : 's'} removed)` : '';
            setNotice({ tone: res.keycloak === 'failed' ? 'bad' : 'good', text: `${ACTIONS[action].done}${extra}${kcNote}` });
            await onChanged();
          }}
          onClose={() => setAction(null)}
        />
      ) : null}
    </Card>
  );
}

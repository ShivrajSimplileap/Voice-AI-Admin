import { useEffect, useState, type ReactNode } from 'react';
import { Activity, Building2, History, Layers, LayoutGrid, LogOut, Megaphone, Menu, Phone, PhoneCall, Settings, ShieldCheck, UserCog, Users, UsersRound, Wallet, X } from 'lucide-react';
import { api, ROLE_LABEL, type AdminRole } from '../api';
import { Link, usePath } from '../router';
import { useInterval, useLoad } from './data';
import { useAdmin, useSession } from '../session';
import { Badge, cx, Logo } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles: AdminRole[];
}

const ALL: AdminRole[] = ['super_admin', 'admin', 'viewer'];
export const NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: <LayoutGrid className="size-[18px]" />, roles: ALL },
  { to: '/workspaces', label: 'Workspaces', icon: <Building2 className="size-[18px]" />, roles: ALL },
  { to: '/users', label: 'Users', icon: <Users className="size-[18px]" />, roles: ALL },
  { to: '/calls', label: 'Calls', icon: <PhoneCall className="size-[18px]" />, roles: ALL },
  { to: '/numbers', label: 'Phone numbers', icon: <Phone className="size-[18px]" />, roles: ALL },
  { to: '/usage', label: 'Usage and cost', icon: <Wallet className="size-[18px]" />, roles: ALL },
  { to: '/plans', label: 'Plans', icon: <Layers className="size-[18px]" />, roles: ALL },
  { to: '/compliance', label: 'Compliance', icon: <ShieldCheck className="size-[18px]" />, roles: ALL },
  { to: '/announcements', label: 'Announcements', icon: <Megaphone className="size-[18px]" />, roles: ALL },
  { to: '/health', label: 'System health', icon: <Activity className="size-[18px]" />, roles: ALL },
  { to: '/admins', label: 'Admin team', icon: <UsersRound className="size-[18px]" />, roles: ['super_admin'] },
  { to: '/settings', label: 'Platform settings', icon: <Settings className="size-[18px]" />, roles: ALL },
  { to: '/activity', label: 'Activity log', icon: <History className="size-[18px]" />, roles: ['super_admin', 'admin'] },
  { to: '/account', label: 'My account', icon: <UserCog className="size-[18px]" />, roles: ALL },
];

export const roleTone = (role: AdminRole) => (role === 'super_admin' ? 'accent' : role === 'admin' ? 'blue' : 'neutral');

export function Shell({ children }: { children: ReactNode }) {
  const admin = useAdmin();
  const { signOut } = useSession();
  const path = usePath();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => n.roles.includes(admin.role));

  const sidebar = (
    <div className="flex h-full flex-col rounded-3xl bg-surface p-4 shadow-card">
      <div className="px-2 pt-1 pb-6">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1" aria-label="Main">
        {items.map((n) => {
          const active = n.to === '/' ? path === '/' : path.startsWith(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={() => setOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'relative flex h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition',
                active ? 'bg-soft text-ink' : 'text-muted hover:bg-soft/70 hover:text-ink'
              )}
            >
              {active ? <span className="absolute top-3 bottom-3 left-0 w-[3px] rounded-full bg-accent" /> : null}
              {n.icon}
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4 rounded-2xl bg-soft p-3">
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-[13px] font-bold text-white">
            {(admin.name || admin.email).slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{admin.name}</div>
            <div className="truncate text-[12px] text-muted">{admin.email}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Badge tone={roleTone(admin.role)}>{ROLE_LABEL[admin.role]}</Badge>
          <button onClick={() => void signOut()} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold text-ink-2 hover:bg-white">
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:flex lg:gap-6 lg:p-5">
      <aside className="sticky top-5 hidden h-[calc(100dvh-40px)] w-[260px] shrink-0 lg:block">{sidebar}</aside>

      {/* Phones and small tablets: a top bar with a drawer. */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-canvas/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <button onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-full bg-surface shadow-card" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </header>
      {open ? (
        <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-y-3 left-3 w-[min(280px,calc(100vw-24px))]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} className="absolute top-4 right-4 z-10 grid size-9 place-items-center rounded-full hover:bg-soft" aria-label="Close menu">
              <X className="size-4" />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <main className="min-w-0 flex-1 px-4 pt-2 pb-10 lg:px-2 lg:pt-4">
        <MaintenanceBanner />
        <DialingBanner />
        {children}
      </main>
    </div>
  );
}

/** While all dialing is stopped, every page says so. */
function MaintenanceBanner() {
  const state = useLoad(() => api.maintenance(), []);
  useInterval(() => void state.reload(), 30_000);
  useEffect(() => {
    const on = () => void state.reload();
    window.addEventListener('admin:maintenance-changed', on);
    return () => window.removeEventListener('admin:maintenance-changed', on);
  }, [state.reload]);
  if (!state.data?.on) return null;
  return (
    <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ink px-4 py-3 text-sm text-white">
      <span>
        <strong>Maintenance mode is on</strong> · customers see the maintenance screen and no calls go out
        {state.data.by ? <span className="text-white/75"> · by {state.data.by}</span> : null}
      </span>
      <Link to="/settings" className="rounded-full bg-white/15 px-3 py-1 font-semibold hover:bg-white/25">
        Manage
      </Link>
    </div>
  );
}

function DialingBanner() {
  const state = useLoad(() => api.dialing(), []);
  useInterval(() => void state.reload(), 30_000);
  // Changed on the Health page: refresh straight away.
  useEffect(() => {
    const on = () => void state.reload();
    window.addEventListener('admin:dialing-changed', on);
    return () => window.removeEventListener('admin:dialing-changed', on);
  }, [state.reload]);
  if (!state.data?.paused) return null;
  return (
    <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-bad px-4 py-3 text-sm text-white">
      <span>
        <strong>All dialing is stopped</strong>
        {state.data.reason ? ` · ${state.data.reason}` : ''}
        {state.data.by ? <span className="text-white/75"> · by {state.data.by}</span> : null}
      </span>
      <Link to="/health" className="rounded-full bg-white/15 px-3 py-1 font-semibold hover:bg-white/25">
        Manage
      </Link>
    </div>
  );
}

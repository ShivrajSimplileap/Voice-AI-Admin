import { Shell, NAV } from './components/Shell';
import { Card, PageHeader, Spinner } from './components/ui';
import { AccountPage } from './pages/AccountPage';
import { ActivityPage } from './pages/ActivityPage';
import { AdminsPage } from './pages/AdminsPage';
import { AcceptInvitePage, ForgotPasswordPage, LoginPage, ResetPasswordPage } from './pages/AuthPages';
import { OverviewPage } from './pages/OverviewPage';
import { WorkspaceDetailPage, WorkspacesPage } from './pages/WorkspacesPage';
import { UserDetailPage, UsersPage } from './pages/UsersPage';
import { CallDetailPage, CallsPage } from './pages/CallsPage';
import { NumbersPage } from './pages/NumbersPage';
import { HealthPage } from './pages/HealthPage';
import { UsagePage } from './pages/UsagePage';
import { PlansPage } from './pages/PlansPage';
import { Link, match, Redirect, usePath } from './router';
import { SessionProvider, useSession } from './session';

export function App() {
  return (
    <SessionProvider>
      <Routes />
    </SessionProvider>
  );
}

const SIGNED_IN_PAGES: Partial<Record<string, () => React.JSX.Element>> = {
  '/': OverviewPage,
  '/workspaces': WorkspacesPage,
  '/users': UsersPage,
  '/calls': CallsPage,
  '/numbers': NumbersPage,
  '/usage': UsagePage,
  '/plans': PlansPage,
  '/health': HealthPage,
  '/admins': AdminsPage,
  '/activity': ActivityPage,
  '/account': AccountPage,
};

function Routes() {
  const path = usePath();
  const { admin } = useSession();

  // Links from emails work whether or not someone is signed in here.
  const invite = match('/invite/:token', path);
  if (invite) return <AcceptInvitePage key={invite.token} token={invite.token} />;
  const reset = match('/reset-password/:token', path);
  if (reset) return <ResetPasswordPage key={reset.token} token={reset.token} />;

  if (admin === undefined) return <Spinner label="Checking your session…" />;

  if (!admin) {
    if (path === '/login') return <LoginPage />;
    if (path === '/forgot-password') return <ForgotPasswordPage />;
    return <Redirect to="/login" />;
  }
  if (path === '/login' || path === '/forgot-password') return <Redirect to="/" />;

  // Pages for one record (every role may open them).
  const detail = (
    [
      ['/workspaces/:id', (id: string) => <WorkspaceDetailPage key={id} id={id} />],
      ['/users/:id', (id: string) => <UserDetailPage key={id} id={id} />],
      ['/calls/:id', (id: string) => <CallDetailPage key={id} id={id} />],
    ] as const
  )
    .map(([pattern, render]) => {
      const m = match(pattern, path);
      return m ? render(m.id) : null;
    })
    .find(Boolean);
  if (detail) return <Shell>{detail}</Shell>;

  const Page = SIGNED_IN_PAGES[path];
  const allowed = NAV.find((n) => n.to === path)?.roles.includes(admin.role);
  return (
    <Shell>
      {Page && allowed ? (
        <Page />
      ) : (
        <>
          <PageHeader title={Page ? 'Not for your role' : 'Page not found'} />
          <Card className="p-8 text-sm text-muted">
            {Page ? 'Your role can’t open this page.' : 'There’s nothing here.'}{' '}
            <Link to="/" className="font-semibold text-ink hover:text-accent">
              Go to the overview
            </Link>
          </Card>
        </>
      )}
    </Shell>
  );
}

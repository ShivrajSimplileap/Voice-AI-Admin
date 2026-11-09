import { Activity, Building2, Gauge, Phone, PhoneCall, Users } from 'lucide-react';
import { ROLE_LABEL } from '../api';
import { Link, useTitle } from '../router';
import { useAdmin } from '../session';
import { Badge, Card, PageHeader } from '../components/ui';
import { roleTone } from '../components/Shell';

/** The landing page. Platform monitoring arrives in Phase 2; until then it points at what's here. */
const COMING = [
  { icon: <Gauge className="size-5" />, title: 'Platform dashboard', text: 'Calls, minutes, connect rate and trends across every workspace.' },
  { icon: <Building2 className="size-5" />, title: 'Workspaces', text: 'Every customer workspace: members, agents, campaigns, usage.' },
  { icon: <Users className="size-5" />, title: 'Users', text: 'Everyone across workspaces, their roles and last sign-in.' },
  { icon: <PhoneCall className="size-5" />, title: 'Calls monitor', text: 'Live calls, transcripts, recordings and failures.' },
  { icon: <Phone className="size-5" />, title: 'Phone numbers', text: 'Assign the platform’s numbers to workspaces.' },
  { icon: <Activity className="size-5" />, title: 'System health', text: 'Services, background workers and queues.' },
];

export function OverviewPage() {
  useTitle('Overview');
  const admin = useAdmin();
  const firstName = admin.name.split(' ')[0] || admin.name;
  return (
    <>
      <PageHeader
        title={`Hello, ${firstName}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            Signed in as <Badge tone={roleTone(admin.role)}>{ROLE_LABEL[admin.role]}</Badge>
            {admin.role === 'viewer' ? 'You can look at everything here, but not change it.' : null}
          </span>
        }
      />

      {admin.role !== 'viewer' ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          {admin.role === 'super_admin' ? (
            <Link to="/admins" className="block">
              <Card className="h-full p-5 transition hover:-translate-y-0.5">
                <div className="text-[15px] font-bold">Admin team</div>
                <p className="mt-1 text-sm text-muted">Invite admins and viewers, change roles, disable accounts.</p>
              </Card>
            </Link>
          ) : null}
          <Link to="/activity" className="block">
            <Card className="h-full p-5 transition hover:-translate-y-0.5">
              <div className="text-[15px] font-bold">Activity log</div>
              <p className="mt-1 text-sm text-muted">Every sign-in and change made in this portal.</p>
            </Card>
          </Link>
        </div>
      ) : null}

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold">Coming next</h2>
          <Badge tone="blue">Phase 2 · Monitoring</Badge>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {COMING.map((c) => (
            <div key={c.title} className="flex gap-3 rounded-2xl bg-soft p-4">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-navy">{c.icon}</div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{c.title}</div>
                <p className="mt-0.5 text-[13px] text-muted">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

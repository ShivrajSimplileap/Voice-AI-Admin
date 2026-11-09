import { CreditCard, ExternalLink } from 'lucide-react';
import { api, type BillingOverview } from '../api';
import { navigate, useTitle } from '../router';
import { Alert, Badge, PageHeader, fullTime, timeAgo } from '../components/ui';
import { StatTile } from '../components/charts';
import { Loaded, Table, fmtMoney, fmtNum, useLoad, type Column } from '../components/data';
import { SUB_STATUS } from '../components/usage';

type Sub = BillingOverview['subscriptions'][number];
type Pay = BillingOverview['payments'][number];

/** Billing with Razorpay across the platform. Start or cancel it on a workspace's Plan & usage tab. */
export function BillingPage() {
  useTitle('Billing');
  const state = useLoad(() => api.billing(), []);
  const inr = (n: number) => fmtMoney(n, 'INR');

  const subColumns: Column<Sub>[] = [
    { key: 'org', label: 'Workspace', render: (s) => <span className="font-semibold">{s.orgName}</span> },
    { key: 'plan', label: 'Plan', render: (s) => `${s.planName ?? '—'} · ${fmtMoney(s.amount, s.currency)}` },
    {
      key: 'status',
      label: 'Status',
      render: (s) => (
        <span className="inline-flex items-center gap-1.5">
          <Badge tone={SUB_STATUS[s.status]?.tone ?? 'neutral'}>{SUB_STATUS[s.status]?.label ?? s.status}</Badge>
          {s.cancelAtCycleEnd && !s.endedAt ? <Badge>Ends at cycle end</Badge> : null}
        </span>
      ),
    },
    { key: 'next', label: 'Paid until', render: (s) => (s.currentEnd ? fullTime(s.currentEnd) : <span className="text-muted">—</span>) },
    { key: 'email', label: 'Billing email', render: (s) => s.billingEmail ?? <span className="text-muted">—</span> },
    { key: 'created', label: 'Started', render: (s) => <span className="text-muted">{timeAgo(s.createdAt)}</span> },
  ];
  const payColumns: Column<Pay>[] = [
    { key: 'when', label: 'When', render: (p) => <span className="whitespace-nowrap text-muted">{fullTime(p.paidAt)}</span> },
    { key: 'org', label: 'Workspace', render: (p) => p.orgName ?? <span className="text-muted">Unknown</span> },
    { key: 'amount', label: 'Amount', align: 'right', render: (p) => <span className="font-semibold">{fmtMoney(p.amount, p.currency)}</span> },
    {
      key: 'status',
      label: 'Result',
      render: (p) =>
        p.status === 'captured' ? (
          <Badge tone="good">Paid{p.method ? ` · ${p.method}` : ''}</Badge>
        ) : p.status === 'failed' ? (
          <span title={p.failureReason ?? ''}>
            <Badge tone="bad">Failed</Badge>
          </span>
        ) : (
          <Badge>{p.status}</Badge>
        ),
    },
    { key: 'id', label: 'Razorpay payment', render: (p) => <span className="font-mono text-[12px] text-muted">{p.razorpayPaymentId}</span> },
  ];

  return (
    <>
      <PageHeader title="Billing" subtitle="Monthly subscriptions through Razorpay. Start or cancel billing on a workspace’s Plan & usage tab." />
      <Loaded state={state}>
        {(b) => (
          <div className="space-y-6">
            {!b.enabled ? (
              <Alert tone="info">
                Billing isn’t set up on this server. Add <span className="font-mono">RAZORPAY_KEY_ID</span>, <span className="font-mono">RAZORPAY_KEY_SECRET</span> and{' '}
                <span className="font-mono">RAZORPAY_WEBHOOK_SECRET</span> to the backend’s config (test keys first), and point a Razorpay webhook at{' '}
                <span className="font-mono">/api/billing/razorpay/webhook</span>.
              </Alert>
            ) : (
              <>
                {b.testMode ? <Alert tone="info">Razorpay is in test mode: no real money moves. Switch to live keys when you’re ready.</Alert> : null}
                {!b.webhookSecretSet ? <Alert>RAZORPAY_WEBHOOK_SECRET isn’t set, so payments from Razorpay can’t be received. Payments and status changes won’t show here.</Alert> : null}
              </>
            )}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Paying workspaces" value={fmtNum(b.totals.active)} sub={`${fmtNum(b.totals.waiting)} waiting for the customer`} />
              <StatTile label="Monthly recurring" value={inr(b.totals.mrr)} sub="Active subscriptions" />
              <StatTile label="Collected this month" value={inr(b.totals.collectedThisMonth)} sub="Payments received (UTC month)" />
              <StatTile
                label="Needs attention"
                value={fmtNum(b.totals.troubled + b.totals.failedPayments30d)}
                sub={`${fmtNum(b.totals.troubled)} retrying or stopped · ${fmtNum(b.totals.failedPayments30d)} failed payments (30 days)`}
                tone={b.totals.troubled ? 'accent' : undefined}
              />
            </div>
            {b.totals.unmatchedEvents30d ? (
              <Alert>
                {fmtNum(b.totals.unmatchedEvents30d)} Razorpay event{b.totals.unmatchedEvents30d === 1 ? '' : 's'} in the last 30 days didn’t match a subscription here (made outside the portal, or
                for another server).
              </Alert>
            ) : null}
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold">
                <CreditCard className="size-4" /> Subscriptions
              </h2>
              <Table rows={b.subscriptions} columns={subColumns} onRow={(s) => navigate(`/workspaces/${s.orgId}?tab=Plan`)} empty="No subscriptions yet." />
            </div>
            <div>
              <h2 className="mb-3 text-[15px] font-bold">Recent payments</h2>
              <Table rows={b.payments} columns={payColumns} onRow={(p) => (p.orgId ? navigate(`/workspaces/${p.orgId}?tab=Plan`) : undefined)} empty="No payments yet." />
              <p className="mt-2 flex items-center gap-1 px-1 text-[12px] text-muted">
                Invoices and refunds are on the Razorpay dashboard <ExternalLink className="size-3" />
              </p>
            </div>
          </div>
        )}
      </Loaded>
    </>
  );
}

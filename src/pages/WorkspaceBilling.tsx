import { useState } from 'react';
import { Copy, CreditCard, ExternalLink, RefreshCw, XCircle } from 'lucide-react';
import { api, type OrgBilling, type OrgPlan } from '../api';
import { Link } from '../router';
import { useAdmin } from '../session';
import { Alert, Badge, Button, Card, Modal, TextField, fullTime } from '../components/ui';
import { Loaded, fmtMoney, useLoad } from '../components/data';
import { SUB_STATUS } from '../components/usage';

/** A workspace's Razorpay billing, on its Plan & usage tab. Super admins start and cancel it. */
export function WorkspaceBilling({ orgId, plan, onChanged }: { orgId: string; plan: OrgPlan; onChanged: () => Promise<void> }) {
  const state = useLoad(() => api.orgBilling(orgId), [orgId]);
  return <Loaded state={state}>{(b) => <BillingView orgId={orgId} plan={plan} b={b} reload={async () => Promise.all([state.reload(), onChanged()]).then(() => {})} />}</Loaded>;
}

function BillingView({ orgId, plan, b, reload }: { orgId: string; plan: OrgPlan; b: OrgBilling; reload: () => Promise<void> }) {
  const admin = useAdmin();
  const isSuper = admin.role === 'super_admin';
  const [dialog, setDialog] = useState<'start' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const sub = b.current;
  const status = sub ? SUB_STATUS[sub.status] : null;

  async function refresh() {
    setBusy(true);
    setNotice(null);
    try {
      await api.refreshBilling(orgId);
      await reload();
      setNotice({ tone: 'good', text: 'Updated from Razorpay.' });
    } catch (err) {
      setNotice({ tone: 'bad', text: err instanceof Error ? err.message : 'Couldn’t reach Razorpay.' });
    } finally {
      setBusy(false);
    }
  }

  const canStart = b.enabled && !sub && plan.plan && plan.plan.priceMonthly > 0;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-bold">
            <CreditCard className="size-4" /> Billing {b.testMode ? <Badge tone="accent">Test mode</Badge> : null}
          </h3>
          <p className="mt-1 text-sm">
            {sub ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <Badge tone={status?.tone ?? 'neutral'}>{status?.label ?? sub.status}</Badge>
                {fmtMoney(sub.amount, sub.currency)} a month{sub.billingEmail ? ` · ${sub.billingEmail}` : ''}
              </span>
            ) : (
              <span className="text-muted">Not billed through Razorpay.</span>
            )}
          </p>
          {sub?.currentEnd ? (
            <p className="mt-1 text-[13px] text-muted">
              {sub.cancelAtCycleEnd ? 'Ends' : 'Paid until'} {fullTime(sub.currentEnd)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {sub && admin.role !== 'viewer' ? (
            <Button size="sm" variant="ghost" busy={busy} icon={<RefreshCw className="size-3.5" />} onClick={() => void refresh()}>
              Refresh
            </Button>
          ) : null}
          {isSuper && canStart ? (
            <Button size="sm" icon={<CreditCard className="size-3.5" />} onClick={() => setDialog('start')}>
              Start billing
            </Button>
          ) : null}
          {isSuper && sub ? (
            <Button size="sm" variant="danger" icon={<XCircle className="size-3.5" />} onClick={() => setDialog('cancel')}>
              Cancel billing
            </Button>
          ) : null}
        </div>
      </div>

      {notice ? (
        <div className="mt-3">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      ) : null}
      {!b.enabled ? (
        <p className="mt-3 text-[13px] text-muted">
          Billing isn’t set up on this server. <Link to="/billing" className="font-semibold underline">How to set it up</Link>
        </p>
      ) : !sub && plan.plan && plan.plan.priceMonthly <= 0 ? (
        <p className="mt-3 text-[13px] text-muted">This plan is free, so there’s nothing to bill.</p>
      ) : !sub && !plan.plan ? (
        <p className="mt-3 text-[13px] text-muted">Give the workspace a plan first.</p>
      ) : null}

      {sub?.shortUrl && ['created', 'pending', 'halted'].includes(sub.status) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-soft px-3.5 py-2 text-sm">
          <span className="text-muted">Payment link:</span>
          <a href={sub.shortUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold break-all hover:text-accent">
            {sub.shortUrl} <ExternalLink className="size-3.5" />
          </a>
          <button
            onClick={() => void navigator.clipboard?.writeText(sub.shortUrl!).then(() => setNotice({ tone: 'good', text: 'Link copied.' }))}
            className="rounded-full p-1 text-muted hover:bg-white hover:text-ink"
            aria-label="Copy payment link"
          >
            <Copy className="size-3.5" />
          </button>
        </div>
      ) : null}

      {b.payments.length ? (
        <ul className="mt-4 space-y-1.5">
          {b.payments.slice(0, 8).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-soft px-3.5 py-2 text-sm">
              <span className="text-muted">{fullTime(p.paidAt)}</span>
              <span className="flex items-center gap-2">
                {p.status === 'failed' ? (
                  <span title={p.failureReason ?? ''}>
                    <Badge tone="bad">Failed</Badge>
                  </span>
                ) : p.status === 'captured' ? (
                  <Badge tone="good">Paid{p.method ? ` · ${p.method}` : ''}</Badge>
                ) : (
                  <Badge>{p.status}</Badge>
                )}
                <span className="font-semibold tabular-nums">{fmtMoney(p.amount, p.currency)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : sub ? (
        <p className="mt-3 text-[13px] text-muted">No payments yet.</p>
      ) : null}

      {dialog === 'start' && plan.plan ? (
        <StartModal
          orgId={orgId}
          plan={plan}
          onClose={() => setDialog(null)}
          onDone={async () => {
            setDialog(null);
            setNotice({ tone: 'good', text: 'Billing started. Razorpay emails the customer a link to pay; the plan turns active when they do.' });
            await reload();
          }}
        />
      ) : null}
      {dialog === 'cancel' && sub ? (
        <CancelModal
          orgId={orgId}
          neverPaid={sub.status === 'created'}
          onClose={() => setDialog(null)}
          onDone={async (atCycleEnd) => {
            setDialog(null);
            setNotice({ tone: 'good', text: atCycleEnd ? 'Billing ends at the end of this cycle; the workspace stays active until then.' : 'Billing cancelled.' });
            await reload();
          }}
        />
      ) : null}
    </Card>
  );
}

function StartModal({ orgId, plan, onClose, onDone }: { orgId: string; plan: OrgPlan; onClose: () => void; onDone: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badEmail = email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const trial = plan.status === 'trialing' && plan.trialEndsAt ? new Date(plan.trialEndsAt) : null;
  return (
    <Modal
      title="Start billing?"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={busy}
            disabled={badEmail}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.startBilling(orgId, email.trim() || undefined);
                await onDone();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Couldn’t start billing.');
                setBusy(false);
              }
            }}
          >
            Start billing
          </Button>
        </>
      }
    >
      {error ? <Alert>{error}</Alert> : null}
      <p className="text-sm text-ink-2">
        A monthly Razorpay subscription for <strong>{plan.plan?.name}</strong> at <strong>{fmtMoney(plan.plan?.priceMonthly ?? 0, 'INR')}</strong>. Razorpay emails a link where the
        customer pays and sets up the monthly mandate (UPI, card or bank).
        {trial ? ` The first charge is on ${trial.toLocaleDateString()}, when the trial ends.` : ' The first charge is when they pay.'}
      </p>
      <TextField label="Billing email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Blank: the workspace’s owner" error={badEmail ? 'Enter a valid email.' : null} />
    </Modal>
  );
}

function CancelModal({ orgId, neverPaid, onClose, onDone }: { orgId: string; neverPaid: boolean; onClose: () => void; onDone: (atCycleEnd: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = async (atCycleEnd: boolean) => {
    setBusy(atCycleEnd ? 'end' : 'now');
    setError(null);
    try {
      await api.cancelBilling(orgId, atCycleEnd);
      await onDone(atCycleEnd && !neverPaid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t cancel.');
      setBusy(null);
    }
  };
  return (
    <Modal
      title="Cancel billing?"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep billing
          </Button>
          {!neverPaid ? (
            <Button variant="soft" busy={busy === 'end'} disabled={Boolean(busy)} onClick={() => void go(true)}>
              At the end of this cycle
            </Button>
          ) : null}
          <Button variant="danger" busy={busy === 'now'} disabled={Boolean(busy)} onClick={() => void go(false)}>
            {neverPaid ? 'Cancel' : 'Right now'}
          </Button>
        </>
      }
    >
      {error ? <Alert>{error}</Alert> : null}
      <p className="text-sm text-ink-2">
        {neverPaid
          ? 'The customer hasn’t paid yet, so the payment link stops working.'
          : 'Razorpay stops charging. When the subscription ends, the workspace’s plan turns unpaid and its calls pause; mark it active by hand if it should keep calling.'}
      </p>
    </Modal>
  );
}

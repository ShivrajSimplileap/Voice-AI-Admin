import { useState, type FormEvent } from 'react';
import { CalendarPlus, CheckCircle2 } from 'lucide-react';
import { api, type LimitKey, type OrgPlan, type OrgPlanInput, type Plan, type PlanStatus } from '../api';
import { Link } from '../router';
import { useAdmin } from '../session';
import { Alert, Badge, Button, Card, SelectField, TextField, fullTime } from '../components/ui';
import { Loaded, fmtMoney, fmtNum, fmtTokens, useLoad } from '../components/data';
import { KIND_LABEL, LIMITS, Meter, limitText } from '../components/usage';
import { WorkspaceBilling } from './WorkspaceBilling';

/** Phase 4: a workspace's plan, what it uses against its limits, and what it costs this month. */
export function WorkspacePlan({ orgId }: { orgId: string }) {
  const state = useLoad(() => Promise.all([api.orgPlan(orgId), api.plans()]), [orgId]);
  return (
    <Loaded state={state}>
      {([p, plans]) => <PlanView key={JSON.stringify(p)} orgId={orgId} p={p} plans={plans.data} onChanged={state.reload} />}
    </Loaded>
  );
}

function trialBadge(p: OrgPlan) {
  if (!p.plan) return <Badge>No plan</Badge>;
  if (p.status === 'active') return <Badge tone="good">Active</Badge>;
  if (p.status === 'unpaid') return <Badge tone="bad">Unpaid · calls paused</Badge>;
  const ends = p.trialEndsAt ? new Date(p.trialEndsAt) : null;
  if (ends && ends <= new Date()) return <Badge tone="bad">Trial ended</Badge>;
  return <Badge tone="blue">Trial{ends ? ` until ${ends.toLocaleDateString()}` : ''}</Badge>;
}

const dateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
/** The end of the chosen day, in the viewer's timezone. */
const endOfDay = (date: string) => new Date(`${date}T23:59:59`).toISOString();

function PlanView({ orgId, p, plans, onChanged }: { orgId: string; p: OrgPlan; plans: Plan[]; onChanged: () => Promise<void> }) {
  const canEdit = useAdmin().role === 'super_admin';
  const currency = p.cost?.currency ?? 'USD';
  const money = (n: number) => fmtMoney(n, currency);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [planId, setPlanId] = useState(p.plan?.id ?? '');
  const [status, setStatus] = useState<PlanStatus>(p.status ?? 'active');
  const [trialEnd, setTrialEnd] = useState(dateInput(p.trialEndsAt));
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries(LIMITS.filter((l) => l.key !== 'numbers').map((l) => [l.key, p.overrides[l.key] !== undefined ? String(p.overrides[l.key]) : '']))
  );

  const choosable = plans.filter((x) => !x.archived || x.id === p.plan?.id);
  const chosen = plans.find((x) => x.id === planId) ?? null;
  const badOverride = Object.values(overrides).some((v) => v.trim() !== '' && !/^\d+$/.test(v.trim()));
  const needsDate = Boolean(planId) && status === 'trialing' && !trialEnd;

  async function save(body: OrgPlanInput, label: string, done: string) {
    setBusy(label);
    setNotice(null);
    try {
      await api.setOrgPlan(orgId, body);
      setNotice({ tone: 'good', text: done });
      await onChanged();
    } catch (err) {
      setNotice({ tone: 'bad', text: err instanceof Error ? err.message : 'Couldn’t save.' });
      setBusy(null);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (badOverride || needsDate) return;
    void save(
      {
        planId: planId || null,
        status: planId ? status : undefined,
        trialEndsAt: planId && status === 'trialing' ? endOfDay(trialEnd) : null,
        overrides: Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, v.trim() === '' ? null : Number(v)])),
      },
      'save',
      'Plan saved. Its limits apply straight away.'
    );
  }

  const current = { planId: p.plan?.id ?? null, overrides: p.overrides as OrgPlanInput['overrides'] };
  const extend = () => {
    const base = p.trialEndsAt && new Date(p.trialEndsAt) > new Date() ? new Date(p.trialEndsAt) : new Date();
    base.setDate(base.getDate() + 7);
    void save({ ...current, status: 'trialing', trialEndsAt: base.toISOString() }, 'extend', `Trial extended to ${base.toLocaleDateString()}.`);
  };

  const margin = p.plan && p.status === 'active' && p.cost ? p.plan.priceMonthly - p.cost.cost : null;

  return (
    <div className="space-y-4">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-bold">Plan</h3>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{p.plan?.name ?? 'No plan: no limits'}</span>
                {trialBadge(p)}
              </p>
              {p.plan ? <p className="mt-1 text-[13px] text-muted">{money(p.plan.priceMonthly)} a month</p> : null}
            </div>
            {canEdit && p.plan ? (
              <div className="flex flex-wrap gap-2">
                {p.status === 'trialing' ? (
                  <>
                    <Button size="sm" variant="soft" busy={busy === 'extend'} icon={<CalendarPlus className="size-3.5" />} onClick={extend}>
                      Extend trial 7 days
                    </Button>
                    <Button
                      size="sm"
                      busy={busy === 'activate'}
                      icon={<CheckCircle2 className="size-3.5" />}
                      onClick={() => void save({ ...current, status: 'active', trialEndsAt: null }, 'activate', 'Plan marked active.')}
                    >
                      Mark active
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          {canEdit ? (
            <form onSubmit={submit} className="mt-5 space-y-4 border-t border-line/70 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Plan"
                  value={planId}
                  onChange={(v) => {
                    setPlanId(v);
                    const next = plans.find((x) => x.id === v);
                    // A new plan with a trial starts on trial.
                    if (next && next.id !== p.plan?.id && next.trialDays > 0) {
                      setStatus('trialing');
                      const end = new Date();
                      end.setDate(end.getDate() + next.trialDays);
                      setTrialEnd(end.toISOString().slice(0, 10));
                    }
                  }}
                  options={[{ value: '', label: 'No plan (no limits)' }, ...choosable.map((x) => ({ value: x.id, label: `${x.name}${x.archived ? ' (archived)' : ''}` }))]}
                />
                {planId ? (
                  <SelectField
                    label="Status"
                    value={status}
                    onChange={(v) => setStatus(v as PlanStatus)}
                    options={[
                      { value: 'active', label: 'Active (paid)' },
                      { value: 'trialing', label: 'On trial' },
                      { value: 'unpaid', label: 'Unpaid (calls pause)' },
                    ]}
                  />
                ) : null}
              </div>
              {planId && status === 'trialing' ? (
                <TextField label="Trial ends" type="date" value={trialEnd} onChange={(e) => setTrialEnd(e.target.value)} hint="Calls pause at the end of this day until the plan is active." error={needsDate ? 'Pick the day the trial ends.' : null} />
              ) : null}
              <div>
                <p className="text-sm font-semibold">This workspace’s own limits</p>
                <p className="text-[13px] text-muted">
                  Blank uses the plan’s. The free-number limit is on the{' '}
                  <span className="font-semibold">Controls</span> tab.
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {LIMITS.filter((l) => l.key !== 'numbers').map((l) => (
                    <TextField
                      key={l.key}
                      label={l.label + (l.unit ? ` (${l.unit})` : '')}
                      type="number"
                      min={0}
                      placeholder={chosen ? `Plan: ${limitText(chosen.limits[l.key])}` : 'Unlimited'}
                      value={overrides[l.key]}
                      onChange={(e) => setOverrides({ ...overrides, [l.key]: e.target.value })}
                    />
                  ))}
                </div>
                {badOverride ? <p className="mt-2 text-[13px] text-bad">Limits are whole numbers.</p> : null}
              </div>
              <div className="flex justify-end">
                <Button type="submit" busy={busy === 'save'} disabled={badOverride || needsDate}>
                  Save plan
                </Button>
              </div>
            </form>
          ) : (
            <p className="mt-4 text-[13px] text-muted">Only super admins can change a workspace’s plan.</p>
          )}
        </Card>

        <div className="space-y-4">
          <WorkspaceBilling orgId={orgId} plan={p} onChanged={onChanged} />
          <Card className="p-5">
            <h3 className="text-[15px] font-bold">Use against limits</h3>
            <p className="mt-1 text-[13px] text-muted">Minutes count this calendar month in the workspace’s timezone.</p>
            <ul className="mt-4 space-y-3">
              {LIMITS.map((l) => (
                <li key={l.key} className="grid grid-cols-[1fr_auto] items-center gap-4">
                  <span className="text-sm">
                    {l.label}
                    {p.overrides[l.key as Exclude<LimitKey, 'numbers'>] !== undefined ? <Badge tone="blue">custom</Badge> : null}
                  </span>
                  <Meter used={p.usage[l.key]} limit={p.limits[l.key]} unit={l.unit} />
                </li>
              ))}
            </ul>
          </Card>

          {p.cost ? (
            <Card className="p-5">
              <h3 className="text-[15px] font-bold">Cost this month</h3>
              <p className="mt-1 text-[13px] text-muted">Since {fullTime(p.cost.from)}, at the current rates.</p>
              <dl className="mt-3 space-y-2 text-sm">
                {(
                  [
                    ['Phone', `${fmtNum(p.cost.minutes)} min · ${fmtNum(p.cost.calls)} calls`, p.cost.phoneCost],
                    ...p.cost.byKind.map((k) => [KIND_LABEL[k.kind] ?? k.kind, `${fmtTokens(k.total)} tokens`, k.cost] as [string, string, number]),
                    ['Number rental', '', p.cost.numbersCost],
                  ] as [string, string, number][]
                ).map(([k, detail, v]) => (
                  <div key={k} className="flex justify-between gap-4 rounded-xl bg-soft px-3.5 py-2">
                    <dt>
                      {k}
                      {detail ? <span className="ml-2 text-[12px] text-muted">{detail}</span> : null}
                    </dt>
                    <dd className="font-semibold tabular-nums">{money(v)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4 px-3.5 pt-1">
                  <dt className="font-bold">Total</dt>
                  <dd className="font-bold tabular-nums">{money(p.cost.cost)}</dd>
                </div>
                {margin !== null ? (
                  <div className="flex justify-between gap-4 px-3.5">
                    <dt className="text-muted">Plan price minus cost</dt>
                    <dd className={`font-semibold tabular-nums ${margin < 0 ? 'text-bad' : ''}`}>{margin < 0 ? `−${money(-margin)}` : money(margin)}</dd>
                  </div>
                ) : null}
              </dl>
              <Link to="/usage" className="mt-3 inline-block text-[13px] font-semibold text-ink-2 hover:text-accent">
                All workspaces’ usage →
              </Link>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

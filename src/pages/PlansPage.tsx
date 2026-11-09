import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Archive, ArchiveRestore, Check, Pencil, Plus, Star } from 'lucide-react';
import { api, type LimitKey, type Plan, type PlanInput } from '../api';
import { useTitle } from '../router';
import { useAdmin } from '../session';
import { Alert, Badge, Button, Card, Confirm, Modal, PageHeader, TextField, Toggle, cx } from '../components/ui';
import { Loaded, fmtMoney, fmtNum, useLoad } from '../components/data';
import { LIMITS, limitText } from '../components/usage';

export function PlansPage() {
  useTitle('Plans');
  const canEdit = useAdmin().role === 'super_admin';
  const state = useLoad(() => Promise.all([api.plans(), api.rates()]), []);
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [archiving, setArchiving] = useState<Plan | null>(null);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  return (
    <>
      <PageHeader
        title="Plans"
        subtitle="What each plan costs and allows. Assign a plan on a workspace’s Plan & usage tab."
        actions={
          canEdit ? (
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              New plan
            </Button>
          ) : null
        }
      />
      {notice ? (
        <div className="mb-4">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      ) : null}
      <Loaded state={state}>
        {([{ data, unplanned }, rates]) => {
          const money = (n: number) => fmtMoney(n, rates.currency);
          return (
            <>
              {!data.length ? (
                <Card className="p-8 text-center">
                  <p className="font-semibold">No plans yet</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                    Without a plan a workspace has no limits. Create plans, mark one as the default for new sign-ups, and assign plans to existing workspaces.
                  </p>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {data.map((p) => (
                    <Card key={p.id} className={cx('flex flex-col p-5', p.archived && 'opacity-70')}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="flex flex-wrap items-center gap-2 text-[17px] font-bold">
                            {p.name}
                            {p.isDefault ? (
                              <Badge tone="accent">
                                <Star className="mr-1 inline size-3" />
                                Default
                              </Badge>
                            ) : null}
                            {p.isPublic && !p.archived ? <Badge tone="good">In the CRM</Badge> : null}
                            {p.archived ? <Badge>Archived</Badge> : null}
                          </h3>
                          {p.description ? <p className="mt-1 text-sm text-muted">{p.description}</p> : null}
                        </div>
                        <div className="text-right">
                          <div className="text-[20px] font-bold tabular-nums">{money(p.priceMonthly)}</div>
                          <div className="text-[12px] text-muted">a month</div>
                        </div>
                      </div>
                      <dl className="mt-4 space-y-1.5 text-sm">
                        {LIMITS.map((l) => (
                          <div key={l.key} className="flex justify-between gap-3">
                            <dt className="text-muted">{l.label}</dt>
                            <dd className="font-semibold tabular-nums">{limitText(p.limits[l.key], l.unit)}</dd>
                          </div>
                        ))}
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted">Free trial</dt>
                          <dd className="font-semibold">{p.trialDays ? `${p.trialDays} days` : 'None'}</dd>
                        </div>
                      </dl>
                      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line/70 pt-3">
                        <span className="text-[13px] text-muted">
                          {fmtNum(p.workspaces)} workspace{p.workspaces === 1 ? '' : 's'}
                          {p.trialing ? ` · ${fmtNum(p.trialing)} on trial` : ''}
                        </span>
                        {canEdit ? (
                          <span className="flex gap-1">
                            {!p.archived ? (
                              <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(p)}>
                                Edit
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={p.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                              onClick={() => setArchiving(p)}
                            >
                              {p.archived ? 'Restore' : 'Archive'}
                            </Button>
                          </span>
                        ) : null}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
              <p className="mt-4 px-1 text-[13px] text-muted">
                {fmtNum(unplanned)} workspace{unplanned === 1 ? ' has' : 's have'} no plan (no limits).
              </p>
            </>
          );
        }}
      </Loaded>

      {editing ? (
        <PlanModal
          plan={editing === 'new' ? null : editing}
          currency={state.data?.[1].currency ?? 'USD'}
          onClose={() => setEditing(null)}
          onSaved={async (name, created) => {
            setEditing(null);
            setNotice({ tone: 'good', text: created ? `Plan “${name}” created.` : `Plan “${name}” saved. Workspaces on it get the new limits straight away.` });
            await state.reload();
          }}
        />
      ) : null}
      {archiving ? (
        <Confirm
          title={archiving.archived ? `Restore “${archiving.name}”?` : `Archive “${archiving.name}”?`}
          body={
            <p>
              {archiving.archived
                ? 'It can be picked for workspaces again.'
                : `It can’t be picked any more${archiving.isDefault ? ' and stops being the default, so new workspaces start with no plan' : ''}. The ${fmtNum(archiving.workspaces)} workspace${archiving.workspaces === 1 ? '' : 's'} on it keep it.`}
            </p>
          }
          confirmLabel={archiving.archived ? 'Restore' : 'Archive'}
          onConfirm={async () => {
            await api.archivePlan(archiving.id, !archiving.archived);
            setNotice({ tone: 'good', text: archiving.archived ? 'Plan restored.' : 'Plan archived.' });
            await state.reload();
          }}
          onClose={() => setArchiving(null)}
        />
      ) : null}
    </>
  );
}

type Draft = { name: string; description: string; price: string; trialDays: string; isDefault: boolean; isPublic: boolean; limits: Record<LimitKey, string> };

const toDraft = (p: Plan | null): Draft => ({
  name: p?.name ?? '',
  description: p?.description ?? '',
  price: p ? String(p.priceMonthly) : '',
  trialDays: p ? String(p.trialDays) : '0',
  isDefault: p?.isDefault ?? false,
  isPublic: p?.isPublic ?? false,
  limits: Object.fromEntries(LIMITS.map((l) => [l.key, p?.limits[l.key] !== undefined ? String(p.limits[l.key]) : ''])) as Record<LimitKey, string>,
});

const whole = (v: string) => /^\d+$/.test(v.trim());

/** Currency symbol for the price field ("$", "₹"), else the code. */
function currencySymbol(currency: string) {
  try {
    return (
      new Intl.NumberFormat('en-IN', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency
    );
  } catch {
    return currency;
  }
}

/** An input with a fixed bit of text before or after it (currency, "days", "min"). */
function AffixField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  error,
  hint,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-semibold text-ink-2">
        {label}
      </label>
      <div
        className={cx(
          'flex h-11 items-center rounded-2xl bg-soft ring-1 ring-transparent transition focus-within:bg-white focus-within:ring-blue/60',
          error && 'ring-bad/60'
        )}
      >
        {prefix ? <span className="pl-4 text-sm font-semibold text-muted">{prefix}</span> : null}
        <input
          id={id}
          inputMode="decimal"
          value={value}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error) || undefined}
          className={cx('h-full min-w-0 flex-1 bg-transparent text-sm text-ink tabular-nums outline-none placeholder:text-muted-2', prefix ? 'pl-1.5' : 'pl-4', suffix ? 'pr-1.5' : 'pr-4')}
        />
        {suffix ? <span className="pr-4 text-[13px] text-muted">{suffix}</span> : null}
      </div>
      {error ? <p className="text-[13px] text-bad">{error}</p> : hint ? <p className="text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

/** How each limit reads to customers (as in the CRM). */
const PREVIEW_TEXT: Record<LimitKey, (n: number) => string> = {
  minutesPerMonth: (n) => `${fmtNum(n)} call minutes a month`,
  seats: (n) => `${fmtNum(n)} member${n === 1 ? '' : 's'}`,
  numbers: (n) => `${fmtNum(n)} phone number${n === 1 ? '' : 's'}`,
  agents: (n) => `${fmtNum(n)} agent${n === 1 ? '' : 's'}`,
  activeCampaigns: (n) => `${fmtNum(n)} running campaign${n === 1 ? '' : 's'}`,
  storageMb: (n) => `${fmtNum(n)} MB of knowledge files`,
};

const LIMIT_SUFFIX: Partial<Record<LimitKey, string>> = { minutesPerMonth: 'min / month', storageMb: 'MB' };

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-[13px] font-bold tracking-wide text-ink uppercase">{title}</h3>
        {hint ? <p className="text-[13px] text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function PlanModal({ plan, currency, onClose, onSaved }: { plan: Plan | null; currency: string; onClose: () => void; onSaved: (name: string, created: boolean) => Promise<void> }) {
  const [d, setD] = useState<Draft>(() => toDraft(plan));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const price = Number(d.price);
  const errors = {
    name: d.name.trim().length < 2 ? 'Give the plan a name.' : null,
    price: d.price.trim() === '' || !Number.isFinite(price) || price < 0 ? 'Enter a price (0 for free).' : null,
    trialDays: !whole(d.trialDays) || Number(d.trialDays) > 365 ? 'Whole days, up to 365.' : null,
    limits: LIMITS.some((l) => d.limits[l.key].trim() !== '' && !whole(d.limits[l.key])) ? 'Limits are whole numbers; leave blank for unlimited.' : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const show = (e: string | null) => (touched ? e : null);
  const setLimit = (key: LimitKey, v: string) => setD({ ...d, limits: { ...d.limits, [key]: v.replace(/[^\d]/g, '') } });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;
    setBusy(true);
    setError(null);
    const body: PlanInput = {
      name: d.name.trim(),
      description: d.description.trim(),
      priceMonthly: price,
      trialDays: Number(d.trialDays),
      isDefault: d.isDefault,
      isPublic: d.isPublic,
      limits: Object.fromEntries(LIMITS.map((l) => [l.key, d.limits[l.key].trim() === '' ? null : Number(d.limits[l.key])])),
    };
    try {
      if (plan) await api.updatePlan(plan.id, body);
      else await api.createPlan(body);
      await onSaved(body.name, !plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save.');
      setBusy(false);
    }
  }

  // What customers see in the CRM (Settings → Plan & billing).
  const previewLimits = LIMITS.filter((l) => d.limits[l.key].trim() !== '' && whole(d.limits[l.key]));
  const priceText = d.price.trim() !== '' && Number.isFinite(price) ? fmtMoney(price, currency) : fmtMoney(0, currency);

  return (
    <Modal
      size="xl"
      title={plan ? `Edit ${plan.name}` : 'New plan'}
      subtitle={plan ? 'Changes apply straight away to every workspace on this plan.' : 'What it costs and what it allows each month.'}
      onClose={onClose}
      footer={
        <>
          {touched && invalid ? <span className="mr-auto text-[13px] text-bad">Fix the highlighted fields.</span> : null}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="plan-form" busy={busy}>
            {plan ? 'Save changes' : 'Create plan'}
          </Button>
        </>
      }
    >
      <form id="plan-form" onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          {error ? <Alert>{error}</Alert> : null}

          <Section title="Plan">
            <TextField label="Name" value={d.name} maxLength={60} placeholder="e.g. Starter" autoFocus={!plan} onChange={(e) => setD({ ...d, name: e.target.value })} error={show(errors.name)} />
            <div className="space-y-1.5">
              <label htmlFor="plan-description" className="block text-[13px] font-semibold text-ink-2">
                Description <span className="font-normal text-muted">(optional)</span>
              </label>
              <textarea
                id="plan-description"
                value={d.description}
                maxLength={300}
                rows={2}
                placeholder="One line customers see under the name, e.g. For small teams getting started."
                onChange={(e) => setD({ ...d, description: e.target.value })}
                className="w-full resize-none rounded-2xl bg-soft px-4 py-3 text-sm text-ink outline-none ring-1 ring-transparent transition placeholder:text-muted-2 focus:bg-white focus:ring-blue/60"
              />
            </div>
          </Section>

          <Section title="Price">
            <div className="grid gap-3 sm:grid-cols-2">
              <AffixField label="Price per month" prefix={currencySymbol(currency)} suffix={currency} placeholder="0.00" value={d.price} onChange={(v) => setD({ ...d, price: v.replace(/[^\d.]/g, '') })} error={show(errors.price)} />
              <AffixField label="Free trial" suffix="days" placeholder="0" value={d.trialDays} onChange={(v) => setD({ ...d, trialDays: v.replace(/[^\d]/g, '') })} error={show(errors.trialDays)} hint="0 for no trial." />
            </div>
          </Section>

          <Section title="Limits" hint="Leave a field blank for unlimited.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {LIMITS.map((l) => (
                <AffixField key={l.key} label={l.label} placeholder="Unlimited" suffix={d.limits[l.key] ? LIMIT_SUFFIX[l.key] : undefined} value={d.limits[l.key]} onChange={(v) => setLimit(l.key, v)} />
              ))}
            </div>
            {touched && errors.limits ? <p className="text-[13px] text-bad">{errors.limits}</p> : null}
          </Section>

          <Section title="Who gets it">
            <div className="grid gap-3 md:grid-cols-2">
              <Toggle label="Offer in the CRM" hint="Owners and admins can subscribe and pay through Razorpay themselves." checked={d.isPublic} onChange={(v) => setD({ ...d, isPublic: v })} />
              <Toggle label="Default for new workspaces" hint="New sign-ups start on it (on trial if it has one). Only one plan can be the default." checked={d.isDefault} onChange={(v) => setD({ ...d, isDefault: v })} />
            </div>
          </Section>
        </div>

        <aside className="lg:sticky lg:top-0 lg:self-start">
          <p className="mb-2 text-[12px] font-semibold tracking-wide text-muted uppercase">{d.isPublic ? 'Preview in the CRM' : 'Preview'}</p>
          <div className="rounded-3xl border border-line bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold">{d.name.trim() || 'Plan name'}</p>
                {d.description.trim() ? <p className="mt-0.5 text-[13px] text-muted">{d.description.trim()}</p> : null}
              </div>
            </div>
            <p className="mt-3">
              <span className="text-[26px] leading-none font-bold tabular-nums">{priceText}</span>
              <span className="text-[13px] text-muted"> / month</span>
            </p>
            {Number(d.trialDays) > 0 ? <p className="mt-1 text-[12px] font-semibold text-good">{d.trialDays}-day free trial</p> : null}
            <ul className="mt-4 space-y-1.5">
              {previewLimits.length ? (
                previewLimits.map((l) => (
                  <li key={l.key} className="flex items-center gap-2 text-[13px]">
                    <Check className="size-3.5 shrink-0 text-good" />
                    {PREVIEW_TEXT[l.key](Number(d.limits[l.key]))}
                  </li>
                ))
              ) : (
                <li className="flex items-center gap-2 text-[13px] text-muted">
                  <Check className="size-3.5 shrink-0 text-good" /> No limits
                </li>
              )}
            </ul>
            <div className="mt-5 rounded-full bg-ink py-2.5 text-center text-[13px] font-semibold text-white">Subscribe for {priceText}/month</div>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            {d.isPublic ? 'Customers see this under Settings → Plan & billing.' : 'Turn on “Offer in the CRM” for customers to see it.'}
          </p>
        </aside>
      </form>
    </Modal>
  );
}

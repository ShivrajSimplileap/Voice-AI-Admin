import { useState, type FormEvent } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus, Star } from 'lucide-react';
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

type Draft = { name: string; description: string; price: string; trialDays: string; isDefault: boolean; limits: Record<LimitKey, string> };

const toDraft = (p: Plan | null): Draft => ({
  name: p?.name ?? '',
  description: p?.description ?? '',
  price: p ? String(p.priceMonthly) : '',
  trialDays: p ? String(p.trialDays) : '0',
  isDefault: p?.isDefault ?? false,
  limits: Object.fromEntries(LIMITS.map((l) => [l.key, p?.limits[l.key] !== undefined ? String(p.limits[l.key]) : ''])) as Record<LimitKey, string>,
});

const whole = (v: string) => /^\d+$/.test(v.trim());

function PlanModal({ plan, currency, onClose, onSaved }: { plan: Plan | null; currency: string; onClose: () => void; onSaved: (name: string, created: boolean) => Promise<void> }) {
  const [d, setD] = useState<Draft>(() => toDraft(plan));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = Number(d.price);
  const errors = {
    name: d.name.trim().length < 2 ? 'Give the plan a name.' : null,
    price: d.price.trim() === '' || !Number.isFinite(price) || price < 0 ? 'Enter a price (0 for free).' : null,
    trialDays: !whole(d.trialDays) || Number(d.trialDays) > 365 ? 'Whole days, up to 365.' : null,
    limits: LIMITS.some((l) => d.limits[l.key].trim() !== '' && !whole(d.limits[l.key])) ? 'Limits are whole numbers; leave blank for unlimited.' : null,
  };
  const invalid = Object.values(errors).some(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    setError(null);
    const body: PlanInput = {
      name: d.name.trim(),
      description: d.description.trim(),
      priceMonthly: price,
      trialDays: Number(d.trialDays),
      isDefault: d.isDefault,
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

  return (
    <Modal
      title={plan ? `Edit ${plan.name}` : 'New plan'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="plan-form" busy={busy} disabled={invalid}>
            {plan ? 'Save' : 'Create plan'}
          </Button>
        </>
      }
    >
      <form id="plan-form" onSubmit={submit} className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
        {error ? <Alert>{error}</Alert> : null}
        <TextField label="Name" value={d.name} maxLength={60} onChange={(e) => setD({ ...d, name: e.target.value })} error={d.name && errors.name} />
        <TextField label="Description (optional)" value={d.description} maxLength={300} onChange={(e) => setD({ ...d, description: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label={`Price a month (${currency})`} type="number" min={0} step="any" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} error={d.price && errors.price} />
          <TextField label="Free trial (days)" type="number" min={0} max={365} value={d.trialDays} onChange={(e) => setD({ ...d, trialDays: e.target.value })} error={errors.trialDays} hint="0 for none" />
        </div>
        <div>
          <p className="text-sm font-semibold">Limits</p>
          <p className="text-[13px] text-muted">Leave blank for unlimited.</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {LIMITS.map((l) => (
              <TextField
                key={l.key}
                label={l.label + (l.unit ? ` (${l.unit})` : '')}
                type="number"
                min={0}
                placeholder="Unlimited"
                value={d.limits[l.key]}
                onChange={(e) => setD({ ...d, limits: { ...d.limits, [l.key]: e.target.value } })}
              />
            ))}
          </div>
          {errors.limits ? <p className="mt-2 text-[13px] text-bad">{errors.limits}</p> : null}
        </div>
        <Toggle label="Default for new workspaces" hint="New sign-ups start on this plan (on trial when it has one). Only one plan can be the default." checked={d.isDefault} onChange={(v) => setD({ ...d, isDefault: v })} />
      </form>
    </Modal>
  );
}

import { useMemo, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { api, type NumberProvider, type NumberSelling, type PhoneAccount, type PlatformNumber } from '../api';
import { useTitle } from '../router';
import { useAdmin } from '../session';
import { Alert, Badge, Button, Card, Confirm, Modal, PageHeader, SelectField, TextField, Toggle } from '../components/ui';
import { FilterBar, FilterSelect, fmtMoney, Loaded, SearchBox, Table, useLoad, useQueryState, type Column } from '../components/data';

/** The platform's phone numbers and which workspace each belongs to. */
export function NumbersPage() {
  useTitle('Phone numbers');
  const admin = useAdmin();
  const canAct = admin.role !== 'viewer';
  const [f, set] = useQueryState({ q: '', provider: '', orgId: '' });
  const state = useLoad(() => api.numbers(), []);
  const orgs = useLoad(() => api.orgOptions(), []);
  const [adding, setAdding] = useState(false);
  const [move, setMove] = useState<{ number: PlatformNumber; orgId: string | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const orgList = orgs.data?.data ?? [];
  const orgName = (id: string | null) => (id ? (orgList.find((o) => o.id === id)?.name ?? 'that workspace') : 'no workspace');

  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return (state.data?.data ?? []).filter(
      (n) =>
        (!q || n.number.includes(q) || n.label.toLowerCase().includes(q) || (n.org?.name.toLowerCase().includes(q) ?? false)) &&
        (!f.provider || n.provider === f.provider) &&
        (!f.orgId || (f.orgId === 'none' ? !n.org : n.org?.id === f.orgId))
    );
  }, [state.data, f.q, f.provider, f.orgId]);
  const providers = [...new Set((state.data?.data ?? []).map((n) => n.provider))].sort();

  const columns: Column<PlatformNumber>[] = [
    { key: 'number', label: 'Number', render: (n) => <span className="font-semibold tabular-nums">{n.number}</span> },
    { key: 'label', label: 'Label', render: (n) => n.label || '—' },
    { key: 'provider', label: 'Provider', render: (n) => <Badge>{n.provider}</Badge> },
    { key: 'country', label: 'Country', render: (n) => n.country || '—' },
    {
      key: 'org',
      label: 'Workspace',
      render: (n) =>
        canAct && n.source === 'platform' ? (
          <select
            aria-label={`Workspace of ${n.number}`}
            value={n.org?.id ?? ''}
            onChange={(e) => setMove({ number: n, orgId: e.target.value || null })}
            className="h-9 w-full max-w-[240px] rounded-full bg-soft px-3 text-[13px] font-semibold outline-none focus:ring-2 focus:ring-blue/50"
          >
            <option value="">Free (no workspace)</option>
            {orgList.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : n.org ? (
          n.org.name
        ) : (
          <Badge tone="blue">Free</Badge>
        ),
    },
    { key: 'agent', label: 'Answering agent', render: (n) => n.agentName ?? '—' },
    {
      key: 'source',
      label: 'Source',
      render: (n) =>
        n.source === 'purchased' ? (
          <span className="whitespace-nowrap">
            <Badge tone="good">Bought</Badge>
            <span className="ml-1.5 text-[12px] text-muted">{n.monthlyPrice !== null ? `${n.monthlyPrice}/mo` : ''}</span>
          </span>
        ) : n.source === 'imported' ? (
          <span className="whitespace-nowrap">
            <Badge tone="blue">Imported</Badge>
            <span className="ml-1.5 text-[12px] text-muted">their own account</span>
          </span>
        ) : (
          <span className="text-muted">Added here</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Phone numbers"
        subtitle="Numbers on the platform’s Vobiz account: ones you add (each workspace’s plan includes one, picked from the free ones) and ones workspaces buy themselves."
        actions={
          canAct ? (
            <Button variant="accent" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Add number
            </Button>
          ) : null
        }
      />
      {notice ? (
        <div className="mb-4">
          <Alert tone="good">{notice}</Alert>
        </div>
      ) : null}
      <PhoneAccountCard />
      <SellingCard />
      <FilterBar>
        <SearchBox value={f.q} onChange={(q) => set({ q })} placeholder="Search number, label or workspace" />
        <FilterSelect label="Provider" value={f.provider} onChange={(provider) => set({ provider })} options={[{ value: '', label: 'All providers' }, ...providers.map((p) => ({ value: p, label: p }))]} />
        <FilterSelect
          label="Workspace"
          value={f.orgId}
          onChange={(orgId) => set({ orgId })}
          options={[{ value: '', label: 'Any workspace' }, { value: 'none', label: 'Free numbers' }, ...orgList.map((o) => ({ value: o.id, label: o.name }))]}
        />
      </FilterBar>
      <Loaded state={state}>{() => <Table rows={rows} columns={columns} empty={state.data?.data.length ? 'No number matches.' : 'No numbers yet. Add the ones bought on the provider’s account.'} />}</Loaded>

      {adding ? (
        <AddNumberModal
          orgs={orgList}
          onClose={() => setAdding(false)}
          onAdded={(data, number) => {
            state.setData({ data });
            setAdding(false);
            setNotice(`${number} added.`);
          }}
        />
      ) : null}
      {move ? (
        <Confirm
          title="Move this number?"
          body={
            <>
              <p>
                <strong>{move.number.number}</strong> goes from <strong>{move.number.org?.name ?? 'no workspace'}</strong> to <strong>{orgName(move.orgId)}</strong>.
              </p>
              {move.number.org ? <p className="mt-2 text-muted">In {move.number.org.name} its answering agent is cleared, and campaigns using it as caller ID lose it.</p> : null}
            </>
          }
          confirmLabel="Move number"
          onConfirm={async () => {
            state.setData(await api.assignNumber(move.number.id, move.orgId));
            setNotice(`${move.number.number} moved to ${orgName(move.orgId)}.`);
          }}
          onClose={() => setMove(null)}
        />
      ) : null}
    </>
  );
}

function AddNumberModal({ orgs, onClose, onAdded }: { orgs: { id: string; name: string }[]; onClose: () => void; onAdded: (data: PlatformNumber[], number: string) => void }) {
  const [provider, setProvider] = useState('vobiz');
  const [number, setNumber] = useState('+91');
  const [label, setLabel] = useState('');
  const [orgId, setOrgId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.addNumber({ provider, number: number.replace(/\s/g, ''), label, orgId: orgId || null });
      onAdded(res.data, number);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t add the number.');
      setBusy(false);
    }
  }

  return (
    <Modal title="Add a phone number" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert tone="info">Buy the number on the Vobiz account first and attach it to the “Voice-AI” application (or run the set-up command with --number). This only records it here.</Alert>
        {error ? <Alert>{error}</Alert> : null}
        <SelectField label="Provider" value={provider} onChange={setProvider} options={[{ value: 'vobiz', label: 'Vobiz' }]} />
        <TextField label="Number" value={number} onChange={(e) => setNumber(e.target.value)} hint="With country code, e.g. +918071234567" required inputMode="tel" />
        <TextField label="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="e.g. Sales line" />
        <SelectField label="Workspace" value={orgId} onChange={setOrgId} options={[{ value: '', label: 'Free (no workspace yet)' }, ...orgs.map((o) => ({ value: o.id, label: o.name }))]} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Add number
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const COUNTRY_HINT = 'Two-letter codes, comma-separated (e.g. US, GB, CA). Blank: the CRM offers US, GB, CA, AU, SG and IN.';
const TYPE_LABEL: Record<string, string> = { local: 'Local', mobile: 'Mobile', tollfree: 'Toll-free' };

/** The platform's Vobiz account: balance, capacity, KYC, recent transactions and the low-balance alert level. */
function PhoneAccountCard() {
  const state = useLoad(() => api.phoneAccount(), []);
  return <Loaded state={state}>{(a) => <PhoneAccountView key={String(a.settings.lowBalanceThreshold)} account={a} onSaved={state.reload} />}</Loaded>;
}

function PhoneAccountView({ account: a, onSaved }: { account: PhoneAccount; onSaved: () => Promise<void> }) {
  const canEdit = useAdmin().role === 'super_admin';
  const [threshold, setThreshold] = useState(a.settings.lowBalanceThreshold === null ? '' : String(a.settings.lowBalanceThreshold));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const bad = threshold.trim() !== '' && !/^\d+(\.\d{1,2})?$/.test(threshold.trim());

  if (!a.configured) {
    return (
      <Card className="mb-4 p-5">
        <h3 className="text-[15px] font-bold">Vobiz account</h3>
        <p className="mt-1 text-sm text-muted">Not set up: add VOBIZ_AUTH_ID and VOBIZ_AUTH_TOKEN to the backend.</p>
      </Card>
    );
  }
  const money = (n: number | null) => (n === null ? '—' : fmtMoney(n, a.currency));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.setPhoneAccount({ lowBalanceThreshold: threshold.trim() === '' ? null : Number(threshold) });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save.');
      setBusy(false);
    }
  }

  const tx = showAll ? a.transactions : a.transactions.slice(0, 5);
  return (
    <Card className="mb-4 p-5">
      <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-bold">
        Vobiz account
        {a.verified === true ? <Badge tone="good">KYC verified</Badge> : a.verified === false ? <Badge tone="bad">KYC pending</Badge> : null}
        {a.trial ? <Badge tone="accent">Trial</Badge> : null}
        {a.low ? <Badge tone="bad">Low balance</Badge> : null}
      </h3>
      {!a.reachable ? (
        <div className="mt-3">
          <Alert>Couldn’t reach Vobiz with the keys on the backend.</Alert>
        </div>
      ) : null}
      {a.low ? (
        <div className="mt-3">
          <Alert>
            The available balance is below {money(a.threshold)}. When it runs out, calls stop and numbers can’t be bought. Top up in the Vobiz console.
            {a.alertedAt ? ' Admins were emailed.' : ''}
          </Alert>
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Available balance" value={money(a.available)} hint={a.balance !== a.available ? `Balance ${money(a.balance)}` : a.postpaid ? 'Postpaid' : undefined} />
        <Stat label="Alert below" value={money(a.threshold)} hint={a.settings.lowBalanceThreshold === null ? 'Vobiz’s own level' : 'Set here'} />
        <Stat
          label="Calls right now"
          value={a.concurrent.now === null ? '—' : `${a.concurrent.now}${a.concurrent.max ? ` of ${a.concurrent.max}` : ''}`}
          hint={a.concurrent.utilization === null ? undefined : `${a.concurrent.utilization}% of capacity`}
        />
        <Stat label="New calls per second" value={a.callsPerSecond === null ? '—' : String(a.callsPerSecond)} hint="Vobiz’s limit for this account" />
      </div>

      <div className="mt-5">
        <p className="mb-2 text-[13px] font-semibold text-ink-2">Recent transactions</p>
        {a.transactions.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <tbody className="divide-y divide-line">
                {tx.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 pr-3 text-muted tabular-nums">{new Date(t.at).toLocaleString()}</td>
                    <td className="py-2 pr-3">{t.description || t.kind || t.type}</td>
                    <td className="py-2 pr-3 text-muted">{t.kind}</td>
                    <td className={`py-2 text-right font-semibold tabular-nums ${t.type === 'credit' ? 'text-good' : ''}`}>
                      {t.type === 'credit' ? '+' : '−'}
                      {fmtMoney(Math.abs(t.amount), t.currency || a.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {a.transactions.length > 5 ? (
              <button type="button" className="mt-2 text-sm font-semibold underline" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Show fewer' : `Show all ${a.transactions.length}`}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">No transactions yet.</p>
        )}
      </div>

      {canEdit ? (
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div className="w-full max-w-xs">
            <TextField
              label={`Email admins when the balance drops below (${a.currency})`}
              value={threshold}
              inputMode="decimal"
              placeholder={a.vobizThreshold === null ? 'e.g. 1000' : `Vobiz’s level: ${a.vobizThreshold}`}
              onChange={(e) => setThreshold(e.target.value)}
              hint="Empty: use Vobiz’s own low-balance level. Checked every 15 minutes."
              error={bad ? 'Enter an amount, or leave it empty.' : error ?? undefined}
            />
          </div>
          <Button busy={busy} disabled={bad} onClick={() => void save()}>
            Save
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-soft px-4 py-3">
      <p className="text-[12px] font-semibold text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
      {hint ? <p className="text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

/** Selling numbers in the CRM: which providers, countries and kinds, and the monthly price. */
function SellingCard() {
  const canEdit = useAdmin().role === 'super_admin';
  const state = useLoad(() => Promise.all([api.numberSelling(), api.rates()]), []);
  return (
    <Loaded state={state}>
      {([s, rates]) => <SellingForm key={JSON.stringify(s.settings)} initial={s.settings} providers={s.providers} currency={rates.currency} canEdit={canEdit} onSaved={state.reload} />}
    </Loaded>
  );
}

function SellingForm({
  initial,
  providers,
  currency,
  canEdit,
  onSaved,
}: {
  initial: NumberSelling;
  providers: NumberProvider[];
  currency: string;
  canEdit: boolean;
  onSaved: () => Promise<void>;
}) {
  // Settings saved before the move to Vobiz may still list removed providers.
  const [s, setS] = useState({ ...initial, providers: initial.providers.filter((id) => providers.some((p) => p.id === id)) });
  const [countries, setCountries] = useState(initial.countries.join(', '));
  const [price, setPrice] = useState(String(initial.price));
  const [setupPrice, setSetupPrice] = useState(String(initial.setupPrice ?? 0));
  const [countryPrices, setCountryPrices] = useState(
    Object.entries(initial.countryPrices)
      .map(([c, p]) => `${c}=${p}`)
      .join(', ')
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const parsedCountries = countries
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const pairs = countryPrices
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split('=').map((x) => x.trim()));
  const parsedPrices = Object.fromEntries(pairs.map(([c, v]) => [(c ?? '').toUpperCase(), Number(v)])) as Record<string, number>;
  const errors = {
    countries: parsedCountries.some((c) => !/^[A-Z]{2}$/.test(c)) ? 'Use two-letter country codes.' : null,
    price: !/^\d+(\.\d{1,2})?$/.test(price.trim()) ? 'Enter a price, e.g. 3 or 2.50.' : null,
    setupPrice: !/^\d+(\.\d{1,2})?$/.test(setupPrice.trim()) ? 'Enter a price, or 0 for none.' : null,
    countryPrices: pairs.some(([c, v]) => !/^[A-Za-z]{2}$/.test(c ?? '') || v === undefined || !/^\d+(\.\d{1,2})?$/.test(v)) ? 'Use CC=price, e.g. GB=4, CA=3.50.' : null,
  };
  const invalid = Object.values(errors).some(Boolean) || (s.enabled && !s.providers.length) || !s.types.length;

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      await api.setNumberSelling({ ...s, countries: parsedCountries, price: Number(price), countryPrices: parsedPrices, setupPrice: Number(setupPrice) });
      setNotice({ tone: 'good', text: s.enabled ? 'Saved. Owners and admins of paying workspaces can buy numbers in the CRM.' : 'Saved. Buying numbers is off.' });
      await onSaved();
    } catch (err) {
      setNotice({ tone: 'bad', text: err instanceof Error ? err.message : 'Couldn’t save.' });
      setBusy(false);
    }
  }

  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <Card className="mb-4 p-5">
      <h3 className="flex items-center gap-2 text-[15px] font-bold">
        Selling numbers in the CRM {initial.enabled ? <Badge tone="good">On</Badge> : <Badge>Off</Badge>}
      </h3>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        A workspace’s plan includes its free number (picked from the ones added here). Extra numbers are bought in the CRM (Phone Numbers → Add phone number → Buy new number) on
        your Vobiz account, and each is added to the workspace’s Razorpay bill every month at your price until it’s cancelled (plus the setup price once, if set). Buying needs an active
        paid subscription. Indian numbers can be bought once the Vobiz account has passed KYC; ones that need Aadhaar verification can’t be bought online.
      </p>
      {notice ? (
        <div className="mt-3">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      ) : null}
      <fieldset disabled={!canEdit} className="mt-4 space-y-4">
        <Toggle label="Let workspaces buy numbers" checked={s.enabled} onChange={(v) => setS({ ...s, enabled: v })} />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Providers</p>
            <div className="flex flex-wrap gap-2">
              {providers.map((p) => (
                <label key={p.id} className="flex items-center gap-2 rounded-full bg-soft px-3 py-1.5 text-sm">
                  <input type="checkbox" checked={s.providers.includes(p.id)} disabled={!p.configured} onChange={() => setS({ ...s, providers: toggle(s.providers, p.id) })} />
                  {p.name}
                  {!p.configured ? <span className="text-[12px] text-muted">(not set up on this server)</span> : null}
                  {p.configured && p.verified === true ? <Badge tone="good">KYC verified</Badge> : null}
                  {p.configured && p.verified === false ? <Badge tone="bad">KYC pending</Badge> : null}
                </label>
              ))}
            </div>
            {s.enabled && !s.providers.length ? <p className="mt-1 text-[13px] text-bad">Pick at least one provider.</p> : null}
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Kinds of number</p>
            <div className="flex flex-wrap gap-2">
              {(['local', 'mobile', 'tollfree'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 rounded-full bg-soft px-3 py-1.5 text-sm">
                  <input type="checkbox" checked={s.types.includes(t)} onChange={() => setS({ ...s, types: toggle(s.types, t) })} />
                  {TYPE_LABEL[t]}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <TextField label="Countries" value={countries} onChange={(e) => setCountries(e.target.value)} hint={COUNTRY_HINT} error={errors.countries} placeholder="US, GB" />
          <TextField label={`Price per number, per month (${currency})`} value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} error={errors.price} />
          <TextField label="Price by country (optional)" value={countryPrices} onChange={(e) => setCountryPrices(e.target.value)} hint="e.g. GB=4, CA=3.50" error={errors.countryPrices} />
          <TextField
            label={`Setup price, once per number (${currency})`}
            value={setupPrice}
            inputMode="decimal"
            onChange={(e) => setSetupPrice(e.target.value)}
            hint="Covers Vobiz’s setup fee; 0 for none"
            error={errors.setupPrice}
          />
        </div>
        {providers.some((p) => p.configured && p.verified === false) ? (
          <Alert tone="info">The Vobiz account hasn’t passed KYC yet, so Indian numbers can’t be bought. Finish KYC in the Vobiz console (PAN and GST for a company).</Alert>
        ) : null}
        {canEdit ? (
          <div className="flex justify-end">
            <Button busy={busy} disabled={invalid} onClick={() => void save()}>
              Save
            </Button>
          </div>
        ) : (
          <p className="text-[13px] text-muted">Only super admins can change this.</p>
        )}
      </fieldset>
    </Card>
  );
}

import { useMemo, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { api, type PlatformNumber } from '../api';
import { useTitle } from '../router';
import { useAdmin } from '../session';
import { Alert, Badge, Button, Confirm, Modal, PageHeader, SelectField, TextField } from '../components/ui';
import { FilterBar, FilterSelect, Loaded, SearchBox, Table, useLoad, useQueryState, type Column } from '../components/data';

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
        canAct ? (
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
  ];

  return (
    <>
      <PageHeader
        title="Phone numbers"
        subtitle="Numbers bought on the platform’s Sinch or Plivo account. Each belongs to one workspace at a time; free ones can be picked by a workspace owner (one each)."
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
  const [provider, setProvider] = useState('sinch');
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
        <Alert tone="info">Buy the number on the provider’s account first (Sinch: link it to the voice service; Plivo: link it to the app). This only records it here.</Alert>
        {error ? <Alert>{error}</Alert> : null}
        <SelectField label="Provider" value={provider} onChange={setProvider} options={[{ value: 'sinch', label: 'Sinch' }, { value: 'plivo', label: 'Plivo' }]} />
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

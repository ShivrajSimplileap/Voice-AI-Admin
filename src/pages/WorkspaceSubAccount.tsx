import { useState, type ReactNode } from 'react';
import { api, type SubAccount } from '../api';
import { useAdmin } from '../session';
import { Alert, Badge, Button, Card, Confirm, Modal, SelectField, TextField, timeAgo } from '../components/ui';
import { Loaded, useLoad } from '../components/data';

const BUSINESS_TYPES: [string, string][] = [
  ['private_limited', 'Private limited company'],
  ['public_limited', 'Public limited company'],
  ['llp', 'LLP'],
  ['partnership', 'Partnership'],
  ['proprietorship', 'Sole proprietorship'],
  ['individual', 'Individual'],
  ['trust', 'Trust'],
  ['society', 'Society'],
  ['huf', 'HUF'],
  ['government', 'Government'],
];

const KYC_LABEL: Record<string, { label: string; tone: 'good' | 'bad' | 'accent' | 'neutral' }> = {
  covered: { label: 'Covered by the platform’s KYC', tone: 'good' },
  verified: { label: 'KYC verified', tone: 'good' },
  pending: { label: 'KYC in progress', tone: 'accent' },
  not_started: { label: 'KYC not started', tone: 'neutral' },
  failed: { label: 'KYC failed', tone: 'bad' },
};

/** The workspace's own Vobiz sub-account: its numbers, calls and KYC, billed to the platform's wallet. */
export function WorkspaceSubAccount({ orgId }: { orgId: string }) {
  const state = useLoad(() => api.subAccount(orgId), [orgId]);
  return <Loaded state={state}>{(r) => <View orgId={orgId} s={r.subAccount} onChanged={state.reload} />}</Loaded>;
}

function View({ orgId, s, onChanged }: { orgId: string; s: SubAccount | null; onChanged: () => Promise<void> }) {
  const role = useAdmin().role;
  const isSuper = role === 'super_admin';
  const canAct = role !== 'viewer';
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(what: string, fn: () => Promise<string>) {
    setBusy(what);
    setNotice(null);
    try {
      setNotice({ tone: 'good', text: await fn() });
      await onChanged();
    } catch (err) {
      setNotice({ tone: 'bad', text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  }

  const kyc = s ? (KYC_LABEL[s.kycStatus] ?? { label: s.kycStatus, tone: 'neutral' as const }) : null;
  return (
    <Card className="p-5">
      <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-bold">
        Vobiz sub-account
        {s ? <Badge tone="good">On</Badge> : <Badge>None</Badge>}
        {kyc ? <Badge tone={kyc.tone}>{kyc.label}</Badge> : null}
        {s?.callsBlocked ? <Badge tone="bad">Calls blocked until KYC</Badge> : null}
      </h3>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        The workspace’s own account under yours at Vobiz: its numbers, calls and call records are kept separate, and everything is billed to your Vobiz wallet. The
        platform’s numbers given to this workspace move into it, and move back when taken away.
      </p>
      {notice ? (
        <div className="mt-3">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      ) : null}

      {s ? (
        <>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Item label="Auth ID" value={<span className="font-mono">{s.authId}</span>} />
            <Item label="Numbers on it" value={String(s.numbers)} />
            <Item label="KYC" value={s.kycMode === 'personal_use' ? 'Platform’s (personal use)' : `Business’s own${s.businessType ? ` · ${s.businessType.replace(/_/g, ' ')}` : ''}`} />
            <Item label="Made" value={timeAgo(s.createdAt)} />
          </dl>
          {s.kycMode === 'customer_use' ? (
            <div className="mt-4 rounded-2xl bg-soft p-4 text-sm">
              <p>
                {s.kycStatus === 'verified'
                  ? 'The business is verified; calls are open.'
                  : 'The business verifies itself on Vobiz’s secure page (PAN, GST or CIN, or Aadhaar). Calls start once it’s verified. Owners can also start it from the CRM (Phone Numbers).'}
              </p>
              {Object.keys(s.verifications).length ? (
                <p className="mt-2 text-muted">
                  {Object.entries(s.verifications)
                    .map(([k, v]) => `${k.toUpperCase()}: ${v.replace(/_/g, ' ')}`)
                    .join(' · ')}
                </p>
              ) : null}
              {s.checkedAt ? <p className="mt-1 text-[12px] text-muted">Checked {timeAgo(s.checkedAt).toLowerCase()}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {canAct && s.kycStatus !== 'verified' ? (
                  <Button
                    variant="soft"
                    busy={busy === 'email'}
                    onClick={() => void act('email', async () => `Verification link sent to ${(await api.sendKycEmail(orgId)).emailedTo}.`)}
                  >
                    Email the verification link{s.email ? ` to ${s.email}` : ''}
                  </Button>
                ) : null}
                <Button variant="ghost" busy={busy === 'refresh'} onClick={() => void act('refresh', async () => (await api.refreshKyc(orgId), 'Status updated from Vobiz.'))}>
                  Check status
                </Button>
              </div>
            </div>
          ) : null}
          {isSuper ? (
            <div className="mt-4">
              <Button variant="ghost" onClick={() => setRemoving(true)}>
                Remove sub-account
              </Button>
            </div>
          ) : null}
        </>
      ) : isSuper ? (
        <div className="mt-4">
          <Button onClick={() => setCreating(true)}>Create sub-account</Button>
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-muted">Only super admins can create one.</p>
      )}

      {creating ? (
        <CreateModal
          orgId={orgId}
          onClose={() => setCreating(false)}
          onCreated={async (text) => {
            setCreating(false);
            setNotice({ tone: 'good', text });
            await onChanged();
          }}
        />
      ) : null}
      {removing ? (
        <Confirm
          title="Remove the sub-account?"
          body="Its numbers move back to the platform’s Vobiz account (Vobiz refuses for 15 days after a number’s last call), then the sub-account is deleted at Vobiz. Past call records stay."
          confirmLabel="Remove"
          danger
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            const r = await api.removeSubAccount(orgId);
            setRemoving(false);
            setNotice({ tone: 'good', text: `Removed; ${r.numbersMoved} number${r.numbersMoved === 1 ? '' : 's'} moved back.` });
            await onChanged();
          }}
        />
      ) : null}
    </Card>
  );
}

function Item({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-soft px-4 py-3">
      <dt className="text-[12px] font-semibold text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

function CreateModal({ orgId, onClose, onCreated }: { orgId: string; onClose: () => void; onCreated: (message: string) => Promise<void> }) {
  const [mode, setMode] = useState<'personal_use' | 'customer_use'>('personal_use');
  const [businessType, setBusinessType] = useState('private_limited');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.createSubAccount(orgId, mode === 'personal_use' ? { kycMode: mode } : { kycMode: mode, businessType, email: email.trim() || undefined });
      const stuck = r.notMoved.length ? ` ${r.notMoved.length} number(s) couldn’t move yet: ${r.notMoved.map((n) => n.e164).join(', ')}.` : '';
      await onCreated(`Sub-account ${r.subAccount.authId} created; ${r.subAccount.numbers} number(s) moved in.${stuck}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t create it.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Create a Vobiz sub-account"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button busy={busy} onClick={() => void submit()}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <SelectField
          label="KYC"
          value={mode}
          onChange={(v) => setMode(v as typeof mode)}
          options={[
            { value: 'personal_use', label: 'Covered by the platform’s KYC (calls work straight away)' },
            { value: 'customer_use', label: 'The business verifies itself (calls wait for its KYC)' },
          ]}
        />
        {mode === 'customer_use' ? (
          <>
            <SelectField label="Business type" value={businessType} onChange={setBusinessType} options={BUSINESS_TYPES.map(([value, label]) => ({ value, label }))} />
            <TextField
              label="Business email (optional)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              hint="Where Vobiz sends the verification link. Empty: the workspace owner."
            />
            <Alert tone="info">India’s caller-ID rules expect calls made for a business to carry that business’s KYC. Calls stay blocked until it’s verified.</Alert>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

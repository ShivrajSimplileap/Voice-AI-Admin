import { useState, type FormEvent } from 'react';
import { Ban, Crown, PauseCircle, PlayCircle } from 'lucide-react';
import { api, type OrgDetail, type OrgFeatures } from '../api';
import { useAdmin } from '../session';
import { Alert, Button, Card, Confirm, Modal, SelectField, TextField, Toggle, fullTime } from '../components/ui';
import { workspaceRole } from '../components/data';

const SWITCHES: { key: Exclude<keyof OrgFeatures, 'numberLimit'>; label: string; hint: string }[] = [
  { key: 'outboundCalls', label: 'Outbound calls', hint: 'Campaigns, AI callbacks and calls placed by hand. Off: campaigns wait, callbacks wait.' },
  { key: 'inboundCalls', label: 'Inbound calls', hint: 'Calls to the workspace’s numbers. Off: they’re not answered.' },
  { key: 'browserVoice', label: 'Browser voice', hint: 'Playground and agent tests in the browser.' },
  { key: 'meetings', label: 'Meeting booking', hint: 'The agent booking meetings. Off overrides the workspace’s own setting.' },
];

/** Phase 3: what the platform team can do to a workspace. */
export function WorkspaceControls({ o, onChanged }: { o: OrgDetail; onChanged: () => Promise<void> }) {
  const admin = useAdmin();
  const canAct = admin.role !== 'viewer';
  const [features, setFeatures] = useState(o.features);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [dialog, setDialog] = useState<'suspend' | 'restore' | 'pause' | 'owner' | null>(null);
  const live = o.campaigns.filter((c) => c.status === 'running' || c.status === 'scheduled').length;

  async function save(patch: Partial<OrgFeatures>, key: string) {
    setSaving(key);
    setNotice(null);
    const before = features;
    setFeatures({ ...features, ...patch });
    try {
      setFeatures((await api.setFeatures(o.id, patch)).features);
    } catch (err) {
      setFeatures(before);
      setNotice({ tone: 'bad', text: err instanceof Error ? err.message : 'Couldn’t save.' });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {!canAct ? <Alert tone="info">Viewers can see these controls but not change them.</Alert> : null}

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <h3 className="text-[15px] font-bold">{o.status === 'suspended' ? 'Workspace suspended' : 'Suspend workspace'}</h3>
            <p className="mt-1 text-sm text-muted">
              {o.status === 'suspended'
                ? `Since ${o.suspendedAt ? fullTime(o.suspendedAt) : 'earlier'}. Its people can’t use the CRM; no calls, campaigns or digests run. Data is kept.`
                : 'Blocks its people from the CRM and stops all its calls, campaigns and digests until restored. Nothing is deleted.'}
            </p>
            {o.status === 'suspended' && o.suspendedMessage ? <p className="mt-2 text-sm">Message shown to them: “{o.suspendedMessage}”</p> : null}
          </div>
          {canAct ? (
            o.status === 'suspended' ? (
              <Button variant="primary" icon={<PlayCircle className="size-4" />} onClick={() => setDialog('restore')}>
                Restore
              </Button>
            ) : (
              <Button variant="danger" icon={<Ban className="size-4" />} onClick={() => setDialog('suspend')}>
                Suspend
              </Button>
            )
          ) : null}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-[15px] font-bold">Features</h3>
        <p className="mt-1 mb-3 text-sm text-muted">On unless switched off here. Changes apply straight away and show in the workspace’s audit log.</p>
        <div className="grid gap-2 lg:grid-cols-2">
          {SWITCHES.map((s) => (
            <Toggle key={s.key} label={s.label} hint={s.hint} checked={features[s.key]} disabled={!canAct || saving !== null} onChange={(v) => void save({ [s.key]: v }, s.key)} />
          ))}
        </div>
        <NumberLimit value={features.numberLimit} disabled={!canAct || saving !== null} onSave={(n) => save({ numberLimit: n }, 'numberLimit')} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-[15px] font-bold">Pause all campaigns</h3>
          <p className="mt-1 text-sm text-muted">
            {live ? `${live} running or scheduled.` : 'None running or scheduled.'} The workspace can start them again itself (unless outbound calls are off).
          </p>
          {canAct ? (
            <Button className="mt-3" variant="soft" icon={<PauseCircle className="size-4" />} disabled={!live} onClick={() => setDialog('pause')}>
              Pause all
            </Button>
          ) : null}
        </Card>
        <Card className="p-5">
          <h3 className="text-[15px] font-bold">Owner</h3>
          <p className="mt-1 text-sm text-muted">
            {o.members
              .filter((m) => m.role === 'owner' && m.isActive)
              .map((m) => `${m.name} (${m.email})`)
              .join(', ') || 'No owner.'}
          </p>
          {canAct ? (
            <Button className="mt-3" variant="soft" icon={<Crown className="size-4" />} onClick={() => setDialog('owner')}>
              Change owner
            </Button>
          ) : null}
        </Card>
      </div>

      {dialog === 'suspend' ? <SuspendModal o={o} onClose={() => setDialog(null)} onDone={async (text) => { setNotice({ tone: 'good', text }); await onChanged(); }} /> : null}
      {dialog === 'restore' ? (
        <Confirm
          title={`Restore ${o.name}?`}
          body={<p>Its people can use the CRM again; running campaigns, inbound calls and digests resume.</p>}
          confirmLabel="Restore"
          onConfirm={async () => {
            await api.restoreOrg(o.id);
            setNotice({ tone: 'good', text: `${o.name} is restored.` });
            await onChanged();
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'pause' ? (
        <PauseModal
          title={`Pause ${live} campaign${live === 1 ? '' : 's'}?`}
          onClose={() => setDialog(null)}
          onPause={async (reason) => {
            const { paused } = await api.pauseOrgCampaigns(o.id, reason);
            setNotice({ tone: 'good', text: `${paused} campaign${paused === 1 ? '' : 's'} paused.` });
            await onChanged();
          }}
        />
      ) : null}
      {dialog === 'owner' ? <OwnerModal o={o} onClose={() => setDialog(null)} onDone={async (text) => { setNotice({ tone: 'good', text }); await onChanged(); }} /> : null}
    </div>
  );
}

function NumberLimit({ value, disabled, onSave }: { value: number; disabled: boolean; onSave: (n: number) => Promise<void> }) {
  const [text, setText] = useState(String(value));
  const n = Number(text);
  const valid = Number.isInteger(n) && n >= 0 && n <= 100;
  return (
    <div className="mt-2 flex flex-wrap items-end gap-3 rounded-2xl bg-soft px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">Phone numbers an owner can take</div>
        <div className="text-[13px] text-muted">From the platform’s free numbers, by themselves. You can always give more on the Phone numbers page.</div>
      </div>
      <input
        aria-label="Number limit"
        type="number"
        min={0}
        max={100}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        className="h-9 w-20 rounded-full bg-white px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue/40"
      />
      <Button size="sm" variant="soft" disabled={disabled || !valid || n === value} onClick={() => void onSave(n)}>
        Save
      </Button>
    </div>
  );
}

function SuspendModal({ o, onClose, onDone }: { o: OrgDetail; onClose: () => void; onDone: (text: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [endLiveCalls, setEndLiveCalls] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { endedCalls } = await api.suspendOrg(o.id, { reason, message: message || undefined, endLiveCalls });
      onClose();
      await onDone(`${o.name} is suspended${endedCalls ? `; ${endedCalls} live call${endedCalls === 1 ? '' : 's'} ended` : ''}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t suspend.');
      setBusy(false);
    }
  }

  return (
    <Modal title={`Suspend ${o.name}?`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Alert tone="info">
          Its {o.members.filter((m) => m.isActive).length} member(s) can’t use the CRM; campaigns, callbacks, inbound calls and digests stop. Nothing is deleted, and restoring brings it all back.
        </Alert>
        {error ? <Alert>{error}</Alert> : null}
        <TextField label="Reason (for the activity log)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Unpaid invoice INV-1042" required minLength={3} maxLength={500} />
        <TextField
          label="Message shown to its people (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. Your account is on hold. Contact billing@…"
          maxLength={300}
        />
        <Toggle label="End its live phone calls now" checked={endLiveCalls} onChange={setEndLiveCalls} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" busy={busy} disabled={reason.trim().length < 3}>
            Suspend workspace
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Asks for an optional reason, then pauses. */
export function PauseModal({ title, onClose, onPause }: { title: string; onClose: () => void; onPause: (reason?: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onPause(reason || undefined);
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Couldn’t pause.');
            setBusy(false);
          }
        }}
      >
        <p className="text-sm text-ink-2">The workspace sees “Paused by the platform team” with your reason on the campaign.</p>
        {error ? <Alert>{error}</Alert> : null}
        <TextField label="Reason (optional, shown to the workspace)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Pause
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function OwnerModal({ o, onClose, onDone }: { o: OrgDetail; onClose: () => void; onDone: (text: string) => Promise<void> }) {
  const candidates = o.members.filter((m) => m.isActive && m.userActive && m.role !== 'owner');
  const [userId, setUserId] = useState(candidates[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Change owner" onClose={onClose}>
      {candidates.length === 0 ? (
        <p className="text-sm text-muted">There’s no other active member to make owner.</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const res = await api.changeOwner(o.id, userId);
              onClose();
              await onDone(`${res.owner} now owns ${o.name}${res.previous.length ? `; ${res.previous.join(', ')} became admin` : ''}.`);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Couldn’t change the owner.');
              setBusy(false);
            }
          }}
        >
          {error ? <Alert>{error}</Alert> : null}
          <SelectField
            label="New owner"
            value={userId}
            onChange={setUserId}
            options={candidates.map((m) => ({ value: m.id, label: `${m.name} · ${m.email} (${workspaceRole(m.role)})` }))}
          />
          <p className="text-[13px] text-muted">The current owner becomes an admin. Both changes show in the workspace’s audit log.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" busy={busy} disabled={!userId}>
              Make owner
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

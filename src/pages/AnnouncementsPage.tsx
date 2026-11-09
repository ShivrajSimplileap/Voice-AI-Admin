import { useState, type FormEvent } from 'react';
import { Megaphone, Plus, Square } from 'lucide-react';
import { api, type Announcement, type AnnouncementTone } from '../api';
import { useTitle } from '../router';
import { useAdmin } from '../session';
import { Alert, Badge, Button, Card, Confirm, Modal, PageHeader, SelectField, TextField, cx, fullTime } from '../components/ui';
import { Loaded, useLoad } from '../components/data';

const TONES: { value: AnnouncementTone; label: string }[] = [
  { value: 'info', label: 'Information (blue)' },
  { value: 'warning', label: 'Heads-up (orange)' },
  { value: 'critical', label: 'Critical (red, can’t be hidden)' },
];

const STATE_BADGE = {
  live: <Badge tone="good">Live</Badge>,
  scheduled: <Badge tone="blue">Scheduled</Badge>,
  ended: <Badge>Ended</Badge>,
};

/** Phase 5: banners at the top of the CRM. */
export function AnnouncementsPage() {
  useTitle('Announcements');
  const canAct = useAdmin().role !== 'viewer';
  const state = useLoad(() => Promise.all([api.announcements(), api.orgOptions()]), []);
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState<Announcement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle="A banner at the top of every CRM page, for every workspace or the ones you pick. People can hide information and heads-up banners."
        actions={
          canAct ? (
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              New announcement
            </Button>
          ) : null
        }
      />
      {notice ? (
        <div className="mb-4">
          <Alert tone="good">{notice}</Alert>
        </div>
      ) : null}
      <Loaded state={state}>
        {([{ data }, orgs]) => {
          const name = new Map(orgs.data.map((o) => [o.id, o.name]));
          return data.length ? (
            <div className="space-y-3">
              {data.map((a) => (
                <Card key={a.id} className={cx('p-5', a.state === 'ended' && 'opacity-70')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {STATE_BADGE[a.state]}
                        <Badge tone={a.tone === 'critical' ? 'bad' : a.tone === 'warning' ? 'accent' : 'blue'}>{TONES.find((t) => t.value === a.tone)?.label.split(' (')[0]}</Badge>
                        <span className="text-[13px] text-muted">
                          {a.orgIds ? `${a.orgIds.length} workspace${a.orgIds.length === 1 ? '' : 's'}: ${a.orgIds.map((id) => name.get(id) ?? 'deleted').slice(0, 4).join(', ')}${a.orgIds.length > 4 ? '…' : ''}` : 'Every workspace'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm whitespace-pre-wrap">{a.message}</p>
                      <p className="mt-2 text-[12px] text-muted">
                        From {fullTime(a.startsAt)} {a.endsAt ? `to ${fullTime(a.endsAt)}` : 'until ended'}
                        {a.createdByName ? ` · by ${a.createdByName}` : ''}
                      </p>
                    </div>
                    {canAct && a.state !== 'ended' ? (
                      <Button size="sm" variant="soft" icon={<Square className="size-3.5" />} onClick={() => setEnding(a)}>
                        End now
                      </Button>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <Megaphone className="mx-auto size-6 text-muted" />
              <p className="mt-2 font-semibold">No announcements yet</p>
              <p className="mt-1 text-sm text-muted">Use them for new features, planned downtime or billing reminders.</p>
            </Card>
          );
        }}
      </Loaded>

      {creating && state.data ? (
        <NewAnnouncement
          orgs={state.data[1].data}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            setNotice('Announcement saved. The CRM picks it up within a few minutes, or when a page is opened.');
            await state.reload();
          }}
        />
      ) : null}
      {ending ? (
        <Confirm
          title="End this announcement?"
          body={<p>It disappears from the CRM the next time pages check (within a few minutes).</p>}
          confirmLabel="End now"
          onConfirm={async () => {
            await api.endAnnouncement(ending.id);
            await state.reload();
          }}
          onClose={() => setEnding(null)}
        />
      ) : null}
    </>
  );
}

function NewAnnouncement({ orgs, onClose, onCreated }: { orgs: { id: string; name: string }[]; onClose: () => void; onCreated: () => Promise<void> }) {
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<AnnouncementTone>('info');
  const [scope, setScope] = useState<'all' | 'some'>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const badWindow = Boolean(endsAt) && new Date(endsAt) <= (startsAt ? new Date(startsAt) : new Date());
  const invalid = message.trim().length < 3 || (scope === 'some' && !picked.length) || badWindow;
  const shown = orgs.filter((o) => o.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 50);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      await api.createAnnouncement({
        message: message.trim(),
        tone,
        orgIds: scope === 'some' ? picked : null,
        ...(startsAt ? { startsAt: new Date(startsAt).toISOString() } : {}),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New announcement"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="announcement-form" busy={busy} disabled={invalid}>
            Publish
          </Button>
        </>
      }
    >
      <form id="announcement-form" onSubmit={submit} className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
        {error ? <Alert>{error}</Alert> : null}
        <div>
          <label htmlFor="ann-message" className="mb-1.5 block text-sm font-semibold">
            Message
          </label>
          <textarea
            id="ann-message"
            value={message}
            maxLength={500}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-2xl bg-soft px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ink/20"
            placeholder="e.g. Calls may drop for a few minutes on Sunday 2–3 AM while we upgrade."
          />
          <p className="mt-1 text-right text-[12px] text-muted">{message.length}/500</p>
        </div>
        <SelectField label="Style" value={tone} onChange={(v) => setTone(v as AnnouncementTone)} options={TONES} />
        <SelectField
          label="Who sees it"
          value={scope}
          onChange={(v) => setScope(v as 'all' | 'some')}
          options={[
            { value: 'all', label: 'Every workspace' },
            { value: 'some', label: 'Chosen workspaces' },
          ]}
        />
        {scope === 'some' ? (
          <div>
            <TextField label={`Workspaces (${picked.length} chosen)`} placeholder="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-2xl bg-soft p-2">
              {shown.map((o) => (
                <li key={o.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-white">
                    <input type="checkbox" checked={picked.includes(o.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, o.id] : picked.filter((p) => p !== o.id))} />
                    {o.name}
                  </label>
                </li>
              ))}
              {!shown.length ? <li className="px-2 py-1.5 text-sm text-muted">No workspace matches.</li> : null}
            </ul>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Starts (optional)" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} hint="Blank: now" />
          <TextField label="Ends (optional)" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} hint="Blank: until ended" error={badWindow ? 'Must be after the start.' : null} />
        </div>
      </form>
    </Modal>
  );
}

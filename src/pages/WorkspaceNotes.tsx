import { useState, type FormEvent } from 'react';
import { Download, Tag, Trash2, X } from 'lucide-react';
import { api, type OrgDetail, type OrgNote } from '../api';
import { navigate } from '../router';
import { useAdmin } from '../session';
import { Alert, Badge, Button, Card, Confirm, Modal, TextField, fullTime, timeAgo } from '../components/ui';
import { Loaded, useLoad } from '../components/data';

/** Phase 5: the platform team's private notes and tags on a workspace. */
export function WorkspaceNotes({ o, onChanged }: { o: OrgDetail; onChanged: () => Promise<void> }) {
  const admin = useAdmin();
  const canAct = admin.role !== 'viewer';
  const state = useLoad(() => api.notes(o.id), [o.id]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<OrgNote | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.addNote(o.id, body.trim());
      setBody('');
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Tags o={o} onChanged={onChanged} />
      <Card className="p-5">
        <h3 className="text-[15px] font-bold">Notes</h3>
        <p className="mt-1 text-sm text-muted">Only the platform team sees these: context, agreements, who to talk to.</p>
        {canAct ? (
          <form onSubmit={add} className="mt-3 space-y-2">
            {error ? <Alert>{error}</Alert> : null}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={4000}
              aria-label="New note"
              placeholder="e.g. Pilot until 31 March; renewal call with the owner in February."
              className="w-full rounded-2xl bg-soft px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ink/20"
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" busy={busy} disabled={!body.trim()}>
                Add note
              </Button>
            </div>
          </form>
        ) : null}
        <Loaded state={state}>
          {({ data }) =>
            data.length ? (
              <ul className="mt-4 space-y-2">
                {data.map((n) => (
                  <li key={n.id} className="rounded-2xl bg-soft px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                      {canAct && (admin.role === 'super_admin' || n.adminId === admin.id) ? (
                        <button onClick={() => setDeleting(n)} className="shrink-0 rounded-full p-1 text-muted hover:bg-white hover:text-bad" aria-label="Delete note">
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-[12px] text-muted" title={fullTime(n.createdAt)}>
                      {n.adminName || 'Someone'} · {timeAgo(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted">No notes yet.</p>
            )
          }
        </Loaded>
      </Card>
      {deleting ? (
        <Confirm
          title="Delete this note?"
          body={<p>It’s gone for everyone; the activity log keeps a copy.</p>}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await api.deleteNote(o.id, deleting.id);
            await state.reload();
          }}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}

function Tags({ o, onChanged }: { o: OrgDetail; onChanged: () => Promise<void> }) {
  const canAct = useAdmin().role !== 'viewer';
  const all = useLoad(() => api.tags(), []);
  const [tags, setTags] = useState(o.tags);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function save(next: string[]) {
    setError(null);
    const before = tags;
    setTags(next);
    try {
      setTags((await api.setTags(o.id, next)).tags);
      await Promise.all([all.reload(), onChanged()]);
    } catch (err) {
      setTags(before);
      setError(err instanceof Error ? err.message : 'Couldn’t save.');
    }
  }

  const suggestions = (all.data?.data ?? []).map((t) => t.tag).filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()));

  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-2 text-[15px] font-bold">
        <Tag className="size-4" /> Tags
      </h3>
      <p className="mt-1 text-sm text-muted">Labels for the platform team, e.g. “enterprise pilot”. Filter the workspace list by them.</p>
      {error ? (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-blue-soft px-3 py-1 text-[13px] font-semibold text-navy">
            {t}
            {canAct ? (
              <button onClick={() => void save(tags.filter((x) => x !== t))} className="rounded-full hover:text-bad" aria-label={`Remove tag ${t}`}>
                <X className="size-3.5" />
              </button>
            ) : null}
          </span>
        ))}
        {!tags.length ? <span className="text-sm text-muted">No tags.</span> : null}
      </div>
      {canAct && tags.length < 20 ? (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim();
            if (t) void save([...tags, t]).then(() => setDraft(''));
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={40}
            list="tag-suggestions"
            placeholder="Add a tag"
            aria-label="Add a tag"
            className="h-9 rounded-full bg-soft px-4 text-sm outline-none focus:ring-2 focus:ring-ink/20"
          />
          <datalist id="tag-suggestions">
            {suggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <Button type="submit" size="sm" variant="soft" disabled={!draft.trim()}>
            Add
          </Button>
        </form>
      ) : null}
    </Card>
  );
}

/** Phase 5: a workspace's data (DPDP): download all of it, or erase it. Super admins only. */
export function WorkspaceData({ o }: { o: OrgDetail }) {
  const admin = useAdmin();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  if (admin.role !== 'super_admin') return null;

  async function exportData() {
    setBusy(true);
    setNotice(null);
    try {
      const { blob, name } = await api.exportOrg(o.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      setNotice({ tone: 'good', text: 'Export downloaded. It holds personal data: store and share it carefully.' });
    } catch (err) {
      setNotice({ tone: 'bad', text: err instanceof Error ? err.message : 'Couldn’t export.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-bold">Workspace data</h3>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        For data requests under DPDP. The export is one JSON file with members, leads, campaigns, calls with transcripts and summaries, follow-ups, meetings and the audit log; recordings and
        uploaded files are listed, not included. Both actions are logged.
      </p>
      {notice ? (
        <div className="mt-3">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="soft" icon={<Download className="size-4" />} busy={busy} onClick={() => void exportData()}>
          Export all data
        </Button>
        <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDeleting(true)}>
          Delete workspace
        </Button>
      </div>
      {o.status !== 'suspended' ? <p className="mt-2 text-[13px] text-muted">Suspend the workspace first to delete it.</p> : null}
      {deleting ? <DeleteModal o={o} onClose={() => setDeleting(false)} /> : null}
    </Card>
  );
}

function DeleteModal({ o, onClose }: { o: OrgDetail; onClose: () => void }) {
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suspended = o.status === 'suspended';
  const ok = suspended && name === o.name && reason.trim().length >= 3;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteOrg(o.id, { confirmName: name, reason: reason.trim() });
      navigate('/workspaces');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t delete.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Delete ${o.name}?`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="delete-org" variant="danger" busy={busy} disabled={!ok}>
            Delete for good
          </Button>
        </>
      }
    >
      <form id="delete-org" onSubmit={submit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        {!suspended ? <Alert>Suspend the workspace on this tab first.</Alert> : null}
        <div className="space-y-2 text-sm text-ink-2">
          <p>
            <Badge tone="bad">Can’t be undone</Badge>
          </p>
          <p>
            Everything in it is erased: leads, campaigns, calls, transcripts, recordings, knowledge files and its audit log. People who only belong to this workspace lose their accounts;
            people in other workspaces keep theirs. Its phone numbers go back to the platform. Export the data first if it’s needed.
          </p>
        </div>
        <TextField label={`Type “${o.name}” to confirm`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <TextField label="Reason (for the activity log)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Erasure request from the owner, 9 Nov" />
      </form>
    </Modal>
  );
}

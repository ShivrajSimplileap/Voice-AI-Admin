import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, KeyRound, MailPlus, RotateCw, UserCheck, UserX, XCircle } from 'lucide-react';
import { api, ROLE_LABEL, type Admin, type AdminRole, type Invite } from '../api';
import { useTitle } from '../router';
import { useAdmin } from '../session';
import { Alert, Badge, Button, Card, Confirm, Modal, PageHeader, Spinner, TextField, cx, fullTime, timeAgo } from '../components/ui';
import { roleTone } from '../components/Shell';

const ROLE_HELP: Record<AdminRole, string> = {
  super_admin: 'Everything, including the admin team.',
  admin: 'Sees everything and takes action on workspaces, users, calls and numbers.',
  viewer: 'Sees everything, changes nothing.',
};

type Pending =
  | { kind: 'role'; admin: Admin; role: AdminRole }
  | { kind: 'active'; admin: Admin; isActive: boolean }
  | { kind: 'reset'; admin: Admin }
  | { kind: 'revoke'; invite: Invite };

export function AdminsPage() {
  useTitle('Admin team');
  const me = useAdmin();
  const [team, setTeam] = useState<{ admins: Admin[]; invites: Invite[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [shareLink, setShareLink] = useState<{ title: string; text: string; link: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTeam(await api.team());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load the team.');
    }
  }, []);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function resend(invite: Invite) {
    try {
      const res = await api.resendInvite(invite.id);
      if (res.link) setShareLink({ title: 'Invitation link', text: `Email isn’t set up, so send this link to ${invite.email} yourself. It works for 48 hours.`, link: res.link });
      else setToast(`Invitation sent again to ${invite.email}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t resend.');
    }
  }

  const activeSupers = team?.admins.filter((a) => a.role === 'super_admin' && a.isActive).length ?? 0;

  return (
    <>
      <PageHeader
        title="Admin team"
        subtitle="People who can sign in to this portal. Only super admins see this page."
        actions={
          <Button variant="accent" icon={<MailPlus className="size-4" />} onClick={() => setInviting(true)}>
            Invite
          </Button>
        }
      />
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {toast ? (
        <div className="mb-4">
          <Alert tone="good">{toast}</Alert>
        </div>
      ) : null}

      {!team ? (
        error ? null : <Spinner />
      ) : (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 className="text-[15px] font-bold">Admins</h2>
              <span className="text-[13px] text-muted">{team.admins.length}</span>
            </div>
            <ul className="divide-y divide-line/70">
              {team.admins.map((a) => {
                const self = a.id === me.id;
                const lastSuper = a.role === 'super_admin' && a.isActive && activeSupers <= 1;
                return (
                  <li key={a.id} className={cx('flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4', !a.isActive && 'opacity-60')}>
                    <div className="grid size-10 shrink-0 place-items-center rounded-full bg-soft text-sm font-bold text-ink-2">
                      {(a.name || a.email).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-[180px] flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {a.name}
                        {self ? <span className="text-[12px] font-medium text-muted">(you)</span> : null}
                        {!a.isActive ? <Badge tone="bad">Disabled</Badge> : null}
                      </div>
                      <div className="truncate text-[13px] text-muted">{a.email}</div>
                    </div>
                    <div className="w-[150px]">
                      {self || !a.isActive ? (
                        <Badge tone={roleTone(a.role)}>{ROLE_LABEL[a.role]}</Badge>
                      ) : (
                        <select
                          aria-label={`Role of ${a.name}`}
                          value={a.role}
                          disabled={lastSuper}
                          title={lastSuper ? 'The last super admin keeps the role.' : undefined}
                          onChange={(e) => setPending({ kind: 'role', admin: a, role: e.target.value as AdminRole })}
                          className="h-9 w-full rounded-full bg-soft px-3 text-[13px] font-semibold text-ink outline-none focus:ring-2 focus:ring-blue/50"
                        >
                          {(['super_admin', 'admin', 'viewer'] as AdminRole[]).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="w-[120px] text-[13px] text-muted" title={a.lastLoginAt ? fullTime(a.lastLoginAt) : undefined}>
                      {a.lastLoginAt ? `Seen ${timeAgo(a.lastLoginAt).toLowerCase()}` : 'Never signed in'}
                    </div>
                    <div className="ml-auto flex gap-1.5">
                      {!self && a.isActive ? (
                        <Button size="sm" variant="soft" icon={<KeyRound className="size-3.5" />} onClick={() => setPending({ kind: 'reset', admin: a })}>
                          Reset link
                        </Button>
                      ) : null}
                      {!self ? (
                        a.isActive ? (
                          <Button size="sm" variant="ghost" icon={<UserX className="size-3.5" />} disabled={lastSuper} onClick={() => setPending({ kind: 'active', admin: a, isActive: false })}>
                            Disable
                          </Button>
                        ) : (
                          <Button size="sm" variant="soft" icon={<UserCheck className="size-3.5" />} onClick={() => setPending({ kind: 'active', admin: a, isActive: true })}>
                            Enable
                          </Button>
                        )
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 className="text-[15px] font-bold">Pending invitations</h2>
              <span className="text-[13px] text-muted">{team.invites.length}</span>
            </div>
            {team.invites.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted">No invitations waiting. Use Invite to add an admin or a viewer.</p>
            ) : (
              <ul className="divide-y divide-line/70">
                {team.invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
                    <div className="min-w-[200px] flex-1">
                      <div className="truncate text-sm font-semibold">{i.email}</div>
                      <div className="text-[13px] text-muted">Sent {timeAgo(i.createdAt).toLowerCase()}</div>
                    </div>
                    <Badge tone={roleTone(i.role)}>{ROLE_LABEL[i.role]}</Badge>
                    {i.expired ? <Badge tone="bad">Expired</Badge> : <span className="text-[13px] text-muted">Expires {timeAgo(i.expiresAt)}</span>}
                    <div className="ml-auto flex gap-1.5">
                      <Button size="sm" variant="soft" icon={<RotateCw className="size-3.5" />} onClick={() => void resend(i)}>
                        Resend
                      </Button>
                      <Button size="sm" variant="ghost" icon={<XCircle className="size-3.5" />} onClick={() => setPending({ kind: 'revoke', invite: i })}>
                        Withdraw
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {inviting ? (
        <InviteModal
          onClose={() => setInviting(false)}
          onSent={async (res, email) => {
            setInviting(false);
            if (res.link) setShareLink({ title: 'Invitation link', text: `Email isn’t set up, so send this link to ${email} yourself. It works for 48 hours.`, link: res.link });
            else setToast(`Invitation sent to ${email}.`);
            await load();
          }}
        />
      ) : null}

      {pending?.kind === 'role' ? (
        <Confirm
          title="Change role?"
          body={
            <>
              <p>
                <strong>{pending.admin.name}</strong> becomes <strong>{ROLE_LABEL[pending.role]}</strong>: {ROLE_HELP[pending.role].toLowerCase()}
              </p>
              <p className="mt-2 text-muted">It applies straight away.</p>
            </>
          }
          confirmLabel="Change role"
          onConfirm={async () => {
            await api.updateAdmin(pending.admin.id, { role: pending.role });
            await load();
          }}
          onClose={() => setPending(null)}
        />
      ) : null}
      {pending?.kind === 'active' ? (
        <Confirm
          title={pending.isActive ? 'Enable this admin?' : 'Disable this admin?'}
          body={
            pending.isActive ? (
              <p>
                <strong>{pending.admin.name}</strong> can sign in again with their password.
              </p>
            ) : (
              <p>
                <strong>{pending.admin.name}</strong> is signed out everywhere and can’t sign in until enabled again.
              </p>
            )
          }
          confirmLabel={pending.isActive ? 'Enable' : 'Disable'}
          danger={!pending.isActive}
          onConfirm={async () => {
            await api.updateAdmin(pending.admin.id, { isActive: pending.isActive });
            await load();
          }}
          onClose={() => setPending(null)}
        />
      ) : null}
      {pending?.kind === 'reset' ? (
        <Confirm
          title="Send a password reset link?"
          body={
            <p>
              <strong>{pending.admin.email}</strong> gets a link to choose a new password. It works once, for one hour. Their current password keeps working until then.
            </p>
          }
          confirmLabel="Send link"
          onConfirm={async () => {
            const res = await api.sendResetLink(pending.admin.id);
            if (res.link) setShareLink({ title: 'Reset link', text: `Email isn’t set up, so send this link to ${pending.admin.email} yourself. It works once, for one hour.`, link: res.link });
            else setToast(`Reset link sent to ${pending.admin.email}.`);
          }}
          onClose={() => setPending(null)}
        />
      ) : null}
      {pending?.kind === 'revoke' ? (
        <Confirm
          title="Withdraw invitation?"
          body={
            <p>
              The link sent to <strong>{pending.invite.email}</strong> stops working.
            </p>
          }
          confirmLabel="Withdraw"
          danger
          onConfirm={async () => {
            await api.revokeInvite(pending.invite.id);
            await load();
          }}
          onClose={() => setPending(null)}
        />
      ) : null}

      {shareLink ? <ShareLinkModal {...shareLink} onClose={() => setShareLink(null)} /> : null}
    </>
  );
}

function InviteModal({ onClose, onSent }: { onClose: () => void; onSent: (res: { emailSent: boolean; link?: string }, email: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.invite(email, role);
      await onSent(res, res.invite.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send the invitation.');
      setBusy(false);
    }
  }

  return (
    <Modal title="Invite to the admin portal" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required />
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-[13px] font-semibold text-ink-2">Role</legend>
          {(['admin', 'viewer'] as const).map((r) => (
            <label key={r} className={cx('flex cursor-pointer gap-3 rounded-2xl p-3.5 ring-1 transition', role === r ? 'bg-soft ring-ink/15' : 'ring-line hover:bg-soft/60')}>
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-0.5 accent-[#1A1C1E]" />
              <span>
                <span className="block text-sm font-semibold">{ROLE_LABEL[r]}</span>
                <span className="block text-[13px] text-muted">{ROLE_HELP[r]}</span>
              </span>
            </label>
          ))}
          <p className="text-[12px] text-muted">To make someone a super admin, invite them as Admin, then change their role.</p>
        </fieldset>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} icon={<MailPlus className="size-4" />}>
            Send invitation
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ShareLinkModal({ title, text, link, onClose }: { title: string; text: string; link: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <Button data-autofocus onClick={onClose}>
          Done
        </Button>
      }
    >
      <Alert tone="info">{text}</Alert>
      <div className="flex gap-2">
        <input readOnly value={link} onFocus={(e) => e.target.select()} className="h-11 min-w-0 flex-1 rounded-2xl bg-soft px-4 text-[13px] text-ink-2 outline-none" />
        <Button
          variant="soft"
          icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            } catch {
              /* select the field by hand */
            }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </Modal>
  );
}

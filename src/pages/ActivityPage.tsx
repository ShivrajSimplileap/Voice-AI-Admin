import { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { api, ROLE_LABEL, type AdminRole, type AuditEvent } from '../api';
import { useTitle } from '../router';
import { Alert, Badge, Button, Card, PageHeader, Spinner, fullTime, timeAgo } from '../components/ui';

/** Plain-language names for the log's actions. */
const ACTION_LABEL: Record<string, string> = {
  'admin.created': 'Admin created (command line)',
  'admin.signed_in': 'Signed in',
  'admin.sign_in_failed': 'Failed sign-in',
  'admin.locked': 'Account locked',
  'admin.signed_out': 'Signed out',
  'admin.password_changed': 'Changed password',
  'admin.password_reset_requested': 'Asked for a reset link',
  'admin.password_reset': 'Reset password',
  'admin.reset_link_sent': 'Sent a reset link',
  'admin.invited': 'Invited',
  'admin.invite_resent': 'Resent invitation',
  'admin.invite_revoked': 'Withdrew invitation',
  'admin.invite_accepted': 'Accepted invitation',
  'admin.role_changed': 'Changed role',
  'admin.disabled': 'Disabled admin',
  'admin.enabled': 'Enabled admin',
  'call.transcript_viewed': 'Opened a call transcript',
  'call.recording_played': 'Played a call recording',
  'call.analysis_retried': 'Retried a call summary',
  'calls.stuck_closed': 'Closed stuck calls',
  'calls.failed_analyses_retried': 'Retried failed summaries',
  'knowledge.file_retried': 'Retried a knowledge file',
  'phone_number.added': 'Added a phone number',
  'phone_number.assigned': 'Moved a phone number',
};
const WARN = new Set(['admin.sign_in_failed', 'admin.locked', 'admin.disabled']);

const label = (action: string) => ACTION_LABEL[action] ?? action;

function detailText(e: AuditEvent): string | null {
  const d = e.details;
  if (e.action === 'admin.role_changed' && d.from && d.to) return `${ROLE_LABEL[d.from as AdminRole]} → ${ROLE_LABEL[d.to as AdminRole]}`;
  if (e.action === 'admin.invited' && d.role) return `as ${ROLE_LABEL[d.role as AdminRole]}${d.emailSent === false ? ' · link shared by hand' : ''}`;
  if (e.action === 'admin.sign_in_failed') return d.reason === 'wrong_password' ? `wrong password (attempt ${d.attempt})` : d.reason === 'disabled' ? 'account disabled' : 'unknown email';
  if (e.action === 'admin.locked') return `for ${d.minutes} minutes`;
  if (e.action === 'admin.signed_in' && d.newNetwork) return 'new network';
  if (e.action === 'phone_number.assigned') return `${d.from ?? 'free'} → ${d.to ?? 'free'}`;
  if (e.action === 'calls.stuck_closed') return `${d.closed} closed`;
  if (e.action === 'calls.failed_analyses_retried') return `${d.queued} queued`;
  return null;
}

export function ActivityPage() {
  useTitle('Activity log');
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [next, setNext] = useState<{ before: string; beforeId: string } | null>(null);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const request = useRef(0);

  const load = useCallback(async (query: string, act: string) => {
    const id = ++request.current;
    setError(null);
    try {
      const res = await api.audit({ q: query || undefined, action: act || undefined, limit: '50' });
      if (id !== request.current) return;
      setEvents(res.data);
      setNext(res.next);
      setActions(res.actions);
    } catch (err) {
      if (id === request.current) setError(err instanceof Error ? err.message : 'Couldn’t load the log.');
    }
  }, []);

  // Typing waits a moment before searching.
  useEffect(() => {
    const t = setTimeout(() => void load(q.trim(), action), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, action, load]);

  async function more() {
    if (!next) return;
    setLoadingMore(true);
    try {
      const res = await api.audit({ q: q.trim() || undefined, action: action || undefined, limit: '50', ...next });
      setEvents((prev) => [...(prev ?? []), ...res.data]);
      setNext(res.next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load more.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <PageHeader title="Activity log" subtitle="Every sign-in and change made in this portal, newest first. Entries can’t be edited or deleted." />
      <Card className="mb-4 flex flex-wrap gap-3 p-4">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by admin or target email"
            className="h-10 w-full rounded-full bg-soft pr-4 pl-10 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue/40"
          />
        </label>
        <select
          aria-label="Action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="h-10 rounded-full bg-soft px-4 text-sm font-semibold text-ink-2 outline-none focus:ring-2 focus:ring-blue/40"
        >
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {label(a)}
            </option>
          ))}
        </select>
      </Card>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {!events ? (
        error ? null : <Spinner />
      ) : events.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">Nothing matches.</Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line/70">
            {events.map((e) => {
              const detail = detailText(e);
              return (
                <li key={e.id} className="flex flex-wrap items-start gap-x-4 gap-y-1.5 px-5 py-3.5">
                  <div className="w-[110px] shrink-0 pt-0.5 text-[13px] text-muted" title={fullTime(e.createdAt)}>
                    {timeAgo(e.createdAt)}
                  </div>
                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {WARN.has(e.action) ? <Badge tone="bad">{label(e.action)}</Badge> : <span className="font-semibold">{label(e.action)}</span>}
                      {e.targetLabel && e.targetLabel !== e.adminEmail ? <span className="text-ink-2">{e.targetLabel}</span> : null}
                      {detail ? <span className="text-muted">· {detail}</span> : null}
                    </div>
                    <div className="mt-0.5 text-[13px] text-muted">
                      {e.adminEmail ? (
                        <>
                          by <span className="text-ink-2">{e.adminName || e.adminEmail}</span>
                        </>
                      ) : e.userAgent === 'command line' ? (
                        'from the command line'
                      ) : (
                        'not signed in'
                      )}
                      {e.ip ? <> · {e.ip.replace(/^::ffff:/, '')}</> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {next ? (
            <div className="flex justify-center p-4">
              <Button variant="soft" busy={loadingMore} onClick={() => void more()}>
                Load more
              </Button>
            </div>
          ) : null}
        </Card>
      )}
    </>
  );
}

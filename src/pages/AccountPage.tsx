import { useState, type FormEvent } from 'react';
import { api, ROLE_LABEL } from '../api';
import { useTitle } from '../router';
import { useAdmin } from '../session';
import { Alert, Badge, Button, Card, PageHeader, PasswordField, fullTime } from '../components/ui';
import { roleTone } from '../components/Shell';

export function AccountPage() {
  useTitle('My account');
  const admin = useAdmin();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const short = next.length > 0 && next.length < 10;
  const mismatch = confirm.length > 0 && confirm !== next;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setResult({ tone: 'good', text: 'Password changed. Your other sessions were signed out.' });
    } catch (err) {
      setResult({ tone: 'bad', text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="My account" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="p-6">
          <h2 className="text-[15px] font-bold">Profile</h2>
          <dl className="mt-4 space-y-3 text-sm">
            {[
              ['Name', admin.name],
              ['Email', admin.email],
              ['Role', <Badge key="r" tone={roleTone(admin.role)}>{ROLE_LABEL[admin.role]}</Badge>],
              ['Admin since', fullTime(admin.createdAt)],
              ['Last sign-in', admin.lastLoginAt ? fullTime(admin.lastLoginAt) : '—'],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex items-center justify-between gap-4 rounded-2xl bg-soft px-4 py-3">
                <dt className="text-muted">{k}</dt>
                <dd className="min-w-0 truncate text-right font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[13px] text-muted">To change your name, email or role, ask a super admin.</p>
        </Card>

        <Card className="p-6">
          <h2 className="text-[15px] font-bold">Change password</h2>
          <p className="mt-1 text-sm text-muted">You stay signed in here; other browsers are signed out.</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            {result ? <Alert tone={result.tone}>{result.text}</Alert> : null}
            <PasswordField label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            <PasswordField
              label="New password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              hint="At least 10 characters. Avoid common passwords."
              error={short ? 'Use at least 10 characters.' : null}
              required
            />
            <PasswordField
              label="Type it again"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={mismatch ? 'The passwords don’t match.' : null}
              required
            />
            <Button type="submit" busy={busy} disabled={!current || next.length < 10 || next !== confirm}>
              Change password
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}

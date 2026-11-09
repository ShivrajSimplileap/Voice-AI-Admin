import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api, ApiError, ROLE_LABEL, type AdminRole } from '../api';
import { Link, navigate, useTitle } from '../router';
import { useSession } from '../session';
import { Alert, AuthLayout, Button, PasswordField, Spinner, TextField } from '../components/ui';

const MIN_PASSWORD = 10;
const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong. Try again.');

/** A new password typed twice, with the length rule shown before submitting. */
function NewPassword({ value, confirm, onChange, onConfirm, label = 'New password' }: { value: string; confirm: string; onChange: (v: string) => void; onConfirm: (v: string) => void; label?: string }) {
  const short = value.length > 0 && value.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== value;
  return (
    <>
      <PasswordField
        label={label}
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        hint={`At least ${MIN_PASSWORD} characters. Avoid common passwords.`}
        error={short ? `${MIN_PASSWORD - value.length} more character${MIN_PASSWORD - value.length === 1 ? '' : 's'} needed.` : null}
        required
      />
      <PasswordField
        label="Type it again"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => onConfirm(e.target.value)}
        error={mismatch ? 'The passwords don’t match.' : null}
        required
      />
    </>
  );
}
const passwordReady = (p: string, c: string) => p.length >= MIN_PASSWORD && p === c;

// ---------------------------------------------------------------------------
export function LoginPage() {
  useTitle('Sign in');
  const { start, notice, clearNotice } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    clearNotice();
    try {
      start(await api.login(email, password));
      navigate('/', { replace: true });
    } catch (err) {
      setError(message(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Use the email and password of your admin account.">
      <form onSubmit={submit} className="space-y-4">
        {notice ? <Alert tone="info">{notice}</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}
        <TextField label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <PasswordField label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Button type="submit" busy={busy} className="w-full">
          Sign in
        </Button>
        <div className="text-center">
          <Link to="/forgot-password" className="text-[13px] font-semibold text-ink-2 hover:text-accent">
            Forgot password?
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------------
export function ForgotPasswordPage() {
  useTitle('Forgot password');
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword(email);
      setDone(true);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Forgot your password?" subtitle="We’ll email you a link to choose a new one.">
      {done ? (
        <div className="space-y-4">
          <Alert tone="good">If {email} is an admin account, a reset link is on its way. It works once, for one hour.</Alert>
          <BackToSignIn />
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <TextField label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          <Button type="submit" busy={busy} className="w-full">
            Send reset link
          </Button>
          <BackToSignIn />
        </form>
      )}
    </AuthLayout>
  );
}

function BackToSignIn() {
  return (
    <div className="text-center">
      <Link to="/login" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-accent">
        <ArrowLeft className="size-3.5" /> Back to sign in
      </Link>
    </div>
  );
}

/** Loads what a link (invitation / reset) is for, or why it can't be used. */
function useLink<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    load().then(
      (data) => setState({ data }),
      (err) => setState({ error: err instanceof ApiError && err.status === 404 ? err.message : message(err) })
    );
  }, []);
  return state;
}

// ---------------------------------------------------------------------------
export function ResetPasswordPage({ token }: { token: string }) {
  useTitle('Choose a new password');
  const link = useLink(() => api.checkReset(token));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  if (!link.data && !link.error) return <AuthLayout title="Choose a new password"><Spinner /></AuthLayout>;
  if (link.error)
    return (
      <AuthLayout title="This link can’t be used">
        <div className="space-y-4">
          <Alert>{link.error}</Alert>
          <Link to="/forgot-password" className="block">
            <Button className="w-full">Send a new link</Button>
          </Link>
        </div>
      </AuthLayout>
    );
  return (
    <AuthLayout title="Choose a new password" subtitle={<>For <strong className="text-ink">{link.data!.email}</strong>. You’ll be signed out everywhere.</>}>
      {done ? (
        <div className="space-y-4">
          <Alert tone="good">Your password is changed. Sign in with the new one.</Alert>
          <Link to="/login" className="block">
            <Button className="w-full">Sign in</Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <NewPassword value={password} confirm={confirm} onChange={setPassword} onConfirm={setConfirm} />
          <Button type="submit" busy={busy} disabled={!passwordReady(password, confirm)} className="w-full">
            Save new password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------------
export function AcceptInvitePage({ token }: { token: string }) {
  useTitle('Accept invitation');
  const { start } = useSession();
  const link = useLink<{ email: string; role: AdminRole }>(() => api.checkInvite(token));
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      start(await api.acceptInvite(token, name, password));
      navigate('/', { replace: true });
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  if (!link.data && !link.error) return <AuthLayout title="Accept invitation"><Spinner /></AuthLayout>;
  if (link.error)
    return (
      <AuthLayout title="This invitation can’t be used">
        <div className="space-y-4">
          <Alert>{link.error}</Alert>
          <BackToSignIn />
        </div>
      </AuthLayout>
    );
  return (
    <AuthLayout
      title="Join the admin portal"
      subtitle={
        <>
          You’re invited as <strong className="text-ink">{ROLE_LABEL[link.data!.role]}</strong> with <strong className="text-ink">{link.data!.email}</strong>.
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <TextField label="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <NewPassword label="Password" value={password} confirm={confirm} onChange={setPassword} onConfirm={setConfirm} />
        <Button type="submit" busy={busy} disabled={!name.trim() || !passwordReady(password, confirm)} className="w-full">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}

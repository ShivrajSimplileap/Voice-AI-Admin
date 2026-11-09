import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, X } from 'lucide-react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type Variant = 'primary' | 'accent' | 'soft' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-navy',
  accent: 'bg-accent text-white hover:brightness-95 shadow-[0_8px_20px_-8px_rgba(255,77,45,0.6)]',
  soft: 'bg-soft text-ink hover:bg-line/70',
  ghost: 'text-ink-2 hover:bg-soft',
  danger: 'bg-bad-soft text-bad hover:bg-bad hover:text-white',
};

export function Button({
  variant = 'primary',
  size = 'md',
  busy,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; busy?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-11 px-5 text-sm',
        VARIANTS[variant],
        className
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------
export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-ink-2">
        {label}
      </label>
      {children}
      {error ? <p className="text-[13px] text-bad">{error}</p> : hint ? <p className="text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

const inputClass =
  'h-11 w-full rounded-2xl bg-soft px-4 text-sm text-ink placeholder:text-muted-2 outline-none ring-1 ring-transparent transition focus:bg-white focus:ring-blue/60 disabled:opacity-60';

export function TextField({ label, hint, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input id={id} {...rest} className={cx(inputClass, error && 'ring-bad/60')} aria-invalid={Boolean(error) || undefined} />
    </Field>
  );
}

export function PasswordField({ label, hint, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        <input id={id} {...rest} type={shown ? 'text' : 'password'} className={cx(inputClass, 'pr-12', error && 'ring-bad/60')} aria-invalid={Boolean(error) || undefined} />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          className="absolute inset-y-0 right-1 my-1 grid w-10 place-items-center rounded-xl text-muted hover:text-ink"
          aria-label={shown ? 'Hide password' : 'Show password'}
        >
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cx(inputClass, 'appearance-none pr-10')}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** An on/off switch with a label and a line of help. */
export function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-soft px-4 py-3">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-semibold">{label}</span>
        {hint ? <span className="block text-[13px] text-muted">{hint}</span> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50', checked ? 'bg-good' : 'bg-muted-2')}
      >
        <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Surfaces and feedback
// ---------------------------------------------------------------------------
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-3xl bg-surface shadow-card', className)}>{children}</div>;
}

export function Alert({ tone = 'bad', children }: { tone?: 'bad' | 'good' | 'info'; children: ReactNode }) {
  const styles = { bad: 'bg-bad-soft text-bad', good: 'bg-good-soft text-good', info: 'bg-blue-soft text-navy' }[tone];
  const Icon = tone === 'good' ? CheckCircle2 : AlertCircle;
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('flex items-start gap-2.5 rounded-2xl px-4 py-3 text-[13px] leading-5', styles)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'blue' | 'good' | 'bad' | 'ink'; children: ReactNode }) {
  const styles = {
    neutral: 'bg-soft text-ink-2',
    accent: 'bg-accent-soft text-accent',
    blue: 'bg-blue-soft text-navy',
    good: 'bg-good-soft text-good',
    bad: 'bg-bad-soft text-bad',
    ink: 'bg-ink text-white',
  }[tone];
  return <span className={cx('inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap', styles)}>{children}</span>;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted" role="status">
      <Loader2 className="size-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------
export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input, select, button[data-autofocus]')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-3xl bg-surface shadow-pop">
        <div className="flex items-center justify-between px-6 pt-5">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full text-muted hover:bg-soft hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 px-6 pb-6">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Confirmation instead of window.confirm. */
export function Confirm({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            busy={busy}
            data-autofocus
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
                onClose();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Something went wrong.');
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-ink-2">{body}</div>
      {error ? <Alert>{error}</Alert> : null}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Signed-out pages (sign in, invitation, reset)
// ---------------------------------------------------------------------------
export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-9 place-items-center rounded-xl bg-ink">
        <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
          <path d="M10 20V12M14 23V9M18 20V12M22 17v-2" stroke="#FF4D2D" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-bold">Voice AI</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Admin portal</div>
      </div>
    </div>
  );
}

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="p-7 sm:p-8">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </Card>
        <p className="mt-6 text-center text-[12px] text-muted-2">For the Voice AI platform team only. Every action is recorded.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export function timeAgo(iso: string | null) {
  if (!iso) return 'Never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 0) {
    const ahead = -s;
    if (ahead < 3600) return `in ${Math.max(1, Math.round(ahead / 60))} min`;
    if (ahead < 86400) return `in ${Math.round(ahead / 3600)} h`;
    return `in ${Math.round(ahead / 86400)} days`;
  }
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const fullTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export { cx };

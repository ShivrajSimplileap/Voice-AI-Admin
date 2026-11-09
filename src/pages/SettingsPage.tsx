import { useState, type FormEvent } from 'react';
import { Cpu, Wrench } from 'lucide-react';
import { api, type AiModelSettings, type Maintenance } from '../api';
import { useTitle } from '../router';
import { useAdmin } from '../session';
import { Alert, Badge, Button, Card, Confirm, PageHeader, TextField, fullTime } from '../components/ui';
import { Loaded, useLoad } from '../components/data';

/** Phase 5: platform-wide settings. Super admins change them; everyone else can look. */
export function SettingsPage() {
  useTitle('Platform settings');
  const state = useLoad(() => Promise.all([api.maintenance(), api.aiModels()]), []);
  return (
    <>
      <PageHeader title="Platform settings" subtitle="Settings that apply to every workspace." />
      <Loaded state={state}>
        {([m, models]) => (
          <div className="space-y-4">
            <MaintenanceCard key={JSON.stringify(m)} m={m} onChanged={state.reload} />
            <ModelsCard key={JSON.stringify(models)} s={models} onChanged={state.reload} />
          </div>
        )}
      </Loaded>
    </>
  );
}

/** For a datetime-local input, in the viewer's timezone. */
const localInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function MaintenanceCard({ m, onChanged }: { m: Maintenance; onChanged: () => Promise<void> }) {
  const canEdit = useAdmin().role === 'super_admin';
  const [message, setMessage] = useState(m.message ?? 'We’re upgrading Voice AI and will be back shortly.');
  const [until, setUntil] = useState(localInput(m.until));
  const [confirm, setConfirm] = useState<'on' | 'off' | null>(null);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="flex items-center gap-2 text-[15px] font-bold">
            <Wrench className="size-4" /> Maintenance mode {m.on ? <Badge tone="bad">On</Badge> : <Badge>Off</Badge>}
          </h3>
          <p className="mt-1 text-sm text-muted">
            Every workspace sees a maintenance screen with your message instead of the CRM, no calls go out (campaigns and callbacks wait), and browser voice is refused.
            Inbound calls are still answered and calls in progress continue. Nothing ends it automatically.
          </p>
          {m.on && m.at ? (
            <p className="mt-2 text-[13px] text-muted">
              Turned on {fullTime(m.at)}
              {m.by ? ` by ${m.by}` : ''}.
            </p>
          ) : null}
        </div>
        {canEdit && m.on ? (
          <Button variant="primary" onClick={() => setConfirm('off')}>
            End maintenance
          </Button>
        ) : null}
      </div>

      {canEdit && !m.on ? (
        <form
          className="mt-4 grid gap-3 border-t border-line/70 pt-4 md:grid-cols-[2fr_1fr_auto] md:items-end"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (message.trim().length >= 3) setConfirm('on');
          }}
        >
          <TextField label="Message for customers" value={message} maxLength={300} onChange={(e) => setMessage(e.target.value)} error={message.trim().length < 3 ? 'Write a short message.' : null} />
          <TextField label="Back by (optional)" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
          <Button type="submit" variant="danger" disabled={message.trim().length < 3}>
            Start maintenance
          </Button>
        </form>
      ) : null}
      {m.on ? <p className="mt-3 rounded-xl bg-soft px-4 py-3 text-sm">“{m.message}”{m.until ? ` · back by ${fullTime(m.until)}` : ''}</p> : null}

      {confirm ? (
        <Confirm
          title={confirm === 'on' ? 'Start maintenance mode?' : 'End maintenance mode?'}
          body={
            <p>
              {confirm === 'on'
                ? 'Every customer is shown the maintenance screen within a few seconds, and outbound calls stop.'
                : 'The CRM opens again for everyone, and campaigns continue.'}
            </p>
          }
          confirmLabel={confirm === 'on' ? 'Start maintenance' : 'End maintenance'}
          danger={confirm === 'on'}
          onConfirm={async () => {
            await api.setMaintenance(confirm === 'on' ? { on: true, message: message.trim(), until: until ? new Date(until).toISOString() : null } : { on: false });
            window.dispatchEvent(new Event('admin:maintenance-changed'));
            await onChanged();
          }}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </Card>
  );
}

const list = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function ModelsCard({ s, onChanged }: { s: AiModelSettings; onChanged: () => Promise<void> }) {
  const canEdit = useAdmin().role === 'super_admin';
  const [live, setLive] = useState(s.current.live);
  const [analysis, setAnalysis] = useState(s.current.analysis.join(', '));
  const [transcription, setTranscription] = useState(s.current.transcription.join(', '));
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  async function save(body: Parameters<typeof api.setAiModels>[0], label: string, done: string) {
    setBusy(label);
    setNotice(null);
    try {
      await api.setAiModels(body);
      setNotice({ tone: 'good', text: done });
      await onChanged();
    } catch (err) {
      setNotice({ tone: 'bad', text: err instanceof Error ? err.message : 'Couldn’t save.' });
      setBusy(null);
    }
  }

  const rows: { key: 'live' | 'analysis' | 'transcription'; label: string; hint: string; value: string; set: (v: string) => void; many: boolean }[] = [
    { key: 'live', label: 'Live voice', hint: 'Phone calls and Playground. New calls use it; calls in progress keep theirs.', value: live, set: setLive, many: false },
    { key: 'analysis', label: 'Call summaries', hint: 'Tried in order: an overloaded or retired model falls through to the next. Comma-separated.', value: analysis, set: setAnalysis, many: true },
    { key: 'transcription', label: 'Audio transcription', hint: 'Audio knowledge files. Tried in order, comma-separated.', value: transcription, set: setTranscription, many: true },
  ];

  return (
    <Card className="p-5">
      <h3 className="flex items-center gap-2 text-[15px] font-bold">
        <Cpu className="size-4" /> AI models
      </h3>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        The Gemini models the platform uses. A blank or reset field uses the server’s config.{' '}
        {s.hasApiKey ? 'Names are checked with Google when you save.' : 'No Gemini key is set, so names aren’t checked.'}
      </p>
      {notice ? (
        <div className="mt-3">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      ) : null}
      <div className="mt-4 space-y-4">
        {rows.map((r) => (
          <div key={r.key} className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
            <TextField
              label={r.label}
              value={r.value}
              disabled={!canEdit}
              onChange={(e) => r.set(e.target.value)}
              hint={
                <>
                  {r.hint} Config: <span className="font-mono">{(r.many ? s.config[r.key] as string[] : [s.config[r.key] as string]).join(', ')}</span>
                  {s.overridden[r.key] ? ' · changed here' : ''}
                </>
              }
            />
            {canEdit ? (
              <div className="flex gap-2 md:pb-6">
                <Button
                  size="sm"
                  busy={busy === r.key}
                  disabled={!r.value.trim()}
                  onClick={() => void save({ [r.key]: r.many ? list(r.value) : r.value.trim() }, r.key, `${r.label} model saved.`)}
                >
                  Save
                </Button>
                {s.overridden[r.key] ? (
                  <Button size="sm" variant="ghost" busy={busy === `${r.key}-reset`} onClick={() => void save({ [r.key]: null }, `${r.key}-reset`, `${r.label} uses the config again.`)}>
                    Reset
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
        <div className="rounded-xl bg-soft px-4 py-3 text-sm">
          <span className="font-semibold">Knowledge embeddings:</span> <span className="font-mono">{s.embedding}</span>
          <span className="text-muted"> · fixed in the config. Changing it would need every knowledge file indexed again.</span>
        </div>
      </div>
    </Card>
  );
}

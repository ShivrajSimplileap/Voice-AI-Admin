import { useState, type ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { api, type VerificationRow, type VerificationStage, type VerificationState } from '../api';
import { useAdmin } from '../session';
import { Alert, Badge, Button, Card, Modal, Toggle, timeAgo } from '../components/ui';
import { FilterBar, FilterSelect, Loaded, Pager, SearchBox, Table, useLoad, type Column } from '../components/data';

/**
 * Business verification before a workspace gets numbers (like Bolna's compliance application):
 * the workspace sends its company details, CIN and GST certificates; admins review them here. On
 * approval the workspace gets its own Vobiz sub-account (customer use) and completes Vobiz's KYC.
 */

export const BUSINESS_TYPE_LABEL: Record<string, string> = {
  private_limited: 'Private limited company',
  public_limited: 'Public limited company',
  llp: 'LLP',
  partnership: 'Partnership firm',
  proprietorship: 'Sole proprietorship',
  trust: 'Trust',
  society: 'Society',
  huf: 'HUF',
  government: 'Government body',
};

const STAGE: Record<VerificationStage, { label: string; tone: 'good' | 'bad' | 'accent' | 'neutral' | 'blue' }> = {
  covered: { label: 'Covered by the platform’s KYC', tone: 'good' },
  verified: { label: 'Verified', tone: 'good' },
  apply: { label: 'Not sent yet', tone: 'neutral' },
  in_review: { label: 'Waiting for review', tone: 'accent' },
  needs_info: { label: 'More information asked', tone: 'blue' },
  rejected: { label: 'Rejected', tone: 'bad' },
  setup: { label: 'Approved · no Vobiz sub-account', tone: 'bad' },
  vobiz_kyc: { label: 'Approved · Vobiz KYC pending', tone: 'blue' },
};

const STATUS: Record<string, { label: string; tone: 'good' | 'bad' | 'accent' | 'blue' }> = {
  submitted: { label: 'Waiting for review', tone: 'accent' },
  needs_info: { label: 'More information asked', tone: 'blue' },
  approved: { label: 'Approved', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'bad' },
};

/** Opens a PDF in a new tab (fetched with the session token). */
async function openDocument(orgId: string, kind: 'registration' | 'gst') {
  const tab = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await api.verificationDocument(orgId, kind));
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/** The workspace's verification: its application, the review, and Vobiz's KYC. */
export function WorkspaceVerification({ orgId, onChanged }: { orgId: string; onChanged?: () => void }) {
  const state = useLoad(() => api.orgVerification(orgId), [orgId]);
  return (
    <Loaded state={state}>
      {(v) => (
        <Review
          orgId={orgId}
          v={v}
          onChanged={async () => {
            await state.reload();
            onChanged?.();
          }}
        />
      )}
    </Loaded>
  );
}

function Review({ orgId, v, onChanged }: { orgId: string; v: VerificationState; onChanged: () => Promise<void> }) {
  const role = useAdmin().role;
  const canAct = role !== 'viewer';
  const isSuper = role === 'super_admin';
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [sendingBack, setSendingBack] = useState<'reject' | 'needs-info' | null>(null);
  const a = v.application;
  const reviewable = a && (a.status === 'submitted' || a.status === 'needs_info');
  const stage = STAGE[v.stage];

  async function act(what: string, fn: () => Promise<string>) {
    setBusy(what);
    setNotice(null);
    try {
      const text = await fn();
      await onChanged();
      setNotice({ tone: 'good', text });
    } catch (err) {
      setNotice({ tone: 'bad', text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-bold">
        Business verification <Badge tone={stage.tone}>{stage.label}</Badge>
        {v.canGetNumbers ? <Badge tone="good">Can get numbers</Badge> : <Badge>Can’t get numbers yet</Badge>}
      </h3>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Needed before the workspace can buy or pick numbers. It sends its company details, CIN and GST certificates; once you approve, it gets its own Vobiz sub-account and
        completes Vobiz’s KYC. Numbers it already has keep working.
      </p>
      {notice ? (
        <div className="mt-3">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      ) : null}

      {a ? (
        <>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Item label="Company" value={a.companyName} />
            <Item label="Business type" value={BUSINESS_TYPE_LABEL[a.businessType] ?? a.businessType} />
            <Item label="Sent by (legal name)" value={`${a.firstName} ${a.lastName}`} />
            <Item label={a.businessType === 'llp' ? 'LLPIN' : ['private_limited', 'public_limited'].includes(a.businessType) ? 'CIN' : 'Registration number'} value={<span className="font-mono">{a.registrationNumber}</span>} />
            <Item label="GSTIN" value={<span className="font-mono">{a.gstin}</span>} />
            <Item label="Application" value={<Badge tone={STATUS[a.status]?.tone ?? 'accent'}>{STATUS[a.status]?.label ?? a.status}</Badge>} />
          </dl>
          <p className="mt-2 text-[12px] text-muted">
            Sent {timeAgo(a.submittedAt).toLowerCase()}
            {a.reviewedAt ? ` · reviewed ${timeAgo(a.reviewedAt).toLowerCase()}` : ''}
          </p>
          {a.reviewNote ? (
            <div className="mt-3">
              <Alert tone="info">Note to the workspace: “{a.reviewNote}”</Alert>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {(['registration', 'gst'] as const).map((kind) => (
              <Button
                key={kind}
                variant="soft"
                icon={<FileText className="size-4" />}
                busy={busy === kind}
                onClick={() => void act(kind, async () => (await openDocument(orgId, kind), 'Opened in a new tab.'))}
              >
                {kind === 'registration' ? 'Registration certificate' : 'GST certificate'} · {kind === 'registration' ? a.registrationFileName : a.gstFileName}
              </Button>
            ))}
          </div>
          {canAct && reviewable ? (
            <div className="mt-4 rounded-2xl bg-soft p-4">
              <p className="text-sm">
                Check that the company name, CIN and GSTIN match the certificates (and the GSTIN’s PAN part matches the company). Approving makes the workspace’s Vobiz sub-account.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button busy={busy === 'approve'} onClick={() => void act('approve', async () => (await api.approveVerification(orgId), 'Approved. The workspace was emailed to complete the Vobiz KYC.'))}>
                  Approve
                </Button>
                <Button variant="soft" onClick={() => setSendingBack('needs-info')}>
                  Ask for more information
                </Button>
                <Button variant="danger" onClick={() => setSendingBack('reject')}>
                  Reject
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">{v.stage === 'covered' ? 'Nothing to review: the platform’s KYC covers this workspace.' : 'The workspace hasn’t sent its application yet.'}</p>
      )}

      {v.vobiz && v.vobiz.mode === 'customer_use' ? (
        <p className="mt-4 text-sm">
          <strong>Vobiz KYC:</strong> {v.vobiz.status.replace(/_/g, ' ')}
          {v.vobiz.callsBlocked ? ' · calls on its sub-account blocked until verified' : ''}
          {v.vobiz.checkedAt ? <span className="text-muted"> · checked {timeAgo(v.vobiz.checkedAt).toLowerCase()}</span> : null}
        </p>
      ) : null}

      {isSuper ? (
        <div className="mt-4 border-t border-line pt-4">
          <Toggle
            label="Waive verification (covered by the platform’s KYC)"
            hint="For internal and test workspaces only: their numbers and calls run under your own Vobiz KYC."
            checked={v.waived}
            disabled={busy !== null}
            onChange={(waived) => void act('waive', async () => (await api.setVerificationWaived(orgId, waived), waived ? 'Waived.' : 'Verification is required again.'))}
          />
        </div>
      ) : null}

      {sendingBack ? (
        <SendBack
          outcome={sendingBack}
          onClose={() => setSendingBack(null)}
          onSend={async (note) => {
            await api.sendBackVerification(orgId, sendingBack, note);
            setSendingBack(null);
            await onChanged();
            setNotice({ tone: 'good', text: sendingBack === 'reject' ? 'Rejected; the workspace was emailed the reason.' : 'Sent back; the workspace was emailed what’s needed.' });
          }}
        />
      ) : null}
    </Card>
  );
}

function SendBack({ outcome, onClose, onSend }: { outcome: 'reject' | 'needs-info'; onClose: () => void; onSend: (note: string) => Promise<void> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title={outcome === 'reject' ? 'Reject the application' : 'Ask for more information'}
      subtitle="The workspace sees this note and gets it by email, then can send the application again."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={outcome === 'reject' ? 'danger' : 'primary'}
            busy={busy}
            disabled={note.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSend(note.trim());
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Couldn’t send it.');
                setBusy(false);
              }
            }}
          >
            {outcome === 'reject' ? 'Reject' : 'Send'}
          </Button>
        </>
      }
    >
      {error ? <Alert>{error}</Alert> : null}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        maxLength={1000}
        aria-label="Note to the workspace"
        placeholder={outcome === 'reject' ? 'e.g. The CIN belongs to a different company.' : 'e.g. The GST certificate is unreadable; please upload a clearer copy.'}
        className="mt-2 w-full rounded-2xl bg-soft px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ink/20"
      />
    </Modal>
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

/** Compliance → Business verification: every workspace's application, waiting ones first. */
export function VerificationQueue({ status, q, page, set }: { status: string; q: string; page: string; set: (v: Record<string, string>) => void }) {
  const state = useLoad(() => api.verifications({ status: status === 'all' ? undefined : status, q, page, pageSize: 25 }), [status, q, page]);
  const [open, setOpen] = useState<VerificationRow | null>(null);

  const columns: Column<VerificationRow & { id: string }>[] = [
    {
      key: 'org',
      label: 'Workspace',
      render: (r) => (
        <div>
          <div className="font-semibold">{r.orgName}</div>
          <div className="text-[12px] text-muted">{r.companyName}</div>
        </div>
      ),
    },
    { key: 'type', label: 'Type', render: (r) => BUSINESS_TYPE_LABEL[r.businessType] ?? r.businessType },
    { key: 'gstin', label: 'GSTIN', render: (r) => <span className="font-mono text-[13px]">{r.gstin}</span> },
    { key: 'status', label: 'Status', render: (r) => <Badge tone={STATUS[r.status]?.tone ?? 'accent'}>{STATUS[r.status]?.label ?? r.status}</Badge> },
    { key: 'sent', label: 'Sent', render: (r) => <span className="text-muted">{timeAgo(r.submittedAt)}</span> },
  ];

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Workspaces send their company details, CIN and GST certificates before they can get phone numbers. Approving gives them their own Vobiz sub-account, where they complete
        Vobiz’s KYC; then they can buy numbers.
      </Alert>
      <FilterBar>
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => set({ vstatus: v, page: '1' })}
          options={[
            { value: 'submitted', label: 'Waiting for review' },
            { value: 'needs_info', label: 'More information asked' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'all', label: 'All' },
          ]}
        />
        <SearchBox value={q} onChange={(v) => set({ q: v, page: '1' })} placeholder="Search workspace, company or GSTIN" />
      </FilterBar>
      <Loaded state={state}>
        {(p) => (
          <>
            {p.waiting ? <p className="text-sm font-semibold">{p.waiting} waiting for review</p> : null}
            <Table
              rows={p.data.map((r) => ({ ...r, id: r.orgId }))}
              columns={columns}
              onRow={(r) => setOpen(r)}
              empty={status === 'submitted' ? 'Nothing waiting for review.' : 'No applications.'}
            />
            <Pager page={p.page} pageSize={p.pageSize} total={p.total} onPage={(n) => set({ page: String(n) })} />
          </>
        )}
      </Loaded>
      {open ? (
        <Modal title={open.orgName} subtitle={open.companyName} onClose={() => setOpen(null)} size="xl">
          <WorkspaceVerification orgId={open.orgId} onChanged={() => void state.reload()} />
        </Modal>
      ) : null}
    </div>
  );
}

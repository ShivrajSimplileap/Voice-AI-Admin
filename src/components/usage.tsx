import type { LimitKey, UsageKind } from '../api';
import { cx } from './ui';
import { fmtNum } from './data';

/** Shared bits of the usage and plan screens (Phase 4). */

export const LIMITS: { key: LimitKey; label: string; unit: string; hint: string }[] = [
  { key: 'minutesPerMonth', label: 'Call minutes a month', unit: 'min', hint: 'Inbound and outbound phone calls, each rounded up to the minute. Used up: calls pause until next month.' },
  { key: 'seats', label: 'Members', unit: '', hint: 'People in the workspace, plus pending invitations.' },
  { key: 'numbers', label: 'Phone numbers', unit: '', hint: 'Free numbers an owner can take themselves.' },
  { key: 'agents', label: 'Agents', unit: '', hint: 'AI agents the workspace can create.' },
  { key: 'activeCampaigns', label: 'Running campaigns', unit: '', hint: 'Running or scheduled at the same time.' },
  { key: 'storageMb', label: 'Knowledge storage', unit: 'MB', hint: 'Knowledge files uploaded.' },
];

export const KIND_LABEL: Record<UsageKind, string> = {
  phone_live: 'Voice on phone calls',
  browser_live: 'Voice in the browser (Playground)',
  analysis: 'Call summaries',
  transcription: 'Audio file transcription',
  embedding: 'Knowledge search and indexing',
};

export const PROVIDER_LABEL: Record<string, string> = { sinch: 'Sinch', plivo: 'Plivo', unknown: 'Unknown provider' };

export const limitText = (v: number | undefined, unit = '') => (v === undefined || v === null ? 'Unlimited' : `${fmtNum(v)}${unit ? ` ${unit}` : ''}`);

/** How much of a limit is used: a bar, with words for near and over (never colour alone). */
export function Meter({ used, limit, unit = '' }: { used: number; limit: number | undefined | null; unit?: string }) {
  const unlimited = limit === undefined || limit === null;
  const share = unlimited ? 0 : limit === 0 ? 1 : used / limit;
  const level = unlimited ? 'ok' : share >= 1 ? 'over' : share >= 0.8 ? 'near' : 'ok';
  const u = unit ? ` ${unit}` : '';
  return (
    <div className="min-w-[140px]">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="font-semibold tabular-nums">
          {fmtNum(used)}
          {unlimited ? u : ` / ${fmtNum(limit)}${u}`}
        </span>
        {level === 'over' ? <span className="text-[12px] font-semibold text-bad">At limit</span> : level === 'near' ? <span className="text-[12px] font-semibold text-accent">Near limit</span> : unlimited ? <span className="text-[12px] text-muted">No limit</span> : null}
      </div>
      {!unlimited ? (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-soft" role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}>
          <div className={cx('h-full rounded-full', level === 'over' ? 'bg-bad' : level === 'near' ? 'bg-accent' : 'bg-blue')} style={{ width: `${Math.min(100, Math.round(share * 100))}%` }} />
        </div>
      ) : null}
    </div>
  );
}

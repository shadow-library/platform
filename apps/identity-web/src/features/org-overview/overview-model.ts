import {
  type BotsResponse,
  type DomainsResponse,
  type IdentityProviderListResponse,
  type InvitationsResponse,
  isPolicyConfigured,
  type MembersResponse,
  type OrganisationApplicationsResponse,
  type PolicyListResponse,
} from '@/lib/apis';
import { formatDate } from '@/lib/format';

import { type OrgGates } from '../portal/org-gates';

export interface QuerySlice<T> {
  data: T | undefined;
  isError: boolean;
}

export type SliceState = 'loading' | 'error' | 'ready';

export type TileKey = 'members' | 'applications' | 'bots' | 'domains';

export type OverviewPath =
  | '/organizations/$orgId/members'
  | '/organizations/$orgId/applications'
  | '/organizations/$orgId/bots'
  | '/organizations/$orgId/domains'
  | '/organizations/$orgId/providers'
  | '/organizations/$orgId/security';

export interface OverviewTile {
  key: TileKey;
  label: string;
  to: OverviewPath;
  state: SliceState;
  value: number | null;
  detail: string | null;
}

export interface TileSlices {
  members: QuerySlice<MembersResponse>;
  invitations: QuerySlice<InvitationsResponse>;
  applications: QuerySlice<OrganisationApplicationsResponse>;
  bots: QuerySlice<BotsResponse>;
  domains: QuerySlice<DomainsResponse>;
}

export type ChecklistKey = 'domain' | 'sso' | 'policies';

export type ChecklistStatus = 'loading' | 'unknown' | 'todo' | 'done';

export interface ChecklistRow {
  key: ChecklistKey;
  title: string;
  status: ChecklistStatus;
  detail: string | null;
  to: OverviewPath;
}

export interface ChecklistSlices {
  domains: QuerySlice<DomainsResponse>;
  providers: QuerySlice<IdentityProviderListResponse>;
  policies: QuerySlice<PolicyListResponse>;
}

export interface Checklist {
  rows: ChecklistRow[];
  done: number;
  summary: string | null;
}

interface TileReading {
  value: number;
  detail: string | null;
}

interface RowReading {
  done: boolean;
  detail: string;
}

export function pluralize(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

export function sliceState(slice: QuerySlice<unknown>): SliceState {
  if (slice.data !== undefined) return 'ready';
  return slice.isError ? 'error' : 'loading';
}

function tile<T>(key: TileKey, label: string, to: OverviewPath, slice: QuerySlice<T>, read: (data: T) => TileReading): OverviewTile {
  const base = { key, label, to };
  if (slice.data === undefined) return { ...base, state: sliceState(slice), value: null, detail: null };
  return { ...base, state: 'ready', ...read(slice.data) };
}

function membersDetail(gates: OrgGates, invitations: QuerySlice<InvitationsResponse>): string | null {
  if (!gates.invitations || invitations.data === undefined) return null;
  const pending = invitations.data.invitations.length;
  return pending === 0 ? 'No pending invitations' : `${pluralize(pending, 'invitation')} pending`;
}

function applicationsReading({ appAccessMode, applications }: OrganisationApplicationsResponse): TileReading {
  if (appAccessMode === 'ASSIGNED_ONLY') return { value: applications.filter(app => app.assigned).length, detail: 'Assigned · managed access' };
  return { value: applications.length, detail: 'Available · open access' };
}

function botsReading({ bots, usage }: BotsResponse): TileReading {
  if (bots.length === 0) return { value: usage.count, detail: 'No bots yet' };
  const active = bots.filter(bot => bot.status === 'ACTIVE').length;
  const suspended = bots.filter(bot => bot.status === 'SUSPENDED').length;
  const deleting = bots.filter(bot => bot.status === 'DELETING').length;
  return { value: usage.count, detail: `${active} active · ${suspended} suspended${deleting > 0 ? ` · ${deleting} deleting` : ''}` };
}

function domainsReading({ domains }: DomainsResponse): TileReading {
  const value = domains.filter(domain => domain.status === 'VERIFIED').length;
  if (domains.length === 0) return { value, detail: 'None registered' };
  const pending = domains.filter(domain => domain.status === 'PENDING').length;
  const failed = domains.filter(domain => domain.status === 'FAILED').length;
  const attention = [pending > 0 ? `${pending} pending` : null, failed > 0 ? `${failed} failed` : null].filter(part => part !== null);
  return { value, detail: attention.length > 0 ? attention.join(' · ') : 'All verified' };
}

export function buildTiles(gates: OrgGates, slices: TileSlices): OverviewTile[] {
  const tiles = [
    tile('members', 'Members', '/organizations/$orgId/members', slices.members, ({ members }) => ({ value: members.length, detail: membersDetail(gates, slices.invitations) })),
  ];
  if (gates.applications) tiles.push(tile('applications', 'Applications', '/organizations/$orgId/applications', slices.applications, applicationsReading));
  if (gates.bots) tiles.push(tile('bots', 'Bots', '/organizations/$orgId/bots', slices.bots, botsReading));
  if (gates.domains) tiles.push(tile('domains', 'Domains', '/organizations/$orgId/domains', slices.domains, domainsReading));
  return tiles;
}

function row<T>(key: ChecklistKey, title: string, to: OverviewPath, slice: QuerySlice<T>, read: (data: T) => RowReading): ChecklistRow {
  const base = { key, title, to };
  if (slice.data !== undefined) {
    const { done, detail } = read(slice.data);
    return { ...base, status: done ? 'done' : 'todo', detail };
  }
  if (slice.isError) return { ...base, status: 'unknown', detail: 'Couldn’t load this status.' };
  return { ...base, status: 'loading', detail: null };
}

function domainReading({ domains }: DomainsResponse): RowReading {
  const verified = domains.filter(domain => domain.status === 'VERIFIED');
  const [first] = verified;
  if (first === undefined) return { done: false, detail: 'Prove ownership of your email domain with a DNS record.' };
  if (verified.length > 1) return { done: true, detail: `${verified.length} domains verified.` };
  const date = formatDate(first.verifiedAt);
  return { done: true, detail: `${first.domain} verified${date ? ` ${date}` : ''}.` };
}

function providersReading({ items }: IdentityProviderListResponse): RowReading {
  if (items.length === 0) return { done: false, detail: 'Let members sign in through your own OIDC identity provider.' };
  return { done: true, detail: `${pluralize(items.length, 'identity provider')} connected.` };
}

function policiesReading({ policies }: PolicyListResponse): RowReading {
  const configured = policies.filter(isPolicyConfigured).length;
  if (configured === 0) return { done: false, detail: 'Every policy currently inherits the platform default.' };
  return { done: true, detail: `${pluralize(configured, 'policy', 'policies')} set for this organization.` };
}

export function buildChecklist(slices: ChecklistSlices): Checklist {
  const rows = [
    row('domain', 'Verify a domain', '/organizations/$orgId/domains', slices.domains, domainReading),
    row('sso', 'Connect single sign-on', '/organizations/$orgId/providers', slices.providers, providersReading),
    row('policies', 'Review security policies', '/organizations/$orgId/security', slices.policies, policiesReading),
  ];
  const done = rows.filter(item => item.status === 'done').length;
  const settled = rows.every(item => item.status !== 'loading');
  return { rows, done, summary: settled ? `${done} of ${rows.length} done` : null };
}

import { ApiError } from '@shadow-library/web';
import { useQuery } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import { type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataState } from '@/components/DataState';
import { type DataQuery, MemoirStore, SyncClient, SyncEngine, SyncEngineProvider } from '@/lib/sync';

import { renderScreen } from './harness';
import { createSyncedTestData, createTestEngine, type FakeServerOptions, sharedBacking } from './sync-harness';

function query<T>(overrides: Partial<DataQuery<T>> = {}): DataQuery<T> {
  return { data: undefined, isError: false, isFetching: false, dataUpdatedAt: 0, error: null, refetch: vi.fn().mockResolvedValue(undefined), ...overrides };
}

function renderWithEngine(node: ReactNode, engine: SyncEngine): void {
  const data = createSyncedTestData(engine);
  renderScreen(<SyncEngineProvider data={data}>{node}</SyncEngineProvider>, { value: data });
}

function renderState(node: ReactNode, server: FakeServerOptions = {}): void {
  renderWithEngine(node, createTestEngine({ ...server, today: '2026-08-24' }).engine);
}

const SKELETON = <span>skeleton</span>;

describe('DataState', () => {
  beforeEach(() => Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }));

  it('should render each readiness state', async () => {
    renderScreen(
      <>
        <DataState skeleton={SKELETON} query={query<string>()} source="server">
          never
        </DataState>
        <DataState skeleton={SKELETON} query={query<string>({ isError: true, error: new Error('boom') })} source="server">
          never
        </DataState>
        <DataState skeleton={SKELETON} query={query({ data: [] as string[] })} isEmpty={items => items.length === 0} empty={<span>nothing yet</span>}>
          never
        </DataState>
        <DataState skeleton={SKELETON} query={query({ data: 'content' })}>
          {data => <span>{data}</span>}
        </DataState>
      </>,
    );

    expect((await screen.findByRole('status', { name: 'Loading' })).textContent).toBe('skeleton');
    expect(screen.getByText("Couldn't load this right now")).toBeDefined();
    expect(screen.getByText('nothing yet')).toBeDefined();
    expect(screen.getByText('content')).toBeDefined();
    expect(screen.queryByText('never')).toBeNull();
  });

  it('should reject function children without a query', () => {
    // @ts-expect-error function children need a query to hand them data
    const node = <DataState skeleton={SKELETON}>{(data: string) => data}</DataState>;

    expect(node).toBeDefined();
  });

  it('should hold mirror data behind a failed first sync', async () => {
    renderState(<DataState skeleton={SKELETON}>content</DataState>, { status: () => 500 });

    expect(await screen.findByText("Couldn't load this right now")).toBeDefined();
    expect(screen.queryByText('content')).toBeNull();
  });

  it('should render a server query while the mirror sync has failed', async () => {
    renderState(
      <DataState skeleton={SKELETON} query={query({ data: 'from the server' })} source="server">
        {data => <span>{data}</span>}
      </DataState>,
      { status: () => 500 },
    );

    expect(await screen.findByText('from the server')).toBeDefined();
  });

  it('should show the deletion notice for ACC_002', async () => {
    renderState(<DataState skeleton={SKELETON}>content</DataState>, { status: () => 403, errorCode: 'ACC_002' });

    expect(await screen.findByText('This account is being deleted')).toBeDefined();
    expect(screen.getByRole('button', { name: 'See deletion status' })).toBeDefined();
  });

  it('should render mirror content once the first sync lands', async () => {
    renderState(<DataState skeleton={SKELETON}>content</DataState>);

    expect(await screen.findByText('content')).toBeDefined();
  });

  it('should read a server query failure by its error code', async () => {
    const deletion = new ApiError(403, { code: 'ACC_002', type: 'Forbidden', message: 'refused' });
    renderScreen(
      <DataState skeleton={SKELETON} query={query<string>({ isError: true, error: deletion })} source="server">
        content
      </DataState>,
    );

    expect(await screen.findByRole('button', { name: 'See deletion status' })).toBeDefined();
  });

  it('should leave signing in to the session overlay rather than offer a retry', async () => {
    const expired = new ApiError(401, { code: 'IAM_001', type: 'Unauthorized', message: 'expired' });
    renderScreen(
      <DataState skeleton={SKELETON} query={query<string>({ isError: true, error: expired })} source="server">
        content
      </DataState>,
    );

    expect(await screen.findByText("You're signed out")).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('should refetch a failed server query on Try again', async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error('boom')).mockResolvedValue('loaded');
    function Screen(): ReactElement {
      return (
        <DataState skeleton={SKELETON} query={useQuery({ queryKey: ['data-state', 'retry'], queryFn: load })} source="server">
          {data => <span>{data}</span>}
        </DataState>
      );
    }
    renderScreen(<Screen />);

    (await screen.findByRole('button', { name: 'Try again' })).click();

    expect(await screen.findByText('loaded')).toBeDefined();
  });

  it('should keep loaded server data when a refetch fails', async () => {
    const load = vi.fn<() => Promise<string>>().mockResolvedValueOnce('loaded').mockRejectedValue(new Error('offline'));
    const handle: { refetch?: () => Promise<unknown> } = {};
    function Screen(): ReactElement {
      const result = useQuery({ queryKey: ['data-state', 'background'], queryFn: load });
      handle.refetch = result.refetch;
      return (
        <DataState skeleton={SKELETON} query={result} source="server">
          {data => <span>{data}</span>}
        </DataState>
      );
    }
    renderScreen(<Screen />);
    expect(await screen.findByText('loaded')).toBeDefined();

    await act(async () => void (await handle.refetch?.()));

    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByText('loaded')).toBeDefined();
    expect(screen.queryByText("Couldn't load this right now")).toBeNull();
  });

  it('should keep focus on Try again while a failed sync retries', async () => {
    const failSlowly = (async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return new Response(JSON.stringify({ message: 'no' }), { status: 500 });
    }) as typeof fetch;
    const engine = new SyncEngine({ store: new MemoirStore(sharedBacking()), client: new SyncClient({ fetchImpl: failSlowly }), today: '2026-08-24' });
    renderWithEngine(<DataState skeleton={SKELETON}>content</DataState>, engine);
    const button = await screen.findByRole('button', { name: 'Try again' });

    button.focus();
    button.click();
    await waitFor(() => expect(button.textContent).toBe('Trying again…'));

    await waitFor(() => expect(button.textContent).toBe('Try again'));
    expect(document.activeElement).toBe(button);
  });
});

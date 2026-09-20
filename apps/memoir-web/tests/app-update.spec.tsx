import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { type ReactElement, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { type RegisterServiceWorkerOptions, type ServiceWorkerController } from '@shadow-library/web/pwa';

const worker = vi.hoisted(() => ({
  options: null as RegisterServiceWorkerOptions | null,
  applyUpdate: vi.fn(),
  registration: { waiting: {} as object | null },
}));

const controller = {
  get registration() {
    return worker.registration;
  },
  applyUpdate: worker.applyUpdate,
} as unknown as ServiceWorkerController;

vi.mock('@shadow-library/web/pwa', async importOriginal => ({
  ...(await importOriginal<typeof import('@shadow-library/web/pwa')>()),
  isServiceWorkerSupported: () => true,
  registerServiceWorker: (options: RegisterServiceWorkerOptions) => {
    worker.options = options;
    return controller;
  },
}));

function stubServiceWorker(controlling: object | null): { serviceWorker: { controller: object | null } } {
  const stub = { serviceWorker: { controller: controlling } };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: stub.serviceWorker });
  return stub;
}

async function renderAppSync(): Promise<void> {
  vi.resetModules();
  const [{ AppSyncScreen }, { SystemOverlayProvider }, { renderScreen }] = await Promise.all([import('@/features/settings'), import('@/features/shell'), import('./harness')]);
  renderScreen(
    <SystemOverlayProvider>
      <AppSyncScreen />
    </SystemOverlayProvider>,
  );
}

async function renderInstallOffer(): Promise<void> {
  vi.resetModules();
  const [{ SystemOverlayProvider, useSystemOverlays }, { renderScreen }] = await Promise.all([import('@/features/shell'), import('./harness')]);
  function OpenInstallOffer(): ReactElement {
    const overlays = useSystemOverlays();
    useEffect(() => overlays.open('install'), [overlays]);
    return <span />;
  }
  renderScreen(
    <SystemOverlayProvider>
      <OpenInstallOffer />
    </SystemOverlayProvider>,
  );
}

function stubReload(): ReturnType<typeof vi.fn> {
  const original = window.location;
  const reload = vi.fn();
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { ...original, reload } });
  onTestFinished(() => void Object.defineProperty(window, 'location', { configurable: true, writable: true, value: original }));
  return reload;
}

async function registerWithUpdate(): Promise<void> {
  expect(await screen.findByText('Needs a connection to open')).toBeDefined();
  act(() => worker.options?.onRegistered?.({} as ServiceWorkerRegistration));
  act(() => worker.options?.onUpdate?.(controller));
}

describe('app update', () => {
  beforeEach(() => {
    vi.stubEnv('PROD', true);
    worker.options = null;
    worker.applyUpdate.mockReset();
    worker.registration.waiting = {};
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('should not claim offline opening for a load no worker served', async () => {
    stubServiceWorker(null);
    await renderAppSync();

    expect(await screen.findByText('Needs a connection to open')).toBeDefined();
    act(() => worker.options?.onRegistered?.({} as ServiceWorkerRegistration));

    expect(await screen.findByText('Opens offline after its next load here')).toBeDefined();
    expect(screen.queryByText('Opens offline')).toBeNull();
    expect(screen.getByText('Up to date')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Reload to update' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh the cache' })).toBeNull();
  });

  it('should say the app opens offline when a worker served this load', async () => {
    stubServiceWorker({});
    await renderAppSync();

    expect(await screen.findByText('Needs a connection to open')).toBeDefined();
    act(() => worker.options?.onRegistered?.({} as ServiceWorkerRegistration));

    expect(await screen.findByText('Opens offline')).toBeDefined();
  });

  it('should claim offline opening in the install offer only when a worker served this load', async () => {
    stubServiceWorker(null);
    await renderInstallOffer();

    expect(await screen.findByText(/anything you log is kept on this device and syncs when you reconnect/)).toBeDefined();
    act(() => worker.options?.onRegistered?.({} as ServiceWorkerRegistration));
    expect(await screen.findByText(/it opens offline after its next load here/)).toBeDefined();
    expect(screen.queryByText(/already opens offline/)).toBeNull();
    expect(screen.queryByText(/already runs offline/)).toBeNull();
  });

  it('should say the install offer opens offline once a worker controls the page', async () => {
    stubServiceWorker({});
    await renderInstallOffer();

    expect(await screen.findByText(/anything you log is kept on this device/)).toBeDefined();
    act(() => worker.options?.onRegistered?.({} as ServiceWorkerRegistration));
    expect(await screen.findByText(/the app already opens offline and syncs when you reconnect/)).toBeDefined();
  });

  it('should offer the update only once a worker is waiting, and apply it on Reload now', async () => {
    stubServiceWorker({});
    await renderAppSync();
    await registerWithUpdate();

    fireEvent.click(await screen.findByRole('button', { name: 'Reload to update' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reload now' }));

    expect(worker.applyUpdate).toHaveBeenCalledTimes(1);
    const reloading = await screen.findByRole('button', { name: 'Reloading…' });
    expect(reloading.getAttribute('aria-busy')).toBe('true');

    fireEvent.click(reloading);
    expect(worker.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('should offer the update again when the new worker never takes control', async () => {
    stubServiceWorker({});
    await renderAppSync();
    await registerWithUpdate();
    fireEvent.click(await screen.findByRole('button', { name: 'Reload to update' }));
    const reloadNow = await screen.findByRole('button', { name: 'Reload now' });

    vi.useFakeTimers({ toFake: ['setTimeout'] });
    fireEvent.click(reloadNow);
    expect(screen.getByRole('button', { name: 'Reloading…' })).toBeDefined();

    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.getByRole('button', { name: 'Reload now' })).toBeDefined();
  });

  it('should reload when another tab already applied the update', async () => {
    const reload = stubReload();
    const stub = stubServiceWorker({});
    await renderAppSync();
    await registerWithUpdate();
    fireEvent.click(await screen.findByRole('button', { name: 'Reload to update' }));
    const reloadNow = await screen.findByRole('button', { name: 'Reload now' });

    worker.registration.waiting = null;
    stub.serviceWorker.controller = {};
    fireEvent.click(reloadNow);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(worker.applyUpdate).not.toHaveBeenCalled();
  });

  it('should return focus to Reload to update after Later', async () => {
    stubServiceWorker({});
    await renderAppSync();
    await registerWithUpdate();

    const trigger = await screen.findByRole('button', { name: 'Reload to update' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('button', { name: 'Later' }));

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

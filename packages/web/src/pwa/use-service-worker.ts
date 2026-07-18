/**
 * Importing npm packages
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { isServiceWorkerSupported, registerServiceWorker, type RegisterServiceWorkerOptions, type ServiceWorkerController } from './register';

/**
 * Defining types
 */
export interface UseServiceWorker {
  isSupported: boolean;
  isRegistered: boolean;
  /** A new worker is installed and waiting — show a refresh prompt, then call `applyUpdate()`. */
  updateAvailable: boolean;
  applyUpdate: () => void;
  controller: ServiceWorkerController | null;
}

/**
 * Declaring the constants
 */

/**
 * Register the service worker for the lifetime of the app and expose its update state to React. Registers
 * exactly once (the worker deliberately outlives the component, so there is no unregister on unmount) and
 * flips `updateAvailable` when a new version is waiting so a "refresh to update" prompt can call `applyUpdate`.
 */
export function useServiceWorker(options: RegisterServiceWorkerOptions = {}): UseServiceWorker {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const controllerRef = useRef<ServiceWorkerController | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    controllerRef.current = registerServiceWorker({
      ...optionsRef.current,
      onRegistered: registration => {
        setIsRegistered(true);
        optionsRef.current.onRegistered?.(registration);
      },
      onUpdate: controller => {
        setUpdateAvailable(true);
        optionsRef.current.onUpdate?.(controller);
      },
    });
  }, []);

  const applyUpdate = useCallback((): void => {
    controllerRef.current?.applyUpdate();
    setUpdateAvailable(false);
  }, []);

  return { isSupported: isServiceWorkerSupported(), isRegistered, updateAvailable, applyUpdate, controller: controllerRef.current };
}

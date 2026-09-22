import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export { act };

/**
 * `createRoot`'s first call in a process pays a real, one-off setup cost (module-level React internals,
 * the reconciler's first pass) that otherwise lands inside whichever test happens to call `renderHook`
 * first, pushing it over the per-test budget for a reason that has nothing to do with that test. Paying
 * it here, at import time rather than inside a test body, keeps it off every file's first test.
 */
{
  const warmup = document.createElement('div');
  const root = createRoot(warmup);
  act(() => root.render(null));
  act(() => root.unmount());
}

export interface RenderHookOptions<TProps> {
  initialProps?: TProps;
  wrapper?: (props: { children: ReactNode }) => ReactElement;
}

export interface RenderHookResult<TResult, TProps> {
  result: { current: TResult };
  rerender: (props?: TProps) => void;
  unmount: () => void;
}

/**
 * A minimal stand-in for `@testing-library/react`'s `renderHook`, built on `react-dom/client` directly:
 * this app's test suite has no other dependency on the library, and pulling it in for one hook-shaped
 * corner would reintroduce the render-testing surface the migration removed. A hidden probe component
 * calls the hook on every render and records its return value; `wrapper` composes the same providers the
 * screens mount under.
 */
export function renderHook<TResult, TProps = void>(callback: (props: TProps) => TResult, options: RenderHookOptions<TProps> = {}): RenderHookResult<TResult, TProps> {
  const result = { current: undefined as unknown as TResult };
  let latestProps = options.initialProps as TProps;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe({ hookProps }: { hookProps: TProps }): null {
    result.current = callback(hookProps);
    return null;
  }

  function tree(props: TProps): ReactElement {
    const probe = <Probe hookProps={props} />;
    return options.wrapper ? options.wrapper({ children: probe }) : probe;
  }

  act(() => {
    root.render(tree(latestProps));
  });

  return {
    result,
    rerender: (props?: TProps) => {
      if (props !== undefined) latestProps = props;
      act(() => {
        root.render(tree(latestProps));
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

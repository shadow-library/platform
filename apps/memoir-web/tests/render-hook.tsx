import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export { act };

/** `createRoot`'s first call pays a one-off setup cost; paying it at import time keeps it off whichever test would otherwise run first and blow its budget. */
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

/** A minimal `renderHook` built on `react-dom/client`, since the suite has no other need for `@testing-library/react`; `wrapper` composes the providers the screens mount under. */
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

import { type RefObject, useEffect, useState } from 'react';

export function useIsClamped(ref: RefObject<HTMLElement | null>, content: string): boolean {
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = (): void => setClamped(element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, content]);

  return clamped;
}

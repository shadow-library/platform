import { type MouseEvent, type MouseEventHandler } from 'react';

export function guardAriaDisabled<T extends HTMLElement>(
  ariaDisabled: boolean | 'true' | 'false' | undefined,
  onClick: MouseEventHandler<T> | undefined,
): MouseEventHandler<T> | undefined {
  if (ariaDisabled !== true && ariaDisabled !== 'true') return onClick;
  return (event: MouseEvent<T>) => event.preventDefault();
}

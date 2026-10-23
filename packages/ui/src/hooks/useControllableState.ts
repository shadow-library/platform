import { useCallback, useState } from 'react';

export interface ControllableStateOptions<T> {
  /** The controlled value. When it is not `undefined`, the component is controlled and owns the value. */
  value: T | undefined;
  /** The initial value in uncontrolled mode. Accepts a lazy initializer, like `useState`. */
  defaultValue: T | (() => T);
  /** Called with the next value on every change, in both controlled and uncontrolled modes. */
  onChange?: (next: T) => void;
}

/** Resolves a controlled-or-uncontrolled value; the setter updates internal state only when uncontrolled and always fires `onChange`. */
export function useControllableState<T>({ value, defaultValue, onChange }: ControllableStateOptions<T>): [T, (next: T) => void] {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue);
  const resolved = isControlled ? (value as T) : internal;

  const setValue = useCallback(
    (next: T) => {
      if (!isControlled) setInternal(next);
      onChange?.(next);
    },
    [isControlled, onChange],
  );

  return [resolved, setValue];
}

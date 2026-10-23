import { type ReactElement } from 'react';

import { type IconProps, SvgIcon } from './svg-icon';

export function AlertTriangleIcon(props: IconProps): ReactElement {
  return (
    <SvgIcon {...props}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </SvgIcon>
  );
}

export function BellIcon(props: IconProps): ReactElement {
  return (
    <SvgIcon {...props}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </SvgIcon>
  );
}

export function CheckIcon(props: IconProps): ReactElement {
  return (
    <SvgIcon {...props}>
      <path d="M20 6L9 17l-5-5" />
    </SvgIcon>
  );
}

export function ChevronDownIcon(props: IconProps): ReactElement {
  return (
    <SvgIcon {...props}>
      <path d="M6 9l6 6 6-6" />
    </SvgIcon>
  );
}

export function ChevronRightIcon(props: IconProps): ReactElement {
  return (
    <SvgIcon {...props}>
      <path d="M9 6l6 6-6 6" />
    </SvgIcon>
  );
}

export function CopyIcon(props: IconProps): ReactElement {
  return (
    <SvgIcon {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </SvgIcon>
  );
}

export function MoonIcon(props: IconProps): ReactElement {
  return (
    <SvgIcon {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </SvgIcon>
  );
}

export function PlusIcon(props: IconProps): ReactElement {
  return (
    <SvgIcon {...props}>
      <path d="M12 5v14M5 12h14" />
    </SvgIcon>
  );
}

export function SearchIcon(props: IconProps): ReactElement {
  return (
    <SvgIcon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </SvgIcon>
  );
}

export function SunIcon(props: IconProps): ReactElement {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </SvgIcon>
  );
}

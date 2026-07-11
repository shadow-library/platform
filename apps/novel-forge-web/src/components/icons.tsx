/**
 * Lucide-style stroke icons used across Novel Forge, matching the design comps.
 * A single 24×24 stroke grid keeps every glyph visually consistent; `size`
 * scales width/height together and colour follows `currentColor`.
 */
import type { SVGProps } from 'react';

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function SvgIcon({ size = 16, children, strokeWidth = 1.8, ...props }: IconProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const OverviewIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M9 21V9" />
  </SvgIcon>
);

export const MenuIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </SvgIcon>
);

export const SourceIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M4 4h11l5 5v11H4z" />
    <path d="M15 4v5h5" />
  </SvgIcon>
);

export const BookIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </SvgIcon>
);

export const ListIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M3 6h18M3 12h18M3 18h12" />
  </SvgIcon>
);

export const EditIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </SvgIcon>
);

export const ReviewIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </SvgIcon>
);

export const ChatIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 8.5 8.5 0 0 1-3.8-.9L3 20l1.9-4.2A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
  </SvgIcon>
);

export const ProposalsIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M9 12l2 2 4-4" />
    <path d="M12 3l7 4v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V7z" />
  </SvgIcon>
);

export const RunsIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M3 3v18h18" />
    <path d="M7 14l4-4 3 3 5-6" />
  </SvgIcon>
);

export const SettingsIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </SvgIcon>
);

export const GridIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <rect x="3" y="3" width="7" height="9" />
    <rect x="14" y="3" width="7" height="5" />
    <rect x="14" y="12" width="7" height="9" />
    <rect x="3" y="16" width="7" height="5" />
  </SvgIcon>
);

export const ClockIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </SvgIcon>
);

export const SearchIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4-4" />
  </SvgIcon>
);

export const BellIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </SvgIcon>
);

export const MoonIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </SvgIcon>
);

export const SunIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </SvgIcon>
);

export const GlobeIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
  </SvgIcon>
);

export const ChevronsUpDownIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
  </SvgIcon>
);

export const ChevronRightIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M9 6l6 6-6 6" />
  </SvgIcon>
);

export const ChevronLeftIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M15 18l-6-6 6-6" />
  </SvgIcon>
);

export const ChevronDownIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M6 9l6 6 6-6" />
  </SvgIcon>
);

export const CheckIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M20 6L9 17l-5-5" />
  </SvgIcon>
);

export const PlusIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M12 5v14M5 12h14" />
  </SvgIcon>
);

export const CloseIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M18 6L6 18M6 6l12 12" />
  </SvgIcon>
);

export const CopyIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </SvgIcon>
);

export const TrashIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M10 11v6M14 11v6" />
  </SvgIcon>
);

export const ArchiveIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <rect x="2" y="4" width="20" height="5" rx="1" />
    <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
    <path d="M10 13h4" />
  </SvgIcon>
);

export const ResetIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </SvgIcon>
);

export const SparkIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </SvgIcon>
);

export const MoreIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon fill="currentColor" stroke="none" {...p}>
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </SvgIcon>
);

export const WarningIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </SvgIcon>
);

export const UsersIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </SvgIcon>
);

export const MapPinIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </SvgIcon>
);

export const FlagIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <path d="M4 22v-7" />
  </SvgIcon>
);

export const SendIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
  </SvgIcon>
);

export const ImageIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </SvgIcon>
);

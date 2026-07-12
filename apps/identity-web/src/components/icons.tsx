/**
 * Lucide-style stroke icons used across Shadow Identity, matching the design comps. A single 24×24
 * stroke grid keeps every glyph visually consistent; `size` scales width/height together and colour
 * follows `currentColor`.
 */
import { type SVGProps } from 'react';

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

export const ShieldIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M12 3l7 4v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V7z" />
  </SvgIcon>
);

export const ShieldCheckIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M12 3l7 4v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V7z" />
    <path d="M9 12l2 2 4-4" />
  </SvgIcon>
);

export const ShieldAlertIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M12 3l7 4v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V7z" />
    <path d="M12 8v4M12 16h.01" />
  </SvgIcon>
);

export const KeyIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <circle cx="7.5" cy="15.5" r="4" />
    <path d="M10.5 12.5 20 3M16 7l3 3M14 9l2 2" />
  </SvgIcon>
);

export const KeyRoundIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M15.5 7.5a4.5 4.5 0 1 0-6 4.24V21l2-2 2 2 1.5-1.5-1.5-1.5 1.5-1.5-1.2-1.2A4.5 4.5 0 0 0 15.5 7.5z" />
    <circle cx="15.5" cy="7.5" r="1" />
  </SvgIcon>
);

export const UserIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </SvgIcon>
);

export const UsersIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </SvgIcon>
);

export const BuildingIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M10 21v-3a2 2 0 0 1 4 0v3" />
  </SvgIcon>
);

export const GridIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </SvgIcon>
);

export const GlobeIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
  </SvgIcon>
);

export const PlugIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M12 22v-5M9 8V2M15 8V2M6 8h12v3a6 6 0 0 1-12 0z" />
  </SvgIcon>
);

export const AppWindowIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
  </SvgIcon>
);

export const TerminalIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M4 17l6-5-6-5M12 19h8" />
  </SvgIcon>
);

export const WebhookIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M15 12a4 4 0 1 0-4 4h5" />
    <path d="M9.5 9.5 6 15a3 3 0 1 0 3 3M14.5 9.5 18 15a3 3 0 1 1-3 3" />
  </SvgIcon>
);

export const LayersIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M12 3 3 8l9 5 9-5-9-5z" />
    <path d="M3 13l9 5 9-5M3 18l9 5 9-5" />
  </SvgIcon>
);

export const BadgeCheckIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M12 2l2.4 1.8 3 .2.9 2.8 2.2 2-1 2.9 1 2.9-2.2 2-.9 2.8-3 .2L12 22l-2.4-1.8-3-.2-.9-2.8-2.2-2 1-2.9-1-2.9 2.2-2 .9-2.8 3-.2z" />
    <path d="M9 12l2 2 4-4" />
  </SvgIcon>
);

export const IdCardIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="11" r="2" />
    <path d="M6 16a3 3 0 0 1 6 0M15 10h3M15 13h3" />
  </SvgIcon>
);

export const FingerprintIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M12 10a2 2 0 0 1 2 2c0 3-.5 5-1 6.5" />
    <path d="M8.5 7.7A5 5 0 0 1 17 12c0 1.5 0 3-.3 4.2" />
    <path d="M5.8 11A7 7 0 0 1 12 5a7 7 0 0 1 3 .7" />
    <path d="M8 15c.4 2 .2 3.3-.3 4.5M11 12c0 4-.6 6-1.2 7.7" />
  </SvgIcon>
);

export const MailIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </SvgIcon>
);

export const PhoneIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
  </SvgIcon>
);

export const LockIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </SvgIcon>
);

export const SmartphoneIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <rect x="6" y="2" width="12" height="20" rx="2.5" />
    <path d="M11 18h2" />
  </SvgIcon>
);

export const MonitorIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </SvgIcon>
);

export const QrCodeIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3M20 14v.01M14 20v.01M20 17v4M17 21h4" />
  </SvgIcon>
);

export const PlusIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M12 5v14M5 12h14" />
  </SvgIcon>
);

export const MinusIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M5 12h14" />
  </SvgIcon>
);

export const CloseIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M18 6L6 18M6 6l12 12" />
  </SvgIcon>
);

export const CheckIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M20 6L9 17l-5-5" />
  </SvgIcon>
);

export const CheckCircleIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12l2.5 2.5 4.5-5" />
  </SvgIcon>
);

export const XCircleIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15 9l-6 6M9 9l6 6" />
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

export const MoreIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon fill="currentColor" stroke="none" {...p}>
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </SvgIcon>
);

export const EditIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </SvgIcon>
);

export const RefreshIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </SvgIcon>
);

export const LogOutIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </SvgIcon>
);

export const SettingsIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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

export const ExternalLinkIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </SvgIcon>
);

export const EyeIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </SvgIcon>
);

export const EyeOffIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M9.9 5.2A9.5 9.5 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-2.4 3.1M6.6 6.6A13.3 13.3 0 0 0 2 12s3.5 7 10 7a9.3 9.3 0 0 0 5.4-1.6M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </SvgIcon>
);

export const DownloadIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </SvgIcon>
);

export const BanIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.6 5.6l12.8 12.8" />
  </SvgIcon>
);

export const LinkIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
  </SvgIcon>
);

export const ArrowLeftIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </SvgIcon>
);

export const ArrowRightIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </SvgIcon>
);

export const SendIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
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

export const ChevronsUpDownIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
  </SvgIcon>
);

export const AlertTriangleIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </SvgIcon>
);

export const InfoIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4M12 8h.01" />
  </SvgIcon>
);

export const ClockIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </SvgIcon>
);

export const MapPinIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
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

export const MenuIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </SvgIcon>
);

export const SparkIcon = (p: IconProps): React.JSX.Element => (
  <SvgIcon {...p}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
  </SvgIcon>
);

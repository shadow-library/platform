import { type ReactNode } from 'react';

export interface IconProps {
  size?: number;
}

function glyph(paths: ReactNode): (props: IconProps) => React.JSX.Element {
  return function Glyph({ size = 18 }: IconProps): React.JSX.Element {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {paths}
      </svg>
    );
  };
}

export const MemoirMark = glyph(
  <>
    <path d="M4 5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
    <path d="M8 3v18" />
    <path d="M12 8h4" />
    <path d="M12 12h4" />
  </>,
);

export const TodayIcon = glyph(
  <>
    <path d="M9 11l3 3 8-8" />
    <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
  </>,
);

export const PlanIcon = glyph(
  <>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 10h18" />
    <path d="M8 2v4" />
    <path d="M16 2v4" />
  </>,
);

export const LogIcon = glyph(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>,
);

export const MoneyIcon = glyph(
  <>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01" />
    <path d="M18 12h.01" />
  </>,
);

export const HeroIcon = glyph(
  <>
    <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9Z" />
  </>,
);

export const HistoryIcon = glyph(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </>,
);

export const InsightsIcon = glyph(
  <>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M22 20H2" />
  </>,
);

export const ReviewIcon = glyph(
  <>
    <path d="M4 4h16v13H8l-4 4Z" />
    <path d="M9 9h6" />
    <path d="M9 12.5h4" />
  </>,
);

export const AiIcon = glyph(
  <>
    <path d="M12 3v3" />
    <rect x="4" y="6" width="16" height="12" rx="3" />
    <path d="M9 11.5h.01" />
    <path d="M15 11.5h.01" />
    <path d="M9.5 15h5" />
  </>,
);

export const SettingsIcon = glyph(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a1.7 1.7 0 0 0-1.6-1H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.7 8.7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 3.4V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </>,
);

export const QuestIcon = glyph(
  <>
    <path d="M4 4h16v6a8 8 0 0 1-8 8 8 8 0 0 1-8-8Z" />
    <path d="M12 18v3" />
    <path d="M8 21h8" />
  </>,
);

export const SearchIcon = glyph(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);

export const SunIcon = glyph(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.9 4.9 1.4 1.4" />
    <path d="m17.7 17.7 1.4 1.4" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m4.9 19.1 1.4-1.4" />
    <path d="m17.7 6.3 1.4-1.4" />
  </>,
);

export const MoonIcon = glyph(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />);

export const MoreIcon = glyph(
  <>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </>,
);

export const BellIcon = glyph(
  <>
    <path d="M18 8a6 6 0 0 0-12 0c0 6-3 7-3 7h18s-3-1-3-7" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </>,
);

export const ChevronLeftIcon = glyph(<path d="m14 6-6 6 6 6" />);

export const ChevronRightIcon = glyph(<path d="m10 6 6 6-6 6" />);

import { type AnyRouteMatch } from '@tanstack/react-router';

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** The screen's name in the document title; the deepest matched route that names one wins. */
    title?: string;
  }
}

export const APP_TITLE = 'Shadow Memoir';

function documentTitle(screen: string): string {
  return `${screen} · ${APP_TITLE}`;
}

const NOT_FOUND_TITLE = documentTitle('Not found');
const ROUTE_ERROR_TITLE = documentTitle('Couldn’t open this page');

interface TitleHeadContext {
  match: Pick<AnyRouteMatch, 'status'>;
  matches: readonly Pick<AnyRouteMatch, 'globalNotFound' | 'staticData'>[];
}

interface TitleHead {
  meta: { title: string }[];
}

/** An unknown path under a layout marks that layout, not the root, as the not-found boundary. */
export function titleForMatches(matches: TitleHeadContext['matches']): string {
  if (matches.some(match => match.globalNotFound)) return NOT_FOUND_TITLE;
  const screen = matches.reduce<string | undefined>((deepest, match) => match.staticData.title ?? deepest, undefined);
  return screen ? documentTitle(screen) : APP_TITLE;
}

/** Heads stop at a route whose `beforeLoad` threw, so a screen that set its own `head` title on an earlier load would outrank this one. */
export function routeErrorHead({ match }: TitleHeadContext): Partial<TitleHead> {
  return match.status === 'error' ? { meta: [{ title: ROUTE_ERROR_TITLE }] } : {};
}

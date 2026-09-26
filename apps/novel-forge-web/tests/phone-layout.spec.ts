import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

type Rules = Map<string, Record<string, string>>;

interface Sheet {
  base: Rules;
  /** Each top-level at-rule block's rules, keyed by its prelude (`@media (max-width: 760px)`). */
  blocks: Map<string, Rules>;
}

const UI = new URL('../../../packages/ui/src/', import.meta.url);

function read(path: string | URL): string {
  return readFileSync(path instanceof URL ? path : new URL(path, import.meta.url), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
}

function rulesOf(css: string): Rules {
  const rules: Rules = new Map();
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = Object.fromEntries(
      (match[2] ?? '')
        .split(';')
        .map(line => {
          const colon = line.indexOf(':');
          return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
        })
        .filter(([property]) => property),
    );
    const selector = (match[1] ?? '').trim().replace(/\s+/g, ' ');
    rules.set(selector, { ...rules.get(selector), ...declarations });
  }
  return rules;
}

function sheetOf(path: string | URL): Sheet {
  let css = read(path);
  const blocks = new Map<string, Rules>();
  for (let start = css.indexOf('@'); start >= 0; start = css.indexOf('@')) {
    const open = css.indexOf('{', start);
    let depth = 1;
    let end = open + 1;
    while (depth > 0 && end < css.length) {
      if (css[end] === '{') depth++;
      if (css[end] === '}') depth--;
      end++;
    }
    blocks.set(css.slice(start, open).trim(), rulesOf(css.slice(open + 1, end - 1)));
    css = css.slice(0, start) + css.slice(end);
  }
  return { base: rulesOf(css), blocks };
}

function px(value: string | undefined): number {
  return Number.parseFloat(value ?? '0') || 0;
}

const PHONE = '@media (max-width: 760px)';
const SHELL_PHONE = '@media (max-width: 767px)';
const COARSE = '@media (pointer: coarse)';

// "today" is main d40a7951, frozen in tests/fixtures/*.baseline.module.css; "Phone l.N" / "Main l.N" are lines in
// scratch-pad/novel-forge/design/*.dc.html. Every desktop rule stays as today; the phone adds blocks of its own.
const SCREENS: { name: string; live: string; today: string; changed?: Record<string, Record<string, string>>; added: string[] }[] = [
  { name: 'shell', live: '../src/components/Layout/AppShell.module.css', today: './fixtures/app-shell.baseline.module.css', added: [SHELL_PHONE] },
  { name: 'jobs tray', live: '../src/components/Layout/JobsTray.module.css', today: './fixtures/jobs-tray.baseline.module.css', added: [COARSE] },
  { name: 'overview', live: '../src/routes/novels/$novelId/overview.module.css', today: './fixtures/overview.baseline.module.css', added: [PHONE] },
  { name: 'publish', live: '../src/routes/novels/$novelId/publish.module.css', today: './fixtures/publish.baseline.module.css', added: [PHONE] },
  {
    name: 'projects home',
    live: '../src/routes/_app/index.module.css',
    today: './fixtures/projects-home.baseline.module.css',
    changed: { '.grid': { 'grid-template-columns': 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))' } },
    added: [],
  },
];

describe('Phone layout keeps today’s desktop values', () => {
  for (const screen of SCREENS) {
    it(`should leave every ${screen.name} rule and existing block as today, changing only what it names`, () => {
      const live = sheetOf(screen.live);
      const today = sheetOf(screen.today);
      const expected = new Map(today.base);
      for (const [selector, values] of Object.entries(screen.changed ?? {})) expected.set(selector, { ...expected.get(selector), ...values });
      expect(live.base).toEqual(expected);
      for (const [prelude, rules] of today.blocks) expect({ prelude, rules: live.blocks.get(prelude) }).toEqual({ prelude, rules });
      expect([...live.blocks.keys()].filter(prelude => !today.blocks.has(prelude))).toEqual(screen.added);
    });
  }
});

describe('Phone top bar', () => {
  const shell = sheetOf('../src/components/Layout/AppShell.module.css').blocks.get(SHELL_PHONE) ?? new Map();
  const topNav = read(new URL('components/TopNavigation/TopNavigation.module.css', UI));
  const tokens = read(new URL('styles/tokens.css', UI));
  const token = (name: string): number => px(new RegExp(`${name}: (\\d+)px`).exec(tokens)?.[1]);

  it('should collapse at the shell’s own breakpoint, where the hamburger and nav drawer take over', () => {
    expect(sheetOf(new URL('components/TopNavigation/TopNavigation.module.css', UI)).blocks.get(SHELL_PHONE)?.get('.menuSlot')).toEqual({ display: 'inline-flex' });
  });

  it('should give the novel’s title the slack and drop the screen crumb (Phone l.35)', () => {
    expect(shell.get(".shellRoot :global(header[data-layout='centred'])")).toEqual({ 'grid-template-columns': 'minmax(0, 1fr) auto auto' });
    expect(shell.get('.crumbLeaf')).toEqual({ display: 'none' });
  });

  it('should turn search into a 44px icon button (Phone l.21 .icon, l.36)', () => {
    expect(token('--sh-tap-target')).toBe(44);
    expect(shell.get('.search')).toEqual({
      'justify-content': 'center',
      width: 'var(--sh-tap-target)',
      height: 'var(--sh-tap-target)',
      'min-width': '0',
      padding: '0',
      'border-color': 'transparent',
      background: 'transparent',
      color: 'var(--sh-text-secondary)',
    });
    expect(shell.get('.search > :not(:first-child)')).toEqual({ display: 'none' });
  });

  it('should give the jobs bell the same 44px touch target as the ui icon buttons beside it', () => {
    expect(sheetOf('../src/components/Layout/JobsTray.module.css').blocks.get(COARSE)?.get('.bellBtn::before')).toMatchObject({
      width: 'var(--sh-tap-target)',
      height: 'var(--sh-tap-target)',
    });
  });

  it('should leave the title at least 90px from 360 to 430 with no horizontal scroll', () => {
    const barGap = px(/\.bar \{[^}]*gap: (\d+)px/.exec(topNav)?.[1]);
    const utilityGap = px(/\.utility \{[^}]*gap: (\d+)px/.exec(topNav)?.[1]);
    const bell = px(sheetOf('../src/components/Layout/JobsTray.module.css').base.get('.bellBtn')?.width);
    const utility = bell + token('--sh-control-height-sm') + token('--sh-control-height-md') + 2 * utilityGap;
    const hamburger = token('--sh-control-height-md') - 8;
    for (const viewport of [360, 375, 390, 414, 430]) {
      const inline = Math.min(Math.max(14, viewport * 0.03), 26);
      const title = viewport - 2 * inline - 2 * barGap - token('--sh-tap-target') - utility - hamburger - barGap;
      expect({ viewport, fits: title >= 90 }).toEqual({ viewport, fits: true });
    }
  });
});

describe('Phone screens', () => {
  const gutter = px(/\.main \{[^}]*--sh-shell-gutter-inline: (\d+)px/.exec(read(new URL('components/Shell/Shell.module.css', UI)))?.[1]);
  const content = (viewport: number): number => viewport - 2 * gutter;

  it('should shrink the projects grid’s 340px track to a phone’s width', () => {
    expect(gutter).toBe(16);
    const track = (viewport: number): number => Math.min(340, content(viewport));
    for (const viewport of [360, 390, 430]) expect(track(viewport)).toBeLessThanOrEqual(content(viewport));
    expect(track(360)).toBe(328);
  });

  it('should wrap the overview header under a 144px cover and stack its grid', () => {
    const overview = sheetOf('../src/routes/novels/$novelId/overview.module.css');
    expect(overview.blocks.get(PHONE)).toEqual(
      new Map([
        ['.header', { 'flex-wrap': 'wrap' }],
        ['.headerActions', { 'flex-basis': '100%', 'flex-wrap': 'wrap' }],
        ['.projectTitle', { 'overflow-wrap': 'anywhere' }],
        ['.nextStepRow', { 'flex-wrap': 'wrap' }],
        ['.mainGrid', { 'grid-template-columns': 'minmax(0, 1fr)' }],
      ]),
    );
    const cover = px(overview.base.get('.headerCover')?.width);
    const gap = px(overview.base.get('.header')?.gap);
    const actions = 4 * 32 + 3 * px(overview.base.get('.headerActions')?.gap);
    expect(content(360) - cover - gap).toBeGreaterThanOrEqual(160);
    expect(actions).toBeLessThanOrEqual(content(360));
  });

  it('should move the publication cell under the title so a row fits at 360', () => {
    const publish = sheetOf('../src/routes/novels/$novelId/publish.module.css');
    const phone = publish.blocks.get(PHONE);
    expect(phone?.get('.headerRow, .row')).toEqual({ 'grid-template-columns': '36px minmax(0, 1fr) auto' });
    expect(phone?.get('.headerRow > :nth-child(5)')).toEqual({ display: 'none' });
    expect(phone?.get('.row > :nth-child(5)')).toEqual({ 'grid-column': '2 / -1', 'grid-row': '2' });
    const row = publish.base.get('.headerRow, .row') ?? {};
    const inner = content(360) - 2 * px(row.padding?.split(' ')[1]) - 2 * px(row.gap);
    const publishNow = 90;
    expect(inner - 36 - publishNow).toBeGreaterThanOrEqual(120);
  });
});

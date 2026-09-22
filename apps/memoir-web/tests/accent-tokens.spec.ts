import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { type AccentKey } from '@/lib/data';

type Theme = 'light' | 'dark';
type Rgba = [number, number, number, number];
type Vars = Map<string, string>;

interface CssBlock {
  selectors: string[];
  vars: Vars;
}

const ACCENTS: Record<AccentKey, true> = { ember: true, frost: true, aurora: true, sunrise: true, midnight: true, returner: true };
const THEMES: Theme[] = ['light', 'dark'];
/** CIEDE2000; the indigo-500 frost accent that read as the indigo-600 default measured 6.3. */
const MIN_VISIBLE_DISTANCE = 10;

function parseBlocks(source: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const vars: Vars = new Map();
    for (const declaration of (match[2] ?? '').matchAll(/--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) vars.set(declaration[1] as string, (declaration[2] as string).trim());
    blocks.push({ selectors: (match[1] ?? '').split(',').map(selector => selector.trim()), vars });
  }
  return blocks;
}

const platformTokensPath = join(import.meta.dirname, '..', '..', '..', 'packages', 'ui', 'src', 'styles', 'tokens.css');
const platformBlocks = parseBlocks(readFileSync(platformTokensPath, 'utf-8'));
const memoirBlocks = parseBlocks(readFileSync(join(import.meta.dirname, '..', 'src', 'styles', 'tokens.css'), 'utf-8'));

const isDark = (selector: string): boolean => selector.includes("[data-theme='dark']") || selector.startsWith('.dark');

function platformVars(theme: Theme): Vars {
  const root = platformBlocks.find(block => block.selectors.length === 1 && block.selectors[0] === ':root');
  const dark = platformBlocks.find(block => block.selectors.some(isDark) && block.vars.has('sh-accent'));
  if (!root || !dark) throw new TypeError('packages/ui tokens.css: expected a :root block and a dark-theme block');
  return new Map([...root.vars, ...(theme === 'dark' ? dark.vars : [])]);
}

function accentVars(key: AccentKey, theme: Theme): Vars {
  const names = [`[data-accent='${key}']`, `[data-hero-accent='${key}']`];
  const matching = (dark: boolean): CssBlock[] =>
    memoirBlocks.filter(block => block.selectors.some(selector => names.some(name => selector.includes(name)) && isDark(selector) === dark));
  const layers = theme === 'dark' ? [...matching(false), ...matching(true)] : matching(false);
  return layers.reduce((vars, block) => new Map([...vars, ...block.vars]), platformVars(theme));
}

function resolve(vars: Vars, name: string, depth = 0): string {
  if (depth > 10) throw new TypeError(`--${name}: variable reference too deep`);
  const raw = vars.get(name);
  if (raw === undefined) throw new TypeError(`--${name} is not defined`);
  return raw.replace(/var\(--([a-zA-Z0-9-]+)\)/g, (_, reference: string) => resolve(vars, reference, depth + 1));
}

function toRgba(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1] as string, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = value.match(/^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/i);
  if (!rgb) throw new TypeError(`unrecognised colour: ${value}`);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
}

function over(colour: string, base: Rgba): Rgba {
  const [r, g, b, alpha] = toRgba(colour);
  return [r * alpha + base[0] * (1 - alpha), g * alpha + base[1] * (1 - alpha), b * alpha + base[2] * (1 - alpha), 1];
}

function luminance([r, g, b]: Rgba): number {
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function cieLab(colour: Rgba): [number, number, number] {
  const [r, g, b] = colour.map(channel => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgba;
  const f = (t: number): number => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function deltaE2000(a: string, b: string): number {
  const [l1, a1, b1] = cieLab(toRgba(a));
  const [l2, a2, b2] = cieLab(toRgba(b));
  const radians = (degrees: number): number => (degrees * Math.PI) / 180;
  const hue = (x: number, y: number): number => (x === 0 && y === 0 ? 0 : ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);

  const chromaMean = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(chromaMean ** 7 / (chromaMean ** 7 + 25 ** 7)));
  const [a1p, a2p] = [a1 * (1 + g), a2 * (1 + g)];
  const [c1p, c2p] = [Math.hypot(a1p, b1), Math.hypot(a2p, b2)];
  const [h1p, h2p] = [hue(a1p, b1), hue(a2p, b2)];

  const deltaL = l2 - l1;
  const deltaC = c2p - c1p;
  const rawHueDelta = h2p - h1p;
  const hueDelta = c1p * c2p === 0 ? 0 : Math.abs(rawHueDelta) <= 180 ? rawHueDelta : rawHueDelta > 180 ? rawHueDelta - 360 : rawHueDelta + 360;
  const deltaH = 2 * Math.sqrt(c1p * c2p) * Math.sin(radians(hueDelta / 2));

  const lMean = (l1 + l2) / 2;
  const cMean = (c1p + c2p) / 2;
  const hueSum = h1p + h2p;
  const hMean = c1p * c2p === 0 ? hueSum : Math.abs(h1p - h2p) <= 180 ? hueSum / 2 : hueSum < 360 ? (hueSum + 360) / 2 : (hueSum - 360) / 2;
  const t = 1 - 0.17 * Math.cos(radians(hMean - 30)) + 0.24 * Math.cos(radians(2 * hMean)) + 0.32 * Math.cos(radians(3 * hMean + 6)) - 0.2 * Math.cos(radians(4 * hMean - 63));
  const sl = 1 + (0.015 * (lMean - 50) ** 2) / Math.sqrt(20 + (lMean - 50) ** 2);
  const sc = 1 + 0.045 * cMean;
  const sh = 1 + 0.015 * cMean * t;
  const rotation = -2 * Math.sqrt(cMean ** 7 / (cMean ** 7 + 25 ** 7)) * Math.sin(radians(60 * Math.exp(-(((hMean - 275) / 25) ** 2))));

  return Math.sqrt((deltaL / sl) ** 2 + (deltaC / sc) ** 2 + (deltaH / sh) ** 2 + rotation * (deltaC / sc) * (deltaH / sh));
}

function contrast(a: Rgba, b: Rgba): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

interface Surfaces {
  app: Rgba;
  card: Rgba;
  raised: Rgba;
  well: Rgba;
  accentSoft: Rgba;
}

function surfaces(vars: Vars): Surfaces {
  const card = toRgba(resolve(vars, 'sh-surface-card'));
  return {
    app: toRgba(resolve(vars, 'sh-surface-app')),
    card,
    raised: toRgba(resolve(vars, 'sh-surface-raised')),
    well: over(resolve(vars, 'sh-surface-well'), card),
    accentSoft: over(resolve(vars, 'sh-accent-soft'), card),
  };
}

describe('equipped accent tokens', () => {
  const cases = (Object.keys(ACCENTS) as AccentKey[]).flatMap(key => THEMES.map(theme => [key, theme] as const));

  it.each(cases)('should give %s a visibly different accent from the default in the %s theme', (key: AccentKey, theme: Theme) => {
    const base = platformVars(theme);
    const equipped = accentVars(key, theme);

    expect(deltaE2000(resolve(equipped, 'sh-accent'), resolve(base, 'sh-accent'))).toBeGreaterThanOrEqual(MIN_VISIBLE_DISTANCE);
    expect(deltaE2000(resolve(equipped, 'sh-accent-text'), resolve(base, 'sh-accent-text'))).toBeGreaterThanOrEqual(MIN_VISIBLE_DISTANCE);
  });

  it.each(cases)('should keep %s accent text at 4.5:1 and the accent at 3:1 against %s surfaces', (key: AccentKey, theme: Theme) => {
    const vars = accentVars(key, theme);
    const accent = toRgba(resolve(vars, 'sh-accent'));
    const accentText = toRgba(resolve(vars, 'sh-accent-text'));
    const { app, card, raised, well, accentSoft } = surfaces(vars);

    for (const surface of [app, card, raised, well, accentSoft]) expect(contrast(accentText, surface)).toBeGreaterThanOrEqual(4.5);
    for (const surface of [app, card]) expect(contrast(accent, surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(toRgba(resolve(vars, 'sh-on-accent')), accent)).toBeGreaterThanOrEqual(4.5);
  });
});

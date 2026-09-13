/**
 * Importing npm packages
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Declaring the constants
 */
const tokensPath = path.join(import.meta.dirname, 'tokens.css');
const tokensSource = fs.readFileSync(tokensPath, 'utf-8');

interface CssBlock {
  selector: string;
  vars: Map<string, string>;
}

function parseBlocks(source: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  let depth = 0;
  let selectorStart = 0;
  let bodyStart = -1;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '{') {
      if (depth === 0) {
        bodyStart = i + 1;
        const selector = source
          .slice(selectorStart, i)
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .trim();
        blocks.push({ selector, vars: new Map() });
      }
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        const body = source.slice(bodyStart, i).replace(/\/\*[\s\S]*?\*\//g, '');
        const block = blocks[blocks.length - 1]!;
        for (const match of body.matchAll(/--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) block.vars.set(match[1]!, match[2]!.trim());
        selectorStart = i + 1;
      }
    }
  }
  return blocks;
}

const blocks = parseBlocks(tokensSource);
const rootBlock = blocks.find(block => block.selector === ':root');
const darkBlock = blocks.find(block => block.selector.includes("[data-theme='dark']"));
if (!rootBlock || !darkBlock) throw new Error('tokens.css: expected a :root block and a dark-theme block');

function resolve(name: string, theme: CssBlock, depth = 0): string {
  if (depth > 10) throw new Error(`--${name}: variable reference too deep`);
  const raw = theme.vars.get(name) ?? rootBlock!.vars.get(name);
  if (raw === undefined) throw new Error(`--${name} is not defined`);
  return raw.replace(/var\(--([a-zA-Z0-9-]+)\)/g, (_, ref: string) => resolve(ref, theme, depth + 1));
}

function toRgb(value: string): [number, number, number] {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = value.match(/rgb\(\s*(\d+)\s+(\d+)\s+(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  throw new Error(`unrecognised colour: ${value}`);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(a: string, b: string): number {
  const lumA = relativeLuminance(toRgb(a));
  const lumB = relativeLuminance(toRgb(b));
  const [lighter, darker] = lumA > lumB ? [lumA, lumB] : [lumB, lumA];
  return (lighter + 0.05) / (darker + 0.05);
}

function cieLstar(value: string): number {
  const y = relativeLuminance(toRgb(value));
  const delta = 6 / 29;
  const f = y > delta ** 3 ? Math.cbrt(y) : y / (3 * delta ** 2) + 4 / 29;
  return 116 * f - 16;
}

function compositeOverCard(translucent: string, theme: CssBlock): string {
  const [, r, g, b, alphaRaw] = translucent.match(/rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\/\s*([\d.]+)\)/)!;
  const alpha = Number(alphaRaw);
  const cardRgb = toRgb(resolve('sh-surface-card', theme));
  const tintedRgb = [r, g, b].map((channel, i) => Number(channel) * alpha + cardRgb[i]! * (1 - alpha));
  return `rgb(${tintedRgb.map(Math.round).join(' ')})`;
}

describe('dark theme contrast tokens', () => {
  it('should keep dark text-tertiary at least 4.5:1 on card surfaces', () => {
    const textTertiary = resolve('sh-text-tertiary', darkBlock);
    const card = resolve('sh-surface-card', darkBlock);
    expect(contrastRatio(textTertiary, card)).toBeGreaterThanOrEqual(4.5);
  });

  it('should keep dark text-tertiary at least 4.5:1 on the app surface', () => {
    const textTertiary = resolve('sh-text-tertiary', darkBlock);
    const app = resolve('sh-surface-app', darkBlock);
    expect(contrastRatio(textTertiary, app)).toBeGreaterThanOrEqual(4.5);
  });

  it('should keep the dark active-nav accent text at least 4.5:1 on plain card and on the accent-soft tint', () => {
    const accentText = resolve('sh-accent-text', darkBlock);
    const card = resolve('sh-surface-card', darkBlock);
    expect(contrastRatio(accentText, card)).toBeGreaterThanOrEqual(4.5);

    const tinted = compositeOverCard(darkBlock.vars.get('sh-accent-soft')!, darkBlock);
    expect(contrastRatio(accentText, tinted)).toBeGreaterThanOrEqual(4.5);
  });

  it('should keep dark text-secondary at least 4.5:1 on the accent-soft tint', () => {
    const textSecondary = resolve('sh-text-secondary', darkBlock);
    const tinted = compositeOverCard(darkBlock.vars.get('sh-accent-soft')!, darkBlock);
    expect(contrastRatio(textSecondary, tinted)).toBeGreaterThanOrEqual(4.5);
  });

  it('should not resolve dark surface-well, border-subtle and the dialog/overlay surface to the same colour', () => {
    const well = resolve('sh-surface-well', darkBlock);
    const borderSubtle = resolve('sh-border-subtle', darkBlock);
    const raised = resolve('sh-surface-raised', darkBlock);
    expect(new Set([well, borderSubtle, raised]).size).toBe(3);
  });

  it('should keep ΔL* ≥ 1.5 between dark surface-well, border-subtle and the dialog/overlay surface over a shared card parent', () => {
    const raised = resolve('sh-surface-raised', darkBlock);
    const wellOverCard = compositeOverCard(resolve('sh-surface-well', darkBlock), darkBlock);
    const borderSubtleOverCard = compositeOverCard(resolve('sh-border-subtle', darkBlock), darkBlock);
    const minDeltaL = 1.5;
    expect(Math.abs(cieLstar(wellOverCard) - cieLstar(raised))).toBeGreaterThanOrEqual(minDeltaL);
    expect(Math.abs(cieLstar(borderSubtleOverCard) - cieLstar(raised))).toBeGreaterThanOrEqual(minDeltaL);
    expect(Math.abs(cieLstar(wellOverCard) - cieLstar(borderSubtleOverCard))).toBeGreaterThanOrEqual(minDeltaL);
  });

  it('should leave the light theme accent, border-subtle and text-tertiary tokens unchanged', () => {
    expect(resolve('sh-accent-text', rootBlock!)).toBe(resolve('sh-accent', rootBlock!));
    expect(rootBlock!.vars.get('sh-border-subtle')).toBe('var(--sh-neutral-150)');
    expect(rootBlock!.vars.get('sh-text-tertiary')).toBe('var(--sh-neutral-500)');
  });
});

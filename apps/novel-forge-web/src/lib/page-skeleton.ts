export type SkeletonVariant = 'list' | 'overview' | 'rows' | 'split' | 'chat' | 'form' | 'default';

interface VariantRule {
  pattern: RegExp;
  variant: SkeletonVariant;
}

const VARIANT_RULES: VariantRule[] = [
  { pattern: /^\/novels\/[^/]+\/overview\/?$/, variant: 'overview' },
  { pattern: /^\/novels\/[^/]+\/(chapters|volumes|source|canon-facts)\/?$/, variant: 'rows' },
  { pattern: /^\/novels\/[^/]+\/chat\/?$/, variant: 'chat' },
  { pattern: /^\/ideas\/[^/]+\/?$/, variant: 'chat' },
  { pattern: /^\/novels\/[^/]+\/story-bible\/?$/, variant: 'list' },
  { pattern: /^\/novels\/[^/]+\/(review|proposals|runs|illustrations)\/?$/, variant: 'split' },
  { pattern: /^\/novels\/[^/]+\/(publish|settings|import-plan|rebrand|reforge|transform|translation)\/?$/, variant: 'form' },
  { pattern: /^\/(ideas)?\/?$/, variant: 'list' },
  { pattern: /^\/(settings|import)\/?$/, variant: 'form' },
];

export function resolveSkeletonVariant(pathname: string): SkeletonVariant {
  const rule = VARIANT_RULES.find(({ pattern }) => pattern.test(pathname));
  return rule?.variant ?? 'default';
}

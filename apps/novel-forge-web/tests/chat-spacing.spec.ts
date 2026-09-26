import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const SPACING = /^(padding|padding-top|padding-bottom|margin|margin-top|margin-left|gap|border-radius|width|height|max-width|min-height|grid-template-columns)$/;

type Rules = Map<string, Record<string, string>>;

interface Expected {
  selector: string;
  values: Record<string, string>;
  source: string;
  /** The rule in today's stylesheet (tests/fixtures, copied from main) whose values this one keeps; checked, not just cited. */
  baseline?: string;
}

function rulesOf(css: string): Rules {
  const rules: Rules = new Map();
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = Object.fromEntries(
      (match[2] ?? '')
        .split(';')
        .map(line => line.split(':').map(part => part.trim()))
        .filter(([property]) => property && SPACING.test(property)),
    );
    if (Object.keys(declarations).length === 0) continue;
    const selector = (match[1] ?? '').trim().replace(/\s+/g, ' ');
    rules.set(selector, { ...rules.get(selector), ...declarations });
  }
  return rules;
}

/** The base rules and the phone overrides, read apart so a phone value never masks the desktop one. */
function spacingOf(path: string): { base: Rules; phone: Rules } {
  const css = readFileSync(new URL(path, import.meta.url), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
  const start = css.indexOf('@media (max-width: 760px)');
  if (start < 0) return { base: rulesOf(css), phone: new Map() };
  const open = css.indexOf('{', start);
  let depth = 1;
  let end = open + 1;
  while (depth > 0 && end < css.length) {
    if (css[end] === '{') depth++;
    if (css[end] === '}') depth--;
    end++;
  }
  return { base: rulesOf(css.slice(0, start) + css.slice(end)), phone: rulesOf(css.slice(open + 1, end - 1)) };
}

// "chat.module.css" is today's route stylesheet, frozen in tests/fixtures/chat.baseline.module.css (main 3a572630) and compared
// wherever an entry names a `baseline` rule; "Main l.N" / "NextChapter l.N" / "Phone l.N" are lines in scratch-pad/novel-forge/design/*.dc.html
// (canvas v11); "rule N" is scratch-pad/novel-forge/ui-spacing-reference.md.
const CHAT: Expected[] = [
  { selector: '.column', values: { 'min-height': '0' }, baseline: '.column', source: 'chat.module.css .column' },
  { selector: '.head', values: { height: '52px', gap: '10px', padding: '0 20px' }, baseline: '.head', source: 'chat.module.css .head; Main l.74; Phone header 52 `0 20px`' },
  {
    selector: '.headTitleButton',
    values: { gap: '6px', padding: '2px 4px', 'border-radius': 'var(--sh-radius-sm)' },
    baseline: '.headTitleButton',
    source: 'chat.module.css .headTitleButton',
  },
  { selector: '.headActions', values: { gap: '8px', 'margin-left': 'auto' }, source: 'Main l.76 header buttons gap 8, margin-left auto' },
  { selector: '.body', values: { 'min-height': '0' }, baseline: '.body', source: 'chat.module.css .body' },
  { selector: ".body[data-view='centred']", values: { 'padding-bottom': '6vh' }, baseline: ".body[data-view='centred']", source: 'chat.module.css centred state' },
  { selector: '.scroll', values: { 'min-height': '0', padding: '24px 20px' }, baseline: '.scroll', source: 'chat.module.css .scroll; Main l.82' },
  { selector: ".body[data-view='centred'] .scroll", values: { padding: '0' }, baseline: ".body[data-view='centred'] .scroll", source: 'chat.module.css centred scroll' },
  { selector: '.msgList', values: { 'max-width': '720px', margin: '0 auto', gap: '20px' }, baseline: '.msgList', source: 'chat.module.css .msgList; Main l.83' },
  { selector: '.userCol', values: { gap: '8px', 'max-width': '86%' }, source: 'chat.module.css max 86%; Main l.102 user column gap 8 (bubble → notes chip)' },
  { selector: '.userBubble', values: { padding: '11px 14px', 'border-radius': '14px 14px 4px 14px' }, baseline: '.userBubble', source: 'chat.module.css .userBubble; Main l.103' },
  { selector: '.userTime', values: { 'margin-top': '-4px' }, source: 'chat.module.css .userTime margin-top 4 — net 4 under the column gap 8' },
  { selector: '.assistantRow', values: { gap: '12px' }, baseline: '.assistantRow', source: 'chat.module.css .assistantRow; Main l.107' },
  { selector: '.avatar', values: { width: '28px', height: '28px', 'border-radius': '8px' }, baseline: '.avatar', source: 'chat.module.css .avatar; Main l.108' },
  { selector: '.assistantCol', values: { 'max-width': '88%', gap: '8px' }, source: 'chat.module.css max 88% + .streamCol gap 8 / .turnCard margin-top 8' },
  {
    selector: '.assistantBubble',
    values: { padding: '12px 15px', 'border-radius': '14px 14px 14px 4px' },
    baseline: '.assistantBubble',
    source: 'chat.module.css .assistantBubble; Main l.150',
  },
  { selector: '.row', values: { gap: '8px' }, source: 'Main l.158 card buttons gap 8; rule 6' },
  { selector: '.pushEnd', values: { 'margin-left': 'auto' }, source: 'Main l.206 Send margin-left auto' },
  { selector: '.srOnly', values: { width: '1px', height: '1px' }, source: 'Main l.30 .sr' },
  { selector: '.textLink', values: { padding: '0' }, source: 'Main l.35 .link' },
  { selector: '.checklist', values: { 'border-radius': 'var(--sh-radius-lg)' }, source: 'Main l.85 checklist radius 8' },
  {
    selector: '.checklistHead',
    values: { width: '100%', gap: '12px', padding: '12px 14px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'Main l.86 toggle button: gap 12, padding 12px 14px, full width',
  },
  { selector: '.checklistBar', values: { 'max-width': '200px', height: '6px', 'border-radius': 'var(--sh-radius-full)' }, source: 'Main l.88 bar max 200, 6 tall, pill' },
  { selector: '.checklistFill', values: { height: '6px' }, source: 'Main l.88 fill' },
  { selector: '.checklistToggle', values: { 'margin-left': 'auto' }, source: 'Main l.90' },
  {
    selector: '.checklistItems',
    values: { margin: '0', padding: '0 14px 12px', 'grid-template-columns': 'repeat(2, minmax(0, 1fr))', gap: '4px 20px' },
    source: 'Main l.93 list: padding 0 14px 12px, two columns, gap 4px 20px',
  },
  { selector: '.checklistItem', values: { gap: '8px', 'min-height': '32px' }, source: 'Main l.95 item gap 8, min-height 32' },
  { selector: '.checklistMark', values: { width: '18px' }, source: 'Main l.95 mark width 18' },
  { selector: '.checklistText', values: { gap: '2px' }, source: 'Main l.120 text column gap 2 (label → why)' },
  { selector: '.checklistActions', values: { gap: '8px' }, source: 'rule 6: 8 between controls' },
  { selector: '.checklistNote', values: { margin: '0', padding: '0 14px 12px' }, source: 'Main l.98 note padding 0 14px 12px' },
  { selector: '.checklistStatus', values: { gap: '8px' }, source: 'rule 6: 8 between controls (spinner → text)' },
  { selector: '.applied, .turnCard', values: { 'border-radius': 'var(--sh-radius-lg)' }, source: 'Main l.113 applied block radius 8; chat.module.css .turnCard' },
  { selector: '.cardHead', values: { gap: '8px', padding: '10px 12px' }, baseline: '.turnCardHead', source: 'Main l.114 head; chat.module.css .turnCardHead' },
  { selector: '.cardHeadNote', values: { 'margin-left': 'auto' }, source: 'Main l.117' },
  { selector: '.badgeSuccess', values: { padding: '2px 8px', 'border-radius': 'var(--sh-radius-full)' }, source: 'Main l.116 "Your own words" badge 2px 8px pill' },
  { selector: '.badgeAccent', values: { padding: '1px 6px', 'border-radius': 'var(--sh-radius-full)' }, source: 'Main l.174 "My pick" badge 1px 6px pill' },
  { selector: '.appliedRows', values: { margin: '0', padding: '8px 12px', gap: '8px' }, source: 'Main l.119 list padding 8px 12px, gap 8' },
  { selector: '.appliedRow', values: { gap: '10px' }, source: 'Main l.120 row gap 10' },
  { selector: '.appliedTopic', values: { width: '96px', 'padding-top': '2px' }, source: 'Main l.120 topic width 96, padding-top 2' },
  { selector: '.appliedText', values: { gap: '2px' }, source: 'Main l.120 value → quote gap 2' },
  { selector: '.cardActions', values: { gap: '8px', padding: '10px 12px' }, baseline: '.turnCardActions', source: 'Main l.139 actions; chat.module.css .turnCardActions' },
  { selector: '.notice', values: { gap: '8px', padding: '12px 14px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'Main l.165 declined notice; l.146 undone notice padding' },
  { selector: '.willAdd', values: { gap: '10px', padding: '12px 14px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'Main l.162 accepted strip, before the card commits' },
  { selector: '.indented', values: { gap: '8px', 'margin-left': '40px' }, source: 'NextChapter l.84 margin-left 40 under the avatar (28 + gap 12); gap 8 as .assistantCol' },
  { selector: '.composerNotice', values: { gap: '8px', padding: '8px 10px', 'border-radius': 'var(--sh-radius-md)' }, source: 'Main l.214 strip padding 8px 10px radius 6' },
  { selector: '.impact', values: { gap: '12px' }, source: 'rule 6: 12 inside cards' },
  { selector: '.impactList', values: { margin: '0', padding: '0', gap: '6px' }, source: 'NextChapter l.76 owed list gap 6' },
  { selector: '.impactRow', values: { gap: '8px' }, source: 'rule 6: 8' },
  { selector: '.dialogText', values: { margin: '0' }, source: 'paragraph reset; rule 9 (Dialog body gap)' },
  { selector: '.suggestions, .waiting', values: { gap: '8px' }, source: 'chat.module.css .turnCard margin-top 8 between cards' },
  { selector: '.suggestion', values: { gap: '8px', padding: '12px 14px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'Main l.154 suggestion card; Phone suggestion' },
  { selector: '.question', values: { gap: '10px' }, source: 'Main l.168 question gap 10' },
  { selector: '.questionOptions', values: { 'grid-template-columns': 'repeat(3, minmax(0, 1fr))', gap: '8px' }, source: 'Main l.172 three columns gap 8' },
  { selector: '.option', values: { gap: '2px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'Main l.28 .opt' },
  { selector: '.optionHead', values: { gap: '6px' }, source: 'Main l.174 title row gap 6' },
  { selector: '.job', values: { gap: '10px', padding: '12px 14px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'NextChapter l.195 progress box' },
  { selector: '.jobHead', values: { gap: '8px' }, source: 'rule 6: 8' },
  { selector: '.jobDone', values: { gap: '12px' }, source: 'Main l.110 receipt → applied block gap 12' },
  { selector: '.receipt', values: { gap: '8px' }, source: 'Main l.111 receipt line gap 8' },
  { selector: '.unused', values: { gap: '8px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'Main l.127 "Not used yet" strip gap 8, padding 10px 12px' },
  { selector: '.unusedList', values: { gap: '8px' }, source: 'Main l.127 strip gap 8' },
  { selector: '.unusedRow', values: { gap: '10px', padding: '8px 10px', 'border-radius': 'var(--sh-radius-md)' }, source: 'Main l.131 paragraph row' },
  { selector: '.unusedNumber', values: { width: '34px' }, source: 'Main l.132 ¶ column width 34' },
  { selector: '.offer', values: { gap: '8px' }, source: 'rule 6: 8 between controls' },
  { selector: '.turnOp', values: { padding: '8px 12px' }, baseline: '.turnOp', source: 'chat.module.css .turnOp' },
  { selector: '.turnOpRow', values: { gap: '8px' }, baseline: '.turnOpRow', source: 'chat.module.css .turnOpRow' },
  { selector: '.turnOpLabel', values: { padding: '0' }, baseline: '.turnOpLabel', source: 'chat.module.css .turnOpLabel' },
  { selector: '.turnOpNote', values: { 'margin-top': '4px' }, baseline: '.turnOpNote', source: 'chat.module.css .turnOpNote' },
  { selector: '.turnOpError', values: { 'margin-top': '6px' }, baseline: '.turnOpError', source: 'chat.module.css .turnOpError' },
  { selector: '.turnOpSummary', values: { 'margin-top': '6px' }, baseline: '.turnOpSummary', source: 'chat.module.css .turnOpSummary' },
  { selector: '.turnCardNote', values: { padding: '10px 12px' }, baseline: '.turnCardNote', source: 'chat.module.css .turnCardNote' },
  { selector: '.turnCardWarning', values: { padding: '10px 12px' }, baseline: '.turnCardWarning', source: 'chat.module.css .turnCardWarning' },
  { selector: '.hero', values: { width: '100%', 'max-width': '720px', margin: '0 auto', padding: '0 20px 4px', gap: '10px' }, baseline: '.hero', source: 'chat.module.css .hero' },
  { selector: '.heroTitle', values: { margin: '0' }, baseline: '.heroTitle', source: 'chat.module.css .heroTitle' },
  { selector: '.heroSub', values: { margin: '0', 'max-width': '56ch' }, baseline: '.heroSub', source: 'chat.module.css .heroSub' },
  { selector: '.composer', values: { padding: '6px 20px 16px' }, baseline: '.composer', source: 'chat.module.css .composer; Main l.191' },
  { selector: '.composerStack', values: { 'max-width': '720px', margin: '0 auto', gap: '8px' }, source: 'Main l.192 max 720, chips → box gap 8' },
  { selector: '.chips', values: { gap: '8px' }, source: 'Main l.193; chat.module.css .suggestions gap 8' },
  {
    selector: '.composerInner',
    values: { 'border-radius': 'var(--sh-radius-lg)', padding: '10px 12px' },
    baseline: '.composerInner',
    source: 'chat.module.css .composerInner; Main l.199',
  },
  { selector: '.composerBar', values: { gap: '8px', 'margin-top': '8px' }, baseline: '.composerBar', source: 'chat.module.css .composerBar; Main l.202' },
  { selector: '.discussToggle', values: { gap: '6px', height: '24px', padding: '0 8px', 'border-radius': 'var(--sh-radius-full)' }, source: 'Main l.36 .tog' },
  { selector: '.discussDot', values: { width: '10px', height: '10px', 'border-radius': 'var(--sh-radius-full)' }, source: 'Main l.204 dot' },
];

const CHAT_PHONE: Expected[] = [
  { selector: '.indented', values: { 'margin-left': '0' }, source: 'Phone: no avatar, so no indent (as the plan card)' },
  { selector: '.headLabel', values: { width: '1px', height: '1px' }, source: 'visually hidden label: icon buttons keep their names at 390' },
  { selector: '.assistantCol', values: { 'max-width': '100%' }, source: 'Phone transcript: replies run the full column, no avatar' },
  { selector: '.checklistItems, .questionOptions', values: { 'grid-template-columns': 'minmax(0, 1fr)' }, source: 'Phone one column' },
  { selector: '.appliedRow', values: { gap: '2px' }, source: 'Main l.120 value → quote gap 2, stacked on phone' },
  { selector: '.appliedTopic', values: { width: 'auto', 'padding-top': '0' }, source: 'topic stacked above the value on phone' },
  { selector: '.chips', values: { 'padding-bottom': '2px' }, source: 'Phone chips row padding-bottom 2 (scrolls sideways)' },
];

const MODEL_MENU: Expected[] = [
  {
    selector: '.trigger',
    values: { gap: '4px', height: '24px', padding: '0 8px', 'border-radius': '999px' },
    baseline: '.trigger',
    source: 'ChatModel.module.css .trigger on main; Main l.38 .pill',
  },
  { selector: '.messageTag', values: { 'margin-top': '4px' }, baseline: '.messageTag', source: 'ChatModel.module.css .messageTag on main' },
  { selector: '.panel', values: { gap: '12px' }, source: 'Main l.209 popover gap 12' },
  { selector: '.group', values: { gap: '6px' }, source: 'Main l.210 label → segmented gap 6' },
  { selector: '.resolved', values: { gap: '8px', padding: '8px 10px', 'border-radius': 'var(--sh-radius-md)' }, source: 'Main l.214 resolved model strip' },
  { selector: '.resolvedPrice', values: { 'margin-left': 'auto' }, source: 'Main l.214' },
  { selector: '.linkButton', values: { padding: '0' }, source: 'Main l.35 .link' },
  { selector: '.actions', values: { gap: '8px' }, source: 'Main l.216' },
  { selector: '.done', values: { 'margin-left': 'auto' }, source: 'Main l.216 Done margin-left auto' },
];

function check(rules: Rules, table: Expected[], baseline?: Rules): void {
  for (const expected of table) {
    expect({ selector: expected.selector, values: rules.get(expected.selector) }).toEqual({ selector: expected.selector, values: expected.values });
    if (!expected.baseline) continue;
    const today = baseline?.get(expected.baseline) ?? {};
    const kept = Object.fromEntries(Object.keys(expected.values).map(property => [property, today[property]]));
    expect({ selector: expected.selector, kept }).toEqual({ selector: expected.selector, kept: expected.values });
  }
  const uncited = [...rules.keys()].filter(selector => !table.some(entry => entry.selector === selector));
  expect(uncited).toEqual([]);
}

describe('Chat spacing', () => {
  const chat = spacingOf('../src/features/chat/Chat.module.css');

  const today = spacingOf('./fixtures/chat.baseline.module.css').base;

  it('should keep every chat spacing value equal to its cited source — today’s value where it names one — and cite every one', () => {
    check(chat.base, CHAT, today);
  });

  it('should keep the composer hint on one line, as today', () => {
    const hint = (path: string): Record<string, string> => {
      const css = readFileSync(new URL(path, import.meta.url), 'utf-8');
      const body = /\n\.hint \{([^}]*)\}/.exec(css)?.[1] ?? '';
      return Object.fromEntries(
        body
          .split(';')
          .map(line => line.split(':').map(part => part.trim()))
          .filter(([property]) => property === 'white-space' || property === 'overflow' || property === 'text-overflow' || property === 'min-width'),
      );
    };
    expect(hint('../src/features/chat/Chat.module.css')).toEqual(hint('./fixtures/chat.baseline.module.css'));
  });

  it('should keep every phone override cited', () => {
    check(chat.phone, CHAT_PHONE);
  });

  it('should keep the model menu’s values cited', () => {
    check(spacingOf('../src/components/nf/ChatModel.module.css').base, MODEL_MENU, spacingOf('./fixtures/chat-model.baseline.module.css').base);
  });

  it('should add no new 5/7/9/11/13 gap outside today’s copied bubbles', () => {
    const odd = [...chat.base.entries()].filter(([selector, values]) => /\b(5|7|9|11|13)px/.test(values.gap ?? '') && selector !== '.userBubble');
    expect(odd).toEqual([]);
  });
});

// The shell: sidebar 254 from 768 (a drawer below), content padding none; the chat screen caps at --sh-page-max 1200 (reference, Page shell).
const SIDEBAR = 254;
const PAGE_MAX = 1200;
const PHONE = 760;

function px(value: string | undefined, index = 0): number {
  const parts = (value ?? '0').split(/\s+/);
  const pick = parts.length === 1 ? parts[0] : parts.length === 2 || parts.length === 3 ? parts[index === 1 || index === 3 ? 1 : 0] : parts[index];
  return Number.parseFloat(pick ?? '0') || 0;
}

describe('Chat width arithmetic', () => {
  const { base, phone } = spacingOf('../src/features/chat/Chat.module.css');
  const sidePad = px(base.get('.scroll')?.padding, 1);
  const listMax = px(base.get('.msgList')?.['max-width']);
  const cardPad = px(base.get('.cardHead')?.padding, 1);
  const avatar = px(base.get('.avatar')?.width) + px(base.get('.assistantRow')?.gap);
  const optionGap = px(base.get('.questionOptions')?.gap);

  const layout = (viewport: number): { list: number; reply: number; option: number; checklistCell: number; appliedText: number } => {
    const content = Math.min(viewport >= 768 ? viewport - SIDEBAR : viewport, PAGE_MAX);
    const list = Math.min(content - 2 * sidePad, listMax);
    const isPhone = viewport <= PHONE;
    const reply = isPhone ? list : Math.min(list - avatar, list * 0.88);
    const columns = isPhone ? 1 : 3;
    const option = (reply - optionGap * (columns - 1)) / columns;
    const checklistCell = isPhone ? list - 2 * 14 : (list - 2 * 14 - 20) / 2;
    const appliedText = isPhone ? reply - 2 * cardPad : reply - 2 * cardPad - px(base.get('.appliedTopic')?.width) - px(base.get('.appliedRow')?.gap);
    return { list, reply, option, checklistCell, appliedText };
  };

  it('should fit the phone at 390 with no horizontal scroll', () => {
    expect(phone.get('.checklistItems, .questionOptions')?.['grid-template-columns']).toBe('minmax(0, 1fr)');
    const at390 = layout(390);
    expect(at390).toEqual({ list: 350, reply: 350, option: 350, checklistCell: 322, appliedText: 326 });
    const header = 390 - 2 * px(base.get('.head')?.padding, 1);
    const storyBible = 90;
    const iconButton = 34;
    const actions = storyBible + 3 * iconButton + 3 * px(base.get('.headActions')?.gap);
    expect(header - actions - px(base.get('.head')?.gap)).toBeGreaterThanOrEqual(100);
  });

  it('should keep every block readable at 768, 1024 and 1280', () => {
    expect(layout(768)).toEqual({ list: 474, reply: 417.12, option: 133.70666666666668, checklistCell: 213, appliedText: 287.12 });
    expect(layout(1024)).toEqual({ list: 720, reply: 633.6, option: 205.86666666666667, checklistCell: 336, appliedText: 503.6 });
    expect(layout(1280)).toEqual(layout(1024));
    for (const viewport of [768, 1024, 1280]) expect(layout(viewport).option).toBeGreaterThanOrEqual(120);
  });
});

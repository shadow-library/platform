import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { PANEL_DOCK_MIN, PROGRESS_PANEL_WIDTH, SHELL_DESKTOP_MIN, SIDEBAR_EXPANDED_MIN, SIDEBAR_RAIL_WIDTH, SIDEBAR_WIDTH } from '../src/lib/sidebar-rail';

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
  { selector: '.frame', values: { 'min-height': '0' }, source: 'chat redesign .shell: the chat beside its progress panel, min-height 0 as .column' },
  { selector: '.column', values: { 'min-height': '0' }, baseline: '.column', source: 'chat.module.css .column' },
  { selector: '.head', values: { height: '52px', gap: '10px', padding: '0 20px' }, baseline: '.head', source: 'chat.module.css .head; Main l.74; Phone header 52 `0 20px`' },
  {
    selector: '.headTitleButton',
    values: { gap: '6px', padding: '2px 4px', 'border-radius': 'var(--sh-radius-sm)' },
    baseline: '.headTitleButton',
    source: 'chat.module.css .headTitleButton',
  },
  {
    selector: '.headInner',
    values: { 'max-width': '720px', margin: '0 auto', gap: '10px' },
    source: 'chat redesign .chat-head .in: the header aligned to the thread column (.msgList 720, margin 0 auto), keeping .head’s own gap 10',
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
  {
    selector: '.assistantCol',
    values: { gap: '8px' },
    source: 'chat.module.css .streamCol gap 8 / .turnCard margin-top 8; no avatar and no width cap — the reply reads as a page',
  },
  { selector: '.jumpDock', values: { height: '0' }, source: 'chat redesign .jump: pinned to the thread’s bottom edge, taking no room' },
  { selector: '.jump.jump[data-size]', values: { 'border-radius': 'var(--sh-radius-full)' }, source: 'chat redesign .jump pill radius 999px' },
  { selector: '.turnRow', values: { gap: '8px', width: 'fit-content', 'max-width': '100%', padding: '4px 0' }, source: 'chat redesign .trow' },
  { selector: '.turnIcon', values: { width: '18px', height: '18px' }, source: 'chat redesign .trow .ic width 18' },
  {
    selector: '.turnDetail',
    values: { gap: '4px', margin: '0 0 6px 26px', padding: '0 0 0 12px' },
    source: 'chat redesign .tdetail: under the label (icon 18 + gap 8), padding-left 12',
  },
  { selector: '.turnSource', values: { gap: '8px' }, source: 'chat redesign .tdetail .src gap 8' },
  { selector: '.turnSourceMark', values: { width: '12px', height: '12px' }, source: 'chat redesign .tdetail .src::before, an 11–12px mark' },
  { selector: '.turnSourceDot', values: { width: '6px', height: '6px', 'border-radius': 'var(--sh-radius-full)' }, source: 'chat redesign .src.running dot' },
  { selector: '.turnTail', values: { gap: '8px', padding: '6px 0 2px' }, source: 'chat redesign .live-tail' },
  { selector: '.turnNote', values: { margin: '0' }, source: 'TurnStatus.module.css .note, the slow-turn note' },
  { selector: '.spark', values: { width: '18px', height: '18px' }, source: 'chat redesign .spark in a .trow (18)' },
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
  { selector: '.indented', values: { gap: '8px' }, source: 'gap 8 as .assistantCol; no avatar, so no indent' },
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
  {
    selector: '.round.round[data-size]',
    values: { width: '34px', height: '34px', 'border-radius': 'var(--sh-radius-full)', 'margin-left': 'auto' },
    source: 'chat redesign .round: 34px circle, margin-left auto',
  },
  { selector: '.queued', values: { gap: '8px', padding: '6px 10px', 'border-radius': 'var(--sh-radius-md)' }, source: 'chat redesign .queued gap 8, padding 6px 10px' },
];

const CHAT_PHONE: Expected[] = [
  { selector: '.headLabel', values: { width: '1px', height: '1px' }, source: 'visually hidden label: icon buttons keep their names at 390' },
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

// "redesign l.N" are lines in the approved chat redesign prototype (novel-forge-chat-redesign.html): its Cowork-style progress panel and receipt.
const PANEL: Expected[] = [
  { selector: '.panel', values: { width: '320px', 'min-height': '0' }, source: 'redesign l.46 .shell third column 320' },
  { selector: '.sheetBody.sheetBody', values: { padding: '0' }, source: 'each .psec pads itself inside the sheet (redesign l.160)' },
  { selector: '.section', values: { gap: '10px', padding: '14px 16px' }, source: 'redesign l.160 .psec padding 14px 16px; l.161 h3 margin-bottom 10' },
  { selector: '.sectionTitle', values: { margin: '0', gap: '8px' }, source: 'redesign l.161 .psec h3 gap 8' },
  { selector: '.empty', values: { margin: '0' }, source: 'paragraph reset' },
  { selector: '.steps', values: { margin: '0', padding: '0', gap: '2px' }, source: 'redesign l.163 .plan gap 2' },
  {
    selector: '.step',
    values: { 'grid-template-columns': '20px minmax(0, 1fr) auto', gap: '8px', padding: '4px 0' },
    source: 'redesign l.164 .plan li; padding 5px rounded to .turnRow’s 4px 0',
  },
  {
    selector: '.stepMark',
    values: { width: '16px', height: '16px', 'margin-top': '2px', 'border-radius': 'var(--sh-radius-full)' },
    source: 'redesign l.167 .plan .mk 16, margin-top 2, round',
  },
  { selector: '.groupLabel', values: { margin: '10px 0 4px' }, source: 'redesign l.173 .chg-g margin 10px 0 4px' },
  { selector: '.groupLabel:first-child', values: { 'margin-top': '0' }, source: 'redesign l.174 .chg-g:first-child' },
  { selector: '.changeList', values: { margin: '0', padding: '0' }, source: 'list reset' },
  {
    selector: '.change',
    values: { 'grid-template-columns': 'minmax(0, 1fr) auto', gap: '4px 6px', padding: '4px 0' },
    source: 'redesign l.175 .ci: columns, gap 6, padding 4px 0',
  },
  { selector: '.changeName', values: { gap: '4px' }, source: 'redesign l.178 .ci .idea margin-left 4' },
  {
    selector: '.changePrompt',
    values: { gap: '8px', padding: '8px 10px', 'border-radius': 'var(--sh-radius-md)' },
    source: 'chat.module.css .composerNotice strip 8px 10px, radius 6',
  },
  { selector: '.promptActions', values: { gap: '8px' }, source: 'rule 6: 8 between controls' },
  { selector: '.decide', values: { gap: '2px' }, source: 'redesign l.184 .ci .yn gap 2' },
  { selector: '.sources', values: { margin: '0', padding: '0', gap: '4px' }, source: 'redesign l.189 .srcl gap 4' },
  { selector: '.source', values: { gap: '8px' }, source: 'chat.module.css .turnSource gap 8' },
  { selector: '.sourceMark', values: { width: '12px', height: '12px' }, source: 'chat.module.css .turnSourceMark 12' },
  { selector: '.sourceDot', values: { width: '6px', height: '6px', 'border-radius': 'var(--sh-radius-full)' }, source: 'chat.module.css .turnSourceDot' },
  {
    selector: '.receipt',
    values: { gap: '12px', padding: '12px 14px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'redesign l.111 .receipt gap 12, padding 12px 14px, radius lg',
  },
  { selector: '.receiptMark', values: { width: '26px', height: '26px', 'border-radius': '8px' }, source: 'redesign l.112 .receipt .tick 26, radius 8' },
  { selector: '.receiptText', values: { gap: '2px' }, source: 'chat.module.css .appliedText title → detail gap 2' },
  { selector: '.changeValue', values: { gap: '2px' }, source: 'chat.module.css .appliedText value → quote gap 2' },
  { selector: '.changeValueText', values: { 'max-width': '100%' }, source: 'the value never widens its row' },
  { selector: '.showMore', values: { padding: '0' }, source: 'chat.module.css .textLink padding 0' },
  { selector: '.backBar', values: { padding: '14px 16px 0' }, source: 'redesign l.160 .psec padding 14px 16px, closing onto the section below' },
  { selector: '.srOnly', values: { width: '1px', height: '1px' }, source: 'Main l.30 .sr' },
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

  it('should size the mode pill with the model pill’s own class and keep the Edit prose note inline', () => {
    const menu = readFileSync(new URL('../src/features/chat/ComposerModeMenu.tsx', import.meta.url), 'utf-8');
    expect(menu).toContain('modelStyles.trigger');
    const toggle = readFileSync(new URL('../src/components/nf/ProseEditsToggle.module.css', import.meta.url), 'utf-8');
    expect(toggle).not.toMatch(/order:|100%/);
    expect(readFileSync(new URL('../src/features/chat/Chat.module.css', import.meta.url), 'utf-8')).toMatch(/\.proseToggle \{\s*flex: 1 1 auto;\s*min-width: 0;/);
    expect(toggle).toMatch(/\.label \{\s*flex: none;\s*white-space: nowrap;/);
  });

  it('should wrap the Edit prose toggle to its own row at 375px, as it did before, because its natural width cannot fit beside the pills and the button', () => {
    const { base } = spacingOf('../src/features/chat/Chat.module.css');
    const composerSide = px(base.get('.composer')?.padding, 1);
    const innerSide = px(base.get('.composerInner')?.padding, 1);
    const bar = 375 - 2 * composerSide - 2 * innerSide - 2;
    const gap = px(base.get('.composerBar')?.gap);
    const round = px(base.get('.round.round[data-size]')?.width);
    const modePill = 100;
    const modelPill = 130;
    const toggleNatural = 36 + 6 + 56;
    const beside = modePill + gap + modelPill + gap + toggleNatural + gap + round;
    expect(beside).toBeGreaterThan(bar);
    expect(modePill + gap + modelPill + gap + round).toBeLessThanOrEqual(bar);
    const css = readFileSync(new URL('../src/features/chat/Chat.module.css', import.meta.url), 'utf-8');
    expect(/\.proseToggle \{\s*flex: (\d+) (\d+) ([^;]+);/.exec(css)?.[3]).toBe('auto');
  });

  it('should keep the queued message on one truncated line', () => {
    const css = readFileSync(new URL('../src/features/chat/Chat.module.css', import.meta.url), 'utf-8');
    const body = /\n\.queuedText \{([^}]*)\}/.exec(css)?.[1] ?? '';
    for (const declaration of ['min-width: 0', 'overflow: hidden', 'text-overflow: ellipsis', 'white-space: nowrap']) expect(body).toContain(declaration);
  });

  it('should keep every phone override cited', () => {
    check(chat.phone, CHAT_PHONE);
  });

  it('should keep the progress panel’s values cited', () => {
    check(spacingOf('../src/features/chat/ProgressPanel.module.css').base, PANEL);
  });

  it('should keep the model menu’s values cited', () => {
    check(spacingOf('../src/components/nf/ChatModel.module.css').base, MODEL_MENU, spacingOf('./fixtures/chat-model.baseline.module.css').base);
  });

  it('should add no new 5/7/9/11/13 gap outside today’s copied bubbles', () => {
    const odd = [...chat.base.entries()].filter(([selector, values]) => /\b(5|7|9|11|13)px/.test(values.gap ?? '') && selector !== '.userBubble');
    expect(odd).toEqual([]);
  });
});

// The shell: a drawer below 768, the 56 rail until the progress panel can dock beside the 254 sidebar, then 254; the author may still expand
// the rail by hand. Content padding none. The chat screen takes the whole content region, so the thread's scrollbar sits at the pane edge;
// only the thread column (.msgList) and the header inside it are capped.
const PHONE = 760;

function sidebarAt(viewport: number): number {
  if (viewport < SHELL_DESKTOP_MIN) return 0;
  return viewport < SIDEBAR_EXPANDED_MIN ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH;
}

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
  const optionGap = px(base.get('.questionOptions')?.gap);

  const layout = (viewport: number, sidebar = sidebarAt(viewport)): { list: number; reply: number; option: number; checklistCell: number; appliedText: number } => {
    const content = viewport - sidebar;
    const thread = content >= PANEL_DOCK_MIN ? content - PROGRESS_PANEL_WIDTH : content;
    const list = Math.min(thread - 2 * sidePad, listMax);
    const isPhone = viewport <= PHONE;
    const reply = list;
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

  it('should keep every block readable at 768, 1024 and 1280, with the rail and with the sidebar expanded by hand', () => {
    expect(layout(768)).toEqual({ list: 672, reply: 672, option: 218.66666666666666, checklistCell: 312, appliedText: 542 });
    expect(layout(768, SIDEBAR_WIDTH)).toEqual({ list: 474, reply: 474, option: 152.66666666666666, checklistCell: 213, appliedText: 344 });
    expect(layout(1024)).toEqual({ list: 720, reply: 720, option: 234.66666666666666, checklistCell: 336, appliedText: 590 });
    expect(layout(1024, SIDEBAR_WIDTH)).toEqual(layout(1024));
    expect(layout(1280)).toEqual(layout(1024));
    expect(layout(1280, SIDEBAR_WIDTH)).toEqual(layout(1024));
    expect(layout(1920)).toEqual(layout(1024));
    for (const viewport of [768, 1024, 1280]) expect(layout(viewport, SIDEBAR_WIDTH).option).toBeGreaterThanOrEqual(120);
  });

  it('should keep the header as it was: the same four controls, with room for the title at 768', () => {
    const column = readFileSync(new URL('../src/features/chat/ChatColumn.tsx', import.meta.url), 'utf-8');
    const actions = /className=\{styles\.headActions\}>([\s\S]*?)\n\s*<\/div>\n/.exec(column)?.[1] ?? '';
    expect([...actions.matchAll(/<Button\b/g)]).toHaveLength(4);
    expect(actions).not.toContain('Progress');

    const header = Math.min(768 - SIDEBAR_WIDTH - 2 * px(base.get('.head')?.padding, 1), px(base.get('.headInner')?.['max-width']));
    const labelled = { changes: 96, history: 90, newChat: 100 };
    const controls = labelled.changes + labelled.history + labelled.newChat + 2 * px(base.get('.headActions')?.gap);
    expect(header - controls - px(base.get('.head')?.gap)).toBeGreaterThanOrEqual(100);
  });

  it('should put the progress panel beside the thread only while the thread keeps its full column, and offer its button otherwise', () => {
    const panelCss = readFileSync(new URL('../src/features/chat/ProgressPanel.module.css', import.meta.url), 'utf-8');
    const chatCss = readFileSync(new URL('../src/features/chat/Chat.module.css', import.meta.url), 'utf-8');
    const hiddenBelow = Number(/@container chat \(max-width: (\d+)px\)/.exec(panelCss)?.[1]);
    const buttonHiddenFrom = Number(/@container chat \(min-width: (\d+)px\)/.exec(chatCss)?.[1]);
    const panelWidth = px(spacingOf('../src/features/chat/ProgressPanel.module.css').base.get('.panel')?.width);
    expect(buttonHiddenFrom).toBe(hiddenBelow + 1);
    expect(buttonHiddenFrom).toBe(listMax + 2 * sidePad + panelWidth);
    expect(buttonHiddenFrom).toBe(PANEL_DOCK_MIN);
  });

  it('should dock the progress panel from 1136 beside the rail and from 1334 beside the sidebar', () => {
    const docks = (viewport: number, sidebar = sidebarAt(viewport)): boolean => viewport - sidebar >= PANEL_DOCK_MIN;
    expect([1440, 1334, 1280, 1136].map(viewport => docks(viewport))).toEqual([true, true, true, true]);
    expect([1135, 1024, 768].map(viewport => docks(viewport))).toEqual([false, false, false]);
    expect(docks(1333, SIDEBAR_WIDTH)).toBe(false);
    expect(docks(1280, SIDEBAR_WIDTH)).toBe(false);
  });

  it('should let the chat screen fill the pane and cap only the thread and header columns', () => {
    const route = readFileSync(new URL('../src/routes/novels/$novelId/chat.module.css', import.meta.url), 'utf-8');
    const screen = /\n\.screen \{([^}]*)\}/.exec(route)?.[1] ?? '';
    expect(screen).toContain('inset: 0');
    expect(screen).not.toMatch(/max-width|margin/);
    expect(base.get('.headInner')?.['max-width']).toBe(base.get('.msgList')?.['max-width']);
  });
});

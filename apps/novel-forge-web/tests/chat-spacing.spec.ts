import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { CHAPTER_PANEL_MIN, CHAPTER_PANEL_WIDTH, CHAPTER_SHEET_QUERY, CHAT_BESIDE_PANEL_MIN, clampPanelWidth } from '../src/lib/chapter-panel';
import {
  CHAT_THREAD_PADDING,
  CHAT_THREAD_WIDTH,
  PANEL_DOCK_MIN,
  PROGRESS_PANEL_WIDTH,
  SHELL_DESKTOP_MIN,
  SIDEBAR_EXPANDED_MIN,
  SIDEBAR_RAIL_WIDTH,
  SIDEBAR_WIDTH,
} from '../src/lib/sidebar-rail';

const SPACING =
  /^(padding|padding-top|padding-bottom|padding-block|padding-inline|margin|margin-inline|margin-top|margin-left|gap|border-radius|width|height|max-width|min-height|grid-template-columns)$/;

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

// "chat.module.css" is the route stylesheet frozen in tests/fixtures/chat.baseline.module.css, compared wherever an entry names a `baseline` rule.
const CHAT: Expected[] = [
  { selector: '.frame', values: { 'min-height': '0' }, source: 'design: the chat beside its progress panel, min-height 0 as .column' },
  { selector: '.column', values: { 'min-height': '0' }, baseline: '.column', source: 'chat.module.css .column' },
  {
    selector: '.head',
    values: { height: '52px', gap: '10px' },
    source:
      'chat.module.css .head height 52, gap 10; 2026-10-03 redesign after Claude and ChatGPT: the header carries no rule under it, and its row sits in the pages’ column (.headInner)',
  },
  {
    selector: '.headTitleButton',
    values: { gap: '6px', padding: '2px 4px', 'border-radius': 'var(--sh-radius-sm)' },
    baseline: '.headTitleButton',
    source: 'chat.module.css .headTitleButton',
  },
  {
    selector: '.headInner',
    values: { 'max-width': 'var(--sh-page-max)', 'margin-inline': 'auto', 'padding-inline': 'var(--nf-page-pad-inline)', gap: '10px' },
    source:
      'the other pages’ column (.nf-page in styles.css: --sh-page-max, centred, the shell gutter inside), so the title and actions line up with every page; keeps .head’s gap 10',
  },
  { selector: '.headActions', values: { gap: '8px', 'margin-left': 'auto' }, source: 'design: header buttons gap 8, margin-left auto' },
  { selector: '.body', values: { 'min-height': '0' }, baseline: '.body', source: 'chat.module.css .body' },
  { selector: ".body[data-view='centred']", values: { 'padding-bottom': '6vh' }, baseline: ".body[data-view='centred']", source: 'chat.module.css centred state' },
  {
    selector: '.scroll',
    values: { 'min-height': '0', 'padding-block': '24px', 'padding-inline': 'var(--nf-page-pad-inline)' },
    source:
      'chat.module.css .scroll 24 above and below; 2026-10-03 redesign after Claude and ChatGPT: a 768 reading column, the shell gutter (--nf-page-pad-inline) at the pane edges',
  },
  { selector: ".body[data-view='centred'] .scroll", values: { padding: '0' }, baseline: ".body[data-view='centred'] .scroll", source: 'chat.module.css centred scroll' },
  {
    selector: '.msgList',
    values: { 'max-width': '768px', margin: '0 auto', gap: '20px' },
    source: 'chat.module.css .msgList gap 20; 2026-10-03 redesign after Claude and ChatGPT: a 768 reading column, the shell gutter (--nf-page-pad-inline) at the pane edges',
  },
  { selector: '.userCol', values: { gap: '8px', 'max-width': '86%' }, source: 'chat.module.css max 86%; design: user column gap 8 (bubble → notes chip)' },
  { selector: '.userBubble', values: { padding: '11px 14px', 'border-radius': '14px 14px 4px 14px' }, baseline: '.userBubble', source: 'chat.module.css .userBubble; design' },
  { selector: '.userTime', values: { 'margin-top': '-4px' }, source: 'chat.module.css .userTime margin-top 4 — net 4 under the column gap 8' },
  {
    selector: '.assistantCol',
    values: { gap: '8px' },
    source: 'chat.module.css .streamCol gap 8 / .turnCard margin-top 8; no avatar and no width cap — the reply reads as a page',
  },
  { selector: '.jumpDock', values: { height: '0' }, source: 'design: pinned to the thread’s bottom edge, taking no room' },
  { selector: '.jump.jump[data-size]', values: { 'border-radius': 'var(--sh-radius-full)' }, source: 'design: pill radius 999px' },
  { selector: '.turnRow', values: { gap: '8px', width: 'fit-content', 'max-width': '100%', padding: '4px 0' }, source: 'design' },
  { selector: '.turnIcon', values: { width: '18px', height: '18px' }, source: 'design: width 18' },
  {
    selector: '.turnDetail',
    values: { gap: '4px', margin: '0 0 6px 26px', padding: '0 0 0 12px' },
    source: 'design: under the label (icon 18 + gap 8), padding-left 12',
  },
  { selector: '.turnSource', values: { gap: '8px' }, source: 'design: gap 8' },
  { selector: '.turnSourceMark', values: { width: '12px', height: '12px' }, source: 'design: an 11–12px mark' },
  { selector: '.turnSourceDot', values: { width: '6px', height: '6px', 'border-radius': 'var(--sh-radius-full)' }, source: 'design: running dot' },
  { selector: '.turnTail', values: { gap: '8px', padding: '6px 0 2px' }, source: 'design' },
  { selector: '.turnNote', values: { margin: '0' }, source: 'TurnStatus.module.css .note, the slow-turn note' },
  { selector: '.spark', values: { width: '18px', height: '18px' }, source: 'design: inside a turn row (18)' },
  { selector: '.row', values: { gap: '8px' }, source: 'design: card buttons gap 8; gap ladder' },
  { selector: '.pushEnd', values: { 'margin-left': 'auto' }, source: 'design: Send margin-left auto' },
  { selector: '.srOnly', values: { width: '1px', height: '1px' }, source: 'design' },
  { selector: '.checklist', values: { 'border-radius': 'var(--sh-radius-lg)' }, source: 'design: checklist radius 8' },
  {
    selector: '.checklistHead',
    values: { width: '100%', gap: '12px', padding: '12px 14px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'design: toggle button: gap 12, padding 12px 14px, full width',
  },
  { selector: '.checklistBar', values: { 'max-width': '200px', height: '6px', 'border-radius': 'var(--sh-radius-full)' }, source: 'design: bar max 200, 6 tall, pill' },
  { selector: '.checklistFill', values: { height: '6px' }, source: 'design: fill' },
  { selector: '.checklistToggle', values: { 'margin-left': 'auto' }, source: 'design' },
  {
    selector: '.checklistItems',
    values: { margin: '0', padding: '0 14px 12px', 'grid-template-columns': 'repeat(2, minmax(0, 1fr))', gap: '4px 20px' },
    source: 'design: list: padding 0 14px 12px, two columns, gap 4px 20px',
  },
  { selector: '.checklistItem', values: { gap: '8px', 'min-height': '32px' }, source: 'design: item gap 8, min-height 32' },
  { selector: '.checklistMark', values: { width: '18px' }, source: 'design: mark width 18' },
  { selector: '.checklistText', values: { gap: '2px' }, source: 'design: text column gap 2 (label → why)' },
  { selector: '.checklistActions', values: { gap: '8px' }, source: 'gap ladder: 8 between controls' },
  { selector: '.checklistNote', values: { margin: '0', padding: '0 14px 12px' }, source: 'design: note padding 0 14px 12px' },
  { selector: '.checklistStatus', values: { gap: '8px' }, source: 'gap ladder: 8 between controls (spinner → text)' },
  { selector: '.turnCard', values: { 'border-radius': 'var(--sh-radius-lg)' }, baseline: '.turnCard', source: 'chat.module.css .turnCard' },
  { selector: '.cardHead', values: { gap: '8px', padding: '10px 12px' }, baseline: '.turnCardHead', source: 'design: head; chat.module.css .turnCardHead' },
  { selector: '.badgeAccent', values: { padding: '1px 6px', 'border-radius': 'var(--sh-radius-full)' }, source: 'design: "Claude’s pick" badge 1px 6px pill' },
  { selector: '.cardActions', values: { gap: '8px', padding: '10px 12px' }, baseline: '.turnCardActions', source: 'design: actions; chat.module.css .turnCardActions' },
  { selector: '.draftBody', values: { padding: '12px 12px 0' }, source: 'the card head’s 12px inline padding; the foot’s border closes the bottom' },
  { selector: '.draftBody::after', values: { height: '64px' }, source: 'fade over the last three body lines (22px each)' },
  { selector: '.draftFoot', values: { gap: '8px', padding: '10px 12px' }, source: 'as .cardActions' },
  {
    selector: '.draftPointer',
    values: { gap: '8px', padding: '10px 12px' },
    source: 'the card’s own head (.cardHead gap 8, padding 10px 12px) standing alone while its chapter is open beside the chat',
  },
  { selector: '.indented', values: { gap: '8px' }, source: 'gap 8 as .assistantCol; no avatar, so no indent' },
  { selector: '.composerNotice', values: { gap: '8px', padding: '8px 10px', 'border-radius': 'var(--sh-radius-md)' }, source: 'design: strip padding 8px 10px radius 6' },
  { selector: '.impact', values: { gap: '12px' }, source: 'gap ladder: 12 inside cards' },
  { selector: '.impactList', values: { margin: '0', padding: '0', gap: '6px' }, source: 'design: owed list gap 6' },
  { selector: '.impactRow', values: { gap: '8px' }, source: 'gap ladder: 8' },
  { selector: '.dialogText', values: { margin: '0' }, source: 'paragraph reset; dialog-body rule (Dialog body gap)' },
  { selector: '.question', values: { gap: '10px' }, source: 'design: question gap 10' },
  {
    selector: '.questionOptions',
    values: { 'grid-template-columns': 'repeat(2, minmax(0, 1fr))', gap: '8px' },
    source: 'design: two columns; gap kept at 8 (design)',
  },
  { selector: '.option', values: { gap: '2px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'design' },
  { selector: '.optionHead', values: { gap: '6px' }, source: 'design: title row gap 6' },
  { selector: '.optionTradeOff', values: { 'margin-top': '6px', 'padding-top': '6px' }, source: 'design: padding-top 6, dashed rule' },
  { selector: '.questionFoot', values: { gap: '8px' }, source: 'gap ladder: 8 between controls' },
  { selector: '.questionConfirm', values: { 'max-width': '100%' }, source: 'a long answer title ellipsises inside the button instead of overflowing the phone' },
  { selector: '.job', values: { gap: '10px', padding: '12px 14px', 'border-radius': 'var(--sh-radius-lg)' }, source: 'design: progress box' },
  { selector: '.jobHead', values: { gap: '8px' }, source: 'gap ladder: 8' },
  { selector: '.jobDone', values: { gap: '12px' }, source: 'design: receipt → applied block gap 12' },
  { selector: '.receipt', values: { gap: '8px' }, source: 'design: receipt line gap 8' },
  { selector: '.offer', values: { gap: '8px' }, source: 'gap ladder: 8 between controls' },
  { selector: '.turnOp', values: { padding: '8px 12px' }, baseline: '.turnOp', source: 'chat.module.css .turnOp' },
  { selector: '.turnOpRow', values: { gap: '8px' }, baseline: '.turnOpRow', source: 'chat.module.css .turnOpRow' },
  { selector: '.turnOpLabel', values: { padding: '0' }, baseline: '.turnOpLabel', source: 'chat.module.css .turnOpLabel' },
  { selector: '.turnOpNote', values: { 'margin-top': '4px' }, baseline: '.turnOpNote', source: 'chat.module.css .turnOpNote' },
  { selector: '.turnOpError', values: { 'margin-top': '6px' }, baseline: '.turnOpError', source: 'chat.module.css .turnOpError' },
  { selector: '.turnOpSummary', values: { 'margin-top': '6px' }, baseline: '.turnOpSummary', source: 'chat.module.css .turnOpSummary' },
  {
    selector: '.turnOpActions',
    values: { gap: '8px', 'margin-top': '8px' },
    source: 'design: an item’s Add / Skip and conflict choice, 8 apart as .row; 8 under the item as .draftFoot gap 8',
  },
  {
    selector: '.passageDiff',
    values: { 'margin-top': '6px', 'border-radius': 'var(--sh-radius-md)' },
    source: 'design: gap 6 between the passage’s row and its .diff, radius 6; 6 under the row as .turnOpError',
  },
  { selector: '.passageRemoved, .passageAdded', values: { padding: '4px 8px' }, source: 'design: div padding 4px 8px' },
  { selector: '.turnCardNote', values: { padding: '10px 12px' }, baseline: '.turnCardNote', source: 'chat.module.css .turnCardNote' },
  { selector: '.turnCardWarning', values: { padding: '10px 12px' }, baseline: '.turnCardWarning', source: 'chat.module.css .turnCardWarning' },
  {
    selector: '.hero',
    values: { width: '100%', 'max-width': '768px', margin: '0 auto', 'padding-block': '0 8px', 'padding-inline': 'var(--nf-page-pad-inline)', gap: '10px' },
    source: 'chat.module.css .hero; 2026-10-03 redesign after Claude and ChatGPT: a 768 reading column, the shell gutter (--nf-page-pad-inline) at the pane edges',
  },
  { selector: '.heroTitle', values: { margin: '0' }, baseline: '.heroTitle', source: 'chat.module.css .heroTitle' },
  { selector: '.heroSub', values: { margin: '0', 'max-width': '56ch' }, baseline: '.heroSub', source: 'chat.module.css .heroSub' },
  {
    selector: '.composer',
    values: { 'padding-block': '6px 16px', 'padding-inline': 'var(--nf-page-pad-inline)' },
    source:
      'chat.module.css .composer 6 above, 16 below; 2026-10-03 redesign after Claude and ChatGPT: a 768 reading column, the shell gutter (--nf-page-pad-inline) at the pane edges',
  },
  {
    selector: '.composerStack',
    values: { 'max-width': '768px', margin: '0 auto', gap: '8px' },
    source: 'box → chips gap 8; 2026-10-03 redesign after Claude and ChatGPT: a 768 reading column, the shell gutter (--nf-page-pad-inline) at the pane edges',
  },
  { selector: '.chips', values: { gap: '8px' }, source: 'design; chat.module.css .suggestions gap 8' },
  {
    selector: '.composerInner',
    values: { 'border-radius': '20px', padding: '14px 14px 10px 18px' },
    source:
      'one rounded surface around a bare textarea, as Claude’s and ChatGPT’s composers; 2026-10-03 redesign after Claude and ChatGPT: a 768 reading column, the shell gutter (--nf-page-pad-inline) at the pane edges',
  },
  { selector: '.composerBar', values: { gap: '8px', 'margin-top': '8px' }, baseline: '.composerBar', source: 'chat.module.css .composerBar; design' },
  {
    selector: '.round.round[data-size]',
    values: { width: '34px', height: '34px', 'border-radius': 'var(--sh-radius-full)', 'margin-left': 'auto' },
    source: 'design: 34px circle, margin-left auto',
  },
  { selector: '.queued', values: { gap: '8px', padding: '6px 10px', 'border-radius': 'var(--sh-radius-md)' }, source: 'design: gap 8, padding 6px 10px' },
  { selector: '.tray', values: { 'border-radius': 'var(--sh-radius-lg)' }, source: 'design: a bordered box with .turnCard’s radius' },
  {
    selector: '.trayHead',
    values: { gap: '8px', padding: '4px 8px 4px 12px' },
    source: 'design: gap 8, 12 at the left; 4 above and below and 8 at the right so its 28px Hide button keeps the design’s 36px head',
  },
  { selector: '.trayRows', values: { margin: '0', padding: '0' }, source: 'a list reset: the rows carry their own padding' },
  {
    selector: '.trayRow',
    values: { gap: '8px', padding: '4px 8px 4px 12px' },
    source: 'design: 12 at the left on .chips’ gap 8; the row’s 28px button stands in for the design’s 8 above and below, as in .trayHead',
  },
  {
    selector: '.trayLine',
    values: { gap: '8px', width: 'fit-content', 'max-width': '100%', padding: '6px 10px', 'border-radius': 'var(--sh-radius-full)' },
    source: 'design: a fit-content pill; the .queued strip’s gap 8 and padding 6px 10px, since both hold a 28px button',
  },
];

// Passage comments: chips in the composer, and sent chips above the bubble.
const PASSAGES: Expected[] = [
  {
    selector: '.sentPassages',
    values: { gap: '6px', 'max-width': '100%', margin: '0', padding: '0' },
    source: 'design: the sent chips stacked 6 apart above the bubble; list reset',
  },
  {
    selector: '.sentPassage',
    values: { gap: '2px', 'max-width': '100%', padding: '8px 10px', 'border-radius': 'var(--sh-radius-md)' },
    source: 'design: white bordered mini-cards; chat .composerNotice 8px 10px, radius-md',
  },
  { selector: '.sentPassageHead', values: { gap: '8px' }, source: 'design: the ref chip 8 before its quote' },
  {
    selector: '.passages',
    values: { gap: '6px', margin: '0 0 8px', padding: '0' },
    source: 'design: chips 6 apart inside the composer, 8 above the input as .composerBar margin-top',
  },
  { selector: '.passage', values: { gap: '4px', 'border-radius': 'var(--sh-radius-md)' }, source: 'design: a chip row with its × close beside it; .queued radius-md' },
  {
    selector: '.passageOpen',
    values: { gap: '8px', padding: '6px 8px', 'border-radius': 'var(--sh-radius-md)' },
    source: 'chat .queued padding 6px 10px less the × button’s side; .row gap 8',
  },
  { selector: '.passageRef', values: { padding: '1px 6px', 'border-radius': 'var(--sh-radius-sm)' }, source: 'design: the "Ch 3 · ¶4" chip, mono 11 on accent-soft' },
];

const CHAT_PHONE: Expected[] = [
  { selector: '.headLabel', values: { width: '1px', height: '1px' }, source: 'visually hidden label: icon buttons keep their names at 390' },
  { selector: '.checklistItems, .questionOptions', values: { 'grid-template-columns': 'minmax(0, 1fr)' }, source: 'Phone one column' },
  { selector: '.chips', values: { 'padding-bottom': '2px' }, source: 'Phone chips row padding-bottom 2 (scrolls sideways)' },
];

const MODEL_MENU: Expected[] = [
  {
    selector: '.trigger',
    values: { gap: '4px', height: '24px', padding: '0 8px', 'border-radius': '999px' },
    baseline: '.trigger',
    source: 'ChatModel.module.css .trigger on main; design',
  },
  { selector: '.messageTag', values: { 'margin-top': '4px' }, baseline: '.messageTag', source: 'ChatModel.module.css .messageTag on main' },
  { selector: '.panel', values: { gap: '12px' }, source: 'design: popover gap 12' },
  { selector: '.group', values: { gap: '6px' }, source: 'design: label → segmented gap 6' },
  { selector: '.resolved', values: { gap: '8px', padding: '8px 10px', 'border-radius': 'var(--sh-radius-md)' }, source: 'design: resolved model strip' },
  { selector: '.resolvedPrice', values: { 'margin-left': 'auto' }, source: 'design' },
  { selector: '.linkButton', values: { padding: '0' }, source: 'design' },
  { selector: '.actions', values: { gap: '8px' }, source: 'design' },
  { selector: '.done', values: { 'margin-left': 'auto' }, source: 'design: Done margin-left auto' },
];

// The Cowork-style progress panel and receipt.
const PANEL: Expected[] = [
  { selector: '.panel', values: { width: '320px', 'min-height': '0' }, source: 'design: third column 320' },
  { selector: '.sheetBody.sheetBody', values: { padding: '0' }, source: 'each section pads itself inside the sheet (design)' },
  { selector: '.section', values: { gap: '10px', padding: '14px 16px' }, source: 'design: padding 14px 16px; h3 margin-bottom 10' },
  { selector: '.sectionTitle', values: { margin: '0', gap: '8px' }, source: 'design: h3 gap 8' },
  { selector: '.empty', values: { margin: '0' }, source: 'paragraph reset' },
  { selector: '.groupLabel', values: { margin: '10px 0 4px' }, source: 'design: margin 10px 0 4px' },
  { selector: '.groupLabel:first-child', values: { 'margin-top': '0' }, source: 'design' },
  { selector: '.changeList', values: { margin: '0', padding: '0' }, source: 'list reset' },
  {
    selector: '.change',
    values: { 'grid-template-columns': 'minmax(0, 1fr) auto', gap: '4px 6px', padding: '4px 0' },
    source: 'design: columns, gap 6, padding 4px 0',
  },
  { selector: '.changeName', values: { gap: '4px' }, source: 'design: margin-left 4' },
  {
    selector: '.changePrompt',
    values: { gap: '8px', padding: '8px 10px', 'border-radius': 'var(--sh-radius-md)' },
    source: 'chat.module.css .composerNotice strip 8px 10px, radius 6',
  },
  { selector: '.promptActions', values: { gap: '8px' }, source: 'gap ladder: 8 between controls' },
  { selector: '.decide', values: { gap: '2px' }, source: 'design: gap 2' },
  { selector: '.sources', values: { margin: '0', padding: '0', gap: '4px' }, source: 'design: gap 4' },
  { selector: '.source', values: { gap: '8px' }, source: 'chat.module.css .turnSource gap 8' },
  { selector: '.sourceMark', values: { width: '12px', height: '12px' }, source: 'chat.module.css .turnSourceMark 12' },
  { selector: '.sourceDot', values: { width: '6px', height: '6px', 'border-radius': 'var(--sh-radius-full)' }, source: 'chat.module.css .turnSourceDot' },
  {
    selector: '.receipt',
    values: { gap: '12px', padding: '12px 14px', 'border-radius': 'var(--sh-radius-lg)' },
    source: 'design: gap 12, padding 12px 14px, radius lg',
  },
  { selector: '.receiptMark', values: { width: '26px', height: '26px', 'border-radius': '8px' }, source: 'design: 26, radius 8' },
  { selector: '.receiptText', values: { gap: '2px' }, source: 'chat.module.css .appliedText title → detail gap 2' },
  { selector: '.changeValue', values: { gap: '2px' }, source: 'chat.module.css .appliedText value → quote gap 2' },
  { selector: '.changeValueText', values: { 'max-width': '100%' }, source: 'the value never widens its row' },
  { selector: '.showMore', values: { padding: '0' }, source: 'chat.module.css .textLink padding 0' },
  { selector: '.backBar', values: { padding: '14px 16px 0' }, source: 'design: padding 14px 16px, closing onto the section below' },
  { selector: '.panelBar', values: { padding: '8px 8px 0' }, source: 'the close button tucked into the corner, closing onto the first section' },
  {
    selector: '.strip',
    values: { gap: '8px', padding: '6px 8px 6px 16px' },
    source: 'the panel folded under the chapter’s header: the header’s 16 at the left and 8 at the right (ChapterPanel .head), 6 above and below its 28px buttons',
  },
  { selector: '.srOnly', values: { width: '1px', height: '1px' }, source: 'design' },
];

// Every at-rule block read apart from the base rules, keyed by its prelude, so a sheet or phone override never masks the value it overrides.
function atRulesOf(path: string): { base: Rules; at: Map<string, Rules> } {
  const css = readFileSync(new URL(path, import.meta.url), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
  const at = new Map<string, Rules>();
  let base = '';
  let index = 0;
  for (let start = css.indexOf('@', index); start >= 0; start = css.indexOf('@', index)) {
    const open = css.indexOf('{', start);
    let depth = 1;
    let end = open + 1;
    while (depth > 0 && end < css.length) {
      if (css[end] === '{') depth++;
      if (css[end] === '}') depth--;
      end++;
    }
    base += css.slice(index, start);
    at.set(css.slice(start, open).trim(), rulesOf(css.slice(open + 1, end - 1)));
    index = end;
  }
  return { base: rulesOf(base + css.slice(index)), at };
}

// The chapter panel beside the chat.
const CHAPTER_PANEL: Expected[] = [
  {
    selector: '.panel',
    values: { width: 'var(--chapter-panel-width, 640px)', 'max-width': 'calc(100% - 420px)', 'min-height': '0' },
    source: 'design: a 640 reading width by default, the chat keeping at least 420 beside it',
  },
  { selector: '.separator', values: { width: '6px' }, source: 'a 6px grab area centred on the 1px border' },
  {
    selector: '.head',
    values: { height: '48px', gap: '8px', padding: '0 8px 0 16px' },
    source: 'design: panel header 48 high; ProgressPanel .section 16 at the left, .panelBar 8 at the right',
  },
  { selector: '.title', values: { margin: '0' }, source: 'heading reset' },
  { selector: '.headActions', values: { gap: '8px', 'margin-left': 'auto' }, source: 'chat .headActions gap 8, margin-left auto' },
  { selector: '.scroll', values: { 'min-height': '0' }, source: 'as chat .scroll' },
  { selector: '.reader', values: { padding: '28px 56px 28px 64px' }, source: 'design: reading view padding 28px 56px 28px 64px' },
  { selector: '.reader :global(.nf-md) > [data-paragraph]::before', values: { width: '32px' }, source: 'design: paragraph-number gutter: 32 wide, 16 short of the prose' },
  {
    selector: '.reader :global(.nf-md) > :global(.chapter-table)[data-paragraph]::before',
    values: { 'margin-left': '-48px' },
    source: 'the paragraph number’s left -48, taken from a table’s static place since its scroll box would clip it',
  },
  { selector: '.note', values: { margin: '0 0 16px' }, source: 'the judge’s note above the prose; ProgressPanel .section 16' },
  { selector: '.empty', values: { margin: '0' }, source: 'paragraph reset' },
  { selector: '.state', values: { gap: '12px', padding: '28px 56px 0 64px' }, source: 'the reading view’s padding (.reader), 12 between a status and its line as chat .receipt' },
  { selector: '.editorBody', values: { 'min-height': '0' }, source: 'as chat .column' },
  {
    selector: '.textarea',
    values: { 'min-height': '0', width: '100%', padding: '28px 56px 28px 64px' },
    source: 'design: edit view: the textarea fills the panel, its text where the reading view’s prose sits',
  },
  { selector: '.statusBar', values: { gap: '4px 8px', padding: '6px 16px' }, source: 'design: status bar; ProgressPanel .section 16 at the sides' },
  {
    selector: '.toolbar',
    values: { gap: '2px', 'max-width': '100%', padding: '4px', 'border-radius': 'var(--sh-radius-md)' },
    source: 'design: the dark toolbar above a selection, its small buttons 4 inside its edge; the tooltip surface’s radius-md',
  },
  { selector: '.toolbarKbd', values: { 'margin-left': '6px' }, source: 'design: "Comment ⌘K", the shortcut 6 after the word as ui Tooltip .shortcut' },
  { selector: '.toolbarNote', values: { 'max-width': '240px', padding: '0 8px' }, source: 'ui Tooltip .content max-width 240, a button’s 8 at the sides' },
  {
    selector: '.toolbarProblem',
    values: { 'max-width': '360px', padding: '10px 12px', 'border-radius': 'var(--sh-radius-md)' },
    source: 'ChecksPanel .notice padding 10px 12px, radius md; Drawer sm 360 as the narrowest reading column',
  },
  {
    selector: '.comment.comment',
    values: { width: '360px', gap: '10px', padding: '14px' },
    source: 'design: the comment popover ≈360 wide; chat .composerInner 14 inside, 10 between rows',
  },
  { selector: '.commentPassage', values: { gap: '8px' }, source: 'design: the ref chip 8 before its quote, as chat .sentPassageHead' },
  { selector: '.quick', values: { gap: '6px' }, source: 'design: quick requests gap 6px' },
  { selector: '.commentFoot', values: { gap: '8px' }, source: 'chat .row gap 8' },
];

const CHAPTER_PANEL_AT: Record<string, Expected[]> = {
  '@media (max-width: 1023px)': [
    { selector: '.panel', values: { width: 'auto', 'max-width': 'none' }, source: 'below 1024 the chapter is a full sheet over the chat' },
    { selector: '.backBar', values: { padding: '8px 8px 0' }, source: 'ProgressPanel .panelBar padding 8px 8px 0' },
  ],
  '@media (max-width: 760px)': [
    {
      selector: '.reader, .textarea',
      values: { padding: '20px 16px 20px 44px' },
      source: 'the phone gutter (16, --nf-page-pad-inline) at the right, 44 at the left for the numbers',
    },
    { selector: '.reader :global(.nf-md) > [data-paragraph]::before', values: { width: '24px' }, source: 'the gutter narrowed with its padding' },
    { selector: '.reader :global(.nf-md) > :global(.chapter-table)[data-paragraph]::before', values: { 'margin-left': '-36px' }, source: 'the phone number’s left -36' },
    { selector: '.state', values: { padding: '20px 16px 0' }, source: 'the phone gutter' },
  ],
};

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
    check(chat.base, [...CHAT, ...PASSAGES], today);
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

  it('should keep the chapter panel’s values cited, its sheet and phone overrides apart', () => {
    const { base, at } = atRulesOf('../src/features/chat/ChapterPanel.module.css');
    check(base, CHAPTER_PANEL);
    for (const [prelude, rules] of at) check(rules, CHAPTER_PANEL_AT[prelude] ?? []);
    expect([...Object.keys(CHAPTER_PANEL_AT)].filter(prelude => !at.has(prelude))).toEqual([]);
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

// The chat's sides take the shell's inline gutter: 16 on a phone and 24 from 640 up.
const GUTTER_VAR = 'var(--nf-page-pad-inline)';

function gutterAt(viewport: number): number {
  return viewport < 640 ? 16 : CHAT_THREAD_PADDING;
}

function px(value: string | undefined, index = 0): number {
  const parts = (value ?? '0').split(/\s+/);
  const pick = parts.length === 1 ? parts[0] : parts.length === 2 || parts.length === 3 ? parts[index === 1 || index === 3 ? 1 : 0] : parts[index];
  if (pick === GUTTER_VAR) return CHAT_THREAD_PADDING;
  return Number.parseFloat(pick ?? '0') || 0;
}

describe('Chat width arithmetic', () => {
  const { base, phone } = spacingOf('../src/features/chat/Chat.module.css');
  const sidePad = px(base.get('.scroll')?.['padding-inline']);
  const listMax = px(base.get('.msgList')?.['max-width']);
  const optionGap = px(base.get('.questionOptions')?.gap);

  const layout = (viewport: number, sidebar = sidebarAt(viewport)): { list: number; reply: number; option: number; checklistCell: number } => {
    const content = viewport - sidebar;
    const thread = content >= PANEL_DOCK_MIN ? content - PROGRESS_PANEL_WIDTH : content;
    const list = Math.min(thread - 2 * gutterAt(viewport), listMax);
    const isPhone = viewport <= PHONE;
    const reply = list;
    const columns = isPhone ? 1 : 2;
    const option = (reply - optionGap * (columns - 1)) / columns;
    const checklistCell = isPhone ? list - 2 * 14 : (list - 2 * 14 - 20) / 2;
    return { list, reply, option, checklistCell };
  };

  it('should fit the phone at 390 with no horizontal scroll', () => {
    expect(phone.get('.checklistItems, .questionOptions')?.['grid-template-columns']).toBe('minmax(0, 1fr)');
    const at390 = layout(390);
    expect(at390).toEqual({ list: 358, reply: 358, option: 358, checklistCell: 330 });
    const header = 390 - 2 * gutterAt(390);
    const storyBible = 90;
    const iconButton = 34;
    const actions = storyBible + 3 * iconButton + 3 * px(base.get('.headActions')?.gap);
    expect(header - actions - px(base.get('.head')?.gap)).toBeGreaterThanOrEqual(100);
  });

  it('should keep every block readable at 768, 1024 and 1280, with the rail and with the sidebar expanded by hand, and cap it at the 768 reading column', () => {
    expect(layout(768)).toEqual({ list: 664, reply: 664, option: 328, checklistCell: 308 });
    expect(layout(768, SIDEBAR_WIDTH)).toEqual({ list: 466, reply: 466, option: 229, checklistCell: 209 });
    expect(layout(1024)).toEqual({ list: 768, reply: 768, option: 380, checklistCell: 360 });
    expect(layout(1024, SIDEBAR_WIDTH)).toEqual({ list: 722, reply: 722, option: 357, checklistCell: 337 });
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

    const header = 768 - SIDEBAR_WIDTH - 2 * gutterAt(768);
    const labelled = { changes: 96, history: 90, newChat: 100 };
    const controls = labelled.changes + labelled.history + labelled.newChat + 2 * px(base.get('.headActions')?.gap);
    expect(header - controls - px(base.get('.head')?.gap)).toBeGreaterThanOrEqual(100);
  });

  it('should put the panel beside the thread only while the thread keeps its full column', () => {
    const panelCss = readFileSync(new URL('../src/features/chat/ProgressPanel.module.css', import.meta.url), 'utf-8');
    const docksFrom = Number(/@container chat \(max-width: (\d+)px\)/.exec(panelCss)?.[1]) + 1;
    const panelWidth = px(spacingOf('../src/features/chat/ProgressPanel.module.css').base.get('.panel')?.width);
    expect(docksFrom).toBe(CHAT_THREAD_WIDTH + 2 * sidePad + panelWidth);
    expect(docksFrom).toBe(PANEL_DOCK_MIN);
  });

  it('should hold the chapter panel to the same bounds in its stylesheet as in the divider it is dragged by', () => {
    const css = readFileSync(new URL('../src/features/chat/ChapterPanel.module.css', import.meta.url), 'utf-8');
    const panel = /\n\.panel \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(panel).toContain(`width: var(--chapter-panel-width, ${CHAPTER_PANEL_WIDTH}px)`);
    expect(panel).toContain(`min-width: ${CHAPTER_PANEL_MIN}px`);
    expect(panel).toContain(`max-width: calc(100% - ${CHAT_BESIDE_PANEL_MIN}px)`);
    expect(css).toContain(`@media ${CHAPTER_SHEET_QUERY} {`);
  });

  it('should leave the chat at least 420 beside a chapter from 1024 up, and a reading column no narrower than the panel minimum', () => {
    for (const viewport of [1024, 1280, 1440]) {
      for (const sidebar of [SIDEBAR_RAIL_WIDTH, SIDEBAR_WIDTH]) {
        const frame = viewport - sidebar;
        const panel = clampPanelWidth(CHAPTER_PANEL_WIDTH, frame);
        expect({ viewport, sidebar, chat: frame - panel >= CHAT_BESIDE_PANEL_MIN }).toEqual({ viewport, sidebar, chat: true });
        expect(panel).toBeGreaterThanOrEqual(CHAPTER_PANEL_MIN);
      }
    }
    expect(clampPanelWidth(CHAPTER_PANEL_WIDTH, 1440 - SIDEBAR_RAIL_WIDTH)).toBe(CHAPTER_PANEL_WIDTH);
  });

  it('should dock the progress panel from 1192 beside the rail and from 1390 beside the sidebar', () => {
    const docks = (viewport: number, sidebar = sidebarAt(viewport)): boolean => viewport - sidebar >= PANEL_DOCK_MIN;
    expect([1440, 1390, 1280, 1192].map(viewport => docks(viewport))).toEqual([true, true, true, true]);
    expect([1191, 1024, 768].map(viewport => docks(viewport))).toEqual([false, false, false]);
    expect(docks(1389, SIDEBAR_WIDTH)).toBe(false);
    expect(docks(1280, SIDEBAR_WIDTH)).toBe(false);
  });

  it('should let the chat screen fill the pane, set the header in the pages’ column and cap the thread, hero and composer to one column', () => {
    const route = readFileSync(new URL('../src/routes/novels/$novelId/chat.module.css', import.meta.url), 'utf-8');
    const screen = /\n\.screen \{([^}]*)\}/.exec(route)?.[1] ?? '';
    expect(screen).toContain('inset: 0');
    expect(screen).not.toMatch(/max-width|margin/);
    expect(base.get('.headInner')?.['max-width']).toBe('var(--sh-page-max)');
    expect(base.get('.composerStack')?.['max-width']).toBe(base.get('.msgList')?.['max-width']);
    expect(base.get('.hero')?.['max-width']).toBe(base.get('.msgList')?.['max-width']);
  });
});

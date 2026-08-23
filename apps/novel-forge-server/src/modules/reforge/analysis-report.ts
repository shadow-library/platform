import { type ReforgeTransform } from '@server/database';

import { type ReforgeArcSchema } from '../ai/schemas/reforge-transform.schema';

export interface ReportInput {
  chapterCount: number;
  windowsFailed: number;
  windowCount: number;
  metrics: ReforgeTransform.AnalysisMetrics;
  summary: string;
  pacingProfile: string | null;
  arcs: ReforgeArcSchema[];
  findings: { type: string; fromChapter: number; toChapter: number; severity: number; confidence: number; detectedBy: string; label: string; detail: string | null }[];
}

const SEVERITY_ORDER = (a: { severity: number }, b: { severity: number }): number => b.severity - a.severity;

function range(from: number, to: number): string {
  return from === to ? `ch. ${from}` : `ch. ${from}–${to}`;
}

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/**
 * The one document the author reads before deciding what their novel should become — a table of 400
 * findings is not that document (transform design §3.4). Findings are grouped by type and ordered by
 * severity, because the author's next action is always "what is worst".
 */
export function renderAnalysisReport(input: ReportInput): string {
  const lines: string[] = ['# Source analysis', ''];
  lines.push(input.summary.trim(), '');

  lines.push('## At a glance', '');
  lines.push(`- ${input.chapterCount} source chapters analysed across ${input.windowCount} windows${input.windowsFailed > 0 ? ` (${input.windowsFailed} failed)` : ''}`);
  lines.push(`- ${percent(input.metrics.repetitionRatio)} of chapters reuse scene material; ${percent(input.metrics.stallRatio)} do not move the story`);
  lines.push(`- median chapter is ${input.metrics.medianWords} words`);
  lines.push(`- ${input.metrics.arcCount} arcs detected, ${input.metrics.deadThreadCount} thread(s) left hanging`);
  if (input.pacingProfile) lines.push('', `**Pacing.** ${input.pacingProfile.trim()}`);
  lines.push('');

  if (input.arcs.length > 0) {
    lines.push('## Arcs', '');
    for (const arc of input.arcs) lines.push(`- **${arc.label}** (${range(arc.fromChapter, arc.toChapter)})${arc.rationale ? ` — ${arc.rationale}` : ''}`);
    lines.push('');
  }

  const byType = new Map<string, ReportInput['findings']>();
  for (const finding of [...input.findings].sort(SEVERITY_ORDER)) {
    const bucket = byType.get(finding.type);
    if (bucket) bucket.push(finding);
    else byType.set(finding.type, [finding]);
  }

  if (byType.size === 0) {
    lines.push('## Findings', '', 'Nothing structural was found — neither the deterministic signals nor the reading pass flagged anything.', '');
    return lines.join('\n');
  }

  lines.push('## Findings', '');
  for (const [type, findings] of byType) {
    lines.push(`### ${type.replace(/_/g, ' ')} (${findings.length})`, '');
    for (const finding of findings) {
      const confidence = `${Math.round(finding.confidence * 100)}% confident, ${finding.detectedBy}`;
      lines.push(`- **${range(finding.fromChapter, finding.toChapter)}** — ${finding.label} _(severity ${finding.severity}, ${confidence})_`);
      if (finding.detail) lines.push(`  ${finding.detail}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

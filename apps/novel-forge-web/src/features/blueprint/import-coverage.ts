import { type ImportCoverageResponse } from '@/lib/apis';

export type CoverageIntent = 'covered' | 'recommended' | 'blocking';

export interface CoverageLine {
  id: string;
  label: string;
  evidence: string;
  intent: CoverageIntent;
}

export interface ImportCoverageSummary {
  covered: number;
  total: number;
  /** "6 of 7" — the phases only; the voice sample is a recommendation beside them, never a fraction of the design. */
  headline: string;
  lines: CoverageLine[];
  blocking: boolean;
}

function intentOf(covered: boolean, blocking: boolean): CoverageIntent {
  if (covered) return 'covered';
  return blocking ? 'blocking' : 'recommended';
}

/**
 * An import never went through the Blueprint, so its coverage is read from its content: what it already
 * settles is ticked, and every gap but a missing chapter brief is a recommendation rather than a blocker.
 */
export function importCoverageSummary(coverage: ImportCoverageResponse): ImportCoverageSummary {
  const lines: CoverageLine[] = coverage.phases.map(phase => ({
    id: phase.phase,
    label: phase.label,
    evidence: phase.evidence,
    intent: intentOf(phase.covered, phase.blocking),
  }));
  lines.push({ id: 'voice', label: 'Voice', evidence: coverage.voice.evidence, intent: intentOf(coverage.voice.covered, false) });

  const covered = coverage.phases.filter(phase => phase.covered).length;
  return { covered, total: coverage.phases.length, headline: `${covered} of ${coverage.phases.length}`, lines, blocking: coverage.blocking };
}

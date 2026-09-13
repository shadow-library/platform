export interface TranslationTermLike {
  id?: string;
  sourceTerm: string;
  variants?: string[] | null;
  target: string;
  category: string;
  treatment: 'translate' | 'localize' | 'transliterate' | 'preserve';
  status: 'suggested' | 'approved' | 'rejected';
  meaning?: string | null;
  revision?: number;
}

export interface FidelityIssue {
  source: 'fidelity';
  type: 'source_script_residue' | 'glossary_violation' | 'number_drift' | 'paragraph_drift' | 'dialogue_drift' | 'length_band';
  detail: string;
  excerpt?: string;
}

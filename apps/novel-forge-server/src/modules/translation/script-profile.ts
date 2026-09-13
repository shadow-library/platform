export interface ScriptProfile {
  language: string;
  residue: RegExp;
  wordBoundaries: boolean;
  minTermLength: number;
  lengthBand: [number, number];
  paragraphBand: [number, number];
  quoteMarks: string[];
}

const CJK_PARAGRAPH_BAND: [number, number] = [0.6, 1.6];
const CORNER_QUOTES = ['「', '」', '『', '』', '“', '”'];

export const ZH_PROFILE: ScriptProfile = {
  language: 'zh',
  residue: /[㐀-䶿一-鿿]/u,
  wordBoundaries: false,
  minTermLength: 2,
  lengthBand: [1.2, 3.2],
  paragraphBand: CJK_PARAGRAPH_BAND,
  quoteMarks: CORNER_QUOTES,
};

export const JA_PROFILE: ScriptProfile = {
  language: 'ja',
  residue: /[぀-ヿ㐀-䶿一-鿿]/u,
  wordBoundaries: false,
  minTermLength: 2,
  lengthBand: [0.8, 2.4],
  paragraphBand: CJK_PARAGRAPH_BAND,
  quoteMarks: CORNER_QUOTES,
};

export const KO_PROFILE: ScriptProfile = {
  language: 'ko',
  residue: /[ᄀ-ᇿ㄰-㆏가-힣]/u,
  wordBoundaries: false,
  minTermLength: 2,
  lengthBand: [0.9, 2.2],
  paragraphBand: CJK_PARAGRAPH_BAND,
  quoteMarks: ['“', '”', '「', '」'],
};

// Latin-script fallback: "residue" is untranslated accented text (Latin-1 Supplement / Latin Extended-A/B),
// since plain ASCII prose is not itself evidence of a stuck source language the way CJK/kana/hangul is.
export const LATIN_PROFILE: ScriptProfile = {
  language: 'latin',
  residue: /[À-ɏ]/u,
  wordBoundaries: true,
  minTermLength: 3,
  lengthBand: [0.7, 1.6],
  paragraphBand: [0.7, 1.4],
  quoteMarks: ['“', '”', '"'],
};

const PROFILES_BY_LANGUAGE: Record<string, ScriptProfile> = { zh: ZH_PROFILE, ja: JA_PROFILE, ko: KO_PROFILE };

export function scriptProfileFor(language: string | null | undefined): ScriptProfile {
  const primary = language?.split('-')[0]?.toLowerCase();
  if (!primary) return LATIN_PROFILE;
  return PROFILES_BY_LANGUAGE[primary] ?? LATIN_PROFILE;
}

export function scriptRatio(text: string, profile: ScriptProfile): number {
  if (!text) return 0;
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  const scriptLetters = text.match(new RegExp(profile.residue.source, 'gu')) ?? [];
  return scriptLetters.length / letters.length;
}

// Models routinely wrap their JSON in prose or markdown fences, and often emit a reasoning object before the
// real answer, so every balanced top-level object that parses is a candidate. String state is tracked from the
// opening brace onward — a `{` or `}` inside a JSON string value would otherwise move the depth counter and
// close the object early or never. Quotes in the surrounding prose are deliberately ignored: they are not
// reliably balanced, whereas quotes inside an object are.
export function extractJsonCandidates(text: string): unknown[] {
  const candidates: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      if (depth > 0) inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (char === '}' && depth > 0) {
      depth--;
      if (depth > 0 || start === -1) continue;
      const block = text.slice(start, i + 1);
      start = -1;
      try {
        candidates.push(JSON.parse(block));
      } catch {
        continue;
      }
    }
  }
  return candidates;
}

export function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return extractJsonCandidates(raw)[0] ?? null;
  }
}

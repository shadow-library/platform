export interface MarkdownHeading {
  level: number;
  text: string;
}

const FENCE_LINE = /^(`{3,}|~{3,})/;
const HEADING_LINE = /^(#{1,6})\s+(.+)$/;

/** Every `#`-through-`######` heading in source order, skipping lines inside a ``` or ~~~ fenced code block. */
export function extractHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  let fenceMarker: string | null = null;

  for (const line of markdown.split('\n')) {
    const fence = FENCE_LINE.exec(line.trimStart())?.[1]?.charAt(0);
    if (fence) {
      if (fenceMarker === null) fenceMarker = fence;
      else if (fenceMarker === fence) fenceMarker = null;
      continue;
    }
    if (fenceMarker) continue;

    const heading = HEADING_LINE.exec(line);
    if (heading) headings.push({ level: heading[1]?.length ?? 1, text: heading[2]?.trim() ?? '' });
  }

  return headings;
}

// Dependency-free HTML table extraction. Enough for the Visa Bulletin: it reads cell text and the
// text that precedes each table (its heading). Works in Workers and Node, where there is no DOM.

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '-',
  mdash: '-',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  hellip: '\u2026',
  bull: '\u2022',
  middot: '\u00b7',
  sect: '\u00a7',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code)) return match;
      // Non-breaking and special hyphens become plain characters.
      if (code === 0xa0) return ' ';
      if (code === 0x2011 || code === 0x2010 || code === 0x2013 || code === 0x2014) return '-';
      return String.fromCodePoint(code);
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Visible text of an HTML fragment, whitespace collapsed. */
export function textOf(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export interface HtmlTable {
  /** Up to 400 characters of text before the table, usually its heading. */
  before: string;
  rows: string[][];
}

export function extractTables(html: string): HtmlTable[] {
  const tables: HtmlTable[] = [];
  const re = /<table\b[\s\S]*?<\/table>/gi;
  let last = 0;
  for (const m of html.matchAll(re)) {
    const start = m.index ?? 0;
    const before = textOf(html.slice(last, start)).slice(-400);
    last = start + m[0].length;
    const rows: string[][] = [];
    for (const row of m[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
      const cells = [...row[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
        textOf(c[1] ?? ''),
      );
      if (cells.some((c) => c)) rows.push(cells);
    }
    tables.push({ before, rows });
  }
  return tables;
}

const DEFAULT_MAX_CHARS = 8_000;
const MAX_MAX_CHARS = 40_000;
const DEFAULT_MAX_ROWS = 50;
const MAX_MAX_ROWS = 500;
const DEFAULT_SEARCH_RESULTS = 10;
const MAX_SEARCH_RESULTS = 25;

function clampInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(minimum, Math.min(parsed, maximum));
}

export type BrowserReadPageRequest = {
  targetId?: string;
  selector?: string;
  maxChars?: number;
  offset?: number;
};

export type BrowserReadTableRequest = {
  targetId?: string;
  selector?: string;
  index?: number;
  maxRows?: number;
  offset?: number;
};

export type BrowserSearchRequest = {
  targetId?: string;
  query: string;
  engine?: "google" | "bing" | "duckduckgo";
  maxResults?: number;
};

export function buildReadPageFunction(request: BrowserReadPageRequest): string {
  const selector = request.selector?.trim() || null;
  const maxChars = clampInteger(request.maxChars, DEFAULT_MAX_CHARS, 256, MAX_MAX_CHARS);
  const offset = clampInteger(request.offset, 0, 0, 10_000_000);
  return `() => {
    const selector = ${JSON.stringify(selector)};
    const maxChars = ${maxChars};
    const offset = ${offset};
    const root = selector ? document.querySelector(selector) :
      (document.querySelector('main, article, [role="main"]') || document.body);
    if (!root) return { ok: false, error: 'selector not found' };
    const excluded = new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG','CANVAS']);
    const blocks = new Set(['P','DIV','SECTION','ARTICLE','MAIN','ASIDE','HEADER','FOOTER',
      'NAV','BLOCKQUOTE','PRE','FIGURE','FIGCAPTION','DL','DT','DD']);
    const clean = (value) => String(value || '').replace(/\\u00a0/g, ' ')
      .replace(/[ \\t]+/g, ' ').replace(/\\n[ \\t]+/g, '\\n')
      .replace(/\\n{3,}/g, '\\n\\n').trim();
    const visible = (el) => {
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        parseFloat(style.opacity || '1') >= 0.05 && !el.hidden &&
        el.getAttribute('aria-hidden') !== 'true';
    };
    const esc = (value) => clean(value).replace(/([\\\\\`*_[\\]()])/g, '\\\\$1');
    const tableText = (table) => {
      const rowEls = Array.from(table.querySelectorAll(
        ':scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr'));
      if (!rowEls.length) return '';
      const matrix = rowEls.map((row) => Array.from(row.querySelectorAll(':scope > th, :scope > td'))
        .map((cell) => clean(cell.innerText).replace(/\\|/g, '\\\\|')));
      const width = Math.max(...matrix.map((row) => row.length));
      if (!width) return '';
      const fill = (row) => row.concat(Array(Math.max(0, width - row.length)).fill(''));
      return '| ' + fill(matrix[0]).join(' | ') + ' |\\n| ' +
        Array(width).fill('---').join(' | ') + ' |' +
        (matrix.length > 1 ? '\\n' + matrix.slice(1).map((row) =>
          '| ' + fill(row).join(' | ') + ' |').join('\\n') : '');
    };
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return esc(node.nodeValue);
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const el = node;
      if (excluded.has(el.tagName) || !visible(el)) return '';
      const tag = el.tagName;
      if (tag === 'TABLE') return '\\n\\n' + tableText(el) + '\\n\\n';
      if (tag === 'BR') return '\\n';
      if (tag === 'HR') return '\\n\\n---\\n\\n';
      if (/^H[1-6]$/.test(tag)) return '\\n\\n' + '#'.repeat(Number(tag[1])) +
        ' ' + esc(el.innerText) + '\\n\\n';
      if (tag === 'A') {
        const label = clean(el.innerText || el.getAttribute('aria-label'));
        return label ? '[' + esc(label) + '](' + (el.href || '') + ')' : '';
      }
      if (tag === 'IMG') {
        const alt = clean(el.alt || el.getAttribute('aria-label'));
        return alt ? '![image](' + esc(alt) + ')' : '';
      }
      if (tag === 'LI') return '\\n- ' + Array.from(el.childNodes).map(walk).join('');
      if (tag === 'TR') return '';
      let body = Array.from(el.childNodes).map(walk).join('');
      if (tag === 'CODE' && el.parentElement?.tagName !== 'PRE') body = '\`' + body + '\`';
      if (tag === 'PRE') body = '\\n\\n\`\`\`\\n' + clean(el.innerText) + '\\n\`\`\`\\n\\n';
      if (tag === 'BLOCKQUOTE') body = '\\n\\n> ' + clean(body).replace(/\\n/g, '\\n> ') + '\\n\\n';
      if (blocks.has(tag)) body = '\\n\\n' + body + '\\n\\n';
      return body;
    };
    const content = clean(walk(root));
    const page = content.slice(offset, offset + maxChars);
    const nextOffset = offset + page.length;
    return {
      ok: true, url: location.href, title: document.title, selector,
      content: page, offset, totalChars: content.length,
      hasMore: nextOffset < content.length,
      nextOffset: nextOffset < content.length ? nextOffset : null
    };
  }`;
}

export function buildReadTableFunction(request: BrowserReadTableRequest): string {
  const selector = request.selector?.trim() || null;
  const index = clampInteger(request.index, 0, 0, 10_000);
  const maxRows = clampInteger(request.maxRows, DEFAULT_MAX_ROWS, 1, MAX_MAX_ROWS);
  const offset = clampInteger(request.offset, 0, 0, 1_000_000);
  return `() => {
    const selector = ${JSON.stringify(selector)};
    const index = ${index};
    const maxRows = ${maxRows};
    const offset = ${offset};
    const candidates = selector ? Array.from(document.querySelectorAll(selector)) :
      Array.from(document.querySelectorAll('table, [role="grid"], [role="table"]'));
    const table = candidates[index];
    if (!table) return { ok: false, error: 'table not found', tableCount: candidates.length };
    const clean = (value) => String(value || '').trim().replace(/\\s+/g, ' ');
    const rowElements = table.tagName === 'TABLE'
      ? Array.from(table.querySelectorAll(
          ':scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr'))
      : Array.from(table.querySelectorAll('[role="row"]'));
    const cellsFor = (row) => Array.from(row.querySelectorAll(
      ':scope > th, :scope > td, :scope > [role="columnheader"], :scope > [role="rowheader"], :scope > [role="cell"], :scope > [role="gridcell"]'
    )).map((cell) => clean(cell.innerText || cell.textContent));
    let headers = [];
    let dataStart = 0;
    if (rowElements.length && rowElements[0].querySelector(
      ':scope > th, :scope > [role="columnheader"]')) {
      headers = cellsFor(rowElements[0]);
      dataStart = 1;
    }
    const allRows = rowElements.slice(dataStart).map(cellsFor).filter((row) => row.length);
    const rows = allRows.slice(offset, offset + maxRows);
    const nextOffset = offset + rows.length;
    return {
      ok: true, url: location.href, title: document.title, tableIndex: index,
      tableCount: candidates.length,
      caption: clean(table.querySelector('caption')?.innerText || table.getAttribute('aria-label')),
      headers, rows, offset, totalRows: allRows.length,
      hasMore: nextOffset < allRows.length,
      nextOffset: nextOffset < allRows.length ? nextOffset : null
    };
  }`;
}

export function buildSearchResultsFunction(maxResults: unknown): string {
  const limit = clampInteger(maxResults, DEFAULT_SEARCH_RESULTS, 1, MAX_SEARCH_RESULTS);
  return `() => {
    const limit = ${limit};
    const clean = (value) => String(value || '').trim().replace(/\\s+/g, ' ');
    const selectors = ['#search .g', 'li.b_algo', '[data-testid="result"]', '.result', '.web-result'];
    let blocks = [];
    for (const selector of selectors) {
      blocks = Array.from(document.querySelectorAll(selector));
      if (blocks.length) break;
    }
    if (!blocks.length) {
      blocks = Array.from(document.querySelectorAll('main a[href], #links a[href]'))
        .map((anchor) => anchor.closest('article, section, div') || anchor);
    }
    const seen = new Set();
    const results = [];
    for (const block of blocks) {
      const anchor = block.matches?.('a[href]') ? block : block.querySelector('a[href]');
      if (!anchor?.href || !/^https?:/i.test(anchor.href)) continue;
      let url = anchor.href;
      try {
        const parsed = new URL(url);
        const target = parsed.searchParams.get('q') || parsed.searchParams.get('url');
        if (target && /^https?:/i.test(target)) url = target;
      } catch {}
      if (seen.has(url)) continue;
      const title = clean(block.querySelector('h1,h2,h3')?.innerText || anchor.innerText);
      if (!title) continue;
      const snippet = clean(block.querySelector(
        '.VwiC3b, .b_caption p, [data-result="snippet"], .result__snippet, p')?.innerText);
      seen.add(url);
      results.push({ title, url, snippet });
      if (results.length >= limit) break;
    }
    return { ok: true, url: location.href, title: document.title, results };
  }`;
}

export function searchUrl(request: BrowserSearchRequest): string {
  const engine = request.engine ?? "google";
  const bases = {
    google: "https://www.google.com/search?q=",
    bing: "https://www.bing.com/search?q=",
    duckduckgo: "https://html.duckduckgo.com/html/?q=",
  };
  return bases[engine] + encodeURIComponent(request.query.trim());
}

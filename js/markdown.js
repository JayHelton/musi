// Tiny zero-dependency Markdown renderer for Musi. Used to display user-entered
// notes (session-level and per-drill) that are stored in localStorage.
//
// SECURITY: the input is treated as untrusted. We HTML-escape the entire source
// FIRST (& < > "), and only then run the markdown transforms over the already
// escaped text. Because no raw `<`/`>` can survive the escape step, no markup or
// <script> can be injected — the transforms only ever emit our own fixed set of
// tags. Links are additionally restricted to http(s) and mailto schemes.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Only http(s) and mailto links are allowed; everything else (javascript:,
// data:, relative, …) is dropped so the link text renders as plain text.
function safeUrl(url) {
  const u = String(url).trim();
  if (/^https?:\/\//i.test(u) || /^mailto:/i.test(u)) return u;
  return null;
}

// Inline transforms applied to the text of a single block (heading, paragraph,
// list item, …). Inline code spans and links are pulled out into placeholders
// first so the emphasis passes can't mangle their contents or our own markup.
function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => {
    codes.push(c);
    return `\u0000IC${codes.length - 1}\u0000`;
  });

  const links = [];
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => {
    const safe = safeUrl(url);
    if (!safe) return txt; // unsafe scheme: keep the text, drop the link
    links.push(`<a href="${safe}" target="_blank" rel="noopener noreferrer">${txt}</a>`);
    return `\u0000LK${links.length - 1}\u0000`;
  });

  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');

  s = s.replace(/\u0000LK(\d+)\u0000/g, (m, n) => links[Number(n)]);
  s = s.replace(/\u0000IC(\d+)\u0000/g, (m, n) => `<code>${codes[Number(n)]}</code>`);
  return s;
}

const isCodePlaceholder = line => /^\u0000CB(\d+)\u0000$/.test(line);

// Block-level parser. Operates line-by-line on already-escaped text in which
// fenced code blocks have been swapped out for `\u0000CB<n>\u0000` placeholders.
function renderBlocks(text, blocks) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;

  const isSpecial = line =>
    /^\s*$/.test(line) ||
    isCodePlaceholder(line.trim()) ||
    /^\s*(#{1,6})\s+/.test(line) ||
    /^\s*&gt;/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^\s*([-*_])(\s*\1){2,}\s*$/.test(line);

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { i++; continue; }

    const placeholder = line.trim();
    if (isCodePlaceholder(placeholder)) {
      const n = Number(placeholder.match(/^\u0000CB(\d+)\u0000$/)[1]);
      out.push(`<pre><code>${blocks[n]}</code></pre>`);
      i++;
      continue;
    }

    // Horizontal rule (---, ***, ___).
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    // Headings.
    const h = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      out.push(`<h${lvl}>${inline(h[2].trim())}</h${lvl}>`);
      i++;
      continue;
    }

    // Blockquote (collects consecutive `>` lines, rendered recursively). The
    // `>` has already been HTML-escaped to `&gt;` by the time we get here.
    if (/^\s*&gt;/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*&gt;/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*&gt;\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${renderBlocks(buf.join('\n'), blocks)}</blockquote>`);
      continue;
    }

    // Unordered list.
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      out.push(`<ul>${items.map(it => `<li>${inline(it)}</li>`).join('')}</ul>`);
      continue;
    }

    // Ordered list.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      out.push(`<ol>${items.map(it => `<li>${inline(it)}</li>`).join('')}</ol>`);
      continue;
    }

    // Paragraph: gather consecutive plain lines, joined with <br>.
    const para = [];
    while (i < lines.length && !isSpecial(lines[i])) {
      para.push(inline(lines[i].trim()));
      i++;
    }
    out.push(`<p>${para.join('<br>')}</p>`);
  }

  return out.join('');
}

// Returns a SAFE HTML string for the given markdown source. Non-strings or empty
// input yield ''.
export function renderMarkdown(src) {
  if (typeof src !== 'string' || src === '') return '';

  let text = escapeHtml(src).replace(/\r\n?/g, '\n');

  // Pull fenced code blocks out first so their contents are never transformed.
  // Contents are already escaped by escapeHtml above.
  const blocks = [];
  text = text.replace(/```[^\n]*\n?([\s\S]*?)```/g, (m, code) => {
    blocks.push(code.replace(/\n$/, ''));
    return `\n\u0000CB${blocks.length - 1}\u0000\n`;
  });

  return renderBlocks(text, blocks);
}

// Convenience: render `src` into `el` and tag it so the markdown CSS applies.
export function setMarkdown(el, src) {
  if (!el) return;
  el.innerHTML = renderMarkdown(src);
  el.classList.add('markdown-body');
}

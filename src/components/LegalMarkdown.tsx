'use client';

import React, { Fragment } from 'react';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInlineHtml(text: string): string {
  let out = escapeHtml(text);
  // Inline code
  out = out.replace(
    /`([^`]+)`/g,
    '<code style="background:#f1f5f9;padding:1px 4px;border-radius:3px;font-family:Consolas,monospace;font-size:10pt;">$1</code>'
  );
  // Bold + Italic
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  return out;
}

/**
 * Pretvara Markdown u čist HTML optimiziran za izravno lijepljenje (Ctrl+V) u Microsoft Word
 * bez Markdown zvjezdica i ljestvi, uz očuvane odlomke, podebljanja i nabrajanja.
 */
export function markdownToWordHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const htmlParts: string[] = [];
  let inUl = false;
  let inOl = false;
  let inBlockquote = false;
  let tableRows: string[][] = [];

  const closeLists = () => {
    if (inUl) {
      htmlParts.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      htmlParts.push('</ol>');
      inOl = false;
    }
    if (inBlockquote) {
      htmlParts.push('</blockquote>');
      inBlockquote = false;
    }
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    let tbl =
      '<table style="border-collapse:collapse;width:100%;margin:8pt 0;font-family:Calibri,Arial,sans-serif;font-size:10.5pt;">';
    tableRows.forEach((row, rIdx) => {
      // Preskoči separator redak |---|---|
      if (row.every((cell) => /^[-:\s]+$/.test(cell))) return;
      const tag = rIdx === 0 ? 'th' : 'td';
      const cellStyle =
        rIdx === 0
          ? 'border:1px solid #cbd5e1;padding:6px 8px;background:#f1f5f9;font-weight:bold;text-align:left;'
          : 'border:1px solid #cbd5e1;padding:6px 8px;text-align:left;';
      tbl += '<tr>' + row.map((c) => `<${tag} style="${cellStyle}">${formatInlineHtml(c.trim())}</${tag}>`).join('') + '</tr>';
    });
    tbl += '</table>';
    htmlParts.push(tbl);
    tableRows = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    // Tablica
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      closeLists();
      const cells = trimmed.slice(1, -1).split('|');
      tableRows.push(cells);
      continue;
    } else if (tableRows.length > 0) {
      flushTable();
    }

    if (!trimmed) {
      closeLists();
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      closeLists();
      htmlParts.push('<hr style="border:none;border-top:1px solid #cbd5e1;margin:10pt 0;" />');
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      const sizes: Record<number, string> = { 1: '14pt', 2: '12.5pt', 3: '11.5pt', 4: '11pt' };
      htmlParts.push(
        `<h${level} style="font-family:Calibri,Arial,sans-serif;font-size:${sizes[level] || '11pt'};font-weight:bold;margin:10pt 0 4pt 0;color:#0f172a;">${formatInlineHtml(
          headingMatch[2]
        )}</h${level}>`
      );
      continue;
    }

    if (trimmed.startsWith('>')) {
      if (inUl || inOl) {
        if (inUl) {
          htmlParts.push('</ul>');
          inUl = false;
        }
        if (inOl) {
          htmlParts.push('</ol>');
          inOl = false;
        }
      }
      if (!inBlockquote) {
        htmlParts.push(
          '<blockquote style="border-left:3px solid #2563eb;padding-left:10pt;margin:6pt 0;color:#334155;font-style:italic;">'
        );
        inBlockquote = true;
      }
      const quoteContent = trimmed.replace(/^>\s?/, '');
      htmlParts.push(`<p style="margin:3pt 0;">${formatInlineHtml(quoteContent)}</p>`);
      continue;
    } else if (inBlockquote) {
      htmlParts.push('</blockquote>');
      inBlockquote = false;
    }

    const ulMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (ulMatch) {
      if (inOl) {
        htmlParts.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        htmlParts.push('<ul style="margin:4pt 0 6pt 18pt;padding:0;">');
        inUl = true;
      }
      htmlParts.push(`<li style="margin:2pt 0;">${formatInlineHtml(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (olMatch) {
      if (inUl) {
        htmlParts.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        htmlParts.push('<ol style="margin:4pt 0 6pt 18pt;padding:0;">');
        inOl = true;
      }
      htmlParts.push(`<li style="margin:2pt 0;">${formatInlineHtml(olMatch[1])}</li>`);
      continue;
    }

    closeLists();
    htmlParts.push(
      `<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45;margin:0 0 6pt 0;text-align:justify;">${formatInlineHtml(
        trimmed
      )}</p>`
    );
  }

  flushTable();
  closeLists();

  return `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#0f172a;">${htmlParts.join('\n')}</div>`;
}

export function stripMarkdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s?/gm, '')
    .trim();
}

export async function copyFormattedLegalText(
  markdown: string,
  mode: 'word' | 'plain' = 'word'
): Promise<boolean> {
  try {
    const plain = stripMarkdownToPlainText(markdown);
    if (mode === 'word' && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const html = markdownToWordHtml(markdown);
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
    await navigator.clipboard.writeText(plain);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(stripMarkdownToPlainText(markdown));
      return true;
    } catch {
      return false;
    }
  }
}

function renderInlineNodes(text: string): React.ReactNode[] {
  // Tokenize `code`, ***bolditalic***, **bold**, *italic*
  const tokenRegex = /(`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|(?<!\*)\*[^*]+\*(?!\*))/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200/80 text-amber-900 font-mono text-[0.82em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('***') && part.endsWith('***') && part.length > 6) {
      return (
        <strong key={i} className="font-semibold italic text-slate-900">
          {part.slice(3, -3)}
        </strong>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={i} className="italic text-slate-800">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function LegalMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];

  let i = 0;
  let keyCounter = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Horizontalna crta
    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      blocks.push(<hr key={keyCounter++} className="my-3 border-slate-200" />);
      i++;
      continue;
    }

    // Markdown tablica
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const parsedRows = tableLines
        .map((tl) => tl.slice(1, -1).split('|').map((c) => c.trim()))
        .filter((cells) => !cells.every((c) => /^[-:\s]+$/.test(c)));

      if (parsedRows.length > 0) {
        const [header, ...body] = parsedRows;
        blocks.push(
          <div key={keyCounter++} className="my-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  {header.map((cell, cIdx) => (
                    <th key={cIdx} className="px-3 py-2 text-left font-semibold border-b border-slate-200">
                      {renderInlineNodes(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {body.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/70">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3 py-2 text-slate-700 align-top">
                        {renderInlineNodes(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Naslovi
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const classes: Record<number, string> = {
        1: 'text-base font-bold text-slate-900 mt-4 mb-2 pb-1 border-b border-slate-200 first:mt-0',
        2: 'text-[15px] font-bold text-slate-900 mt-3.5 mb-1.5 first:mt-0',
        3: 'text-sm font-bold text-slate-800 mt-3 mb-1 first:mt-0',
        4: 'text-xs font-bold uppercase tracking-wide text-slate-600 mt-2.5 mb-1 first:mt-0',
      };
      blocks.push(
        <div key={keyCounter++} className={classes[level] || classes[3]}>
          {renderInlineNodes(text)}
        </div>
      );
      i++;
      continue;
    }

    // Blockquote (pravni citat)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote
          key={keyCounter++}
          className="my-2.5 pl-3.5 pr-3 py-2 border-l-3 border-blue-500 bg-blue-50/50 rounded-r-lg text-slate-700 italic text-[13.5px] leading-relaxed space-y-1"
        >
          {quoteLines.map((ql, qIdx) => (
            <p key={qIdx}>{renderInlineNodes(ql)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Nabrajanje s točkama (unordered list)
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={keyCounter++} className="my-2 pl-5 list-disc space-y-1.5 text-slate-700 leading-relaxed">
          {items.map((it, idx) => (
            <li key={idx} className="pl-0.5">
              {renderInlineNodes(it)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numerirano nabrajanje (ordered list)
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: { num: string; text: string }[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        const m = lines[i].trim().match(/^(\d+[.)])\s+(.+)$/);
        if (m) items.push({ num: m[1], text: m[2] });
        i++;
      }
      blocks.push(
        <ol key={keyCounter++} className="my-2 space-y-1.5 text-slate-700 leading-relaxed">
          {items.map((it, idx) => (
            <li key={idx} className="flex gap-2 items-baseline">
              <span className="font-semibold text-slate-800 shrink-0 min-w-5">{it.num}</span>
              <span className="flex-1">{renderInlineNodes(it.text)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Obični odlomak (spaja uzastopne obične retke)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('|') &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim()) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push(
      <p key={keyCounter++} className="my-1.5 text-slate-800 leading-relaxed">
        {renderInlineNodes(paraLines.join(' '))}
      </p>
    );
  }

  return <div className="space-y-1 text-[13.5px]">{blocks}</div>;
}

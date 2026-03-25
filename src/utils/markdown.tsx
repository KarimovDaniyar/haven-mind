import React from 'react';

export function extractWikiLinks(content: string): string[] {
  const matches = content.match(/\[\[([^\]]+)\]\]/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(2, -2));
}

function splitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

function isTableSeparatorLine(line: string): boolean {
  const cells = splitTableRow(line);
  if (cells.length < 2) return false;
  return cells.every((c) => /^:?-{3,}:?$/.test(c.replace(/\s/g, '')));
}

function looksLikeTableStart(line: string): boolean {
  const t = line.trim();
  return t.includes('|') && splitTableRow(line).length >= 2;
}

export function renderMarkdown(
  text: string,
  onLinkClick: (title: string) => void,
  paperMode?: boolean,
  forPrint?: boolean
): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let elKey = 0;
  const key = () => `md-${elKey++}`;

  const cls = paperMode
    ? {
        h1: 'font-display text-2xl font-semibold text-zinc-900 mt-4 mb-2 first:mt-0',
        h2: 'font-display text-lg font-medium text-zinc-900 mt-3 mb-1',
        h3: 'font-display text-base font-medium text-zinc-800 mt-2 mb-1',
        bq: 'border-l-2 border-zinc-300 pl-3 my-1 text-zinc-600 italic',
        hr: 'my-3 border-zinc-200',
        numMuted: 'text-zinc-500',
        bullet: 'text-amber-700',
        p: 'my-0.5 text-zinc-800',
        tableTh: 'border border-zinc-200 px-2 py-1.5 text-left font-medium bg-zinc-100 text-zinc-900',
        tableTd: 'border border-zinc-200 px-2 py-1.5 text-zinc-800',
      }
    : {
        h1: 'font-display text-2xl font-semibold text-foreground mt-4 mb-2',
        h2: 'font-display text-lg font-medium text-foreground mt-3 mb-1',
        h3: 'font-display text-base font-medium text-foreground mt-2 mb-1',
        bq: 'border-l-2 border-accent pl-3 my-1 text-muted-foreground italic',
        hr: 'my-3 border-border',
        numMuted: 'text-muted-foreground',
        bullet: 'text-accent',
        p: 'my-0.5',
        tableTh: 'border border-border px-2 py-1.5 text-left font-medium bg-muted/50 text-foreground',
        tableTd: 'border border-border px-2 py-1.5',
      };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '/pagebreak') {
      i++;
      continue;
    }

    if (line.trim() === '<!--haven-svg-->') {
      i++;
      const block: string[] = [];
      while (i < lines.length && lines[i].trim() !== '<!--/haven-svg-->') {
        block.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      const svgHtml = block.join('\n');
      if (svgHtml.trim()) {
        elements.push(
          <div
            key={key()}
            className={paperMode ? 'my-3 w-full overflow-x-auto text-zinc-900 [&_svg]:max-w-full' : 'my-3 w-full overflow-x-auto [&_svg]:max-w-full'}
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        );
      }
      continue;
    }

    if (looksLikeTableStart(line) && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) {
        if (isTableSeparatorLine(lines[i])) {
          i++;
          continue;
        }
        bodyRows.push(splitTableRow(lines[i]));
        i++;
      }
      elements.push(
        <div key={key()} className="my-2 w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {header.map((h, j) => (
                  <th key={j} className={cls.tableTh}>
                    {renderInline(h, onLinkClick, paperMode, forPrint)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className={cls.tableTd}>
                      {renderInline(cell, onLinkClick, paperMode, forPrint)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const k = key();
    if (line.startsWith('# ')) {
      elements.push(<h1 key={k} className={cls.h1}>{renderInline(line.slice(2), onLinkClick, paperMode, forPrint)}</h1>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={k} className={cls.h2}>{renderInline(line.slice(3), onLinkClick, paperMode, forPrint)}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={k} className={cls.h3}>{renderInline(line.slice(4), onLinkClick, paperMode, forPrint)}</h3>);
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={k} className={cls.bq}>
          {renderInline(line.slice(2), onLinkClick, paperMode, forPrint)}
        </blockquote>
      );
    } else if (line === '---') {
      elements.push(<hr key={k} className={cls.hr} />);
    } else if (line.match(/^(\d+)\.\s/)) {
      const content = line.replace(/^\d+\.\s/, '');
      elements.push(
        <div key={k} className="flex gap-2 my-0">
          <span className={cls.numMuted}>{line.match(/^(\d+)/)?.[1]}.</span>
          <span className={paperMode ? 'text-zinc-800' : undefined}>{renderInline(content, onLinkClick, paperMode, forPrint)}</span>
        </div>
      );
    } else if (line.startsWith('- ')) {
      elements.push(
        <div key={k} className="flex gap-2 my-0 ml-1">
          <span className={`${cls.bullet} mt-0.5`}>•</span>
          <span className={paperMode ? 'text-zinc-800' : undefined}>{renderInline(line.slice(2), onLinkClick, paperMode, forPrint)}</span>
        </div>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={k} className="h-1.5" />);
    } else {
      elements.push(<p key={k} className={cls.p}>{renderInline(line, onLinkClick, paperMode, forPrint)}</p>);
    }
    i++;
  }

  return elements;
}

export function renderInline(
  text: string,
  onLinkClick: (title: string) => void,
  paperMode?: boolean,
  forPrint?: boolean
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[\[(.+?)\]\])/g;
  let match;
  let lastIndex = 0;
  let idx = 0;

  const strongCls = paperMode ? 'font-semibold text-zinc-900' : 'font-semibold';
  const emCls = paperMode ? 'italic text-zinc-800' : 'italic';
  const codeCls = paperMode
    ? 'font-mono text-sm bg-zinc-100 text-zinc-800 px-1 py-0.5 rounded'
    : 'font-mono text-sm bg-surface-active px-1 py-0.5 rounded';
  const linkCls = paperMode
    ? 'text-amber-800 font-medium border-b border-dotted border-amber-700/50 hover:border-amber-800 transition-colors duration-200'
    : 'text-accent font-medium border-b border-dotted border-accent/50 hover:border-accent transition-colors duration-200';

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2]) parts.push(<strong key={idx++} className={strongCls}>{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={idx++} className={emCls}>{match[3]}</em>);
    else if (match[4]) parts.push(<code key={idx++} className={codeCls}>{match[4]}</code>);
    else if (match[5]) {
      const linkTitle = match[5];
      if (forPrint) {
        parts.push(
          <span key={idx++} className={paperMode ? 'text-amber-900 font-medium' : 'font-medium'}>
            {linkTitle}
          </span>
        );
      } else {
        parts.push(
          <button
            key={idx++}
            type="button"
            onMouseDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); onLinkClick(linkTitle); }}
            className={linkCls}
          >
            {linkTitle}
          </button>
        );
      }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

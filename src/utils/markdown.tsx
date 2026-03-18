import React from 'react';

export function extractWikiLinks(content: string): string[] {
  const matches = content.match(/\[\[([^\]]+)\]\]/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(2, -2));
}

export function renderMarkdown(text: string, onLinkClick: (title: string) => void): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    const key = `line-${i}`;
    if (line.startsWith('# ')) {
      elements.push(<h1 key={key} className="font-display text-2xl font-semibold text-foreground mt-4 mb-2">{renderInline(line.slice(2), onLinkClick)}</h1>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={key} className="font-display text-lg font-medium text-foreground mt-3 mb-1">{renderInline(line.slice(3), onLinkClick)}</h2>);
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={key} className="border-l-2 border-accent pl-3 my-1 text-muted-foreground italic">
          {renderInline(line.slice(2), onLinkClick)}
        </blockquote>
      );
    } else if (line === '---') {
      elements.push(<hr key={key} className="my-3 border-border" />);
    } else if (line.match(/^(\d+)\.\s/)) {
      const content = line.replace(/^\d+\.\s/, '');
      elements.push(
        <div key={key} className="flex gap-2 my-0">
          <span className="text-muted-foreground">{line.match(/^(\d+)/)?.[1]}.</span>
          <span>{renderInline(content, onLinkClick)}</span>
        </div>
      );
    } else if (line.startsWith('- ')) {
      elements.push(
        <div key={key} className="flex gap-2 my-0 ml-1">
          <span className="text-accent mt-0.5">•</span>
          <span>{renderInline(line.slice(2), onLinkClick)}</span>
        </div>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={key} className="h-1.5" />);
    } else {
      elements.push(<p key={key} className="my-0.5">{renderInline(line, onLinkClick)}</p>);
    }
  });

  return elements;
}

export function renderInline(text: string, onLinkClick: (title: string) => void): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[\[(.+?)\]\])/g;
  let match;
  let lastIndex = 0;
  let idx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2]) parts.push(<strong key={idx++} className="font-semibold">{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={idx++} className="italic">{match[3]}</em>);
    else if (match[4]) parts.push(<code key={idx++} className="font-mono text-sm bg-surface-active px-1 py-0.5 rounded">{match[4]}</code>);
    else if (match[5]) {
      const linkTitle = match[5];
      parts.push(
        <button key={idx++} onClick={(e) => { e.stopPropagation(); onLinkClick(linkTitle); }}
          className="text-accent font-medium border-b border-dotted border-accent/50 hover:border-accent transition-colors duration-200">
          {linkTitle}
        </button>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

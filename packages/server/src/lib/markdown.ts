// A tiny Markdown subset (what Lumora templates produce) converted to each ticket system's
// format: headings, paragraphs, bullet/numbered lists, fenced code, **bold**, `code`, links.

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; text: string };

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }
    const listItem = /^\s*(?:[-*]|\d+\.)\s+/;
    if (listItem.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && listItem.test(lines[i])) items.push(lines[i++].replace(listItem, ''));
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('```') && !/^#{1,6}\s/.test(lines[i]) && !listItem.test(lines[i])) {
      para.push(lines[i++]);
    }
    blocks.push({ type: 'paragraph', text: para.join('\n') });
  }
  return blocks;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inlineHtml(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n/g, '<br>');
}

export function toHtml(markdown: string): string {
  return parseBlocks(markdown)
    .map((b) => {
      switch (b.type) {
        case 'heading':
          return `<h${Math.min(b.level + 1, 6)}>${inlineHtml(b.text)}</h${Math.min(b.level + 1, 6)}>`;
        case 'paragraph':
          return `<p>${inlineHtml(b.text)}</p>`;
        case 'list': {
          const tag = b.ordered ? 'ol' : 'ul';
          return `<${tag}>${b.items.map((it) => `<li>${inlineHtml(it)}</li>`).join('')}</${tag}>`;
        }
        case 'code':
          return `<pre><code>${escapeHtml(b.text)}</code></pre>`;
      }
    })
    .join('\n');
}

/** Jira (REST v2) wiki markup. */
export function toJiraWiki(markdown: string): string {
  const inline = (t: string) =>
    t
      .replace(/`([^`]+)`/g, '{{$1}}')
      .replace(/\*\*([^*]+)\*\*/g, '*$1*')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '[$1|$2]');
  return parseBlocks(markdown)
    .map((b) => {
      switch (b.type) {
        case 'heading':
          return `h${Math.min(b.level + 1, 6)}. ${inline(b.text)}`;
        case 'paragraph':
          return inline(b.text);
        case 'list':
          return b.items.map((it) => `${b.ordered ? '#' : '*'} ${inline(it)}`).join('\n');
        case 'code':
          return `{noformat}\n${b.text}\n{noformat}`;
      }
    })
    .join('\n\n');
}

/** Slack mrkdwn. */
export function toSlack(markdown: string): string {
  const inline = (t: string) => t.replace(/\*\*([^*]+)\*\*/g, '*$1*').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<$2|$1>');
  return parseBlocks(markdown)
    .map((b) => {
      switch (b.type) {
        case 'heading':
          return `*${inline(b.text)}*`;
        case 'paragraph':
          return inline(b.text);
        case 'list':
          return b.items.map((it, i) => `${b.ordered ? `${i + 1}.` : '•'} ${inline(it)}`).join('\n');
        case 'code':
          return `\`\`\`${b.text}\`\`\``;
      }
    })
    .join('\n\n');
}

/** Plain text (Salesforce Case description, e-mail fallback). */
export function toPlain(markdown: string): string {
  const inline = (t: string) => t.replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1: $2');
  return parseBlocks(markdown)
    .map((b) => {
      switch (b.type) {
        case 'heading':
          return inline(b.text).toUpperCase();
        case 'paragraph':
          return inline(b.text);
        case 'list':
          return b.items.map((it, i) => `${b.ordered ? `${i + 1}.` : '-'} ${inline(it)}`).join('\n');
        case 'code':
          return b.text;
      }
    })
    .join('\n\n');
}

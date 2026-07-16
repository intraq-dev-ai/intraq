export function renderAiMessageMarkdown(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[] = [];
  let listItems: string[] = [];
  let codeLines: string[] = [];
  let inCodeBlock = false;

  const flushList = (): void => {
    if (listItems.length === 0) return;
    blocks.push(`<ul>${listItems.map(item => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`);
    listItems = [];
  };
  const flushCode = (): void => {
    if (codeLines.length === 0) return;
    blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    codeLines = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushList();
      const level = heading[1]?.length ?? 2;
      blocks.push(`<h${level}>${inlineMarkdown(heading[2] ?? '')}</h${level}>`);
      continue;
    }
    const item = /^[-*]\s+(.+)$/.exec(trimmed);
    if (item) {
      listItems.push(item[1] ?? '');
      continue;
    }
    flushList();
    blocks.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }

  flushList();
  flushCode();
  return blocks.join('');
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.use({
  async: false,
  breaks: true,
  gfm: true
});

export function renderAiMessageMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'a',
      'blockquote',
      'br',
      'code',
      'em',
      'h1',
      'h2',
      'h3',
      'h4',
      'hr',
      'li',
      'ol',
      'p',
      'pre',
      'strong',
      'table',
      'tbody',
      'td',
      'th',
      'thead',
      'tr',
      'ul'
    ],
    ALLOWED_ATTR: ['href', 'rel', 'target']
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (/^(https?:|mailto:|#|\/)/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function renderMarkdownToHtml(content: string): string {
  if (!content) return '';

  let html = escapeHtml(content);

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const normalizedLanguage = escapeHtml(String(lang || 'plain'));
    return `<pre><code class="language-${normalizedLanguage}">${code.trim()}</code></pre>`;
  });

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^---$/gm, '<hr/>');

  html = html.replace(
    /^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_, header, _separator, body) => {
      const headers = header
        .split('|')
        .filter((cell: string) => cell.trim())
        .map((cell: string) => `<th>${cell.trim()}</th>`)
        .join('');

      const rows = body
        .trim()
        .split('\n')
        .map((row: string) => {
          const cells = row
            .split('|')
            .filter((cell: string) => cell.trim())
            .map((cell: string) => `<td>${cell.trim()}</td>`)
            .join('');

          return `<tr>${cells}</tr>`;
        })
        .join('');

      return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    }
  );

  html = html.replace(/^(\s*)[-*] (.+)$/gm, '$1<li>$2</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) {
      return label;
    }

    return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/(?<!<\/p>)\n(?!<)/g, '<br/>');

  if (!html.startsWith('<')) {
    html = `<p>${html}</p>`;
  }

  return html;
}

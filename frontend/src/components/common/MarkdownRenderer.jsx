import React, { useMemo } from 'react';
import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// Configure custom marked renderer for chat and academic reading
const customRenderer = {
  heading(token) {
    const depth = token?.depth || 2;
    const rawText = token?.text || '';
    let cleanText = rawText.replace(/\*\*/g, '').replace(/\*/g, '').trim();
    cleanText = cleanText.replace(/^(\d+(?:\.\d+)*)([A-Za-z])/, '$1 $2');
    const cleanId = cleanText
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return `<h${depth} id="${cleanId}" class="chat-markdown-heading chat-h${depth}">${cleanText}</h${depth}>`;
  },

  code(token) {
    const codeText = token?.text || '';
    const lang = (token?.lang || '').trim();
    const escaped = codeText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<div class="chat-code-block">
      <div class="chat-code-header">
        <span class="chat-code-lang">${lang || 'code'}</span>
        <button type="button" class="chat-code-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.chat-code-block').querySelector('code').textContent); this.textContent='Copied!'; setTimeout(()=>this.textContent='Copy', 1500)">Copy</button>
      </div>
      <pre><code class="language-${lang}">${escaped}</code></pre>
    </div>`;
  },

  table(token) {
    const header = (token?.header || [])
      .map((cell) => `<th>${this.parser.parseInline(cell.tokens || [])}</th>`)
      .join('');
    const rows = (token?.rows || [])
      .map((row) => {
        const cells = row
          .map((cell) => `<td>${this.parser.parseInline(cell.tokens || [])}</td>`)
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
    return `<div class="chat-table-wrapper"><table class="chat-markdown-table"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
  },

  link(token) {
    const href = token?.href || '#';
    const text = this.parser.parseInline(token?.tokens || []);
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="chat-markdown-link">${text}</a>`;
  },

  image(token) {
    const rawHref = token?.href ? token.href.trim() : '';
    let href = rawHref;
    if (href && !href.startsWith('data:') && !href.startsWith('http://') && !href.startsWith('https://')) {
      href = href.replace(/^(\.\/|\/?library\/|\/?reader\/)+/, '');
      if (href.startsWith('dump_extract/')) {
        href = '/' + href;
      } else if (href.startsWith('images/')) {
        href = '/dump_extract/' + href;
      } else if (!href.startsWith('/dump_extract/')) {
        href = '/dump_extract/images/' + href.replace(/^\/+/, '');
      }
    }

    const text = token?.text || token?.title || '';
    const captionHtml = text
      ? `<figcaption class="markdown-image-caption">${text}</figcaption>`
      : '';

    return `<figure class="markdown-image-figure" data-src="${href}">
      <div class="figure-img-container">
        <img
          src="${href}"
          alt="${text || 'Scientific Figure'}"
          title="${token?.title || ''}"
          loading="lazy"
          class="markdown-rendered-image"
          onerror="if(!this.dataset.retried){this.dataset.retried='1';if(this.src.indexOf('8000')===-1){this.src='http://localhost:8000'+(this.getAttribute('src').startsWith('/')?'':'/')+this.getAttribute('src');}}"
        />
        <div class="figure-zoom-hint">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          <span>Click to zoom</span>
        </div>
      </div>
      ${captionHtml}
    </figure>`;
  },
};

marked.use({ renderer: customRenderer });

export default function MarkdownRenderer({ content, className = '', onImageClick }) {
  const renderedHtml = useMemo(() => {
    if (!content) return '';

    let text = String(content);

    // 1. Stash code blocks and inline code to shield them from math parsing
    const codeStash = [];
    text = text.replace(/```[\s\S]*?```/g, (match) => {
      const ph = `@@@CODE_BLOCK_${codeStash.length}@@@`;
      codeStash.push(match);
      return ph;
    });
    text = text.replace(/`[^`\n]+?`/g, (match) => {
      const ph = `@@@CODE_BLOCK_${codeStash.length}@@@`;
      codeStash.push(match);
      return ph;
    });

    // 2. Pre-process LaTeX Math formulas into mathStash
    const mathStash = [];

    // Display math: $$ ... $$
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
      try {
        const rendered = `<div class="katex-block-wrapper">${katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })}</div>`;
        const ph = `@@@MATH_DISPLAY_${mathStash.length}@@@`;
        mathStash.push(rendered);
        return `\n\n${ph}\n\n`;
      } catch {
        return match;
      }
    });

    // Display math: \[ ... \] or \begin{equation} ... \end{equation}
    text = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
      try {
        const rendered = `<div class="katex-block-wrapper">${katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })}</div>`;
        const ph = `@@@MATH_DISPLAY_${mathStash.length}@@@`;
        mathStash.push(rendered);
        return `\n\n${ph}\n\n`;
      } catch {
        return match;
      }
    });
    text = text.replace(/\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g, (match, formula) => {
      try {
        const rendered = `<div class="katex-block-wrapper">${katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })}</div>`;
        const ph = `@@@MATH_DISPLAY_${mathStash.length}@@@`;
        mathStash.push(rendered);
        return `\n\n${ph}\n\n`;
      } catch {
        return match;
      }
    });

    // Inline math: \( ... \)
    text = text.replace(/\\\(([\s\S]*?)\\\)/g, (match, formula) => {
      try {
        const rendered = katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false });
        const ph = `@@@MATH_INLINE_${mathStash.length}@@@`;
        mathStash.push(rendered);
        return ph;
      } catch {
        return match;
      }
    });

    // Inline math: $ ... $ (guarding against currency amounts like $50 or $10.99)
    text = text.replace(/(?<!\\)\$([^\$\n]+?)\$(?!\d)/g, (match, formula) => {
      const trimmed = formula.trim();
      if (!trimmed || /^\d+(?:\.\d+)?$/.test(trimmed)) return match;
      try {
        const rendered = katex.renderToString(trimmed, { displayMode: false, throwOnError: false });
        const ph = `@@@MATH_INLINE_${mathStash.length}@@@`;
        mathStash.push(rendered);
        return ph;
      } catch {
        return match;
      }
    });

    // Clean asterisks from markdown headings so they never render literal **
    text = text.replace(/^(#{1,6}\s+)\*\*(.*?)\*\*\s*$/gm, '$1$2');

    // Collapse blank lines between Markdown table rows so GFM parses them as native tables
    text = text.replace(/(\|[^\n]+\|)\n\s*\n(?=\s*\|)/g, '$1\n');

    // 3. Restore code blocks back to markdown text
    text = text.replace(/@@@CODE_BLOCK_(\d+)@@@/g, (_, idx) => codeStash[Number(idx)]);

    // Configure marked options with line breaks enabled for natural conversational chat
    marked.setOptions({
      gfm: true,
      breaks: true,
    });

    let html = '';
    try {
      html = marked.parse(text);
    } catch (e) {
      console.error('Markdown parse error:', e);
      html = text;
    }

    // 4. Restore math placeholders into final HTML
    html = html.replace(/<p>\s*(@@@MATH_DISPLAY_\d+@@@)\s*<\/p>/g, '$1');
    html = html.replace(/@@@MATH_DISPLAY_(\d+)@@@/g, (_, idx) => mathStash[Number(idx)] || '');
    html = html.replace(/@@@MATH_INLINE_(\d+)@@@/g, (_, idx) => mathStash[Number(idx)] || '');

    return html;
  }, [content]);

  // Click handler to catch figure image clicks for modal lightbox
  const handleClick = (e) => {
    if (!onImageClick) return;
    const img = e.target.closest('img.markdown-rendered-image');
    if (img) {
      const figure = img.closest('figure');
      const caption = figure?.querySelector('figcaption')?.textContent || img.alt || '';
      onImageClick({ src: img.src, caption });
    }
  };

  return (
    <div
      className={`markdown-body chat-markdown-body ${className}`}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}

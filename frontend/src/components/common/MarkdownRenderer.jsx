import React, { useMemo } from 'react';
import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// Configure custom marked renderer
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
    return `<h${depth} id="${cleanId}" class="academic-heading academic-h${depth}">${cleanText}</h${depth}>`;
  },

  image(token) {
    const rawHref = token?.href ? token.href.trim() : '';
    let href = rawHref;
    if (href && !href.startsWith('data:') && !href.startsWith('http://') && !href.startsWith('https://')) {
      // Strip accidental router subpaths from relative links
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

    let processed = String(content);

    // Strip OCR picture text comments
    processed = processed.replace(/<!-- Start of picture text -->[\s\S]*?<!-- End of picture text -->/g, '');

    // Strip running page headers and author banners (e.g., '2 Laiq et al.', 'Agentic AI for contextualized...')
    processed = processed.replace(/\n\n(?:\-\s*)?\d{1,3}\s+[A-Za-z\s\.,\-]+et al\.\s*\n\n/g, '\n\n');
    processed = processed.replace(/\n\n(?:\-\s*)?(?:Agentic AI for contextualized and multifaceted code review|[A-Za-z\s\.,\-]+et al\.)(?:\s+\d{1,3})?\s*\n\n/gi, '\n\n');
    // Rejoin sentences split across page breaks
    processed = processed.replace(/(?<=[a-zA-Z,–—\(\)])\s*\n\n\s*(?=[a-z])/g, ' ');

    // Clean asterisks from markdown headings so they never render literal **
    processed = processed.replace(/^(#{1,6}\s+)\*\*(.*?)\*\*\s*$/gm, '$1$2');
    processed = processed.replace(/^(#{1,6}\s+\d+(?:\.\d+)*)([A-Za-z])/gm, '$1 $2');

    // Collapse blank lines between Markdown table rows so GFM parses them as native tables
    processed = processed.replace(/(\|[^\n]+\|)\n\s*\n(?=\s*\|)/g, '$1\n');
    processed = processed.replace(/(\|[^\n]+\|)\n\s*\n(?=\s*\|)/g, '$1\n');

    // Normalize image paths in markdown to absolute /dump_extract/images/
    processed = processed.replace(
      /!\[(.*?)\]\((?:(?:\/)?dump_extract\/)?images\/([^)]+)\)/g,
      '![$1](/dump_extract/images/$2)'
    );

    // 1. Clean any whitespace or newline artifacts inside base64 data URLs
    processed = processed.replace(
      /\(data:image\/([a-zA-Z0-9]+);base64,\s*([A-Za-z0-9+/=\s]+?)\s*\)/g,
      (match, format, b64) => `(data:image/${format};base64,${b64.replace(/\s+/g, '')})`
    );

    // 2. Pre-process LaTeX Math formulas before Markdown parsing
    // Display Math: $$ ... $$ or \[ ... \] or \begin{equation}...\end{equation}
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
      try {
        return `<div class="katex-block-wrapper">${katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })}</div>`;
      } catch (e) {
        return match;
      }
    });

    processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
      try {
        return `<div class="katex-block-wrapper">${katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })}</div>`;
      } catch (e) {
        return match;
      }
    });

    processed = processed.replace(/\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g, (match, formula) => {
      try {
        return `<div class="katex-block-wrapper">${katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })}</div>`;
      } catch (e) {
        return match;
      }
    });

    // Inline math: \( ... \)
    processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (match, formula) => {
      try {
        return katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false });
      } catch (e) {
        return match;
      }
    });

    // Inline math: $ ... $ (avoiding currency $10)
    processed = processed.replace(/(?<!\\)\$([^\$\n]+?)\$/g, (match, formula) => {
      try {
        return katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false });
      } catch (e) {
        return match;
      }
    });

    // Configure marked options
    // NOTE: breaks: false is intentional — academic prose requires single newlines
    // within paragraphs to flow naturally instead of inserting <br> tags.
    marked.setOptions({
      gfm: true,
      breaks: false,
    });

    try {
      return marked.parse(processed);
    } catch (e) {
      console.error('Markdown parse error:', e);
      return processed;
    }
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
      className={`markdown-body ${className}`}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}

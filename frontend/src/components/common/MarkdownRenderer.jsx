import React, { useMemo } from 'react';
import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// Configure custom image renderer to ensure high-fidelity figure rendering with captions
const customRenderer = {
  image({ href, title, text }) {
    const cleanHref = href ? href.trim() : '';
    const captionText = text || title || '';
    const captionHtml = captionText
      ? `<figcaption class="markdown-image-caption">${captionText}</figcaption>`
      : '';

    return `<figure class="markdown-image-figure"><img src="${cleanHref}" alt="${captionText || 'Scientific Figure'}" title="${title || ''}" loading="lazy" class="markdown-rendered-image" />${captionHtml}</figure>`;
  },
};

marked.use({ renderer: customRenderer });

export default function MarkdownRenderer({ content, className = '' }) {
  const renderedHtml = useMemo(() => {
    if (!content) return '';

    // 1. Clean any whitespace or newline artifacts inside base64 data URLs
    let processed = String(content).replace(
      /\(data:image\/([a-zA-Z0-9]+);base64,\s*([A-Za-z0-9+/=\s]+?)\s*\)/g,
      (match, format, b64) => `(data:image/${format};base64,${b64.replace(/\s+/g, '')})`
    );

    // 2. Pre-process LaTeX Math formulas before Markdown parsing
    // Block math: $$ ... $$
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
      try {
        return `<div class="katex-block-wrapper">${katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })}</div>`;
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
    // NOTE: breaks: false is intentional — pymupdf4llm uses single newlines within
    // paragraphs which should flow as prose, not become <br> tags.
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

  return (
    <div
      className={`markdown-body ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}

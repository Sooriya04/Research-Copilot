import React, { useMemo } from 'react';
import { marked } from 'marked';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function MarkdownRenderer({ content, className = '' }) {
  const renderedHtml = useMemo(() => {
    if (!content) return '';

    // 1. Pre-process LaTeX Math formulas before Markdown parsing
    let processed = String(content);

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
    marked.setOptions({
      gfm: true,
      breaks: true,
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
      style={{
        lineHeight: 1.7,
        color: 'var(--text-primary)',
        fontSize: '14px',
      }}
    />
  );
}

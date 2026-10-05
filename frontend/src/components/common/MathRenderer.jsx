import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Escapes raw text so it can safely be injected as HTML outside of KaTeX math spans.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Normalizes boundary spacing between prose and math delimiters so words never stick
 * to equations (e.g. "Let$X" becomes "Let $X", "$X$be" becomes "$X$ be").
 */
function normalizeMathBoundaries(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw;
  // If an alphanumeric character immediately touches an opening delimiter: "word$X" -> "word $X"
  str = str.replace(/([a-zA-Z0-9])(\$|\\\(|\\\[)/g, '$1 $2');
  return str;
}

/**
 * Regex matching LaTeX math delimiters:
 * 1. Display Math: $$ ... $$
 * 2. Display Math: \[ ... \]
 * 3. Inline Math: \( ... \)
 * 4. Inline Math: $ ... $
 * 5. LaTeX Environment: \begin{env} ... \end{env}
 */
const DELIMITER_REGEX = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|(?<!\\)\$([^\$\n]+?)\$|\\begin\{([a-zA-Z*]+)\}([\s\S]*?)\\end\{\5\}/g;

/**
 * Strips outer enclosing LaTeX math delimiters ($$, $, \[, \], \(, \)) if present for standalone equations.
 */
function stripOuterDelimiters(raw) {
  if (typeof raw !== 'string') return '';
  let str = raw.trim();

  if (str.startsWith('$$') && str.endsWith('$$') && str.length >= 4) {
    str = str.slice(2, -2).trim();
  } else if (str.startsWith('\\[') && str.endsWith('\\]') && str.length >= 4) {
    str = str.slice(2, -2).trim();
  } else if (str.startsWith('\\(') && str.endsWith('\\)') && str.length >= 4) {
    str = str.slice(2, -2).trim();
  } else if (str.startsWith('$') && str.endsWith('$') && str.length >= 2 && !str.slice(1, -1).includes('$')) {
    str = str.slice(1, -1).trim();
  }

  return str;
}

/**
 * Parses and renders text that may be:
 * - Mixed text with embedded LaTeX formulas ($X \in \mathbb{R}^d$, $$...$$, etc.)
 * - Standalone pure LaTeX equation (\hat{y} = Wx + b, r_{c,h} = \operatorname{softmax}(...))
 * - Plain descriptive text without math
 */
function parseAndRenderMath(rawInput, isBlock) {
  if (!rawInput || typeof rawInput !== 'string') return '';
  const text = normalizeMathBoundaries(rawInput.trim());

  // Test if the text contains embedded delimiters ($...$, $$...$$, \[...\], \(...\), \begin{...})
  DELIMITER_REGEX.lastIndex = 0;
  const hasDelimiters = DELIMITER_REGEX.test(text);

  if (hasDelimiters) {
    DELIMITER_REGEX.lastIndex = 0;
    let lastIndex = 0;
    let match;
    const parts = [];

    while ((match = DELIMITER_REGEX.exec(text)) !== null) {
      const precedingText = text.slice(lastIndex, match.index);
      if (precedingText) {
        parts.push(escapeHtml(precedingText));
      }

      // Identify whether this is display or inline math
      const isDisplayEnv = Boolean(match[5]); // \begin{env}...\end{env}
      const displayFormula = match[1] ?? match[2] ?? (isDisplayEnv ? match[0] : null);
      const inlineFormula = match[3] ?? match[4];
      const formula = (displayFormula ?? inlineFormula ?? '').trim();
      const isDisplay = Boolean(displayFormula);

      // Inspect adjacent characters for intelligent spacing and punctuation attachment
      const nextChar = text[DELIMITER_REGEX.lastIndex];
      const isPunctuationAfter = Boolean(nextChar && /[.,;:?!)}\]’”]/.test(nextChar));
      const hasWordAfter = Boolean(nextChar && /[a-zA-Z0-9]/.test(nextChar));
      const isPunctuationBefore = Boolean(precedingText && /[({\[‘“'"]$/.test(precedingText));

      try {
        const rendered = katex.renderToString(formula, {
          displayMode: isDisplay,
          throwOnError: false,
          errorColor: '#d97706', // subtle amber for localized syntax warnings, never bright red
          strict: false,
          trust: false,
        });

        if (isDisplay) {
          parts.push(`<div class="katex-block-wrapper" style="margin: 8px 0; overflow-x: auto;">${rendered}</div>`);
        } else {
          const classList = [
            'katex-inline-wrapper',
            isPunctuationAfter ? 'no-mr' : '',
            isPunctuationBefore ? 'no-ml' : '',
          ].filter(Boolean).join(' ');

          parts.push(`<span class="${classList}">${rendered}</span>`);

          // If a word character directly followed without a space (e.g. "$X$be"), insert clean space
          if (hasWordAfter) {
            parts.push(' ');
          }
        }
      } catch (err) {
        // Fallback: render formula as clean code without crashing
        parts.push(`<code class="math-fallback">${escapeHtml(match[0])}</code>`);
        if (hasWordAfter) parts.push(' ');
      }

      lastIndex = DELIMITER_REGEX.lastIndex;
    }

    // Append remaining plain text
    if (lastIndex < text.length) {
      parts.push(escapeHtml(text.slice(lastIndex)));
    }

    return parts.join('');
  }

  // If no delimiters, check if it's purely plain English prose without math operators
  const hasMathIndicators = /[\\_{}^=+\-*\/<>]/.test(text) || /\b(alpha|beta|gamma|theta|lambda|sigma|pi|sum|int|frac|sqrt|softmax|times|mathbb|in)\b/i.test(text);
  if (!hasMathIndicators && /\s[a-zA-Z]{2,}\s/.test(text)) {
    return escapeHtml(text);
  }

  // Pure standalone LaTeX equation without outer delimiters
  const cleanEq = stripOuterDelimiters(text);
  try {
    return katex.renderToString(cleanEq, {
      displayMode: isBlock,
      throwOnError: false,
      errorColor: '#d97706',
      strict: false,
      trust: false,
    });
  } catch (err) {
    return escapeHtml(cleanEq);
  }
}

/**
 * MathRenderer - Universal KaTeX Mathematics and Mixed-Text Renderer
 *
 * Requirements:
 * - Dynamic rendering via KaTeX (never static or hardcoded HTML)
 * - Seamlessly handles mixed prose with embedded LaTeX ($X \in \mathbb{R}^d$)
 * - Handles pure standalone equations (\hat{y} = Wx + b)
 * - Preserves proper spacing between adjacent words and math symbols ("Let $X$ be")
 * - Preserves original LaTeX string in the data (data-latex attribute)
 * - Supports both inline and display (block) mode
 * - Graceful fallback without coloring cards red
 * - Supports all mathematical notations: subscripts, superscripts, fractions,
 *   matrices, Greek letters, summations, integrals, vectors, \mathbb, \operatorname,
 *   \text, \hat{}, \bar{}, \frac{}, \sum, \in, \mathbb{R}, etc.
 *
 * @param {string} equation - The equation or mixed text string
 * @param {boolean} [block=true] - Render in display (block) mode vs inline mode
 * @param {boolean} [inline=false] - Convenience prop to set inline mode
 * @param {string} [className=''] - Optional CSS class
 * @param {object} [style={}] - Optional inline styles
 */
export default function MathRenderer({
  equation,
  math, // alias support
  children, // alias support
  block = true,
  inline = false,
  className = '',
  style = {},
  ...restProps
}) {
  const rawEquation = equation ?? math ?? (typeof children === 'string' ? children : '');
  const isBlock = inline ? false : Boolean(block);

  const html = useMemo(() => {
    if (!rawEquation || typeof rawEquation !== 'string' || !rawEquation.trim()) {
      return '';
    }
    return parseAndRenderMath(rawEquation, isBlock);
  }, [rawEquation, isBlock]);

  if (!rawEquation || !rawEquation.trim()) {
    return null;
  }

  if (isBlock) {
    return (
      <div
        className={`math-renderer math-renderer-block ${className}`}
        data-latex={rawEquation}
        title={rawEquation}
        style={{
          overflowX: 'auto',
          maxWidth: '100%',
          lineHeight: 1.6,
          ...style,
        }}
        dangerouslySetInnerHTML={{ __html: html }}
        {...restProps}
      />
    );
  }

  return (
    <span
      className={`math-renderer math-renderer-inline ${className}`}
      data-latex={rawEquation}
      title={rawEquation}
      style={{
        display: 'inline',
        verticalAlign: 'baseline',
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
      {...restProps}
    />
  );
}

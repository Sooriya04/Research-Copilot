import React, { useState } from 'react';
import { Download, Check, FileText } from 'lucide-react';

export default function ManuscriptView() {
  const [activeSec, setActiveSec] = useState('sec-abstract');
  const [copied, setCopied] = useState(false);

  const handleExportLatex = () => {
    const latexCode = `\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Unified Deepfake Audio Detection via Hybrid Spectro-Temporal Graph Networks}
\\author{AI Research Engineer \\and Autonomous Copilot Agent \\\\ Research Copilot Scientific Platform}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
Voice spoofing countermeasures face severe performance degradation when deployed across unseen acoustic environments and synthetic speech algorithms. In this paper, we propose a novel \\textit{Hybrid Spectro-Temporal Graph Network} that integrates learnable Sinc filters with multi-scale graph messaging across spectral frames. Evaluated on the ASVspoof benchmark, our proposed approach achieves an Equal Error Rate (EER) of \\textbf{0.84\\%}, outperforming existing baselines while guaranteeing 100\\% reproducible execution.
\\end{abstract}

\\section{Introduction}
The proliferation of state-of-the-art text-to-speech (TTS) and voice conversion (VC) models poses significant security challenges to automatic speaker verification (ASV) systems. Modern deepfake generation tools utilize diffusion models and neural codecs capable of cloning voice characteristics from minimal audio samples.

\\section{Methodology}
Our architecture consists of three core components:
\\begin{enumerate}
  \\item Learnable Parameterized Sinc Filterbanks: $h[n] = 2f_2 \\text{sinc}(2\\pi f_2 n) - 2f_1 \\text{sinc}(2\\pi f_1 n)$
  \\item Dual-Branch Residual Spectro-Temporal Blocks
  \\item Graph Attention Aggregator with Dynamic Edge Pruning
\\end{enumerate}

\\section{Results \\& Discussion}
On the ASVspoof 2021 LA evaluation partition, our model reduces min t-DCF to 0.0241 and EER to 0.84\\%.

\\end{document}`;

    const blob = new Blob([latexCode], { type: 'text/x-tex' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'manuscript_draft.tex';
    a.click();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="view-manuscript" className="view-panel active">
      <div className="panel-header">
        <div>
          <h1>Structured Manuscript Draft Studio</h1>
          <p className="panel-subtitle">
            8-section publication draft generated from empirical results with verified citation links.
          </p>
        </div>
        <button
          className="btn btn-primary"
          id="btn-export-latex"
          onClick={handleExportLatex}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {copied ? <Check size={14} /> : <Download size={14} />}
          <span>{copied ? 'Exported LaTeX (.tex)' : 'Export LaTeX (.tex)'}</span>
        </button>
      </div>

      <div className="manuscript-workspace">
        <div className="card outline-nav">
          <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Structure
          </h4>
          <ul>
            <li className={activeSec === 'sec-abstract' ? 'active' : ''}>
              <a href="#sec-abstract" onClick={() => setActiveSec('sec-abstract')}>
                Abstract
              </a>
            </li>
            <li className={activeSec === 'sec-intro' ? 'active' : ''}>
              <a href="#sec-intro" onClick={() => setActiveSec('sec-intro')}>
                1. Introduction
              </a>
            </li>
            <li className={activeSec === 'sec-method' ? 'active' : ''}>
              <a href="#sec-method" onClick={() => setActiveSec('sec-method')}>
                2. Methodology
              </a>
            </li>
            <li className={activeSec === 'sec-results' ? 'active' : ''}>
              <a href="#sec-results" onClick={() => setActiveSec('sec-results')}>
                3. Results & Discussion
              </a>
            </li>
          </ul>
        </div>

        <div className="paper-sheet">
          <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
            Unified Deepfake Audio Detection via Hybrid Spectro-Temporal Graph Networks
          </h1>
          <div className="paper-meta">
            <span>AI Research Engineer</span><sup>1</sup>, <span>Autonomous Copilot Agent</span><sup>1</sup><br />
            <em><sup>1</sup>Research Copilot Scientific Platform</em>
          </div>

          <div id="sec-abstract" className="doc-section">
            <h3>Abstract</h3>
            <p>
              Voice spoofing countermeasures face severe performance degradation when deployed across unseen acoustic environments and synthetic speech algorithms. In this paper, we propose a novel <em>Hybrid Spectro-Temporal Graph Network</em> that integrates learnable Sinc filters with multi-scale graph messaging across spectral frames. Evaluated on the ASVspoof benchmark, our proposed approach achieves an Equal Error Rate (EER) of <strong>0.84%</strong>, outperforming existing baselines while guaranteeing 100% reproducible execution.
            </p>
          </div>

          <div id="sec-intro" className="doc-section">
            <h3>1. Introduction</h3>
            <p>
              The proliferation of state-of-the-art text-to-speech (TTS) and voice conversion (VC) models poses significant security challenges to automatic speaker verification (ASV) systems. Modern deepfake generation tools utilize diffusion models and neural codecs capable of cloning voice characteristics from minimal audio samples.
            </p>
          </div>

          <div id="sec-method" className="doc-section">
            <h3>2. Methodology</h3>
            <p>
              Our proposed feature extraction network replaces fixed Discrete Fourier Transform (DFT) filters with learnable sinc convolutions, capturing localized sub-band anomalies directly from raw audio waveforms:
            </p>
            <div style={{ background: 'var(--bg-subtle)', padding: 12, borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-code)', fontSize: 12, margin: '8px 0' }}>
              h[n] = 2f_2 sinc(2π f_2 n) - 2f_1 sinc(2π f_1 n)
            </div>
          </div>

          <div id="sec-results" className="doc-section">
            <h3>3. Results & Discussion</h3>
            <p>
              On the ASVspoof 2021 Logical Access (LA) partition, our hybrid network achieves an EER of 0.84% and minimum normalized tandem Detection Cost Function (min t-DCF) of 0.0241, demonstrating robustness against multilingual voice cloning.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

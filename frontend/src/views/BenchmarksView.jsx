import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FlaskConical,
  Trophy,
  Cpu,
  ShieldCheck,
  Bookmark,
  Download,
  Copy,
  Check,
  ExternalLink,
  Play,
  Lightbulb,
  Search,
  Code,
  Terminal,
  SlidersHorizontal,
  Layers,
  Zap,
  Sparkles,
  Trash2,
  RotateCw,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  GitBranch,
  FileText,
  DollarSign,
  Clock,
  Database,
  ArrowUpRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function BenchmarksView() {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeWorkspace, theme } = useApp();
  const isDark = theme === 'dark';

  // Navigation tab state: 'leaderboards' | 'planner' | 'auditor' | 'saved'
  const [activeTab, setActiveTab] = useState(() => {
    if (location.state?.tab) return location.state.tab;
    if (location.state?.proposal) return 'planner';
    return 'leaderboards';
  });

  // --- Tab 1: Leaderboards State ---
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState('translation');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  // --- Tab 2: Experiment Planner State ---
  const [planForm, setPlanForm] = useState({
    title: location.state?.proposal?.title || '',
    hypothesis: location.state?.proposal?.testable_hypothesis || '',
    target_datasets: (location.state?.proposal?.target_datasets || []).join(', ') || 'WMT-14 En-De / GLUE Benchmark',
    baselines_to_beat: (location.state?.proposal?.baselines_to_beat || []).join(', ') || 'Transformer Base / LoRA Baseline',
    expected_metrics: (location.state?.proposal?.expected_metrics || []).join(', ') || 'BLEU, Latency, Accuracy',
    mathematical_formulation: location.state?.proposal?.mathematical_formulation || '',
    provider: 'gemini',
    gpu_target: 'NVIDIA A100 (40GB)',
  });
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planSubTab, setPlanSubTab] = useState('data'); // 'data' | 'model' | 'hyperparams' | 'scripts'
  const [copiedCodeKey, setCopiedCodeKey] = useState(null);

  // --- Tab 3: Codebase Auditor State ---
  const [auditUrl, setAuditUrl] = useState('https://github.com/microsoft/LoRA');
  const [auditPaperTitle, setAuditPaperTitle] = useState('LoRA: Low-Rank Adaptation of Large Language Models');
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState(null);

  // --- Tab 4: Saved Plans State ---
  const [savedPlans, setSavedPlans] = useState([]);
  const [loadingSavedPlans, setLoadingSavedPlans] = useState(false);

  // Toast and error notifications
  const [toastMsg, setToastMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Load tasks and initial leaderboard on mount
  useEffect(() => {
    fetchTasks();
    fetchSavedPlans();
  }, [activeWorkspace?.id]);

  useEffect(() => {
    if (selectedTask) {
      fetchLeaderboard(selectedTask);
    }
  }, [selectedTask]);

  // Sync if passed via location.state
  useEffect(() => {
    if (location.state?.proposal) {
      setPlanForm((prev) => ({
        ...prev,
        title: location.state.proposal.title || prev.title,
        hypothesis: location.state.proposal.testable_hypothesis || prev.hypothesis,
        target_datasets: (location.state.proposal.target_datasets || []).join(', ') || prev.target_datasets,
        baselines_to_beat: (location.state.proposal.baselines_to_beat || []).join(', ') || prev.baselines_to_beat,
        expected_metrics: (location.state.proposal.expected_metrics || []).join(', ') || prev.expected_metrics,
        mathematical_formulation: location.state.proposal.mathematical_formulation || prev.mathematical_formulation,
      }));
      setActiveTab('planner');
    }
  }, [location.state]);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/v1/benchmarks/tasks');
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (e) {
      console.warn('Failed to fetch benchmark tasks:', e);
    }
  };

  const fetchLeaderboard = async (taskId) => {
    setLoadingLeaderboard(true);
    try {
      const res = await fetch(`/api/v1/benchmarks/leaderboard?task=${encodeURIComponent(taskId)}`);
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data);
      }
    } catch (e) {
      console.warn('Failed to fetch leaderboard:', e);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  const fetchSavedPlans = async () => {
    setLoadingSavedPlans(true);
    try {
      const wsParam = activeWorkspace?.id ? `?workspace_id=${encodeURIComponent(activeWorkspace.id)}` : '';
      const res = await fetch(`/api/v1/benchmarks/plans${wsParam}`);
      if (res.ok) {
        const data = await res.json();
        setSavedPlans(data);
      }
    } catch (e) {
      console.warn('Failed to fetch saved plans:', e);
    } finally {
      setLoadingSavedPlans(false);
    }
  };

  const handleGeneratePlan = async (e) => {
    if (e) e.preventDefault();
    if (!planForm.title.trim()) {
      setErrorMsg('Please enter a research title or hypothesis for the experiment plan.');
      return;
    }
    setGeneratingPlan(true);
    setErrorMsg(null);
    try {
      const payload = {
        title: planForm.title.trim(),
        hypothesis: planForm.hypothesis.trim(),
        target_datasets: planForm.target_datasets.split(',').map((s) => s.trim()).filter(Boolean),
        baselines_to_beat: planForm.baselines_to_beat.split(',').map((s) => s.trim()).filter(Boolean),
        expected_metrics: planForm.expected_metrics.split(',').map((s) => s.trim()).filter(Boolean),
        mathematical_formulation: planForm.mathematical_formulation.trim(),
        provider: planForm.provider,
        gpu_target: planForm.gpu_target,
        workspace_id: activeWorkspace?.id || 'default-workspace',
      };

      const res = await fetch('/api/v1/benchmarks/plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Plan generation failed');
      }

      const data = await res.json();
      setCurrentPlan(data);
      setToastMsg('Experiment Execution Plan generated successfully!');
    } catch (err) {
      setErrorMsg(err.message || 'Failed generating experiment plan');
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleSavePlan = async () => {
    if (!currentPlan) return;
    setSavingPlan(true);
    try {
      const payload = {
        workspace_id: activeWorkspace?.id || 'default-workspace',
        proposal_id: currentPlan.proposal_id,
        title: currentPlan.title,
        target_dataset: currentPlan.target_dataset,
        baseline_model: currentPlan.baseline_model,
        plan_data: currentPlan.plan,
      };

      const res = await fetch('/api/v1/benchmarks/plan/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setToastMsg('Experiment plan saved permanently to workspace database.');
        fetchSavedPlans();
      }
    } catch (e) {
      setErrorMsg('Failed saving plan to SQLite.');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleDeletePlan = async (planId) => {
    try {
      const res = await fetch(`/api/v1/benchmarks/plan/${planId}`, { method: 'DELETE' });
      if (res.ok) {
        setToastMsg('Experiment plan deleted.');
        setSavedPlans((prev) => prev.filter((p) => p.id !== planId));
      }
    } catch (e) {
      setErrorMsg('Failed deleting plan.');
    }
  };

  const handleRunAudit = async (e) => {
    if (e) e.preventDefault();
    if (!auditUrl.trim()) return;
    setAuditing(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/benchmarks/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          github_url: auditUrl.trim(),
          paper_title: auditPaperTitle.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Codebase audit failed');
      }

      const data = await res.json();
      setAuditResult(data);
      setToastMsg(`Audit complete for ${data.repository.full_name}: ${data.reproducibility_rating}`);
    } catch (err) {
      setErrorMsg(err.message || 'Audit failed');
    } finally {
      setAuditing(false);
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeKey(key);
    setTimeout(() => setCopiedCodeKey(null), 2000);
  };

  const downloadTextFile = (filename, content) => {
    const element = document.createElement('a');
    const file = new Blob([content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleUseBaseline = (modelRow) => {
    setPlanForm((prev) => ({
      ...prev,
      baselines_to_beat: modelRow.model || prev.baselines_to_beat,
      target_datasets: modelRow.dataset || prev.target_datasets,
      expected_metrics: modelRow.metric || prev.expected_metrics,
      title: prev.title || `Empirical Enhancement over ${modelRow.model}`,
    }));
    setActiveTab('planner');
    setToastMsg(`Pre-filled experiment planner with baseline: ${modelRow.model}`);
  };

  // Filter tasks by category and search
  const filteredTasks = tasks.filter((t) => {
    const matchesCat = categoryFilter === 'all' || (t.category || '').toLowerCase().includes(categoryFilter.toLowerCase());
    const matchesQuery = !taskSearchQuery || t.name.toLowerCase().includes(taskSearchQuery.toLowerCase()) || (t.desc || '').toLowerCase().includes(taskSearchQuery.toLowerCase());
    return matchesCat && matchesQuery;
  });

  return (
    <div className="view-panel active" style={{ padding: '24px 32px', maxWidth: 1440, margin: '0 auto' }}>
      {/* ── 1. Top Unified Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              <FlaskConical size={18} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Experiment & Benchmark SOTA Studio
            </h1>
            <span
              className="badge"
              style={{
                background: isDark ? '#082f49' : '#f0f9ff',
                color: '#0284c7',
                border: '1px solid #0284c7',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Reproducible ML Engine
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Automated benchmark leaderboards, reproduction plans, data loaders, PyTorch architecture deltas, and codebase reproducibility audits.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/novelty')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            title="Open Novelty Studio"
          >
            <Lightbulb size={13} style={{ color: '#10b981' }} />
            <span>Novelty Studio</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/knowledge-graph')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            title="Open Vis.js Knowledge Graph"
          >
            <Layers size={13} style={{ color: '#8b5cf6' }} />
            <span>Graph Canvas</span>
          </button>
        </div>
      </div>

      {/* ── Toast and Error Alerts ── */}
      {toastMsg && (
        <div
          style={{
            padding: '10px 16px',
            marginBottom: 16,
            background: isDark ? '#064e3b' : '#ecfdf5',
            border: '1px solid #10b981',
            borderRadius: 'var(--radius-sm, 6px)',
            color: isDark ? '#ecfdf5' : '#065f46',
            fontSize: 12.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} style={{ color: '#10b981' }} />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            x
          </button>
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            padding: '10px 16px',
            marginBottom: 16,
            background: isDark ? '#450a0a' : '#fef2f2',
            border: '1px solid #ef4444',
            borderRadius: 'var(--radius-sm, 6px)',
            color: isDark ? '#fca5a5' : '#991b1b',
            fontSize: 12.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} style={{ color: '#ef4444' }} />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            x
          </button>
        </div>
      )}

      {/* ── 2. Primary Studio Navigation Pills ── */}
      <div
        className="novelty-pill-toolbar"
        style={{
          display: 'flex',
          gap: 6,
          marginBottom: 20,
          background: 'var(--bg-card)',
          padding: '6px',
          borderRadius: 'var(--radius-md, 8px)',
          border: '1px solid var(--border-subtle)',
          width: 'fit-content',
        }}
      >
        {[
          { id: 'leaderboards', label: 'SOTA Leaderboards & Baselines', icon: Trophy },
          { id: 'planner', label: 'Reproduction & Execution Planner', icon: Cpu },
          { id: 'auditor', label: 'Codebase Reproducibility Auditor', icon: ShieldCheck },
          { id: 'saved', label: `Saved Plans (${savedPlans.length})`, icon: Bookmark },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`novelty-pill-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                fontSize: 12.5,
                fontWeight: isActive ? 600 : 500,
                borderRadius: 6,
                background: isActive ? 'var(--accent-primary)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── 3. Tab Content ── */}

      {/* ── TAB 1: SOTA LEADERBOARDS & BASELINES ── */}
      {activeTab === 'leaderboards' && (
        <div>
          {/* Filter Bar */}
          <div
            className="card"
            style={{
              padding: '14px 18px',
              marginBottom: 16,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md, 8px)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            {/* Category pills */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Category:
              </span>
              {['all', 'Natural Language Processing', 'Computer Vision', 'Reasoning & Coding', 'Reliability & Safety'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  style={{
                    fontSize: 11.5,
                    padding: '3px 9px',
                    borderRadius: 4,
                    border: categoryFilter === cat ? '1px solid #0284c7' : '1px solid var(--border-subtle)',
                    background: categoryFilter === cat ? (isDark ? 'rgba(2, 132, 199, 0.2)' : '#f0f9ff') : 'var(--bg-subtle)',
                    color: categoryFilter === cat ? '#0284c7' : 'var(--text-secondary)',
                    fontWeight: categoryFilter === cat ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {cat === 'all' ? 'All Tasks' : cat.split('&')[0].trim()}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 260 }}>
              <Search size={14} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="input"
                placeholder="Search benchmark task or dataset..."
                value={taskSearchQuery}
                onChange={(e) => setTaskSearchQuery(e.target.value)}
                style={{ fontSize: 12, padding: '4px 10px', width: '100%' }}
              />
            </div>
          </div>

          {/* Quick Task Selection Chips */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10, marginBottom: 16 }}>
            {filteredTasks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTask(t.id)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: selectedTask === t.id ? 700 : 500,
                  whiteSpace: 'nowrap',
                  background: selectedTask === t.id ? (isDark ? '#082f49' : '#e0f2fe') : 'var(--bg-card)',
                  border: selectedTask === t.id ? '1.5px solid #0284c7' : '1px solid var(--border-subtle)',
                  color: selectedTask === t.id ? '#0284c7' : 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>{t.name}</span>
                <span style={{ fontSize: 10, opacity: 0.7 }}>• {t.category.split('&')[0]}</span>
              </button>
            ))}
          </div>

          {/* Leaderboard Table Card */}
          <div
            className="card"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md, 8px)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  SOTA Leaderboard: {tasks.find((t) => t.id === selectedTask)?.name || selectedTask}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  Verified state-of-the-art evaluation rankings from Papers With Code & SQLite research cache.
                </p>
              </div>

              <span className="badge" style={{ fontSize: 11, background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>
                {leaderboard.length} Models Indexed
              </span>
            </div>

            {loadingLeaderboard ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                <RotateCw size={28} className="animate-spin" style={{ margin: '0 auto 10px', color: '#0284c7' }} />
                <p style={{ fontSize: 13, margin: 0 }}>Querying verified benchmark leaderboards...</p>
              </div>
            ) : leaderboard.length === 0 ? (
              <div style={{ padding: 50, textAlign: 'center', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: 13 }}>No models currently listed for this task. Try selecting another task above.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '10px 16px', fontWeight: 600, width: 80 }}>Rank</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Model / Architecture</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Target Dataset</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Metric & Score</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Reference Paper</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((row, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          background: idx % 2 === 0 ? 'transparent' : (isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.01)'),
                        }}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                          <span
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: String(row.rank).includes('#1')
                                ? 'rgba(245, 158, 11, 0.2)'
                                : 'var(--bg-subtle)',
                              color: String(row.rank).includes('#1') ? '#f59e0b' : 'var(--text-primary)',
                              border: String(row.rank).includes('#1') ? '1px solid #f59e0b' : '1px solid var(--border-subtle)',
                            }}
                          >
                            {row.rank || `#${idx + 1}`}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <strong style={{ fontSize: 13, color: 'var(--text-primary)', display: 'block' }}>
                            {row.model}
                          </strong>
                          {row.methods && row.methods.length > 0 && (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                              {row.methods.slice(0, 3).map((m, mi) => (
                                <span
                                  key={mi}
                                  style={{
                                    fontSize: 10,
                                    padding: '1px 5px',
                                    borderRadius: 3,
                                    background: 'var(--bg-subtle)',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  {m}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                          {row.dataset}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              fontWeight: 700,
                              color: '#10b981',
                              fontSize: 13,
                              display: 'block',
                            }}
                          >
                            {row.value}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {row.metric}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', maxWidth: 260 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.paper_url ? (
                              <a
                                href={row.paper_url}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: 'var(--accent-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.paper_title || row.model}</span>
                                <ExternalLink size={11} style={{ flexShrink: 0 }} />
                              </a>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>{row.paper_title || row.model}</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleUseBaseline(row)}
                            style={{ fontSize: 11, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            title="Pre-fill Reproduction Planner with this model and dataset"
                          >
                            <Cpu size={12} style={{ color: '#0284c7' }} />
                            <span>Plan Experiment</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: REPRODUCTION & EXECUTION PLANNER ── */}
      {activeTab === 'planner' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 380px) 1fr', gap: 20, alignItems: 'flex-start' }}>
          {/* Left Form: Plan Configuration */}
          <div
            className="card"
            style={{
              padding: '18px 20px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md, 8px)',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cpu size={16} style={{ color: '#0284c7' }} />
              <span>Experiment Specification</span>
            </h3>

            <form onSubmit={handleGeneratePlan} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Research Title / Novelty:
                </label>
                <input
                  type="text"
                  className="input"
                  value={planForm.title}
                  onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })}
                  placeholder="e.g. Low-Rank Orthogonal Adapter Tuning"
                  style={{ fontSize: 12.5, width: '100%', padding: '6px 10px' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Hypothesis to Test:
                </label>
                <textarea
                  className="input"
                  rows={2}
                  value={planForm.hypothesis}
                  onChange={(e) => setPlanForm({ ...planForm, hypothesis: e.target.value })}
                  placeholder="e.g. Orthogonal decomposition reduces gradient interference across multilingual tasks."
                  style={{ fontSize: 12, width: '100%', padding: '6px 10px', resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Target Benchmark Dataset:
                </label>
                <input
                  type="text"
                  className="input"
                  value={planForm.target_datasets}
                  onChange={(e) => setPlanForm({ ...planForm, target_datasets: e.target.value })}
                  placeholder="e.g. WMT-14 En-De, GLUE, HumanEval"
                  style={{ fontSize: 12, width: '100%', padding: '6px 10px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Baseline Model to Beat:
                </label>
                <input
                  type="text"
                  className="input"
                  value={planForm.baselines_to_beat}
                  onChange={(e) => setPlanForm({ ...planForm, baselines_to_beat: e.target.value })}
                  placeholder="e.g. LoRA (2021) Base, Transformer Big"
                  style={{ fontSize: 12, width: '100%', padding: '6px 10px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Target Compute Hardware:
                </label>
                <select
                  className="input"
                  value={planForm.gpu_target}
                  onChange={(e) => setPlanForm({ ...planForm, gpu_target: e.target.value })}
                  style={{ fontSize: 12, width: '100%', padding: '6px 10px' }}
                >
                  <option value="NVIDIA A100 (40GB)">NVIDIA A100 (40GB) - Production SOTA</option>
                  <option value="NVIDIA H100 (80GB)">NVIDIA H100 (80GB) - High Throughput</option>
                  <option value="NVIDIA RTX 4090 (24GB)">NVIDIA RTX 4090 (24GB) - Prosumer / Workstation</option>
                  <option value="NVIDIA T4 (16GB)">NVIDIA T4 (16GB) - Low-Cost / Colab</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  AI Engineer Engine:
                </label>
                <select
                  className="input"
                  value={planForm.provider}
                  onChange={(e) => setPlanForm({ ...planForm, provider: e.target.value })}
                  style={{ fontSize: 12, width: '100%', padding: '6px 10px' }}
                >
                  <option value="gemini">Google Gemini (Flash)</option>
                  <option value="groq">Groq LPU (Ultra-Fast)</option>
                  <option value="ollama">Local Ollama</option>
                  <option value="deepseek">DeepSeek Reasoner</option>
                </select>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={generatingPlan}
                style={{
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  border: 'none',
                  padding: '9px 16px',
                }}
              >
                {generatingPlan ? <RotateCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                <span>{generatingPlan ? 'Formulating Plan...' : 'Generate Experiment Plan'}</span>
              </button>
            </form>
          </div>

          {/* Right Display: Plan Dossier */}
          <div>
            {!currentPlan ? (
              <div
                className="card"
                style={{
                  padding: '60px 30px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  background: 'var(--bg-card)',
                  border: '1px dashed var(--border-subtle)',
                  borderRadius: 'var(--radius-md, 8px)',
                }}
              >
                <Cpu size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                  No Experiment Plan Formulated Yet
                </h4>
                <p style={{ fontSize: 12.5, maxWidth: 420, margin: '0 auto 16px', lineHeight: 1.5 }}>
                  Enter your research hypothesis on the left and click <strong>Generate Experiment Plan</strong> to construct a complete PyTorch data loader, hardware budget, and bash scripts.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleGeneratePlan}
                  style={{ fontSize: 11.5 }}
                >
                  Run Demo Plan
                </button>
              </div>
            ) : (
              <div>
                {/* Plan Overview & Stats Strip */}
                <div
                  className="card"
                  style={{
                    padding: '16px 20px',
                    marginBottom: 16,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md, 8px)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                    <div>
                      <span className="badge" style={{ fontSize: 10.5, background: 'rgba(2, 132, 199, 0.15)', color: '#0284c7', marginBottom: 4 }}>
                        Execution Dossier
                      </span>
                      <h2 style={{ fontSize: 16.5, fontWeight: 700, margin: '4px 0 2px', color: 'var(--text-primary)' }}>
                        {currentPlan.title}
                      </h2>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        Target Dataset: <strong>{currentPlan.target_dataset}</strong> · Baseline: <strong>{currentPlan.baseline_model}</strong>
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleSavePlan}
                        disabled={savingPlan}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}
                      >
                        <Bookmark size={13} />
                        <span>{savingPlan ? 'Saving...' : 'Save Plan to SQLite'}</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => downloadTextFile('run_experiment.sh', currentPlan.plan.runscript_sh || '')}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}
                        title="Download runnable bash script"
                      >
                        <Download size={13} />
                        <span>.sh Script</span>
                      </button>
                    </div>
                  </div>

                  {/* Hardware & Budget Stat Pills */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>GPU TARGET</span>
                      <strong style={{ fontSize: 12, color: 'var(--text-primary)' }}>{currentPlan.plan.hardware_budget?.gpu_model || 'NVIDIA A100'}</strong>
                    </div>
                    <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>ESTIMATED TIME</span>
                      <strong style={{ fontSize: 12, color: '#0284c7' }}>{currentPlan.plan.hardware_budget?.estimated_hours || '4.5 Hours'}</strong>
                    </div>
                    <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>ESTIMATED COST</span>
                      <strong style={{ fontSize: 12, color: '#10b981' }}>{currentPlan.plan.hardware_budget?.estimated_cost_usd || '$6.75'}</strong>
                    </div>
                    <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>VRAM REQ</span>
                      <strong style={{ fontSize: 12, color: 'var(--text-primary)' }}>{currentPlan.plan.hardware_budget?.vram_gb || '32 GB'}</strong>
                    </div>
                  </div>
                </div>

                {/* Sub-Tab Navigation for Code & Specs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 6 }}>
                  {[
                    { id: 'data', label: '1. Data Pipeline (Python)', icon: Database },
                    { id: 'model', label: '2. PyTorch Architecture Delta', icon: Code },
                    { id: 'hyperparams', label: '3. Hyperparameters & Protocol', icon: SlidersHorizontal },
                    { id: 'scripts', label: '4. Runnable Scripts (Bash/Py)', icon: Terminal },
                  ].map((sub) => {
                    const SubIcon = sub.icon;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => setPlanSubTab(sub.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '5px 12px',
                          fontSize: 12,
                          fontWeight: planSubTab === sub.id ? 600 : 400,
                          borderRadius: 4,
                          border: 'none',
                          background: planSubTab === sub.id ? 'var(--bg-card)' : 'transparent',
                          color: planSubTab === sub.id ? 'var(--accent-primary)' : 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        <SubIcon size={13} />
                        <span>{sub.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Sub-Tab 1: Data Pipeline Code */}
                {planSubTab === 'data' && (
                  <div className="card" style={{ padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <strong style={{ fontSize: 13 }}>Data Loading & Tokenization Pipeline</strong>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => copyToClipboard(currentPlan.plan.dataset_pipeline_py, 'data')}
                        style={{ fontSize: 11, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        {copiedCodeKey === 'data' ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                        <span>{copiedCodeKey === 'data' ? 'Copied' : 'Copy Code'}</span>
                      </button>
                    </div>
                    <pre
                      style={{
                        padding: 14,
                        borderRadius: 6,
                        background: isDark ? '#0f172a' : '#f8fafc',
                        border: '1px solid var(--border-subtle)',
                        fontSize: 12,
                        fontFamily: 'monospace',
                        overflowX: 'auto',
                        lineHeight: 1.45,
                        margin: 0,
                      }}
                    >
                      <code>{currentPlan.plan.dataset_pipeline_py}</code>
                    </pre>
                  </div>
                )}

                {/* Sub-Tab 2: Model Delta PyTorch */}
                {planSubTab === 'model' && (
                  <div className="card" style={{ padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <strong style={{ fontSize: 13 }}>PyTorch Architectural Modification (Delta)</strong>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => copyToClipboard(currentPlan.plan.model_delta_py, 'model')}
                        style={{ fontSize: 11, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        {copiedCodeKey === 'model' ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                        <span>{copiedCodeKey === 'model' ? 'Copied' : 'Copy Code'}</span>
                      </button>
                    </div>
                    <pre
                      style={{
                        padding: 14,
                        borderRadius: 6,
                        background: isDark ? '#0f172a' : '#f8fafc',
                        border: '1px solid var(--border-subtle)',
                        fontSize: 12,
                        fontFamily: 'monospace',
                        overflowX: 'auto',
                        lineHeight: 1.45,
                        margin: 0,
                      }}
                    >
                      <code>{currentPlan.plan.model_delta_py}</code>
                    </pre>
                  </div>
                )}

                {/* Sub-Tab 3: Hyperparameters & Protocol */}
                {planSubTab === 'hyperparams' && (
                  <div className="card" style={{ padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                    <h4 style={{ fontSize: 13.5, fontWeight: 700, margin: '0 0 12px' }}>
                      Training Hyperparameter Specification
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
                      {Object.entries(currentPlan.plan.hyperparameters || {}).map(([k, v]) => (
                        <div key={k} style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
                          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>
                            {k.replace(/_/g, ' ')}
                          </span>
                          <strong style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{String(v)}</strong>
                        </div>
                      ))}
                    </div>

                    <h4 style={{ fontSize: 13.5, fontWeight: 700, margin: '0 0 8px' }}>
                      Evaluation & Verification Protocol
                    </h4>
                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, background: 'var(--bg-subtle)', padding: 12, borderRadius: 6, margin: 0, whiteSpace: 'pre-line' }}>
                      {currentPlan.plan.evaluation_protocol}
                    </p>
                  </div>
                )}

                {/* Sub-Tab 4: Runnable Scripts */}
                {planSubTab === 'scripts' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="card" style={{ padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <strong style={{ fontSize: 13 }}>run_experiment.sh (Bash Orchestration)</strong>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => copyToClipboard(currentPlan.plan.runscript_sh, 'sh')}
                          style={{ fontSize: 11, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          {copiedCodeKey === 'sh' ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                          <span>{copiedCodeKey === 'sh' ? 'Copied' : 'Copy Script'}</span>
                        </button>
                      </div>
                      <pre
                        style={{
                          padding: 12,
                          borderRadius: 6,
                          background: isDark ? '#0f172a' : '#f8fafc',
                          border: '1px solid var(--border-subtle)',
                          fontSize: 11.5,
                          fontFamily: 'monospace',
                          overflowX: 'auto',
                          lineHeight: 1.4,
                          margin: 0,
                        }}
                      >
                        <code>{currentPlan.plan.runscript_sh}</code>
                      </pre>
                    </div>

                    <div className="card" style={{ padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <strong style={{ fontSize: 13 }}>experiment_runner.py (Python Entry Point)</strong>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => copyToClipboard(currentPlan.plan.runner_py, 'py')}
                          style={{ fontSize: 11, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          {copiedCodeKey === 'py' ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                          <span>{copiedCodeKey === 'py' ? 'Copied' : 'Copy Script'}</span>
                        </button>
                      </div>
                      <pre
                        style={{
                          padding: 12,
                          borderRadius: 6,
                          background: isDark ? '#0f172a' : '#f8fafc',
                          border: '1px solid var(--border-subtle)',
                          fontSize: 11.5,
                          fontFamily: 'monospace',
                          overflowX: 'auto',
                          lineHeight: 1.4,
                          margin: 0,
                        }}
                      >
                        <code>{currentPlan.plan.runner_py}</code>
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: CODEBASE REPRODUCIBILITY AUDITOR ── */}
      {activeTab === 'auditor' && (
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          {/* Audit Search Box */}
          <div
            className="card"
            style={{
              padding: '20px 24px',
              marginBottom: 20,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md, 8px)',
            }}
          >
            <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} style={{ color: '#10b981' }} />
              <span>Automated GitHub Codebase Reproducibility Audit</span>
            </h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.45 }}>
              Verify mathematical claims, dependency pinning, and execution entry points of reference repositories before spending GPU compute.
            </p>

            <form onSubmit={handleRunAudit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    GitHub Repository URL:
                  </label>
                  <input
                    type="url"
                    className="input"
                    value={auditUrl}
                    onChange={(e) => setAuditUrl(e.target.value)}
                    placeholder="https://github.com/microsoft/LoRA"
                    style={{ fontSize: 12.5, width: '100%', padding: '7px 12px' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    Paper Title / Reference:
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={auditPaperTitle}
                    onChange={(e) => setAuditPaperTitle(e.target.value)}
                    placeholder="e.g. LoRA Paper (2021)"
                    style={{ fontSize: 12.5, width: '100%', padding: '7px 12px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={auditing}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontWeight: 600,
                    padding: '8px 20px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                  }}
                >
                  {auditing ? <RotateCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  <span>{auditing ? 'Auditing Repository...' : 'Run Codebase Audit'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Audit Results View */}
          {auditResult && (
            <div
              className="card"
              style={{
                padding: '24px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md, 8px)',
              }}
            >
              {/* Header result row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <GitBranch size={16} style={{ color: 'var(--text-muted)' }} />
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      {auditResult.repository.full_name}
                    </h3>
                    <a
                      href={auditResult.repository.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--accent-primary)', display: 'flex', alignItems: 'center' }}
                    >
                      <ArrowUpRight size={13} />
                    </a>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    {auditResult.audit_summary}
                  </p>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 14px',
                      borderRadius: 20,
                      background: auditResult.reproducibility_score >= 85 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      border: auditResult.reproducibility_score >= 85 ? '1px solid #10b981' : '1px solid #f59e0b',
                      color: auditResult.reproducibility_score >= 85 ? '#10b981' : '#f59e0b',
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    <CheckCircle2 size={15} />
                    <span>{auditResult.reproducibility_score}% {auditResult.reproducibility_rating}</span>
                  </div>
                </div>
              </div>

              {/* Checklist Items Table */}
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 13.5, fontWeight: 700, margin: '0 0 10px', color: 'var(--text-primary)' }}>
                  Reproducibility Rubric Checklist
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {auditResult.checked_items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 6,
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 10,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                          <strong style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{item.name}</strong>
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
                            {item.category}
                          </span>
                        </div>
                        <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '4px 0 0 22px' }}>
                          {item.evidence}
                        </p>
                      </div>

                      <span
                        style={{
                          fontSize: 10.5,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: item.status === 'pass' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: item.status === 'pass' ? '#10b981' : '#f59e0b',
                          fontWeight: 600,
                        }}
                      >
                        {item.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendations Box */}
              <div>
                <h4 style={{ fontSize: 13.5, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
                  Pre-Flight Execution Recommendations
                </h4>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {auditResult.recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: SAVED PLANS ── */}
      {activeTab === 'saved' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
              Saved Experiment Plans in Workspace ({savedPlans.length})
            </h3>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={fetchSavedPlans}
              style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <RotateCw size={12} className={loadingSavedPlans ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          {loadingSavedPlans ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <RotateCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
              <p style={{ fontSize: 12.5 }}>Loading saved plans...</p>
            </div>
          ) : savedPlans.length === 0 ? (
            <div
              className="card"
              style={{
                padding: '50px 20px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                border: '1px dashed var(--border-subtle)',
              }}
            >
              <Bookmark size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
              <h4 style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                No Experiment Plans Saved Yet
              </h4>
              <p style={{ fontSize: 12.5, maxWidth: 400, margin: '0 auto 14px' }}>
                Formulate an experiment plan in the <strong>Reproduction & Execution Planner</strong> tab and click Save Plan to archive it here.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setActiveTab('planner')}
                style={{ fontSize: 12 }}
              >
                Go to Planner
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
              {savedPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="card"
                  style={{
                    padding: '16px 18px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md, 8px)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <span className="badge" style={{ fontSize: 10, background: 'rgba(2, 132, 199, 0.15)', color: '#0284c7' }}>
                        Experiment Plan
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeletePlan(plan.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}
                        title="Delete plan"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <h4 style={{ fontSize: 14.5, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
                      {plan.title}
                    </h4>

                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.4 }}>
                      Target: <strong>{plan.target_dataset || 'General Benchmark'}</strong> · Baseline: <strong>{plan.baseline_model || 'Standard Baseline'}</strong>
                    </p>

                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {plan.plan?.objective || 'Objective formalized in experiment plan dossier.'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {plan.created_at ? new Date(plan.created_at).toLocaleDateString() : 'Recent'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setCurrentPlan(plan);
                          setActiveTab('planner');
                        }}
                        style={{ fontSize: 11, padding: '3px 8px' }}
                      >
                        Open Dossier
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => downloadTextFile(`${plan.title.replace(/\s+/g, '_')}_runner.sh`, plan.plan?.runscript_sh || '')}
                        style={{ fontSize: 11, padding: '3px 8px' }}
                        title="Download bash script"
                      >
                        <Download size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const PIPELINE_STAGES = [
  { id: 'grounding', label: 'Research Grounding' },
  { id: 'paper_analysis', label: 'Paper Analysis' },
  { id: 'gap_extraction', label: 'Gap Extraction' },
  { id: 'candidate_gen', label: 'Candidate Generation' },
  { id: 'prior_art', label: 'Prior-Art Verification' },
  { id: 'synthesis', label: 'Proposal Synthesis' },
  { id: 'quality', label: 'Quality Assessment' },
  { id: 'persistence', label: 'Persistence' },
];

export const MECHANISM_LABELS = {
  recombination: 'Recombination',
  contradiction_resolution: 'Contradiction Resolution',
  limitation_inversion: 'Limitation Inversion',
  gap_realization: 'Gap Realization',
};

export const PRIOR_ART_STATUS_META = {
  not_assessed: { label: 'Not yet assessed', tone: 'neutral' },
  potential_overlap: { label: 'Potential overlap', tone: 'warn' },
  substantial_overlap: { label: 'Substantial overlap', tone: 'err' },
  insufficient_evidence: { label: 'Insufficient evidence', tone: 'warn' },
  no_close_match: { label: 'No close match found', tone: 'ok' },
};

export function resolvePriorArtStatus(proposal) {
  const raw =
    proposal?.prior_art_status ||
    proposal?.verification_status ||
    proposal?.prior_art_check?.status ||
    'not_assessed';
  const key = String(raw).toLowerCase().replace(/\s+/g, '_');
  return PRIOR_ART_STATUS_META[key] || { label: raw, tone: 'neutral' };
}

export function resolveEvidenceStatus(proposal) {
  const count = proposal?.grounded_paper_ids?.length || proposal?.grounded_paper_titles?.length || 0;
  if (proposal?.evidence_status) return proposal.evidence_status;
  if (count >= 2) return `Grounded (${count} papers)`;
  if (count === 1) return 'Partial (1 paper)';
  return 'Topic-level only';
}

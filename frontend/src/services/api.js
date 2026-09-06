/* ==========================================================================
   Research Copilot - API Service Module
   ========================================================================== */

const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';

export const ApiService = {
  // 1. Backend Health Check
  async getHealth() {
    try {
      const res = await fetch(`${API_BASE}/api/v1/health`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Health check failed:', err.message);
      return { status: 'offline', timestamp: new Date().toISOString() };
    }
  },

  // 2. Unified Search Across 8 Scientific Repositories
  async searchUnified(query, options = {}) {
    if (!query || !query.trim()) return { papers: [], source_counts: {} };
    try {
      const res = await fetch(`${API_BASE}/api/v1/search/unified`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          top_k: options.top_k || 30,
          source_filter: options.source_filter || 'all'
        })
      });
      if (!res.ok) throw new Error(`Unified search error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Unified search API call failed:', err);
      throw err;
    }
  },

  // 3. Provider-Specific Search Handler
  async searchProvider(provider, query, topK = 25) {
    if (!query || !query.trim()) return { papers: [] };
    try {
      const res = await fetch(`${API_BASE}/api/v1/search/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query, top_k: topK })
      });
      if (!res.ok) throw new Error(`${provider} search error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`Provider ${provider} search failed:`, err);
      throw err;
    }
  },

  // 4. Knowledge Graph Data Fetching
  async getKnowledgeGraph() {
    try {
      const res = await fetch(`${API_BASE}/api/v1/knowledge-graph`);
      if (!res.ok) throw new Error(`Graph error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Knowledge graph fetch failed:', err.message);
      return null;
    }
  },

  // 5. Agentic RAG Hybrid Retrieval
  async hybridRetrieval(query, hops = 1) {
    if (!query || !query.trim()) return { results: [] };
    try {
      const res = await fetch(`${API_BASE}/api/v1/retrieval/hybrid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          top_k: 20,
          graph_hops: hops
        })
      });
      if (!res.ok) throw new Error(`Hybrid retrieval error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Hybrid retrieval API failed:', err);
      throw err;
    }
  },

  // 6. PDF Extractor Microservice (port 8001)
  async extractPdf(pdfUrl) {
    try {
      const res = await fetch('http://localhost:8001/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pdfUrl })
      });
      if (!res.ok) throw new Error(`PDF extractor returned ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('PDF extraction failed:', err);
      throw err;
    }
  },

  // 7. Search Sessions
  async getSearchSessions() {
    try {
      const res = await fetch(`${API_BASE}/api/v1/search/sessions`);
      if (!res.ok) throw new Error(`Sessions error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Search sessions fetch failed:', err.message);
      return [];
    }
  }
};

"""
Research Copilot — Scikit-Learn Paper Processor
Provides TF-IDF based deduplication, hybrid relevance reranking, and thematic K-Means clustering
for research papers fetched across 8 scientific sources (arXiv, OpenAlex, Semantic Scholar, 
Papers with Code, Hugging Face, PubMed, Crossref, Kaggle).
"""

import logging
from typing import List, Dict, Any, Optional
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.cluster import KMeans

logger = logging.getLogger("PAPER-PROCESSOR")


class ScikitPaperProcessor:
    """
    ML-driven post-processor for research papers retrieved from multiple scientific APIs.
    """

    def __init__(self, max_features: int = 5000):
        self.max_features = max_features

    def _build_corpus(self, papers: List[Dict[str, Any]]) -> List[str]:
        """Utility to build textual corpus from paper title and abstract."""
        corpus = []
        for p in papers:
            title = str(p.get("title") or "").strip()
            abstract = str(p.get("abstract") or "").strip()
            text = f"{title}. {abstract}".strip()
            corpus.append(text if text != "." else "empty paper content")
        return corpus

    def deduplicate_papers(
        self, papers: List[Dict[str, Any]], similarity_threshold: float = 0.85
    ) -> List[Dict[str, Any]]:
        """
        Deduplicates papers from 8 distinct sources using TF-IDF sparse representations 
        and pairwise Cosine Similarity. Merges source metadata when duplicate papers are found.
        """
        if not papers or len(papers) <= 1:
            return papers

        corpus = self._build_corpus(papers)
        
        try:
            vectorizer = TfidfVectorizer(stop_words="english", max_features=self.max_features)
            tfidf_matrix = vectorizer.fit_transform(corpus)
            sim_matrix = cosine_similarity(tfidf_matrix)
        except Exception as e:
            logger.error(f"TF-IDF vectorization failed during deduplication: {e}")
            return papers

        unique_papers = []
        visited = set()
        n = len(papers)

        for i in range(n):
            if i in visited:
                continue

            base_paper = dict(papers[i])
            # Ensure sources field is a list
            sources = base_paper.get("sources")
            if not isinstance(sources, list):
                s = base_paper.get("source")
                sources = [s] if s else ["unknown"]
            
            duplicate_indices = np.where(sim_matrix[i] >= similarity_threshold)[0]

            for dup_idx in duplicate_indices:
                visited.add(dup_idx)
                if dup_idx == i:
                    continue
                
                # Merge duplicate metadata
                dup_paper = papers[dup_idx]
                dup_s = dup_paper.get("sources") or dup_paper.get("source")
                if isinstance(dup_s, list):
                    for src in dup_s:
                        if src and src not in sources:
                            sources.append(src)
                elif dup_s and dup_s not in sources:
                    sources.append(dup_s)

                # Prefer non-empty abstracts / pdf links
                if not base_paper.get("abstract") and dup_paper.get("abstract"):
                    base_paper["abstract"] = dup_paper["abstract"]
                if not base_paper.get("pdf_url") and dup_paper.get("pdf_url"):
                    base_paper["pdf_url"] = dup_paper["pdf_url"]

            base_paper["sources"] = sources
            unique_papers.append(base_paper)

        logger.info(f"Deduplicated {n} papers down to {len(unique_papers)} unique papers (threshold={similarity_threshold})")
        return unique_papers

    def rerank_papers(self, query: str, papers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Reranks a list of papers according to TF-IDF relevance against the user's research query.
        """
        if not papers or not query.strip():
            return papers

        corpus = self._build_corpus(papers)
        
        try:
            vectorizer = TfidfVectorizer(stop_words="english", max_features=self.max_features)
            tfidf_matrix = vectorizer.fit_transform(corpus)
            query_vec = vectorizer.transform([query])
            
            scores = cosine_similarity(query_vec, tfidf_matrix).flatten()
            
            scored_papers = []
            for paper, score in zip(papers, scores):
                paper_copy = dict(paper)
                paper_copy["tfidf_score"] = float(round(score, 4))
                scored_papers.append(paper_copy)
                
            # Sort descending by tfidf_score
            scored_papers.sort(key=lambda x: x.get("tfidf_score", 0.0), reverse=True)
            return scored_papers

        except Exception as e:
            logger.error(f"Reranking error: {e}")
            return papers

    def cluster_papers(self, papers: List[Dict[str, Any]], n_clusters: int = 3) -> List[Dict[str, Any]]:
        """
        Clusters papers into thematic groups using K-Means for structured display in UI dashboard.
        """
        if not papers:
            return papers

        effective_k = min(n_clusters, len(papers))
        if effective_k <= 1:
            for p in papers:
                p["cluster_id"] = 0
                p["cluster_topic"] = "General Research"
            return papers

        corpus = self._build_corpus(papers)

        try:
            vectorizer = TfidfVectorizer(stop_words="english", max_features=self.max_features)
            tfidf_matrix = vectorizer.fit_transform(corpus)
            
            kmeans = KMeans(n_clusters=effective_k, random_state=42, n_init=5)
            cluster_labels = kmeans.fit_predict(tfidf_matrix)
            
            # Identify top feature terms per cluster center for topic naming
            feature_names = np.array(vectorizer.get_feature_names_out())
            cluster_topics = {}
            
            for cid in range(effective_k):
                center = kmeans.cluster_centers_[cid]
                top_indices = center.argsort()[-3:][::-1]
                top_terms = [feature_names[idx] for idx in top_indices if idx < len(feature_names)]
                cluster_topics[cid] = " / ".join(top_terms).title() if top_terms else f"Cluster {cid+1}"

            clustered_papers = []
            for paper, label in zip(papers, cluster_labels):
                p_copy = dict(paper)
                cid = int(label)
                p_copy["cluster_id"] = cid
                p_copy["cluster_topic"] = cluster_topics.get(cid, f"Cluster {cid+1}")
                clustered_papers.append(p_copy)

            logger.info(f"Clustered {len(papers)} papers into {effective_k} thematic clusters.")
            return clustered_papers

        except Exception as e:
            logger.error(f"Clustering error: {e}")
            for p in papers:
                p["cluster_id"] = 0
                p["cluster_topic"] = "General Research"
            return papers

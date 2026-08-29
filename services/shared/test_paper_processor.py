"""
Unit tests for ScikitPaperProcessor
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paper_processor import ScikitPaperProcessor

class TestScikitPaperProcessor(unittest.TestCase):

    def setUp(self):
        self.processor = ScikitPaperProcessor()
        self.sample_papers = [
            {
                "id": "arxiv-001",
                "title": "Attention Is All You Need for Transformer Networks",
                "abstract": "We propose the Transformer, a novel neural network architecture based on self-attention mechanisms.",
                "source": "arXiv",
                "pdf_url": "https://arxiv.org/pdf/1706.03762"
            },
            {
                "id": "openalex-002",
                "title": "Attention Is All You Need for Transformer Networks", # Duplicate title/abstract
                "abstract": "We propose the Transformer, a novel neural network architecture based on self-attention mechanisms.",
                "source": "OpenAlex",
                "pdf_url": "https://openalex.org/W12345"
            },
            {
                "id": "s2-003",
                "title": "Deep Residual Learning for Image Recognition",
                "abstract": "Deeper neural networks are more difficult to train. We present a residual learning framework.",
                "source": "Semantic Scholar"
            },
            {
                "id": "pwc-004",
                "title": "ResNet: Deep Residual Networks for Computer Vision",
                "abstract": "Residual networks ease the training of deep neural networks for image classification tasks.",
                "source": "Papers with Code"
            }
        ]

    def test_deduplication(self):
        unique = self.processor.deduplicate_papers(self.sample_papers, similarity_threshold=0.85)
        self.assertEqual(len(unique), 3) # The first two papers are identical and merged
        # Check merged sources
        merged_sources = unique[0]["sources"]
        self.assertIn("arXiv", merged_sources)
        self.assertIn("OpenAlex", merged_sources)

    def test_reranking(self):
        query = "Transformer self-attention architecture"
        reranked = self.processor.rerank_papers(query, self.sample_papers)
        self.assertGreater(len(reranked), 0)
        # The top paper should be the Transformer paper
        self.assertIn("Transformer", reranked[0]["title"])
        self.assertIn("tfidf_score", reranked[0])

    def test_clustering(self):
        clustered = self.processor.cluster_papers(self.sample_papers, n_clusters=2)
        self.assertEqual(len(clustered), 4)
        for paper in clustered:
            self.assertIn("cluster_id", paper)
            self.assertIn("cluster_topic", paper)

if __name__ == "__main__":
    unittest.main()

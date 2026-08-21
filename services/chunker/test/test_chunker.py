import unittest
from main import chunk_text, split_sentences

class TestChunker(unittest.TestCase):
    def test_split_sentences(self):
        text = "This is sentence one. This is sentence two (with e.g. some abbreviation). And sentence three!"
        sents = split_sentences(text)
        self.assertEqual(len(sents), 3)
        self.assertEqual(sents[0], "This is sentence one.")
        self.assertEqual(sents[1], "This is sentence two (with e.g. some abbreviation).")
        self.assertEqual(sents[2], "And sentence three!")

    def test_chunk_text_normal(self):
        text = "This is a normal paragraph under 350 words.\n\nAnother paragraph that is also quite small."
        chunks = chunk_text(text)
        self.assertEqual(len(chunks), 2)
        self.assertEqual(chunks[0]['chunk_index'], 0)
        self.assertEqual(chunks[1]['chunk_index'], 1)
        self.assertEqual(chunks[0]['chunk_type'], 'PARAGRAPH')

    def test_chunk_text_large(self):
        # Create a large paragraph
        large_para = " ".join([f"This is sentence {i} contributing to a very large paragraph body." for i in range(35)])
        chunks = chunk_text(large_para)
        self.assertTrue(len(chunks) >= 2)
        for chunk in chunks:
            self.assertTrue(chunk['word_count'] <= 300)
            self.assertTrue(chunk['content'].endswith('.'))

    def test_chunk_text_section(self):
        text = "Introduction\nThis is paragraph one.\n\nMethodology\nThis is paragraph two."
        chunks = chunk_text(text)
        self.assertEqual(len(chunks), 2)
        self.assertEqual(chunks[0]['section_name'], "Introduction")
        self.assertEqual(chunks[1]['section_name'], "Methodology")

    def test_chunk_large_file_chunking(self):
        # Create a ~2000-word document (well over the 300-word limit)
        long_paragraph = "The quick brown fox jumps over the lazy dog. " * 100
        text = f"Title: A Very Large Document\n\n{long_paragraph}\n\nConclusion: This document is long."
        
        chunks = chunk_text(text)
        
        # Should be split into multiple chunks to respect the 300-word limit
        self.assertGreater(len(chunks), 5)
        
        # Verify chunk metadata
        for chunk in chunks:
            self.assertIn('chunk_index', chunk)
            self.assertIn('word_count', chunk)
            self.assertIn('section_name', chunk)
            
            # Verify word count is within limits
            self.assertLessEqual(chunk['word_count'], 300)
            
            # All chunks should be 'PARAGRAPH' type for this simple text
            self.assertEqual(chunk['chunk_type'], 'PARAGRAPH')

if __name__ == '__main__':
    unittest.main()

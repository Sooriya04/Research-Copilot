package core

import (
	"context"
	"strings"
	"testing"

	_ "github.com/lib/pq"
)

func TestChunkText_NormalAndSmall(t *testing.T) {
	text := "This is the first paragraph. It is relatively short and contains only a few sentences.\n\n" +
		"This is the second paragraph. It also contains several sentences to simulate a standard research paper text body."

	chunks := ChunkText(text)
	if len(chunks) != 2 {
		t.Fatalf("Expected 2 chunks, got %d", len(chunks))
	}

	if chunks[0].ChunkIndex != 0 || chunks[1].ChunkIndex != 1 {
		t.Errorf("Chunk indices are wrong: %d and %d", chunks[0].ChunkIndex, chunks[1].ChunkIndex)
	}

	if !strings.Contains(chunks[0].Content, "first paragraph") {
		t.Errorf("First chunk content mismatch: %s", chunks[0].Content)
	}
}

func TestChunkText_LargeParagraphSplitting(t *testing.T) {
	// Create a paragraph with > 400 words
	var sb strings.Builder
	for i := 0; i < 40; i++ {
		sb.WriteString("This is sentence number ")
		sb.WriteByte(byte('a' + (i % 26)))
		sb.WriteString(" which contributes to a very long paragraph. ")
	}
	largePara := sb.String()

	chunks := ChunkText(largePara)
	if len(chunks) < 2 {
		t.Fatalf("Expected large paragraph to be split, but got %d chunk(s)", len(chunks))
	}

	// Verify sentence preservation
	for _, chunk := range chunks {
		if chunk.WordCount > 300 {
			t.Errorf("Chunk exceeds target limit: %d words", chunk.WordCount)
		}
		// Each chunk should end with a period followed by space or end of string
		trimmed := strings.TrimSpace(chunk.Content)
		if !strings.HasSuffix(trimmed, ".") {
			t.Errorf("Chunk does not preserve sentence boundary: %q", trimmed)
		}
	}
}

func TestChunkText_SectionDetection(t *testing.T) {
	text := "Introduction\nThis is paragraph one under introduction.\n\n" +
		"Methodology\nThis is paragraph two under methodology."

	chunks := ChunkText(text)
	if len(chunks) != 2 {
		t.Fatalf("Expected 2 chunks, got %d", len(chunks))
	}

	if chunks[0].SectionName == nil || *chunks[0].SectionName != "Introduction" {
		t.Errorf("Expected section Introduction, got %v", chunks[0].SectionName)
	}

	if chunks[1].SectionName == nil || *chunks[1].SectionName != "Methodology" {
		t.Errorf("Expected section Methodology, got %v", chunks[1].SectionName)
	}
}

func TestChunkText_Empty(t *testing.T) {
	chunks := ChunkText("    \n\n   ")
	if len(chunks) != 0 {
		t.Errorf("Expected 0 chunks, got %d", len(chunks))
	}
}

func TestProcessAndStoreChunks_Idempotency(t *testing.T) {
	// To test ProcessAndStoreChunks, we need a test DB connection
	err := InitDB()
	if err != nil {
		t.Skip("Skipping DB integration test: no DB connection")
		return
	}

	ctx := context.Background()
	tx, err := DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("Failed to begin transaction: %v", err)
	}
	defer tx.Rollback()

	// Insert mock paper and content version
	paperID := "test-paper-id"
	_, err = tx.ExecContext(ctx, `
		INSERT INTO research_papers (id, source, external_id, title)
		VALUES ($1, 'arxiv', '12345', 'Test Title')
		ON CONFLICT (id) DO NOTHING;
	`, paperID)
	if err != nil {
		t.Fatalf("Failed to insert mock paper: %v", err)
	}

	var versionID int
	err = tx.QueryRowContext(ctx, `
		INSERT INTO paper_content_versions (paper_id, content_type, content, content_hash, is_active)
		VALUES ($1, 'PDF', 'Introduction\nThis is some mock paper content.', 'hash123', true)
		ON CONFLICT (paper_id, content_type, content_hash) DO UPDATE SET is_active = true
		RETURNING id;
	`, paperID).Scan(&versionID)
	if err != nil {
		t.Fatalf("Failed to insert mock content version: %v", err)
	}

	// First chunking run
	err = ProcessAndStoreChunks(ctx, tx, paperID, versionID, "Introduction\nThis is some mock paper content.")
	if err != nil {
		t.Fatalf("First chunk run failed: %v", err)
	}

	var count1 int
	err = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM paper_chunks WHERE content_version_id = $1;", versionID).Scan(&count1)
	if err != nil || count1 == 0 {
		t.Fatalf("Failed to query chunks or count is 0: %v, count=%d", err, count1)
	}

	// Second chunking run (idempotency test)
	err = ProcessAndStoreChunks(ctx, tx, paperID, versionID, "Introduction\nThis is some mock paper content.")
	if err != nil {
		t.Fatalf("Second chunk run failed: %v", err)
	}

	var count2 int
	err = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM paper_chunks WHERE content_version_id = $1;", versionID).Scan(&count2)
	if err != nil || count2 != count1 {
		t.Fatalf("Idempotency failed. Expected %d chunks, got %d", count1, count2)
	}
}

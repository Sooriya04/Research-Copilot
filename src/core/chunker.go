package core

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"regexp"
	"strings"
)

// Chunk represents a parsed paper chunk
type Chunk struct {
	PaperID          string
	ContentVersionID int
	ChunkIndex       int
	Content          string
	SectionName      *string
	PageStart        *int
	PageEnd          *int
	WordCount        int
	TokenCount       int
	ChunkType        string
}

var (
	// Regex to match section headings (e.g., "1. Introduction", "Abstract", "Discussion")
	sectionRegex = regexp.MustCompile(`^(?i)(?:\d+(?:\.\d+)*\s+)?(Abstract|Introduction|Related Work|Methodology|Methods|Dataset|Experiments|Results|Discussion|Conclusion|References)$`)
	
	// Regex to split text into sentences (handles standard endings, avoiding abbreviations like e.g. and i.e.)
	sentenceSplitRegex = regexp.MustCompile(`[^.!?]+[.!?]+(?:\s+|$)`)
)

// ChunkText splits the input text into structural, sentence-preserved chunks of target size 200-300 words.
func ChunkText(text string) []Chunk {
	var chunks []Chunk
	paragraphs := strings.Split(text, "\n\n")
	
	currentSection := ""
	chunkIndex := 0
	
	for _, para := range paragraphs {
		para = strings.TrimSpace(para)
		if para == "" {
			continue
		}
		
		// Check for section header change
		lines := strings.Split(para, "\n")
		firstLine := strings.TrimSpace(lines[0])
		if len(firstLine) < 60 && sectionRegex.MatchString(firstLine) {
			currentSection = firstLine
			// If the paragraph is only the heading, keep it for tracking but don't chunk it alone if it's empty
			if len(para) == len(firstLine) {
				continue
			}
		}
		
		words := strings.Fields(para)
		wordCount := len(words)
		
		if wordCount == 0 {
			continue
		}
		
		// If the paragraph fits standard limits (less than 350 words), keep it as a single chunk
		if wordCount <= 350 {
			var secPtr *string
			if currentSection != "" {
				s := currentSection
				secPtr = &s
			}
			chunks = append(chunks, Chunk{
				ChunkIndex:  chunkIndex,
				Content:     para,
				SectionName: secPtr,
				WordCount:   wordCount,
				TokenCount:  estimateTokenCount(wordCount),
				ChunkType:   "PARAGRAPH",
			})
			chunkIndex++
			continue
		}
		
		// Large paragraph: split at sentence boundaries
		sentences := splitSentences(para)
		var currentChunkWords []string
		
		for _, sentence := range sentences {
			sentenceWords := strings.Fields(sentence)
			if len(sentenceWords) == 0 {
				continue
			}
			
			// If adding this sentence exceeds target chunk size (300 words), emit the current chunk first
			if len(currentChunkWords) > 0 && len(currentChunkWords)+len(sentenceWords) > 300 {
				chunkText := strings.Join(currentChunkWords, " ")
				var secPtr *string
				if currentSection != "" {
					s := currentSection
					secPtr = &s
				}
				chunks = append(chunks, Chunk{
					ChunkIndex:  chunkIndex,
					Content:     chunkText,
					SectionName: secPtr,
					WordCount:   len(currentChunkWords),
					TokenCount:  estimateTokenCount(len(currentChunkWords)),
					ChunkType:   "PARAGRAPH",
				})
				chunkIndex++
				currentChunkWords = nil
			}
			
			currentChunkWords = append(currentChunkWords, sentenceWords...)
		}
		
		// Emit any remaining sentences as the last chunk of this paragraph
		if len(currentChunkWords) > 0 {
			chunkText := strings.Join(currentChunkWords, " ")
			var secPtr *string
			if currentSection != "" {
				s := currentSection
				secPtr = &s
			}
			chunks = append(chunks, Chunk{
				ChunkIndex:  chunkIndex,
				Content:     chunkText,
				SectionName: secPtr,
				WordCount:   len(currentChunkWords),
				TokenCount:  estimateTokenCount(len(currentChunkWords)),
				ChunkType:   "PARAGRAPH",
			})
			chunkIndex++
		}
	}
	
	return chunks
}

func splitSentences(text string) []string {
	found := sentenceSplitRegex.FindAllString(text, -1)
	if len(found) == 0 {
		return []string{text}
	}
	
	// Re-join sentences if they split on common abbreviations
	var sentences []string
	var currentSentence strings.Builder
	
	abbreviations := []string{"e.g.", "i.e.", "al.", "vs.", "fig.", "ref.", "dr.", "prof."}
	
	for _, f := range found {
		currentSentence.WriteString(f)
		trimmed := strings.ToLower(strings.TrimSpace(f))
		
		isAbbrev := false
		for _, ab := range abbreviations {
			if strings.HasSuffix(trimmed, ab) {
				isAbbrev = true
				break
			}
		}
		
		if !isAbbrev {
			sentences = append(sentences, currentSentence.String())
			currentSentence.Reset()
		}
	}
	
	if currentSentence.Len() > 0 {
		sentences = append(sentences, currentSentence.String())
	}
	
	return sentences
}

func estimateTokenCount(wordCount int) int {
	// Simple rule of thumb: ~4/3 tokens per word
	return (wordCount * 4) / 3
}

// ProcessAndStoreChunks chunks paper content and inserts them into paper_chunks table.
func ProcessAndStoreChunks(ctx context.Context, tx *sql.Tx, paperID string, contentVersionID int, content string) error {
	// Generate chunks
	chunks := ChunkText(content)
	
	// Clean existing chunks for this version first (Idempotency)
	_, err := tx.ExecContext(ctx, "DELETE FROM paper_chunks WHERE content_version_id = $1;", contentVersionID)
	if err != nil {
		return err
	}
	
	if len(chunks) == 0 {
		return nil
	}
	
	// Batch insert chunks
	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO paper_chunks (
			paper_id, content_version_id, chunk_index, content, 
			section_name, page_start, page_end, word_count, token_count, 
			chunk_type, embedding_status, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING', NOW(), NOW());
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	
	for _, chunk := range chunks {
		_, err = stmt.ExecContext(ctx,
			paperID,
			contentVersionID,
			chunk.ChunkIndex,
			chunk.Content,
			chunk.SectionName,
			chunk.PageStart,
			chunk.PageEnd,
			chunk.WordCount,
			chunk.TokenCount,
			chunk.ChunkType,
		)
		if err != nil {
			return err
		}
	}
	
	return nil
}

// GenerateSHA256Hash creates a hex-encoded SHA256 string for content verification.
func GenerateSHA256Hash(text string) string {
	h := sha256.New()
	h.Write([]byte(text))
	return hex.EncodeToString(h.Sum(nil))
}

// ComputeSHA256 returns the first 16 characters of the hex-encoded SHA256 string to match project convention.
func ComputeSHA256(data string) string {
	h := sha256.New()
	h.Write([]byte(data))
	return hex.EncodeToString(h.Sum(nil))[:16]
}

// InsertVersionAndChunk helper wraps version insertion and chunking in a transaction
func InsertVersionAndChunk(ctx context.Context, db *sql.DB, title string, sourceURL string, sourceType string, content string) error {
	paperID := ComputeSHA256(title)
	
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	
	hash := GenerateSHA256Hash(content)
	
	var versionID int
	err = tx.QueryRowContext(ctx, `
		INSERT INTO paper_content_versions (paper_id, content_type, source_url, source_type, extraction_method, content, content_hash, quality_score, validation_status, is_active)
		VALUES ($1, 'PDF', $2, $3, 'default_extractor', $4, $5, 1.0, 'VALID', true)
		ON CONFLICT (paper_id, content_type, content_hash) DO UPDATE SET is_active = true
		RETURNING id;
	`, paperID, sourceURL, sourceType, content, hash).Scan(&versionID)
	if err != nil {
		return err
	}
	
	err = ProcessAndStoreChunks(ctx, tx, paperID, versionID, content)
	if err != nil {
		return err
	}
	
	return tx.Commit()
}

// IngestAndChunkFullText is a helper for ingestion modules to version and chunk text in their existing transactions
func IngestAndChunkFullText(ctx context.Context, tx *sql.Tx, paperID string, sourceURL string, sourceType string, content string) error {
	hash := GenerateSHA256Hash(content)
	
	var versionID int
	err := tx.QueryRowContext(ctx, `
		INSERT INTO paper_content_versions (paper_id, content_type, source_url, source_type, extraction_method, content, content_hash, quality_score, validation_status, is_active)
		VALUES ($1, 'PDF', $2, $3, 'default_extractor', $4, $5, 1.0, 'VALID', true)
		ON CONFLICT (paper_id, content_type, content_hash) DO UPDATE SET is_active = true
		RETURNING id;
	`, paperID, sourceURL, sourceType, content, hash).Scan(&versionID)
	if err != nil {
		return err
	}
	
	return ProcessAndStoreChunks(ctx, tx, paperID, versionID, content)
}

package retrieval

import (
	"context"
	"testing"
)

func TestComputeRRF_SameResultInBoth(t *testing.T) {
	dense := []Candidate{
		{ChunkID: 1, Content: "A", DenseScore: 0.9},
		{ChunkID: 2, Content: "B", DenseScore: 0.8},
		{ChunkID: 3, Content: "C", DenseScore: 0.7},
	}
	sparse := []Candidate{
		{ChunkID: 1, Content: "A", SparseScore: 5.0},
		{ChunkID: 3, Content: "C", SparseScore: 4.0},
		{ChunkID: 4, Content: "D", SparseScore: 3.0},
	}

	results := ComputeRRF(dense, sparse, 60, 10)
	if len(results) != 4 {
		t.Fatalf("Expected 4 fused candidates, got %d", len(results))
	}

	// Candidate 1 (A) was #1 in dense, #1 in sparse: 1/(60+1) + 1/(60+1) = 0.03278
	// Candidate 3 (C) was #3 in dense, #2 in sparse: 1/(60+3) + 1/(60+2) = 0.03200
	if results[0].ChunkID != 1 {
		t.Errorf("Expected top candidate to be ChunkID 1 (A), got ChunkID %d", results[0].ChunkID)
	}

	if results[0].DenseRank != 1 || results[0].SparseRank != 1 {
		t.Errorf("Candidate A ranks incorrect: dense=%d, sparse=%d", results[0].DenseRank, results[0].SparseRank)
	}

	if results[1].ChunkID != 3 {
		t.Errorf("Expected second candidate to be ChunkID 3 (C), got ChunkID %d", results[1].ChunkID)
	}
}

func TestComputeRRF_DenseOnly(t *testing.T) {
	dense := []Candidate{
		{ChunkID: 10, Content: "Dense Only", DenseScore: 0.95},
	}
	sparse := []Candidate{}

	results := ComputeRRF(dense, sparse, 60, 10)
	if len(results) != 1 {
		t.Fatalf("Expected 1 candidate, got %d", len(results))
	}
	if results[0].ChunkID != 10 || results[0].DenseRank != 1 || results[0].SparseRank != 0 {
		t.Errorf("Dense-only candidate mismatch: %+v", results[0])
	}
}

func TestComputeRRF_SparseOnly(t *testing.T) {
	dense := []Candidate{}
	sparse := []Candidate{
		{ChunkID: 20, Content: "Sparse Only", SparseScore: 10.2},
	}

	results := ComputeRRF(dense, sparse, 60, 10)
	if len(results) != 1 {
		t.Fatalf("Expected 1 candidate, got %d", len(results))
	}
	if results[0].ChunkID != 20 || results[0].SparseRank != 1 || results[0].DenseRank != 0 {
		t.Errorf("Sparse-only candidate mismatch: %+v", results[0])
	}
}

func TestComputeRRF_EmptyResults(t *testing.T) {
	results := ComputeRRF(nil, nil, 60, 10)
	if results == nil {
		t.Errorf("Expected non-nil slice, got nil")
	}
	if len(results) != 0 {
		t.Errorf("Expected 0 results, got %d", len(results))
	}
}

func TestComputeRRF_TopKLimit(t *testing.T) {
	dense := []Candidate{
		{ChunkID: 1}, {ChunkID: 2}, {ChunkID: 3}, {ChunkID: 4}, {ChunkID: 5},
	}

	results := ComputeRRF(dense, nil, 60, 3)
	if len(results) != 3 {
		t.Errorf("Expected top_k 3 results, got %d", len(results))
	}
}

func TestHybridEngine_InputValidation(t *testing.T) {
	engine := NewHybridEngine()
	ctx := context.Background()

	// Empty Query
	_, err := engine.ExecuteHybridSearch(ctx, HybridSearchRequest{RequestID: "req-1", Query: ""})
	if err == nil {
		t.Errorf("Expected error on empty query")
	}

	// Empty RequestID
	_, err = engine.ExecuteHybridSearch(ctx, HybridSearchRequest{RequestID: "", Query: "test query"})
	if err == nil {
		t.Errorf("Expected error on missing request_id")
	}
}

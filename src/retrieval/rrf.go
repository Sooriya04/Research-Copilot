package retrieval

import (
	"math"
	"sort"
)

type Candidate struct {
	ChunkID     int                    `json:"chunk_id"`
	PaperID     string                 `json:"paper_id"`
	Content     string                 `json:"content"`
	SectionName string                 `json:"section_name,omitempty"`
	WordCount   int                    `json:"word_count"`
	TokenCount  int                    `json:"token_count"`
	DenseRank   int                    `json:"dense_rank,omitempty"`
	SparseRank  int                    `json:"sparse_rank,omitempty"`
	DenseScore  float64                `json:"dense_score,omitempty"`
	SparseScore float64                `json:"sparse_score,omitempty"`
	RRFScore    float64                `json:"rrf_score"`
	Rank        int                    `json:"rank"`
	Metadata    map[string]interface{} `json:"metadata"`
}

// ComputeRRF takes ranked lists of dense and sparse candidates and applies Reciprocal Rank Fusion using constant k.
func ComputeRRF(denseList []Candidate, sparseList []Candidate, k int, topK int) []Candidate {
	if k <= 0 {
		k = 60
	}

	type fusedItem struct {
		candidate   Candidate
		denseRank   int
		sparseRank  int
		denseScore  float64
		sparseScore float64
		rrfScore    float64
	}

	mapItems := make(map[int]*fusedItem)

	// Process Dense Candidates
	for rank, item := range denseList {
		rankVal := rank + 1
		entry, ok := mapItems[item.ChunkID]
		if !ok {
			entry = &fusedItem{
				candidate:  item,
				denseScore: item.DenseScore,
			}
			mapItems[item.ChunkID] = entry
		}
		entry.denseRank = rankVal
		entry.rrfScore += 1.0 / float64(k+rankVal)
	}

	// Process Sparse Candidates
	for rank, item := range sparseList {
		rankVal := rank + 1
		entry, ok := mapItems[item.ChunkID]
		if !ok {
			entry = &fusedItem{
				candidate:   item,
				sparseScore: item.SparseScore,
			}
			mapItems[item.ChunkID] = entry
		}
		entry.sparseRank = rankVal
		entry.sparseScore = item.SparseScore
		entry.rrfScore += 1.0 / float64(k+rankVal)
	}

	// Convert map to slice
	results := []Candidate{}
	for _, item := range mapItems {
		c := item.candidate
		c.DenseRank = item.denseRank
		c.SparseRank = item.sparseRank
		c.DenseScore = math.Round(item.denseScore*10000) / 10000
		c.SparseScore = math.Round(item.sparseScore*10000) / 10000
		c.RRFScore = math.Round(item.rrfScore*100000) / 100000
		results = append(results, c)
	}

	// Sort descending by RRF score
	sort.Slice(results, func(i, j int) bool {
		if results[i].RRFScore == results[j].RRFScore {
			return results[i].ChunkID < results[j].ChunkID
		}
		return results[i].RRFScore > results[j].RRFScore
	})

	// Assign final ranks and limit to topK
	for i := range results {
		results[i].Rank = i + 1
	}

	if topK > 0 && len(results) > topK {
		results = results[:topK]
	}

	return results
}

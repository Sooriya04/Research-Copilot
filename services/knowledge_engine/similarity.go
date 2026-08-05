package main

import (
	"regexp"
	"sort"
	"strings"
)

type PaperSimilarity struct {
	PaperIndex int
	Score      float64
}

// Tokenize text for Jaccard similarity
func tokenize(text string) map[string]bool {
	tokens := make(map[string]bool)
	reg := regexp.MustCompile(`[a-zA-Z0-9]+`)
	matches := reg.FindAllString(strings.ToLower(text), -1)
	for _, m := range matches {
		if len(m) > 2 { // filter out very short terms
			tokens[m] = true
		}
	}
	return tokens
}

// Compute Jaccard Similarity between two sets of tokens
func jaccardSimilarity(a, b map[string]bool) float64 {
	intersection := 0
	for k := range a {
		if b[k] {
			intersection++
		}
	}
	union := len(a) + len(b) - intersection
	if union == 0 {
		return 0.0
	}
	return float64(intersection) / float64(union)
}

// Find top 5 similar papers
func findTop5Similar(papers []DBResearchPaper, currentIndex int) []int {
	currentPaper := papers[currentIndex]
	currentTokens := tokenize(currentPaper.Title + " " + currentPaper.Abstract)

	var sims []PaperSimilarity
	for i, p := range papers {
		if i == currentIndex {
			continue
		}
		otherTokens := tokenize(p.Title + " " + p.Abstract)
		score := jaccardSimilarity(currentTokens, otherTokens)
		sims = append(sims, PaperSimilarity{PaperIndex: i, Score: score})
	}

	// Sort by score desc
	sort.Slice(sims, func(i, j int) bool {
		return sims[i].Score > sims[j].Score
	})

	limit := 5
	if len(sims) < limit {
		limit = len(sims)
	}

	var indices []int
	for i := 0; i < limit; i++ {
		indices = append(indices, sims[i].PaperIndex)
	}
	return indices
}

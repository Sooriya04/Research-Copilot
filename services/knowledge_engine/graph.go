package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func mapGeminiEdgeType(relType string) EdgeType {
	switch strings.ToUpper(relType) {
	case "EXTENDS":
		return EdgeImports
	case "COMPARES_WITH":
		return EdgeRelated
	case "IMPROVES":
		return EdgeImplements
	case "USES_SIMILAR_METHOD":
		return EdgeSimilarTo
	case "USES_SAME_DATASET":
		return EdgeExemplifies
	case "RELATED_TOPIC":
		return EdgeRelated
	case "SURVEY_OF":
		return EdgeDocuments
	case "BENCHMARKS":
		return EdgeExemplifies
	case "INSPIRED_BY":
		return EdgeRelated
	case "ALTERNATIVE_METHOD":
		return EdgeSimilarTo
	default:
		return EdgeRelated
	}
}

func buildGraph(requestID string) (*KnowledgeGraph, error) {
	query, err := getSearchSessionQuery(requestID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch search session: %w", err)
	}

	papers, err := getResearchPapers(requestID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch papers: %w", err)
	}

	var nodes []GraphNode
	var edges []GraphEdge

	// 1. Topic Node
	topicID := "topic_" + requestID
	nodes = append(nodes, GraphNode{
		ID:         topicID,
		Type:       NodeTopic,
		Name:       query,
		Summary:    fmt.Sprintf("Primary search topic for request session '%s'", query),
		Tags:       []string{"Search Topic", "Root"},
		Complexity: "simple",
	})

	// Helper maps to merge duplicates
	frameworksMap := make(map[string]bool)
	reposMap := make(map[string]bool)

	// Keep track of which node IDs belong to which categories for layers grouping
	paperNodeIDs := []string{}
	authorNodeIDs := []string{}
	resourceNodeIDs := []string{}
	conceptualNodeIDs := []string{}

	paperNodeIDs = append(paperNodeIDs, topicID)

	for _, p := range papers {
		paperNodeID := "paper_" + p.ID
		paperNodeIDs = append(paperNodeIDs, paperNodeID)

		// 2. Article Node
		summary := strings.TrimSpace(p.Abstract)
		if pdfSum, err := getPDFSummary(p.ExternalID); err == nil && pdfSum != "" {
			summary = pdfSum
		}
		if summary == "" {
			// Query Gemini to generate a brief summary based on the paper's title
			generatedSummary, err := generateSummaryFromTitle(p.Title)
			if err == nil && generatedSummary != "" {
				summary = generatedSummary
			} else {
				summary = fmt.Sprintf("Academic publication titled '%s'. Source: %s.", p.Title, p.Source)
				if p.CitationCount > 0 {
					summary += fmt.Sprintf(" This paper has been cited %d times.", p.CitationCount)
				}
			}
		}

		nodes = append(nodes, GraphNode{
			ID:         paperNodeID,
			Type:       NodeArticle,
			Name:       p.Title,
			Summary:    summary,
			Tags:       []string{p.Source, fmt.Sprintf("Citations: %d", p.CitationCount)},
			Complexity: "moderate",
		})

		// Paper ABOUT Topic Edge
		edges = append(edges, GraphEdge{
			Source:    paperNodeID,
			Target:    topicID,
			Type:      EdgeCategorizedUnder,
			Direction: "forward",
			Weight:    1.0,
		})

		// 3. Code Repositories only — authors/tasks/datasets removed (too noisy in visualizer)
		repoURL := strings.TrimSpace(p.CodeRepository)
		if repoURL != "" {
			repoID := "repo_" + strings.ReplaceAll(strings.ReplaceAll(strings.ToLower(repoURL), "https://", ""), "/", "_")
			if !reposMap[repoID] {
				reposMap[repoID] = true
				nodes = append(nodes, GraphNode{
					ID:         repoID,
					Type:       NodeResource,
					Name:       repoURL,
					Summary:    fmt.Sprintf("Official open-source code repository for: %s", p.Title),
					Tags:       []string{"Repository", "Code"},
					Complexity: "moderate",
				})
				resourceNodeIDs = append(resourceNodeIDs, repoID)
			}
			edges = append(edges, GraphEdge{
				Source:    paperNodeID,
				Target:    repoID,
				Type:      EdgeReadsFrom,
				Direction: "forward",
				Weight:    1.0,
			})
		}

		// 4. Frameworks (only well-known ML tools — skip empty)
		var frameworksList []string
		_ = json.Unmarshal([]byte(p.Frameworks), &frameworksList)
		for _, fwork := range frameworksList {
			fworkName := strings.TrimSpace(fwork)
			if fworkName == "" {
				continue
			}
			fworkID := "framework_" + strings.ReplaceAll(strings.ToLower(fworkName), " ", "_")
			if !frameworksMap[fworkID] {
				frameworksMap[fworkID] = true
				nodes = append(nodes, GraphNode{
					ID:         fworkID,
					Type:       NodeConcept,
					Name:       fworkName,
					Summary:    fmt.Sprintf("ML framework or library used in this research: %s", fworkName),
					Tags:       []string{"Framework"},
					Complexity: "simple",
				})
				conceptualNodeIDs = append(conceptualNodeIDs, fworkID)
			}
			edges = append(edges, GraphEdge{
				Source:    paperNodeID,
				Target:    fworkID,
				Type:      EdgeImplements,
				Direction: "forward",
				Weight:    1.0,
			})
		}
	}

	// 9. Semantic Edges using Gemini API config configuration
	// For each paper, find only top 5 similar candidates and query Gemini
	log.Printf("[GRAPH] Starting Gemini Semantic Edge extraction across %d papers...", len(papers))
	for idx, p1 := range papers {
		p1NodeID := "paper_" + p1.ID
		similarIndices := findTop5Similar(papers, idx)
		for _, otherIdx := range similarIndices {
			p2 := papers[otherIdx]
			p2NodeID := "paper_" + p2.ID

			// Avoid duplicate query pairs (i.e. only query once)
			if idx > otherIdx {
				continue
			}

			// Only query Gemini if there is some textual overlap (Jaccard similarity > 0.02)
			currentTokens := tokenize(p1.Title + " " + p1.Abstract)
			otherTokens := tokenize(p2.Title + " " + p2.Abstract)
			score := jaccardSimilarity(currentTokens, otherTokens)
			if score <= 0.02 {
				continue
			}

			// Sleep to respect Gemini API rate limits (5 requests per minute free tier limit)
			log.Printf("[GRAPH] Querying Gemini for relationship between '%s' and '%s' (Jaccard score: %.3f)...", p1.Title, p2.Title, score)
			time.Sleep(12 * time.Second)

			rels := getGeminiRelationships(p1, p2)
			if len(rels) == 0 {
				edges = append(edges, GraphEdge{
					Source:      p1NodeID,
					Target:      p2NodeID,
					Type:        EdgeSimilarTo,
					Direction:   "forward",
					Description: fmt.Sprintf("High content similarity based on word overlap analysis (Jaccard: %.2f)", score),
					Weight:      score,
				})
			} else {
				for _, r := range rels {
					if strings.ToUpper(r.EdgeType) == "NONE" || r.EdgeType == "" {
						continue
					}

					weight := r.Confidence
					if weight == 0 {
						weight = 0.5
					}

					edges = append(edges, GraphEdge{
						Source:      p1NodeID,
						Target:      p2NodeID,
						Type:        mapGeminiEdgeType(r.EdgeType),
						Direction:   "forward",
						Description: fmt.Sprintf("%s (Confidence: %.2f)", r.Reason, r.Confidence),
						Weight:      weight,
					})
				}
			}
		}
	}

	// Deduplicate nodes by ID to prevent duplicate key violations in PostgreSQL
	var deduplicatedNodes []GraphNode
	nodeIDsSeen := make(map[string]bool)
	for _, n := range nodes {
		if n.ID == "" {
			continue
		}
		if !nodeIDsSeen[n.ID] {
			nodeIDsSeen[n.ID] = true
			deduplicatedNodes = append(deduplicatedNodes, n)
		}
	}
	nodes = deduplicatedNodes

	// Persist generated nodes & edges to SQL
	err = saveGraphToDatabase(requestID, nodes, edges)
	if err != nil {
		log.Printf("[GRAPH] ⚠️ Failed to save graph to PostgreSQL: %v", err)
	} else {
		log.Printf("[GRAPH] ✅ Successfully persisted graph to database (%d nodes, %d edges).", len(nodes), len(edges))
	}

	// Export to .ua/knowledge-graph.json
	uaGraph := &KnowledgeGraph{
		Version: "1.0.0",
		Kind:    "knowledge",
		Project: ProjectMeta{
			Name:          "Research Copilot Search Graph",
			Languages:     []string{"Academic Literature", "SQL", "Go"},
			Frameworks:    []string{},
			Description:   fmt.Sprintf("Aggregated research session graph for query: '%s'", query),
			AnalyzedAt:    time.Now().Format(time.RFC3339),
			GitCommitHash: getGitCommitHash(),
		},
		Nodes: nodes,
		Edges: edges,
		Layers: []Layer{
			{
				ID:          "papers_layer",
				Name:        "Publications",
				Description: "Scientific literature and topics",
				NodeIDs:     paperNodeIDs,
			},
			{
				ID:          "authors_layer",
				Name:        "Authors",
				Description: "Researchers and academic contributors",
				NodeIDs:     authorNodeIDs,
			},
			{
				ID:          "resources_layer",
				Name:        "Artifacts",
				Description: "Code repositories and dataset nodes",
				NodeIDs:     resourceNodeIDs,
			},
			{
				ID:          "conceptual_layer",
				Name:        "Concepts",
				Description: "Extracted ML frameworks and research tasks",
				NodeIDs:     conceptualNodeIDs,
			},
		},
		Tour: []TourStep{
			{
				Order:       1,
				Title:       "Research Overview",
				Description: fmt.Sprintf("Explore the papers returned for query '%s'", query),
				NodeIDs:     paperNodeIDs,
			},
		},
	}

	err = exportGraphToFile(uaGraph)
	if err != nil {
		return nil, fmt.Errorf("failed to export graph file: %w", err)
	}

	return uaGraph, nil
}

func exportGraphToFile(g *KnowledgeGraph) error {
	dirPath := ".ua"
	if err := os.MkdirAll(dirPath, 0755); err != nil {
		return err
	}

	filePath := filepath.Join(dirPath, "knowledge-graph.json")
	file, err := os.Create(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(g); err != nil {
		return err
	}

	// Also write meta.json if expected by Understand-Anything
	metaPath := filepath.Join(dirPath, "meta.json")
	metaFile, err := os.Create(metaPath)
	if err != nil {
		return err
	}
	defer metaFile.Close()

	metaData := map[string]interface{}{
		"lastAnalyzedAt": time.Now().Format(time.RFC3339),
		"version":        "1.0.0",
		"analyzedFiles":  len(g.Nodes),
	}
	return json.NewEncoder(metaFile).Encode(metaData)
}

func getGitCommitHash() string {
	cmd := exec.Command("git", "rev-parse", "HEAD")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return "unknown"
	}
	return strings.TrimSpace(out.String())
}

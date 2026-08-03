package main

import (
	"fmt"
	"strings"
)

// BuildKnowledgeGraph constructs a Knowledge Graph from paper inputs
func BuildKnowledgeGraph(query string, papers []PaperInput) KnowledgeGraph {
	nodeMap := make(map[string]GraphNode)
	edgeMap := make(map[string]GraphEdge)

	// Add central Query/Topic node
	if query != "" {
		topicID := "topic:" + strings.ToLower(strings.ReplaceAll(query, " ", "_"))
		nodeMap[topicID] = GraphNode{
			ID:    topicID,
			Label: query,
			Type:  "topic",
			Attributes: map[string]interface{}{
				"category": "search_query",
			},
		}
	}

	for i, paper := range papers {
		paperID := paper.ID
		if paperID == "" {
			paperID = fmt.Sprintf("paper_%d", i+1)
		}

		// 1. Add Paper node
		nodeMap[paperID] = GraphNode{
			ID:    paperID,
			Label: paper.Title,
			Type:  "paper",
			Attributes: map[string]interface{}{
				"source":         paper.Source,
				"abstract":       paper.Abstract,
				"citation_count": paper.Citation,
			},
		}

		// Connect Paper to search query Topic
		if query != "" {
			topicID := "topic:" + strings.ToLower(strings.ReplaceAll(query, " ", "_"))
			edgeID := fmt.Sprintf("%s-HAS_TOPIC-%s", paperID, topicID)
			edgeMap[edgeID] = GraphEdge{
				ID:       edgeID,
				SourceID: paperID,
				TargetID: topicID,
				Relation: "HAS_TOPIC",
			}
		}

		// 2. Add Author nodes & WRITTEN_BY edges
		for _, author := range paper.Authors {
			authorClean := strings.TrimSpace(author)
			if authorClean == "" {
				continue
			}
			authorID := "author:" + strings.ToLower(strings.ReplaceAll(authorClean, " ", "_"))
			if _, exists := nodeMap[authorID]; !exists {
				nodeMap[authorID] = GraphNode{
					ID:         authorID,
					Label:      authorClean,
					Type:       "author",
					Attributes: map[string]interface{}{},
				}
			}
			edgeID := fmt.Sprintf("%s-WRITTEN_BY-%s", paperID, authorID)
			edgeMap[edgeID] = GraphEdge{
				ID:       edgeID,
				SourceID: paperID,
				TargetID: authorID,
				Relation: "WRITTEN_BY",
			}
		}

		// 3. Add Dataset nodes & USES_DATASET edges
		for _, ds := range paper.Datasets {
			dsClean := strings.TrimSpace(ds)
			if dsClean == "" {
				continue
			}
			dsID := "dataset:" + strings.ToLower(strings.ReplaceAll(dsClean, " ", "_"))
			if _, exists := nodeMap[dsID]; !exists {
				nodeMap[dsID] = GraphNode{
					ID:         dsID,
					Label:      dsClean,
					Type:       "dataset",
					Attributes: map[string]interface{}{},
				}
			}
			edgeID := fmt.Sprintf("%s-USES_DATASET-%s", paperID, dsID)
			edgeMap[edgeID] = GraphEdge{
				ID:       edgeID,
				SourceID: paperID,
				TargetID: dsID,
				Relation: "USES_DATASET",
			}
		}

		// 4. Add Model nodes & USES_MODEL edges
		for _, m := range paper.Models {
			mClean := strings.TrimSpace(m)
			if mClean == "" {
				continue
			}
			mID := "model:" + strings.ToLower(strings.ReplaceAll(mClean, " ", "_"))
			if _, exists := nodeMap[mID]; !exists {
				nodeMap[mID] = GraphNode{
					ID:         mID,
					Label:      mClean,
					Type:       "model",
					Attributes: map[string]interface{}{},
				}
			}
			edgeID := fmt.Sprintf("%s-USES_MODEL-%s", paperID, mID)
			edgeMap[edgeID] = GraphEdge{
				ID:       edgeID,
				SourceID: paperID,
				TargetID: mID,
				Relation: "USES_MODEL",
			}
		}
	}

	nodes := make([]GraphNode, 0, len(nodeMap))
	for _, n := range nodeMap {
		nodes = append(nodes, n)
	}

	edges := make([]GraphEdge, 0, len(edgeMap))
	for _, e := range edgeMap {
		edges = append(edges, e)
	}

	return KnowledgeGraph{
		Nodes: nodes,
		Edges: edges,
	}
}

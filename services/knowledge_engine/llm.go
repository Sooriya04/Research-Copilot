package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

type GeminiRelationship struct {
	EdgeType   string  `json:"edge_type"`
	Confidence float64 `json:"confidence"`
	Reason     string  `json:"reason"`
}

type GeminiResponse struct {
	Relationships []GeminiRelationship `json:"relationships"`
}

// Call LLM to extract semantic relationships
func getGeminiRelationships(p1, p2 DBResearchPaper) []GeminiRelationship {
	prompt := fmt.Sprintf(`You are an expert research graph construction system.
Determine semantic relationships between these two papers.

Paper 1:
- Title: %s
- Abstract: %s
- Tasks: %s
- Frameworks: %s
- Benchmarks: %s
- Repository: %s

Paper 2:
- Title: %s
- Abstract: %s
- Tasks: %s
- Frameworks: %s
- Benchmarks: %s
- Repository: %s

Infer relationships:
EXTENDS
COMPARES_WITH
IMPROVES
USES_SIMILAR_METHOD
USES_SAME_DATASET
RELATED_TOPIC
SURVEY_OF
BENCHMARKS
INSPIRED_BY
ALTERNATIVE_METHOD

If there is no relationship return NONE.
Return ONLY JSON.

{
    "relationships":[
        {
            "edge_type":"",
            "confidence":0.0,
            "reason":""
        }
    ]
}`,
		p1.Title, p1.Abstract, p1.Tasks, p1.Frameworks, p1.Benchmarks, p1.CodeRepository,
		p2.Title, p2.Abstract, p2.Tasks, p2.Frameworks, p2.Benchmarks, p2.CodeRepository,
	)

	jsonText, err := queryLLM(prompt, true)
	if err != nil {
		log.Printf("[LLM] Failed to query relationships: %v", err)
		return nil
	}

	var geminiResp GeminiResponse
	if err := json.Unmarshal([]byte(jsonText), &geminiResp); err != nil {
		log.Printf("[LLM] Failed to parse response JSON: %v. Raw: %s", err, jsonText)
		return nil
	}

	return geminiResp.Relationships
}

func generateSummaryFromTitle(title string) (string, error) {
	prompt := fmt.Sprintf("Write a brief 2-3 sentence overview of what a research paper titled '%s' is about. Do not include introductory text, go straight to the description.", title)
	return queryLLM(prompt, false)
}

func queryLLM(prompt string, forceJSON bool) (string, error) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("no GEMINI_API_KEY set")
	}

	reqPayload := map[string]interface{}{
		"contents": []interface{}{
			map[string]interface{}{
				"parts": []interface{}{
					map[string]interface{}{
						"text": prompt,
					},
				},
			},
		},
	}
	if forceJSON {
		reqPayload["generationConfig"] = map[string]interface{}{
			"responseMimeType": "application/json",
		}
	}

	reqBytes, _ := json.Marshal(reqPayload)
	apiURL := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=%s", apiKey)

	req, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(reqBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("gemini error (%d): %s", resp.StatusCode, string(body))
	}

	var geminiResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&geminiResp); err != nil {
		return "", err
	}

	if len(geminiResp.Candidates) > 0 && len(geminiResp.Candidates[0].Content.Parts) > 0 {
		return strings.TrimSpace(geminiResp.Candidates[0].Content.Parts[0].Text), nil
	}
	return "", fmt.Errorf("empty gemini candidate response")
}

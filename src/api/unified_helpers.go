package api

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"strings"
)

func safeString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func uniqueStrings(slice []string) []string {
	keys := make(map[string]bool)
	var list []string
	for _, entry := range slice {
		clean := strings.TrimSpace(entry)
		if clean != "" && !keys[clean] {
			keys[clean] = true
			list = append(list, clean)
		}
	}
	return list
}

func normalizeTitle(title string) string {
	title = strings.ToLower(title)
	var sb strings.Builder
	for _, r := range title {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r > 127 {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

func computeSHA256(data string) string {
	h := sha256.New()
	h.Write([]byte(data))
	return hex.EncodeToString(h.Sum(nil))
}

func mergeBenchmarks(b1, b2 []map[string]string) []map[string]string {
	merged := append([]map[string]string{}, b1...)
	for _, m2 := range b2 {
		found := false
		for _, m1 := range merged {
			if m1["dataset"] == m2["dataset"] && m1["metric"] == m2["metric"] {
				found = true
				break
			}
		}
		if !found {
			merged = append(merged, m2)
		}
	}
	return merged
}

func mergeHyperparameters(h1, h2 map[string]interface{}) map[string]interface{} {
	merged := make(map[string]interface{})
	for k, v := range h1 {
		merged[k] = v
	}
	for k, v := range h2 {
		if _, exists := merged[k]; !exists {
			merged[k] = v
		}
	}
	return merged
}

func extractHyperparameters(texts ...string) map[string]interface{} {
	params := make(map[string]interface{})
	lrRegex := regexp.MustCompile(`(?i)(?:learning rate|lr)[\s=:]+([0-9\.\-e]+)`)
	bsRegex := regexp.MustCompile(`(?i)(?:batch size|bs)[\s=:]+(\d+)`)
	epRegex := regexp.MustCompile(`(?i)(?:epochs?|iterations?)[\s=:]+(\d+)`)

	for _, text := range texts {
		if match := lrRegex.FindStringSubmatch(text); len(match) > 1 {
			params["learning_rate"] = match[1]
		}
		if match := bsRegex.FindStringSubmatch(text); len(match) > 1 {
			params["batch_size"] = match[1]
		}
		if match := epRegex.FindStringSubmatch(text); len(match) > 1 {
			params["epochs"] = match[1]
		}
	}
	return params
}

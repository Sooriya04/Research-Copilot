package core

import (
	"regexp"
	"strings"
)

var githubRegex = regexp.MustCompile(`https?://(?:www\.)?github\.com/[a-zA-Z0-9\-_\.]+/[a-zA-Z0-9\-_\.]+`)
var gitlabRegex = regexp.MustCompile(`https?://(?:www\.)?gitlab\.com/[a-zA-Z0-9\-_\.]+/[a-zA-Z0-9\-_\.]+`)

// ExtractGitHubURL searches string tokens for GitHub or GitLab repository URLs.
func ExtractGitHubURL(texts ...string) string {
	for _, text := range texts {
		if match := githubRegex.FindString(text); match != "" {
			// Strip trailing punctuation if matched
			return strings.TrimRight(match, ".,);\"'")
		}
		if match := gitlabRegex.FindString(text); match != "" {
			return strings.TrimRight(match, ".,);\"'")
		}
	}
	return ""
}

// ExtractFrameworks searches string tokens for deep learning framework keywords.
func ExtractFrameworks(texts ...string) []string {
	frameworkMap := make(map[string]bool)
	var frameworks []string

	keywords := map[string]string{
		"pytorch":    "PyTorch",
		"torch":      "PyTorch",
		"tensorflow": "TensorFlow",
		"keras":      "Keras",
		"jax":        "Jax",
		"flax":       "Flax",
		"mxnet":      "MXNet",
		"caffe":      "Caffe",
	}

	for _, text := range texts {
		lowerText := strings.ToLower(text)
		for kw, name := range keywords {
			if strings.Contains(lowerText, kw) && !frameworkMap[name] {
				frameworkMap[name] = true
				frameworks = append(frameworks, name)
			}
		}
	}

	if len(frameworks) == 0 {
		return []string{}
	}
	return frameworks
}

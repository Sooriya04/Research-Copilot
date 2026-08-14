package core

import (
	"math"
	"strings"
	"unicode"
)

type ValidationResult struct {
	Valid        bool               `json:"valid"`
	QualityScore float64            `json:"quality_score"`
	Reason       string             `json:"reason"`
	Metrics      map[string]float64 `json:"metrics"`
}

const (
	ReasonValid             = "VALID"
	ReasonNull              = "CONTENT_NULL"
	ReasonEmpty             = "CONTENT_EMPTY"
	ReasonTooShort          = "CONTENT_TOO_SHORT"
	ReasonCorrupted         = "CORRUPTED_TEXT"
	ReasonOCRGarbage        = "OCR_GARBAGE"
	ReasonLowQuality        = "LOW_QUALITY"
	ReasonWrongDocument     = "WRONG_DOCUMENT"
	ReasonPartialExtraction = "PARTIAL_EXTRACTION"
)

func ValidateContent(text string, expectedTitle string) ValidationResult {
	if text == "" {
		return ValidationResult{
			Valid:        false,
			QualityScore: 0.0,
			Reason:       ReasonEmpty,
			Metrics:      map[string]float64{"character_count": 0, "word_count": 0},
		}
	}

	charCount := float64(len(text))
	words := strings.Fields(text)
	wordCount := float64(len(words))

	if wordCount < 50 {
		return ValidationResult{
			Valid:        false,
			QualityScore: 0.1,
			Reason:       ReasonTooShort,
			Metrics:      map[string]float64{"character_count": charCount, "word_count": wordCount},
		}
	}

	alphaCount := 0.0
	garbageCount := 0.0
	for _, r := range text {
		if unicode.IsLetter(r) {
			alphaCount++
		} else if r == '\x00' || r == '\ufffd' || (!unicode.IsSpace(r) && !unicode.IsPunct(r) && !unicode.IsDigit(r) && !unicode.IsLetter(r)) {
			garbageCount++
		}
	}

	alphaRatio := alphaCount / charCount
	garbageRatio := garbageCount / charCount

	metrics := map[string]float64{
		"character_count":  charCount,
		"word_count":       wordCount,
		"alphabetic_ratio": alphaRatio,
		"garbage_ratio":    garbageRatio,
	}

	if garbageRatio > 0.05 {
		return ValidationResult{
			Valid:        false,
			QualityScore: math.Max(0, 1.0-(garbageRatio*10)),
			Reason:       ReasonOCRGarbage,
			Metrics:      metrics,
		}
	}

	if alphaRatio < 0.6 {
		return ValidationResult{
			Valid:        false,
			QualityScore: alphaRatio,
			Reason:       ReasonCorrupted,
			Metrics:      metrics,
		}
	}

	// Basic title check if expectedTitle is provided
	if expectedTitle != "" {
		lowerText := strings.ToLower(text)
		lowerTitle := strings.ToLower(expectedTitle)
		// Check if at least some words from the title are in the first 2000 chars
		titleWords := strings.Fields(lowerTitle)
		matchedWords := 0
		checkLen := 2000
		if len(lowerText) < checkLen {
			checkLen = len(lowerText)
		}
		prefix := lowerText[:checkLen]
		
		for _, w := range titleWords {
			if len(w) > 3 && strings.Contains(prefix, w) {
				matchedWords++
			}
		}
		
		titleMatchRatio := 1.0
		if len(titleWords) > 0 {
			titleMatchRatio = float64(matchedWords) / float64(len(titleWords))
		}

		metrics["title_match_ratio"] = titleMatchRatio

		if titleMatchRatio < 0.2 { // Extremely low match
			return ValidationResult{
				Valid:        false,
				QualityScore: 0.2,
				Reason:       ReasonWrongDocument,
				Metrics:      metrics,
			}
		}
	}

	// Calculate a basic quality score (0.0 to 1.0)
	score := alphaRatio * 0.9 // Base score on alpha ratio
	if wordCount > 2000 {
		score += 0.1 // Bonus for length
	}
	if score > 1.0 {
		score = 1.0
	}

	reason := ReasonValid
	if score < 0.5 {
		reason = ReasonLowQuality
		return ValidationResult{
			Valid:        false,
			QualityScore: score,
			Reason:       reason,
			Metrics:      metrics,
		}
	}

	return ValidationResult{
		Valid:        true,
		QualityScore: score,
		Reason:       reason,
		Metrics:      metrics,
	}
}

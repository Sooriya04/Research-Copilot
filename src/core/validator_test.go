package core

import (
	"testing"
)

func TestValidateContent(t *testing.T) {
	tests := []struct {
		name          string
		text          string
		expectedTitle string
		wantValid     bool
		wantReason    string
	}{
		{
			name:          "Empty Text",
			text:          "",
			expectedTitle: "",
			wantValid:     false,
			wantReason:    ReasonEmpty,
		},
		{
			name:          "Too Short",
			text:          "This is just a few words, not enough for a paper.",
			expectedTitle: "",
			wantValid:     false,
			wantReason:    ReasonTooShort,
		},
		{
			name:          "OCR Garbage",
			text:          "Valid text to start. \n\n   #$@@!#^&*",
			expectedTitle: "",
			wantValid:     false,
			wantReason:    ReasonTooShort, // Because word count < 50
		},
		{
			name:          "Valid Text",
			text:          "This is a perfectly valid mock extracted text for a research paper. It contains a lot of words to ensure it passes the word count check. The alphabetic ratio is high and garbage characters are non-existent. " +
							"Audio deepfake detection is an emerging field of research, designed to identify synthetically generated speech. The study explores new deep learning paradigms for detecting manipulated audio streams in real time. We introduce a novel benchmark dataset for evaluating these systems.",
			expectedTitle: "Audio Deepfake Detection",
			wantValid:     true,
			wantReason:    ReasonValid,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ValidateContent(tt.text, tt.expectedTitle)
			if got.Valid != tt.wantValid {
				t.Errorf("ValidateContent() Valid = %v, want %v", got.Valid, tt.wantValid)
			}
			if got.Reason != tt.wantReason {
				t.Errorf("ValidateContent() Reason = %v, want %v", got.Reason, tt.wantReason)
			}
		})
	}
}

package huggingface

import (
	"time"
)

type HFAuthor struct {
	Name string `json:"name"`
}

type HFSubmittedBy struct {
	Fullname string `json:"fullname"`
	User     string `json:"user"`
}

type HFPaperAPI struct {
	ID                 string        `json:"id"`
	Title              string        `json:"title"`
	Summary            string        `json:"summary"`
	PublishedAt        string        `json:"publishedAt"`
	SubmittedOnDailyAt string        `json:"submittedOnDailyAt"`
	SubmittedOnDailyBy HFSubmittedBy `json:"submittedOnDailyBy"`
	Upvotes            int           `json:"upvotes"`
	DiscussionID       string        `json:"discussionId"`
	GithubRepo         *string       `json:"githubRepo"`
	GithubStars        *int          `json:"githubStars"`
	Authors            []HFAuthor    `json:"authors"`
}

type HFResponseItem struct {
	Paper HFPaperAPI `json:"paper"`
}

type HFPaper struct {
	PaperID            string     `json:"paper_id"`
	Title              string     `json:"title"`
	Summary            string     `json:"summary"`
	AISummary          *string    `json:"ai_summary"`
	PublishedAt        *time.Time `json:"published_at"`
	SubmittedOnDailyAt *time.Time `json:"submitted_on_daily_at"`
	SubmittedBy        *string    `json:"submitted_by"`
	Upvotes            int        `json:"upvotes"`
	DiscussionID       *string    `json:"discussion_id"`
	GithubRepo         *string    `json:"github_repo"`
	GithubStars        *int       `json:"github_stars"`
	URL                string     `json:"url"`
	Authors            []string   `json:"authors"`
}

type HFSearchResult struct {
	Date          string    `json:"date"`
	ReturnedCount int       `json:"returned_count"`
	Papers        []HFPaper `json:"papers"`
}

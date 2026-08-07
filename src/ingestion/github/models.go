package github

type GithubOwner struct {
	Login string `json:"login"`
}

type GithubRepo struct {
	ID              int         `json:"id"`
	FullName        string      `json:"full_name"`
	HTMLURL         string      `json:"html_url"`
	Description     string      `json:"description"`
	StargazersCount int         `json:"stargazers_count"`
	Language        string      `json:"language"`
	Topics          []string    `json:"topics"`
	Owner           GithubOwner `json:"owner"`
}

type GithubSearchResponse struct {
	TotalCount        int          `json:"total_count"`
	IncompleteResults bool         `json:"incomplete_results"`
	Items             []GithubRepo `json:"items"`
}

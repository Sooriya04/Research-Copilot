package kaggle

type KaggleTagAPI struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	FullPath    string `json:"fullPath"`
}

type KaggleDatasetAPI struct {
	Ref             string          `json:"ref"`
	Title           string          `json:"title"`
	Subtitle        string          `json:"subtitle"`
	CreatorName     string          `json:"creatorName"`
	CreatorUrl      string          `json:"creatorUrl"`
	TotalBytes      *int64          `json:"totalBytes"`
	URL             string          `json:"url"`
	DownloadCount   int             `json:"downloadCount"`
	VoteCount       int             `json:"voteCount"`
	UsabilityRating float64         `json:"usabilityRating"`
	LicenseName     string          `json:"licenseName"`
	Tags            []KaggleTagAPI  `json:"tags"`
}

type KaggleModelAPI struct {
	Ref         string         `json:"ref"`
	Title       string         `json:"title"`
	Subtitle    string         `json:"subtitle"`
	OwnerName   string         `json:"ownerName"`
	OwnerRef    string         `json:"ownerRef"`
	Framework   string         `json:"framework"`
	FineTunable bool           `json:"fineTunable"`
	VoteCount   int            `json:"voteCount"`
	URL         string         `json:"url"`
	Tags        []KaggleTagAPI `json:"tags"`
}

type KaggleModelWrapperAPI struct {
	Ref       string         `json:"ref"`
	Title     string         `json:"title"`
	Subtitle  string         `json:"subtitle"`
	VoteCount int            `json:"voteCount"`
	URL       string         `json:"url"`
	Tags      []KaggleTagAPI `json:"tags"`
	Instances []struct {
		Framework   string `json:"framework"`
		FineTunable bool   `json:"fineTunable"`
	} `json:"instances"`
}

type KaggleSearchResult struct {
	Query         string             `json:"query"`
	ReturnedCount int                `json:"returned_count"`
	Datasets      []KaggleDatasetAPI `json:"datasets,omitempty"`
	Models        []KaggleModelAPI   `json:"models,omitempty"`
}

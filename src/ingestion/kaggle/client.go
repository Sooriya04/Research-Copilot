package kaggle

import (
	"net/http"
	"os"
	"time"
)

type KaggleClient struct {
	BaseURL    string
	APIToken   string
	Timeout    time.Duration
	HTTPClient *http.Client
}

func NewKaggleClient() *KaggleClient {
	apiToken := os.Getenv("KAGGLE_API_TOKEN")
	return &KaggleClient{
		BaseURL:  "https://www.kaggle.com/api/v1",
		APIToken: apiToken,
		Timeout:  20 * time.Second,
		HTTPClient: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

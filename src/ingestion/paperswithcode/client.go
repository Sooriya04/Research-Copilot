package paperswithcode

import (
	"net/http"
	"time"
)

type PWCClient struct {
	BaseURL    string
	Timeout    time.Duration
	HTTPClient *http.Client
}

func NewPWCClient() *PWCClient {
	return &PWCClient{
		BaseURL: "https://paperswithcode.com/api/v1",
		Timeout: 15 * time.Second,
		HTTPClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var (
	pdfMetaRegex = regexp.MustCompile(`(?i)<meta\s+name=["'](?:citation_pdf_url|bepress_citation_pdf_url|pdf_url)["']\s+content=["']([^"']+)["']`)
	pdfLinkRegex = regexp.MustCompile(`(?i)href=["']([^"']+\.pdf(?:\?[^"']*)?)["']`)
)

func normalizeTargetURL(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if strings.Contains(rawURL, "arxiv.org/abs/") {
		rawURL = strings.ReplaceAll(rawURL, "arxiv.org/abs/", "arxiv.org/pdf/")
		if !strings.HasSuffix(rawURL, ".pdf") {
			rawURL += ".pdf"
		}
	} else if strings.Contains(rawURL, "arxiv.org/html/") {
		rawURL = strings.ReplaceAll(rawURL, "arxiv.org/html/", "arxiv.org/pdf/")
		if !strings.HasSuffix(rawURL, ".pdf") {
			rawURL += ".pdf"
		}
	}
	return rawURL
}

func fetchPDFWithClient(client *http.Client, targetURL string) (*http.Response, error) {
	targetURL = normalizeTargetURL(targetURL)

	httpReq, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
	httpReq.Header.Set("Accept", "application/pdf,application/xhtml+xml,text/html;q=0.9,*/*;q=0.8")
	httpReq.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	return resp, nil
}

func lookupUnpaywallPDF(client *http.Client, doi string) (string, error) {
	doi = strings.TrimPrefix(doi, "https://doi.org/")
	doi = strings.TrimPrefix(doi, "http://doi.org/")

	unpaywallURL := fmt.Sprintf("https://api.unpaywall.org/v2/%s?email=unpaywall@researchcopilot.org", url.PathEscape(doi))
	resp, err := fetchPDFWithClient(client, unpaywallURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Unpaywall returned status %d", resp.StatusCode)
	}

	var data struct {
		BestOALocation *struct {
			URLForPDF string `json:"url_for_pdf"`
		} `json:"best_oa_location"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", err
	}

	if data.BestOALocation != nil && data.BestOALocation.URLForPDF != "" {
		return data.BestOALocation.URLForPDF, nil
	}
	return "", fmt.Errorf("no open access PDF URL found in Unpaywall")
}

func handleDownload(req *DownloadRequest) (*DownloadResponse, error) {
	if req.ID == "" || req.PDFURL == "" {
		return nil, fmt.Errorf("missing required fields 'id' or 'pdf_url'")
	}

	tmpDir := os.TempDir()
	localPath := filepath.Join(tmpDir, fmt.Sprintf("%s.pdf", req.ID))

	client := &http.Client{
		Timeout: 60 * time.Second,
		CheckRedirect: func(r *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("too many redirects")
			}
			r.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
			return nil
		},
	}

	targetURL := normalizeTargetURL(req.PDFURL)
	resp, err := fetchPDFWithClient(client, targetURL)
	if err != nil {
		return nil, fmt.Errorf("failed to execute download request: %w", err)
	}

	// Handle DOI redirect landing pages
	if strings.Contains(targetURL, "doi.org/") {
		if oaPDF, oaErr := lookupUnpaywallPDF(client, targetURL); oaErr == nil && oaPDF != "" {
			resp.Body.Close()
			targetURL = oaPDF
			resp, err = fetchPDFWithClient(client, targetURL)
			if err != nil {
				return nil, fmt.Errorf("failed to download open access PDF from Unpaywall: %w", err)
			}
		}
	}

	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("upstream server returned status %d", resp.StatusCode)
	}

	contentType := strings.ToLower(resp.Header.Get("Content-Type"))

	// If upstream server returned HTML landing page, parse for meta citation_pdf_url tag
	if strings.Contains(contentType, "text/html") {
		bodyBytes, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("failed to read HTML response: %w", err)
		}

		htmlStr := string(bodyBytes)
		var extractedPDFURL string

		if match := pdfMetaRegex.FindStringSubmatch(htmlStr); len(match) > 1 {
			extractedPDFURL = match[1]
		} else if match := pdfLinkRegex.FindStringSubmatch(htmlStr); len(match) > 1 {
			extractedPDFURL = match[1]
		}

		if extractedPDFURL != "" {
			// Resolve relative URLs if needed
			if strings.HasPrefix(extractedPDFURL, "/") {
				u, err := url.Parse(targetURL)
				if err == nil {
					extractedPDFURL = fmt.Sprintf("%s://%s%s", u.Scheme, u.Host, extractedPDFURL)
				}
			}
			resp, err = fetchPDFWithClient(client, extractedPDFURL)
			if err != nil || resp.StatusCode != http.StatusOK {
				if resp != nil {
					resp.Body.Close()
				}
				return nil, fmt.Errorf("upstream HTML landing page provided PDF link %s, but download failed", extractedPDFURL)
			}
		} else {
			return nil, fmt.Errorf("upstream server returned an HTML page without direct PDF citation meta tag")
		}
	}

	defer resp.Body.Close()

	out, err := os.Create(localPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create local file: %w", err)
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to write PDF body: %w", err)
	}

	return &DownloadResponse{
		ID:        req.ID,
		LocalPath: localPath,
	}, nil
}

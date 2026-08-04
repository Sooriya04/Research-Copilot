package arxiv

import (
	"context"
	"database/sql"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/lib/pq"
	"research_copilot/src/core"
)

var (
	lastRequestTime time.Time
	throttleMutex   sync.Mutex
)

const ThrottleDelay = 15 * time.Second

type AtomFeed struct {
	XMLName      xml.Name    `xml:"feed"`
	TotalResults int         `xml:"totalResults"`
	Entries      []AtomEntry `xml:"entry"`
}

type AtomEntry struct {
	ID              string          `xml:"id"`
	Title           string          `xml:"title"`
	Summary         string          `xml:"summary"`
	Published       string          `xml:"published"`
	Updated         string          `xml:"updated"`
	Authors         []AtomAuthor    `xml:"author"`
	PrimaryCategory PrimaryCategory `xml:"primary_category"`
	Categories      []Category      `xml:"category"`
	Links           []AtomLink      `xml:"link"`
	DOI             string          `xml:"doi"`
	JournalRef      string          `xml:"journal_ref"`
	Comment         string          `xml:"comment"`
}

type AtomAuthor struct {
	Name        string `xml:"name"`
	Affiliation string `xml:"affiliation"`
}

type PrimaryCategory struct {
	Term string `xml:"term,attr"`
}

type Category struct {
	Term string `xml:"term,attr"`
}

type AtomLink struct {
	Rel   string `xml:"rel,attr"`
	Type  string `xml:"type,attr"`
	Href  string `xml:"href,attr"`
	Title string `xml:"title,attr"`
}

func (c *ArxivClient) Search(ctx context.Context, query string, maxResults int, start int, sortBy, sortOrder string) (*ArxivSearchResult, error) {
	searchQueryStr := c.formatSearchQuery(query)
	params := url.Values{}
	params.Set("search_query", searchQueryStr)
	params.Set("start", fmt.Sprintf("%d", start))
	params.Set("max_results", fmt.Sprintf("%d", maxResults))
	params.Set("sortBy", sortBy)
	params.Set("sortOrder", sortOrder)

	// Record request timestamp (used to avoid hammering the API across back-to-back requests)
	throttleMutex.Lock()
	lastRequestTime = time.Now()
	throttleMutex.Unlock()

	var xmlData []byte
	var lastErr error

	client := &http.Client{Timeout: c.Timeout}

	for attempt := 1; attempt <= c.Retries; attempt++ {
		for _, baseURL := range c.BaseURLs {
			reqURL := fmt.Sprintf("%s?%s", baseURL, params.Encode())
			req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
			if err != nil {
				lastErr = err
				continue
			}
			req.Header.Set("User-Agent", "ArxivClient/1.0")

			resp, err := client.Do(req)
			if err != nil {
				lastErr = err
				time.Sleep(time.Duration(attempt) * 3 * time.Second)
				continue
			}
			defer resp.Body.Close()

			if resp.StatusCode == http.StatusOK {
				xmlData, err = io.ReadAll(resp.Body)
				if err == nil {
					break
				}
				lastErr = err
			} else if resp.StatusCode == http.StatusTooManyRequests {
				time.Sleep(time.Duration(attempt) * 3 * time.Second)
			}
		}
		if xmlData != nil {
			break
		}
	}

	if xmlData == nil {
		return nil, fmt.Errorf("failed to fetch from arXiv API after %d attempts: %v", c.Retries, lastErr)
	}

	var feed AtomFeed
	if err := xml.Unmarshal(xmlData, &feed); err != nil {
		return nil, fmt.Errorf("failed to parse Atom XML: %w", err)
	}

	var result ArxivSearchResult
	result.Query = query
	result.TotalResults = feed.TotalResults
	result.ReturnedCount = len(feed.Entries)

	if len(feed.Entries) == 0 {
		return &result, nil
	}

	// Map Atom Entries to ArxivPaper models
	var papers []ArxivPaper
	var paperIDs []string

	for _, entry := range feed.Entries {
		id := c.extractArxivID(entry.ID)
		paperIDs = append(paperIDs, id)

		var authors []Author
		for _, auth := range entry.Authors {
			name := c.cleanText(auth.Name)
			var aff *string
			if auth.Affiliation != "" {
				cleanAff := c.cleanText(auth.Affiliation)
				aff = &cleanAff
			}
			authors = append(authors, Author{Name: name, Affiliation: aff})
		}

		var categories []string
		for _, cat := range entry.Categories {
			categories = append(categories, cat.Term)
		}

		pdfURL := ""
		for _, link := range entry.Links {
			if link.Title == "pdf" || link.Type == "application/pdf" {
				pdfURL = link.Href
			}
		}
		if pdfURL == "" {
			pdfURL = fmt.Sprintf("https://arxiv.org/pdf/%s.pdf", id)
		}

		primaryCat := entry.PrimaryCategory.Term
		if primaryCat == "" && len(categories) > 0 {
			primaryCat = categories[0]
		}

		var doi *string
		if entry.DOI != "" {
			cleanDOI := c.cleanText(entry.DOI)
			doi = &cleanDOI
		}
		var journalRef *string
		if entry.JournalRef != "" {
			cleanRef := c.cleanText(entry.JournalRef)
			journalRef = &cleanRef
		}

		var commentPtr *string
		if entry.Comment != "" {
			cleanComment := c.cleanText(entry.Comment)
			commentPtr = &cleanComment
		}

		paper := ArxivPaper{
			ArxivID:         id,
			Title:           c.cleanText(entry.Title),
			Abstract:        c.cleanText(entry.Summary),
			Authors:         authors,
			PublishedDate:   entry.Published,
			PDFURL:          pdfURL,
			EntryID:         entry.ID,
			PrimaryCategory: primaryCat,
			Categories:      categories,
			DOI:             doi,
			JournalRef:      journalRef,
			Comment:         commentPtr,
		}
		if entry.Updated != "" {
			upDate := entry.Updated
			paper.UpdatedDate = &upDate
		}

		papers = append(papers, paper)
	}

	// 2. Batch check duplicate IDs in PostgreSQL
	existingPapers := make(map[string]*ArxivPaper)
	rows, err := core.DB.QueryContext(ctx, "SELECT paper_id, title, abstract, full_text FROM arxiv_papers WHERE paper_id = ANY($1);", pq.Array(paperIDs))
	if err != nil {
		return nil, fmt.Errorf("failed to query database cache: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var cachedID, title, abstract string
		var fullText sql.NullString
		if err := rows.Scan(&cachedID, &title, &abstract, &fullText); err != nil {
			continue
		}

		cachedPaper := &ArxivPaper{
			ArxivID:  cachedID,
			Title:    title,
			Abstract: abstract,
		}
		if fullText.Valid {
			cachedPaper.FullText = &fullText.String
		}
		existingPapers[cachedID] = cachedPaper
	}

	// Load cached paragraphs
	if len(existingPapers) > 0 {
		var cachedIDs []string
		for id := range existingPapers {
			cachedIDs = append(cachedIDs, id)
		}

		paraRows, err := core.DB.QueryContext(ctx, "SELECT paper_id, text FROM paper_paragraphs WHERE paper_id = ANY($1) ORDER BY paragraph_index;", pq.Array(cachedIDs))
		if err == nil {
			defer paraRows.Close()
			for paraRows.Next() {
				var pID, pText string
				if err := paraRows.Scan(&pID, &pText); err == nil {
					if paper, exists := existingPapers[pID]; exists {
						paper.Paragraphs = append(paper.Paragraphs, pText)
					}
				}
			}
		}
	}

	log.Printf("[DATABASE] Found %d/%d papers already cached in PostgreSQL database.", len(existingPapers), len(paperIDs))

	// 3. Identify missing papers
	var missingPapers []ArxivPaper
	for _, paper := range papers {
		if _, cached := existingPapers[paper.ArxivID]; !cached {
			missingPapers = append(missingPapers, paper)
		}
	}

	if len(missingPapers) > 0 {
		log.Printf("[INGESTION] Firing background ingestion for %d uncached papers (non-blocking)", len(missingPapers))

		// Use a detached context so goroutines survive HTTP request cancellation
		bgCtx := context.Background()

		go func(papersToIngest []ArxivPaper) {
			var wg sync.WaitGroup
			for _, paper := range papersToIngest {
				wg.Add(1)
				go func(p ArxivPaper) {
					defer wg.Done()
					c.ingestPaper(bgCtx, p)
				}(paper)
			}
			wg.Wait()
			log.Printf("[INGESTION] Background ingestion completed for %d papers.", len(papersToIngest))
		}(missingPapers)
	}

	// 4. Merge only already-cached results into response (return immediately)
	for i, paper := range papers {
		if cached, exists := existingPapers[paper.ArxivID]; exists {
			papers[i].FullText = cached.FullText
			papers[i].Paragraphs = cached.Paragraphs
		}
	}

	result.Papers = papers
	return &result, nil
}

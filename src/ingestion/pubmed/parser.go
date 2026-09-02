package pubmed

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// NCBI Entrez eSummary/eSearch XML Structs
type eSearchResult struct {
	XMLName xml.Name `xml:"eSearchResult"`
	Count   int      `xml:"Count"`
	IdList  []string `xml:"IdList>Id"`
}

type pubmedArticleSet struct {
	XMLName xml.Name        `xml:"PubmedArticleSet"`
	Articles []pubmedArticle `xml:"PubmedArticle"`
}

type pubmedArticle struct {
	MedlineCitation struct {
		PMID struct {
			Value string `xml:",chardata"`
		} `xml:"PMID"`
		Article struct {
			Journal struct {
				Title string `xml:"Title"`
				JournalIssue struct {
					PubDate struct {
						Year  string `xml:"Year"`
						Month string `xml:"Month"`
						Day   string `xml:"Day"`
					} `xml:"PubDate"`
				} `xml:"JournalIssue"`
			} `xml:"Journal"`
			ArticleTitle string `xml:"ArticleTitle"`
			Abstract     struct {
				AbstractText []struct {
					Value string `xml:",chardata"`
					Label string `xml:"Label,attr"`
				} `xml:"AbstractText"`
			} `xml:"Abstract"`
			AuthorList struct {
				Author []struct {
					LastName string `xml:"LastName"`
					ForeName string `xml:"ForeName"`
				} `xml:"Author"`
			} `xml:"AuthorList"`
		} `xml:"Article"`
	} `xml:"MedlineCitation"`
	PubmedData struct {
		ArticleIdList struct {
			ArticleId []struct {
				Value string `xml:",chardata"`
				Type  string `xml:"IdType,attr"`
			} `xml:"ArticleId"`
		} `xml:"ArticleIdList"`
	} `xml:"PubmedData"`
}

func (c *PubMedClient) Search(ctx context.Context, query string, topK int) (*PubMedSearchResult, error) {
	if query == "" {
		return nil, fmt.Errorf("empty search query")
	}

	// 1. Execute eSearch to get PMIDs
	params := url.Values{}
	params.Set("db", "pubmed")
	params.Set("term", query)
	params.Set("retmode", "xml")
	params.Set("retmax", fmt.Sprintf("%d", topK))
	if c.APIKey != "" {
		params.Set("api_key", c.APIKey)
	}

	searchURL := fmt.Sprintf("%s?%s", c.BaseSearchURL, params.Encode())
	req, err := http.NewRequestWithContext(ctx, "GET", searchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create eSearch request: %w", err)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("eSearch HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("eSearch returned status %d", resp.StatusCode)
	}

	var searchRes eSearchResult
	if err := xml.NewDecoder(resp.Body).Decode(&searchRes); err != nil {
		return nil, fmt.Errorf("failed to decode eSearch XML: %w", err)
	}

	if len(searchRes.IdList) == 0 {
		return &PubMedSearchResult{Query: query, TotalCount: 0, Papers: []PubMedPaper{}}, nil
	}

	// 2. Execute eFetch XML for detailed paper metadata
	fetchParams := url.Values{}
	fetchParams.Set("db", "pubmed")
	fetchParams.Set("id", strings.Join(searchRes.IdList, ","))
	fetchParams.Set("retmode", "xml")
	if c.APIKey != "" {
		fetchParams.Set("api_key", c.APIKey)
	}

	fetchURL := fmt.Sprintf("%s?%s", c.BaseFetchURL, fetchParams.Encode())
	reqFetch, err := http.NewRequestWithContext(ctx, "GET", fetchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create eFetch request: %w", err)
	}

	respFetch, err := c.HTTPClient.Do(reqFetch)
	if err != nil {
		return nil, fmt.Errorf("eFetch HTTP request failed: %w", err)
	}
	defer respFetch.Body.Close()

	if respFetch.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("eFetch returned status %d", respFetch.StatusCode)
	}

	var articleSet pubmedArticleSet
	if err := xml.NewDecoder(respFetch.Body).Decode(&articleSet); err != nil {
		return nil, fmt.Errorf("failed to decode eFetch XML: %w", err)
	}

	var papers []PubMedPaper
	for _, art := range articleSet.Articles {
		citation := art.MedlineCitation
		pmid := citation.PMID.Value
		if pmid == "" {
			continue
		}

		title := strings.TrimSpace(citation.Article.ArticleTitle)
		title = strings.TrimSuffix(title, ".")

		var abstractParts []string
		for _, ab := range citation.Article.Abstract.AbstractText {
			val := strings.TrimSpace(ab.Value)
			if val != "" {
				if ab.Label != "" {
					abstractParts = append(abstractParts, fmt.Sprintf("%s: %s", ab.Label, val))
				} else {
					abstractParts = append(abstractParts, val)
				}
			}
		}
		abstract := strings.Join(abstractParts, "\n\n")

		var authors []PubMedAuthor
		for _, a := range citation.Article.AuthorList.Author {
			last := strings.TrimSpace(a.LastName)
			fore := strings.TrimSpace(a.ForeName)
			full := strings.TrimSpace(fmt.Sprintf("%s %s", fore, last))
			if full != "" {
				authors = append(authors, PubMedAuthor{LastName: last, ForeName: fore, FullName: full})
			}
		}

		var doi, pmcid string
		for _, idItem := range art.PubmedData.ArticleIdList.ArticleId {
			if idItem.Type == "doi" {
				doi = strings.TrimSpace(idItem.Value)
			} else if idItem.Type == "pmc" {
				pmcid = strings.TrimSpace(idItem.Value)
			}
		}

		var doiPtr, pmcPtr *string
		if doi != "" {
			doiPtr = &doi
		}
		if pmcid != "" {
			pmcPtr = &pmcid
		}

		paperURL := fmt.Sprintf("https://pubmed.ncbi.nlm.nih.gov/%s/", pmid)
		var pdfURL *string
		isOpenAccess := false

		if pmcid != "" {
			pmcClean := strings.TrimPrefix(pmcid, "PMC")
			pURL := fmt.Sprintf("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC%s/pdf/", pmcClean)
			pdfURL = &pURL
			isOpenAccess = true
		}

		yearStr := citation.Article.Journal.JournalIssue.PubDate.Year
		var year int
		if yearStr != "" {
			fmt.Sscanf(yearStr, "%d", &year)
		}

		papers = append(papers, PubMedPaper{
			PaperID:      pmid,
			PMID:         pmid,
			PMCID:        pmcPtr,
			DOI:          doiPtr,
			Title:        title,
			Abstract:     abstract,
			Journal:      citation.Article.Journal.Title,
			Year:         year,
			PDFURL:       pdfURL,
			PaperURL:     &paperURL,
			IsOpenAccess: isOpenAccess,
			Authors:      authors,
		})
	}

	return &PubMedSearchResult{
		Query:      query,
		TotalCount: searchRes.Count,
		Papers:     papers,
	}, nil
}

// ConvertToJSON encodes article structs to JSON string
func ConvertToJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

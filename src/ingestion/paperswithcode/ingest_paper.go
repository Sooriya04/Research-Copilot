package paperswithcode

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"research_copilot/src/core"
)

func (c *PWCClient) ingestPWCPaper(ctx context.Context, details PWCPaperDetails) {
	p := details.Paper

	// Sanitize strings
	p.ID = strings.ReplaceAll(p.ID, "\x00", "")
	p.Title = strings.ReplaceAll(p.Title, "\x00", "")
	p.Abstract = strings.ReplaceAll(p.Abstract, "\x00", "")

	log.Printf("[INGESTION] [PWC:%s] Starting ingestion: '%s'", p.ID, p.Title)

	// Build tasks list from results if any
	var tasks []string
	taskMap := make(map[string]bool)
	for _, res := range details.Results {
		if res.Task != "" && !taskMap[res.Task] {
			taskMap[res.Task] = true
			tasks = append(tasks, res.Task)
		}
	}
	tasksJSON, _ := json.Marshal(tasks)

	// Step 1: Write to pwc_papers
	tx, err := core.DB.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("[INGESTION] [PWC:%s] Failed to start transaction: %v", p.ID, err)
		return
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO pwc_papers (paper_id, title, abstract, tasks, created_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (paper_id) DO UPDATE SET
			title = EXCLUDED.title,
			abstract = EXCLUDED.abstract,
			tasks = EXCLUDED.tasks;
	`, p.ID, p.Title, p.Abstract, string(tasksJSON))
	if err != nil {
		tx.Rollback()
		log.Printf("[INGESTION] [PWC:%s] Failed to write paper metadata: %v", p.ID, err)
		return
	}

	// Step 2: Write repositories
	repoStmt, err := tx.PrepareContext(ctx, `
		INSERT INTO pwc_repositories (repo_url, paper_id, framework, stars, is_official, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (repo_url) DO UPDATE SET
			framework = EXCLUDED.framework,
			stars = EXCLUDED.stars,
			is_official = EXCLUDED.is_official;
	`)
	if err == nil {
		defer repoStmt.Close()
		for _, repo := range details.Repositories {
			if repo.URL == "" {
				continue
			}
			cleanURL := strings.ReplaceAll(repo.URL, "\x00", "")
			_, _ = repoStmt.ExecContext(ctx, cleanURL, p.ID, repo.Framework, repo.Stars, repo.IsOfficial)
		}
	}

	// Step 3: Write results
	resultStmt, err := tx.PrepareContext(ctx, `
		INSERT INTO pwc_results (paper_id, dataset, task, metric, value, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW());
	`)
	if err == nil {
		defer resultStmt.Close()
		// Clear old results to prevent duplicate appends on update
		_, _ = tx.ExecContext(ctx, "DELETE FROM pwc_results WHERE paper_id = $1", p.ID)

		for _, res := range details.Results {
			cleanDataset := strings.ReplaceAll(res.Dataset, "\x00", "")
			cleanTask := strings.ReplaceAll(res.Task, "\x00", "")
			cleanMetric := strings.ReplaceAll(res.Metric, "\x00", "")
			valStr := fmt.Sprintf("%v", res.Value)
			valStr = strings.ReplaceAll(valStr, "\x00", "")

			_, _ = resultStmt.ExecContext(ctx, p.ID, cleanDataset, cleanTask, cleanMetric, valStr)
		}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("[INGESTION] [PWC:%s] Failed to commit transaction: %v", p.ID, err)
		return
	}

	log.Printf("[INGESTION] [PWC:%s] Successfully wrote metadata to pwc_papers, repos, and results", p.ID)
}

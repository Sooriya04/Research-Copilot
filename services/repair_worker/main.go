package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"os/signal"
	"research_copilot/src/core"
	"strings"
	"sync"
	"syscall"
	"time"

	_ "github.com/lib/pq"
)

var db *sql.DB

type RepairJob struct {
	ID          int
	PaperID     string
	ContentType string
	Reason      string
	Priority    int
	Attempts    int
	MaxAttempts int
}

func initDB() {
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		// Try loading .env from current directory first, then fallback to relative paths
		paths := []string{".env", "../../.env"}
		for _, path := range paths {
			if data, err := os.ReadFile(path); err == nil {
				for _, line := range strings.Split(string(data), "\n") {
					line = strings.TrimSpace(line)
					if strings.HasPrefix(line, "DATABASE_URL=") {
						connStr = strings.Trim(strings.TrimPrefix(line, "DATABASE_URL="), `"'`)
					}
				}
				if connStr != "" {
					break
				}
			}
		}
	}
	if connStr == "" {
		log.Fatal("[WORKER] DATABASE_URL is not set. Cannot start repair worker.")
	}

	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("[WORKER] Failed to connect to DB: %v", err)
	}

	if err = db.Ping(); err != nil {
		core.LogError("[WORKER] Failed to ping DB: %v", err)
		os.Exit(1)
	}
	core.LogSuccess("[WORKER] Connected to PostgreSQL DB.")
}

func claimJob(ctx context.Context, workerID string) (*RepairJob, error) {
	query := `
		UPDATE content_repair_jobs
		SET status = 'REPAIRING', locked_at = NOW(), locked_by = $1, updated_at = NOW()
		WHERE id = (
			SELECT id
			FROM content_repair_jobs
			WHERE status = 'QUEUED'
			ORDER BY priority DESC, created_at ASC
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		)
		RETURNING id, paper_id, content_type, reason, priority, attempts, max_attempts;
	`

	row := db.QueryRowContext(ctx, query, workerID)
	var job RepairJob
	err := row.Scan(
		&job.ID,
		&job.PaperID,
		&job.ContentType,
		&job.Reason,
		&job.Priority,
		&job.Attempts,
		&job.MaxAttempts,
	)

	if err == sql.ErrNoRows {
		return nil, nil // No jobs available
	} else if err != nil {
		return nil, err
	}

	return &job, nil
}

func completeJob(ctx context.Context, jobID int, status string, errMessage string) error {
	query := `
		UPDATE content_repair_jobs
		SET status = $1, last_error = $2, locked_by = NULL, locked_at = NULL, updated_at = NOW(), attempts = attempts + 1
		WHERE id = $3;
	`
	_, err := db.ExecContext(ctx, query, status, errMessage, jobID)
	return err
}

func recoverStaleJobs(ctx context.Context) {
	// Any job stuck in REPAIRING for > 15 minutes gets bumped back to QUEUED
	query := `
		UPDATE content_repair_jobs
		SET status = 'QUEUED', locked_by = NULL, locked_at = NULL, updated_at = NOW(), last_error = 'Worker timeout recovery'
		WHERE status = 'REPAIRING' AND locked_at < NOW() - INTERVAL '15 minutes';
	`
	res, err := db.ExecContext(ctx, query)
	if err != nil {
		core.LogError("[WORKER] Error recovering stale jobs: %v", err)
		return
	}
	affected, _ := res.RowsAffected()
	if affected > 0 {
		core.LogWarn("[WORKER] Recovered %d stale jobs.", affected)
	}
}

func processJob(ctx context.Context, job *RepairJob) {
	err := executePipeline(ctx, job)
	if err != nil {
		core.LogError("[WORKER] Error in pipeline for job %d: %v", job.ID, err)
	}
}

func workerLoop(ctx context.Context, workerID string, wg *sync.WaitGroup) {
	defer wg.Done()
	core.LogInfo("[WORKER] %s started.", workerID)

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	staleTicker := time.NewTicker(1 * time.Minute)
	defer staleTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			core.LogWarn("[WORKER] %s shutting down...", workerID)
			return
		case <-staleTicker.C:
			recoverStaleJobs(ctx)
		case <-ticker.C:
			job, err := claimJob(ctx, workerID)
			if err != nil {
				core.LogError("[WORKER] %s failed to claim job: %v", workerID, err)
				continue
			}
			if job != nil {
				processJob(ctx, job)
			}
		}
	}
}

func main() {
	initDB()
	defer db.Close()

	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup

	// Launch multiple workers
	workerCount := 3
	hostname, _ := os.Hostname()
	for i := 1; i <= workerCount; i++ {
		wg.Add(1)
		workerID := fmt.Sprintf("worker-%s-%d", hostname, i)
		go workerLoop(ctx, workerID, &wg)
	}

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	log.Println("[WORKER] Received shutdown signal. Waiting for workers to finish...")
	cancel()
	wg.Wait()
	log.Println("[WORKER] Shutdown complete.")
}

package kaggle

import (
	"context"
	"encoding/json"
	"log"
	"strings"

	"github.com/lib/pq"
	"research_copilot/src/core"
)

// ingestKaggleData stores raw JSON metadata to raw_kaggle_doc (Bronze)
// and updates the kaggle_datasets and kaggle_models tables (Silver).
func (c *KaggleClient) ingestKaggleData(ctx context.Context, datasets []KaggleDatasetAPI, models []KaggleModelAPI) {
	if len(datasets) > 0 {
		tx, err := core.DB.BeginTx(ctx, nil)
		if err != nil {
			log.Printf("[KAGGLE] Failed to begin datasets ingestion transaction: %v", err)
		} else {
			rawStmt, err := tx.PrepareContext(ctx, `
				INSERT INTO raw_kaggle_doc (ref, type, payload, fetched_at)
				VALUES ($1, 'dataset', $2, NOW())
				ON CONFLICT (ref) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = NOW();
			`)
			if err != nil {
				tx.Rollback()
				log.Printf("[KAGGLE] Failed to prepare raw dataset statement: %v", err)
				return
			}
			defer rawStmt.Close()

			silverStmt, err := tx.PrepareContext(ctx, `
				INSERT INTO kaggle_datasets (
					ref, title, subtitle, creator_name, creator_url, total_bytes,
					url, download_count, vote_count, usability_rating, license_name, tags, fetched_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
				ON CONFLICT (ref) DO UPDATE SET
					title = EXCLUDED.title,
					subtitle = EXCLUDED.subtitle,
					creator_name = EXCLUDED.creator_name,
					creator_url = EXCLUDED.creator_url,
					total_bytes = EXCLUDED.total_bytes,
					url = EXCLUDED.url,
					download_count = EXCLUDED.download_count,
					vote_count = EXCLUDED.vote_count,
					usability_rating = EXCLUDED.usability_rating,
					license_name = EXCLUDED.license_name,
					tags = EXCLUDED.tags,
					fetched_at = NOW();
			`)
			if err != nil {
				tx.Rollback()
				log.Printf("[KAGGLE] Failed to prepare silver dataset statement: %v", err)
				return
			}
			defer silverStmt.Close()

			for _, d := range datasets {
				ref := strings.ReplaceAll(d.Ref, "\x00", "")
				title := strings.ReplaceAll(d.Title, "\x00", "")
				subtitle := strings.ReplaceAll(d.Subtitle, "\x00", "")
				cName := strings.ReplaceAll(d.CreatorName, "\x00", "")
				cURL := strings.ReplaceAll(d.CreatorUrl, "\x00", "")
				urlStr := strings.ReplaceAll(d.URL, "\x00", "")
				lic := strings.ReplaceAll(d.LicenseName, "\x00", "")

				var tags []string
				for _, t := range d.Tags {
					tags = append(tags, strings.ReplaceAll(t.Name, "\x00", ""))
				}

				payload, _ := json.Marshal(d)
				_, _ = rawStmt.ExecContext(ctx, ref, payload)

				var bytesVal int64
				if d.TotalBytes != nil {
					bytesVal = *d.TotalBytes
				}

				_, _ = silverStmt.ExecContext(ctx,
					ref, title, subtitle, cName, cURL, bytesVal,
					urlStr, d.DownloadCount, d.VoteCount, d.UsabilityRating, lic, pq.Array(tags),
				)
			}

			if err := tx.Commit(); err != nil {
				log.Printf("[KAGGLE] Failed to commit datasets transaction: %v", err)
			} else {
				log.Printf("[KAGGLE] Successfully cached %d Kaggle datasets in database.", len(datasets))
			}
		}
	}

	if len(models) > 0 {
		tx, err := core.DB.BeginTx(ctx, nil)
		if err != nil {
			log.Printf("[KAGGLE] Failed to begin models ingestion transaction: %v", err)
		} else {
			rawStmt, err := tx.PrepareContext(ctx, `
				INSERT INTO raw_kaggle_doc (ref, type, payload, fetched_at)
				VALUES ($1, 'model', $2, NOW())
				ON CONFLICT (ref) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = NOW();
			`)
			if err != nil {
				tx.Rollback()
				log.Printf("[KAGGLE] Failed to prepare raw model statement: %v", err)
				return
			}
			defer rawStmt.Close()

			silverStmt, err := tx.PrepareContext(ctx, `
				INSERT INTO kaggle_models (
					url, ref, title, subtitle, owner_name, owner_ref,
					framework, fine_tunable, vote_count, tags, fetched_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
				ON CONFLICT (url) DO UPDATE SET
					ref = EXCLUDED.ref,
					title = EXCLUDED.title,
					subtitle = EXCLUDED.subtitle,
					owner_name = EXCLUDED.owner_name,
					owner_ref = EXCLUDED.owner_ref,
					framework = EXCLUDED.framework,
					fine_tunable = EXCLUDED.fine_tunable,
					vote_count = EXCLUDED.vote_count,
					tags = EXCLUDED.tags,
					fetched_at = NOW();
			`)
			if err != nil {
				tx.Rollback()
				log.Printf("[KAGGLE] Failed to prepare silver model statement: %v", err)
				return
			}
			defer silverStmt.Close()

			for _, m := range models {
				ref := strings.ReplaceAll(m.Ref, "\x00", "")
				title := strings.ReplaceAll(m.Title, "\x00", "")
				subtitle := strings.ReplaceAll(m.Subtitle, "\x00", "")
				ownerName := strings.ReplaceAll(m.OwnerName, "\x00", "")
				ownerRef := strings.ReplaceAll(m.OwnerRef, "\x00", "")
				framework := strings.ReplaceAll(m.Framework, "\x00", "")
				urlStr := strings.ReplaceAll(m.URL, "\x00", "")

				var tags []string
				for _, t := range m.Tags {
					tags = append(tags, strings.ReplaceAll(t.Name, "\x00", ""))
				}

				payload, _ := json.Marshal(m)
				_, _ = rawStmt.ExecContext(ctx, ref, payload)

				_, _ = silverStmt.ExecContext(ctx,
					urlStr, ref, title, subtitle, ownerName, ownerRef,
					framework, m.FineTunable, m.VoteCount, pq.Array(tags),
				)
			}

			if err := tx.Commit(); err != nil {
				log.Printf("[KAGGLE] Failed to commit models transaction: %v", err)
			} else {
				log.Printf("[KAGGLE] Successfully cached %d Kaggle models in database.", len(models))
			}
		}
	}
}

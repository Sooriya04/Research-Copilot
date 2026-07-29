package huggingface

import (
	"context"
	"log"

	"github.com/lib/pq"
	"research_copilot/src/core"
)

// ingestModelsAndDatasets stores parsed model and dataset search metadata to hf_models and hf_datasets (Silver Layer).
func (c *HuggingFaceClient) ingestModelsAndDatasets(ctx context.Context, models []HFModel, datasets []HFDataset) {
	if len(models) > 0 {
		tx, err := core.DB.BeginTx(ctx, nil)
		if err != nil {
			log.Printf("[INGESTION] Failed to start transaction for HF models: %v", err)
		} else {
			stmt, err := tx.PrepareContext(ctx, `
				INSERT INTO hf_models (
					model_id, likes, downloads, pipeline_tag, library_name, tags, url, fetched_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
				ON CONFLICT (model_id) DO UPDATE SET
					likes = EXCLUDED.likes,
					downloads = EXCLUDED.downloads,
					pipeline_tag = EXCLUDED.pipeline_tag,
					library_name = EXCLUDED.library_name,
					tags = EXCLUDED.tags,
					url = EXCLUDED.url,
					fetched_at = NOW();
			`)
			if err != nil {
				tx.Rollback()
				log.Printf("[INGESTION] Failed to prepare statement for HF models: %v", err)
			} else {
				defer stmt.Close()
				for _, model := range models {
					_, _ = stmt.ExecContext(ctx,
						model.ModelID, model.Likes, model.Downloads, model.PipelineTag,
						model.LibraryName, pq.Array(model.Tags), model.URL,
					)
				}
				if err := tx.Commit(); err != nil {
					log.Printf("[INGESTION] Failed to commit HF models transaction: %v", err)
				} else {
					log.Printf("[INGESTION] Successfully cached %d Hugging Face models in database.", len(models))
				}
			}
		}
	}

	if len(datasets) > 0 {
		tx, err := core.DB.BeginTx(ctx, nil)
		if err != nil {
			log.Printf("[INGESTION] Failed to start transaction for HF datasets: %v", err)
		} else {
			stmt, err := tx.PrepareContext(ctx, `
				INSERT INTO hf_datasets (
					dataset_id, author, likes, downloads, description, tags, url, fetched_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
				ON CONFLICT (dataset_id) DO UPDATE SET
					author = EXCLUDED.author,
					likes = EXCLUDED.likes,
					downloads = EXCLUDED.downloads,
					description = EXCLUDED.description,
					tags = EXCLUDED.tags,
					url = EXCLUDED.url,
					fetched_at = NOW();
			`)
			if err != nil {
				tx.Rollback()
				log.Printf("[INGESTION] Failed to prepare statement for HF datasets: %v", err)
			} else {
				defer stmt.Close()
				for _, dataset := range datasets {
					_, _ = stmt.ExecContext(ctx,
						dataset.DatasetID, dataset.Author, dataset.Likes, dataset.Downloads,
						dataset.Description, pq.Array(dataset.Tags), dataset.URL,
					)
				}
				if err := tx.Commit(); err != nil {
					log.Printf("[INGESTION] Failed to commit HF datasets transaction: %v", err)
				} else {
					log.Printf("[INGESTION] Successfully cached %d Hugging Face datasets in database.", len(datasets))
				}
			}
		}
	}
}

package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func initDB() error {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgresql://minibase:minibase@localhost:5432/research_copilot?sslmode=disable"
	}

	var err error
	DB, err = sql.Open("postgres", dbURL)
	if err != nil {
		return fmt.Errorf("failed to open database connection: %w", err)
	}

	if err := DB.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	log.Println("🔌 Knowledge Engine connected to PostgreSQL successfully.")
	return nil
}

func getSearchSessionQuery(requestID string) (string, error) {
	var query string
	err := DB.QueryRow("SELECT query FROM search_sessions WHERE request_id = $1", requestID).Scan(&query)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("search session not found for request_id: %s", requestID)
	} else if err != nil {
		return "", err
	}
	return query, nil
}

func getResearchPapers(requestID string) ([]DBResearchPaper, error) {
	rows, err := DB.Query(`
		SELECT id, request_id, source, external_id, title, abstract, authors, url, pdf_url, 
		       citation_count, code_repository, frameworks, tasks, benchmarks, hyperparameters 
		FROM research_papers 
		WHERE request_id = $1`, requestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var papers []DBResearchPaper
	for rows.Next() {
		var p DBResearchPaper
		var abs sql.NullString
		var auth sql.NullString
		var u sql.NullString
		var pdf sql.NullString
		var code sql.NullString
		var fworks sql.NullString
		var tsk sql.NullString
		var bench sql.NullString
		var hparams sql.NullString

		err := rows.Scan(
			&p.ID, &p.RequestID, &p.Source, &p.ExternalID, &p.Title,
			&abs, &auth, &u, &pdf, &p.CitationCount, &code,
			&fworks, &tsk, &bench, &hparams,
		)
		if err != nil {
			return nil, err
		}

		p.Abstract = abs.String
		p.Authors = auth.String
		p.URL = u.String
		p.PDFURL = pdf.String
		p.CodeRepository = code.String
		p.Frameworks = fworks.String
		p.Tasks = tsk.String
		p.Benchmarks = bench.String
		p.Hyperparameters = hparams.String

		papers = append(papers, p)
	}
	return papers, nil
}

func saveGraphToDatabase(requestID string, nodes []GraphNode, edges []GraphEdge) error {
	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Clear old nodes/edges for this request_id
	_, err = tx.Exec("DELETE FROM graph_edges WHERE request_id = $1", requestID)
	if err != nil {
		return err
	}
	_, err = tx.Exec("DELETE FROM graph_nodes WHERE request_id = $1", requestID)
	if err != nil {
		return err
	}

	// Insert nodes
	nodeStmt, err := tx.Prepare(`
		INSERT INTO graph_nodes (id, request_id, type, label, properties) 
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (id) DO UPDATE SET
			request_id = EXCLUDED.request_id,
			type = EXCLUDED.type,
			label = EXCLUDED.label,
			properties = EXCLUDED.properties
	`)
	if err != nil {
		return err
	}
	defer nodeStmt.Close()

	for _, n := range nodes {
		props := map[string]interface{}{
			"filePath": n.FilePath,
			"summary":  n.Summary,
			"tags":     n.Tags,
		}
		propsJSON, _ := json.Marshal(props)

		_, err = nodeStmt.Exec(n.ID, requestID, string(n.Type), n.Name, propsJSON)
		if err != nil {
			return fmt.Errorf("failed to insert node %s: %w", n.ID, err)
		}
	}

	// Insert edges
	edgeStmt, err := tx.Prepare(`
		INSERT INTO graph_edges (id, request_id, source, target, relation, weight, properties) 
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (id) DO UPDATE SET
			request_id = EXCLUDED.request_id,
			source = EXCLUDED.source,
			target = EXCLUDED.target,
			relation = EXCLUDED.relation,
			weight = EXCLUDED.weight,
			properties = EXCLUDED.properties
	`)
	if err != nil {
		return err
	}
	defer edgeStmt.Close()

	for idx, e := range edges {
		edgeID := fmt.Sprintf("edge_%s_%d", requestID, idx)
		props := map[string]interface{}{
			"description": e.Description,
		}
		propsJSON, _ := json.Marshal(props)

		_, err = edgeStmt.Exec(edgeID, requestID, e.Source, e.Target, string(e.Type), e.Weight, propsJSON)
		if err != nil {
			return fmt.Errorf("failed to insert edge %s -> %s: %w", e.Source, e.Target, err)
		}
	}

	return tx.Commit()
}

func getPDFSummary(externalID string) (string, error) {
	rows, err := DB.Query(`
		SELECT text 
		FROM paper_paragraphs 
		WHERE paper_id = $1 
		ORDER BY paragraph_index ASC 
		LIMIT 4`, externalID)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var paras []string
	for rows.Next() {
		var txt string
		if err := rows.Scan(&txt); err != nil {
			return "", err
		}
		txt = strings.TrimSpace(txt)
		if txt != "" {
			paras = append(paras, txt)
		}
	}

	if len(paras) == 0 {
		return "", nil
	}
	return strings.Join(paras, "\n\n"), nil
}

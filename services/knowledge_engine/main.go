package main

import (
	"log"
	"net/http"
	"os"

	"github.com/joho/godotenv"
)

func main() {
	log.Println("🧠 Starting Research Copilot Knowledge Engine microservice...")

	// Load environment variables from parent workspace directory
	if err := godotenv.Load("../../.env"); err != nil {
		// Fallback to current dir .env
		if err := godotenv.Load(); err != nil {
			log.Println("Warning: No .env file loaded, reading raw environment variables.")
		}
	}

	if err := initDB(); err != nil {
		log.Fatalf("Fatal: Database initialization failed: %v", err)
	}
	defer DB.Close()

	http.HandleFunc("/api/v1/graph/generate", handleGenerateGraph)

	port := os.Getenv("KNOWLEDGE_ENGINE_PORT")
	if port == "" {
		port = "8002"
	}

	log.Printf("🧠 Knowledge Engine running on port %s. Endpoint: http://localhost:%s/api/v1/graph/generate", port, port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Fatal: Server failed to start: %v", err)
	}
}

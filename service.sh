#!/bin/bash

# Ensure Go binaries are built
if [ ! -f "bin/pdf_extractor" ]; then
  echo "🔨 Side service binaries not found. Building..."
  ./build.sh
fi

echo "🚀 Launching Side Services..."

echo "▶️ Starting PDF Extractor (port 8001)..."
./bin/pdf_extractor &
PID_PDF=$!

echo "▶️ Starting Query Expansion Server (port 8100)..."
.venv/bin/python services/query_optimizer/main.py &
PID_PY=$!

echo "▶️ Starting Repair Agent (port 8101)..."
./bin/repair_agent &
PID_AGENT=$!

echo "▶️ Starting Repair Worker Queue..."
./bin/repair_worker &
PID_WORKER=$!

echo "▶️ Starting Embedding Worker (nomic-embed-text, port 8102)..."
.venv/bin/python services/embedding_worker/main.py &
PID_EMBED=$!

echo "▶️ Starting Chunker Worker (port 8103)..."
.venv/bin/python services/chunker/main.py &
PID_CHUNKER=$!

# Trap SIGINT and SIGTERM to gracefully shut down the background processes
trap "echo '🛑 Shutting down side services...'; kill $PID_PDF $PID_PY $PID_AGENT $PID_WORKER $PID_EMBED $PID_CHUNKER 2>/dev/null; exit" SIGINT SIGTERM

# Wait for processes so logs are printed to terminal
wait $PID_PDF $PID_PY $PID_AGENT $PID_WORKER $PID_EMBED $PID_CHUNKER

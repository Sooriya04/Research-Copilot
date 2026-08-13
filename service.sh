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

# Trap SIGINT and SIGTERM to gracefully shut down the background processes
trap "echo '🛑 Shutting down side services...'; kill $PID_PDF $PID_PY; exit" SIGINT SIGTERM

# Wait for processes so logs are printed to terminal
wait $PID_PDF $PID_PY


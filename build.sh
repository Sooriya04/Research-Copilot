#!/bin/bash
set -e

echo "🔨 Building Research Copilot Go Services..."

mkdir -p bin

# 1. Build stateless Go PDF extractor service
echo "📦 Building Go PDF Extractor service (port 8001)..."
cd services/pdf_extractor
go build -o ../../bin/pdf_extractor
cd ../..

# 2. Build Go Repair Worker service
echo "📦 Building Go Repair Worker (queue processor)..."
cd services/repair_worker
go build -o ../../bin/repair_worker
cd ../..

# 3. Build main Go backend server
echo "📦 Building Main Go Backend Server (port 8000)..."
go build -o bin/research_copilot .

echo "✅ Compilation completed successfully!"

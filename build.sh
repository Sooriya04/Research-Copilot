#!/bin/bash
set -e

echo "🔨 Building Research Copilot Go Services..."

# 1. Build stateless Go PDF extractor service
echo "📦 Building Go PDF Extractor service (port 8001)..."
cd services/pdf_extractor
go build -o pdf_extractor
cd ../..

# 2. Build main Go backend server
echo "📦 Building Main Go Backend Server (port 8000)..."
go build -o research_copilot .

echo "✅ Compilation completed successfully!"

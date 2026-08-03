#!/bin/bash
set -e

echo "🔨 Building Research Copilot Go Services..."

# 1. Build stateless Go PDF extractor service
echo "📦 Building Go PDF Extractor service (port 8001)..."
cd services/pdf_extractor
go build -o pdf_extractor
cd ../..

# 2. Build OmniGraph microservice
echo "📦 Building OmniGraph Knowledge Graph service (port 8002)..."
cd services/omnigraph
go build -o omnigraph
cd ../..

# 3. Build main Go backend server
echo "📦 Building Main Go Backend Server (port 8000)..."
go build -o research_copilot .

echo "✅ Compilation completed successfully!"


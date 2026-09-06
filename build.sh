#!/bin/bash
set -e

echo "🔨 Building Research Copilot Monolithic Application..."

mkdir -p public bin

# 1. Build React Production Bundle from frontend/src/index.jsx
echo "⚛️ Compiling Modern React Frontend (frontend/ -> public/)..."
npx esbuild frontend/src/index.jsx --bundle --outfile=public/bundle.js --loader:.jsx=jsx --loader:.js=jsx --minify

# 2. Sync Styles & HTML to public/
echo "🎨 Copying CSS Design System & HTML entry to public/..."
cp frontend/src/styles/main.css public/styles.css
cp frontend/index.html public/index.html

# 3. Build stateless Go PDF extractor service
echo "📦 Building Go PDF Extractor service (port 8001)..."
cd services/pdf_extractor
go build -o ../../bin/pdf_extractor
cd ../..

# 4. Build Go Repair Worker service
echo "📦 Building Go Repair Worker (queue processor)..."
cd services/repair_worker
go build -o ../../bin/repair_worker
cd ../..

# 5. Build Go Repair Agent service
echo "📦 Building Go Repair Agent service (port 8101)..."
go build -o bin/repair_agent src/agent/main/main.go

# 6. Build Main Go Backend Server (Embedding public/*)
echo "📦 Compiling Single Binary Backend + Embedded Frontend (port 8000)..."
go build -o bin/research_copilot .

echo "✅ Compilation completed successfully! Single binary ready at ./bin/research_copilot"

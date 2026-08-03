#!/bin/bash

# Port cleanup helper
cleanup_ports() {
    echo "🧹 Cleaning up existing service bindings..."
    fuser -k 8000/tcp >/dev/null 2>&1 || true
    fuser -k 8001/tcp >/dev/null 2>&1 || true
    fuser -k 8002/tcp >/dev/null 2>&1 || true
}

cleanup_ports

# Function to handle shutdown of background processes on Ctrl+C
cleanup_on_exit() {
    echo -e "\n🛑 Stopping all services..."
    kill $EXTRACTOR_PID $OMNIGRAPH_PID $BACKEND_PID 2>/dev/null || true
    exit 0
}
trap cleanup_on_exit SIGINT SIGTERM

echo "🚀 Starting Go PDF Extractor service on port 8001..."
# Run and prefix output with [PDF EXTRACTOR] (unbuffered)
./services/pdf_extractor/pdf_extractor 2>&1 | sed -u -e 's/^/[PDF EXTRACTOR] : /' &
EXTRACTOR_PID=$!

echo "🚀 Starting OmniGraph Knowledge Graph service on port 8002..."
# Run and prefix output with [OMNIGRAPH] (unbuffered)
./services/omnigraph/omnigraph 2>&1 | sed -u -e 's/^/[OMNIGRAPH]     : /' &
OMNIGRAPH_PID=$!

echo "🚀 Starting Main Go Backend Server on port 8000..."
# Run and prefix output with [GO BACKEND] (unbuffered)
./research_copilot 2>&1 | sed -u -e 's/^/[GO BACKEND]   : /' &
BACKEND_PID=$!

echo "🟢 All 3 services are running. Live logs stream below (Press Ctrl+C to stop):"
echo "------------------------------------------------------------------------"


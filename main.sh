#!/bin/bash

# Ensure binaries are built
if [ ! -f "bin/research_copilot" ]; then
  echo "🔨 Main backend binary not found. Building..."
  ./build.sh
fi

echo "🚀 Launching Main Backend Server..."
./bin/research_copilot

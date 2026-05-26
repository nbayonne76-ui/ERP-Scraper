#!/usr/bin/env bash
# Start the ERP Intelligence backend
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Copy .env.example to .env if not present
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — set your ANTHROPIC_API_KEY for AI scoring"
fi

echo "Starting UK ERP Intelligence Backend on port 8001..."
python3 main.py

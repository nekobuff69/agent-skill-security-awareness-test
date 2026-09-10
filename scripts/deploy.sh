#!/usr/bin/env bash
set -euo pipefail

echo "Running preflight gate..."
./scripts/preflight.sh

echo "Deploying Worker..."
npx wrangler deploy worker/ --name quiz-llm

echo "Deploying Pages..."
npx wrangler pages deploy ./ --project-name=agent-security-quiz

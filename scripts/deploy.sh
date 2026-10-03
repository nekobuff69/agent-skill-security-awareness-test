#!/usr/bin/env bash
set -euo pipefail

echo "Running preflight gate..."
./scripts/preflight.sh

echo "Deploying Worker..."
# The worker's name lives in worker/wrangler.toml. Do not override it here —
# a --name flag that disagrees with the toml deploys one Worker and leaves the
# next plain `wrangler deploy` creating a second one.
npx wrangler deploy worker/

echo "Deploying Pages..."
npx wrangler pages deploy ./ --project-name=agent-security-quiz

#!/usr/bin/env bash
set -euo pipefail

echo "Running preflight gate..."
./scripts/preflight.sh

echo "Deploying Worker..."
# --config is required: from the repo root wrangler would otherwise not see
# worker/wrangler.toml at all (no name, no compatibility_date) and fall back
# to the directory name as the Worker name. The name lives in that toml —
# never pass --name here; a flag that disagrees with the toml deploys one
# Worker and leaves the next plain `wrangler deploy` creating a second one.
npx wrangler deploy --config worker/wrangler.toml

echo "Deploying Pages..."
npx wrangler pages deploy ./ --project-name=agent-security-quiz

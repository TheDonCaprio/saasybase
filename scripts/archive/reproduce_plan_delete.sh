#!/usr/bin/env bash
# reproduce_plan_delete.sh
# Usage: ./reproduce_plan_delete.sh <PLAN_ID> [FORCE_FLAG]
# Example: ./reproduce_plan_delete.sh plan_abc true

set -euo pipefail
PLAN_ID=${1:-"REPLACE_PLAN_ID"}
FORCE=${2:-"false"}

# Replace TOKEN with a valid admin bearer token for your local/dev server
AUTH_TOKEN="REPLACE_WITH_ADMIN_BEARER_TOKEN"

URL="http://localhost:3000/api/admin/plans/${PLAN_ID}"
if [ "$FORCE" = "true" ]; then
  URL="$URL?force=true"
fi

echo "Calling DELETE $URL"

curl -v -X DELETE "$URL" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" || true

# Note: Run the dev server (`pnpm dev` or `npm run dev` in pro-app) and watch server logs to capture the typed Logger output.

#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Start both Next.js dev server and Stripe webhook forwarder
concurrently \
  "npm run dev" \
  "stripe listen --forward-to localhost:3000/api/stripe/webhook" \
  --names "NEXT,STRIPE" \
  --prefix-colors "cyan,magenta"
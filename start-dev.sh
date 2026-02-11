#!/bin/bash
cd /Users/doncaprio/Documents/GitHub/skrinsot/pro-app

# Start both Next.js dev server and Stripe webhook forwarder
concurrently \
  "npm run dev" \
  "stripe listen --forward-to localhost:3000/api/stripe/webhook" \
  --names "NEXT,STRIPE" \
  --prefix-colors "cyan,magenta"
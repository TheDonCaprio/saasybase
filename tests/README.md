# Tests for count=false behavior

These tests are lightweight integration helpers that invoke Next.js route handlers directly using Node's global Request/Response polyfills.

Run steps (local):

1. Install dev tooling if you don't already have it (you may prefer a temporary environment):

   npm install -D ts-node typescript @types/node node-fetch

2. From the `pro-app` folder, run a specific test file with ts-node, for example:

   npx ts-node ./tests/test_dashboard_payments_count_false.ts

Notes:
- These tests are intentionally minimal and runnable locally; they are not integrated into CI to avoid changing project configs.
- They assume local environment variables required by Prisma/Next are set. For robust CI, integrate with a test runner and a test database.

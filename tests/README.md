# Tests

Route and utility regression coverage lives in Vitest-discovered files under this folder.

Run a targeted subset locally with:

1. `npx vitest --run tests/admin-payments-count-false.test.ts`
2. `npx vitest --run tests/dashboard-payments-count-false.test.ts`
3. `npx vitest --run tests/validation-lib.test.ts`

Run the full suite with `npm run test -- --run`.

Legacy ad hoc node scripts have been retired; support-ticket cursor and secure-error coverage now live in:

1. `npx vitest --run tests/support-tickets-cursor.test.ts`
2. `npx vitest --run tests/secure-errors.test.ts`
3. `npx vitest --run tests/debug-routes-hardening.test.ts`

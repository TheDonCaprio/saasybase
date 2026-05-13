# CONTRIBUTING.md — Working With SaaSyBase

> SaaSyBase is free to use, but it is not an open-source project. This file explains how to work with the codebase, how approved collaborators should make changes, and how users should report issues or request improvements.

---

## Scope

This repository is not operated like a public open-source project.

- External pull requests are not the default workflow.
- Bug reports, feature requests, and security disclosures are still useful and welcome through the project's support or contact channels.
- If you are an approved collaborator, contractor, or internal maintainer, use the guidance below when changing the codebase.

---

## Development Setup

Use a supported Node runtime before installing dependencies: `^20.19.0`, `^22.12.0`, or `>=24.0.0`.

```bash
cp .env.example .env.local
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

If you need to skip admin creation, run `npx prisma db seed -- --skip-admin`.

For database inspection, prefer `npm run prisma:studio` so Prisma uses the repo's checked-in config.

---

## Working Style For Maintainers

1. Start from `main` or from the branch assigned to the work.
2. Make changes following the patterns in [PATTERNS.md](PATTERNS.md).
3. Keep edits narrow and avoid opportunistic refactors unless they are required for correctness.
4. Add tests for new business logic and regression coverage for bug fixes.
5. Run validation before handing work off or merging:
   ```bash
   npm test
   npm run typecheck
   npm run lint
   ```
6. Use clear, descriptive commits and document any migration, env, or deployment impact.

If a change touches auth, payments, subscriptions, tokens, teams, or security-sensitive flows, default to stronger regression coverage rather than lighter coverage.

---

## Reporting Bugs Or Requesting Features

If you are using SaaSyBase and need something fixed or improved:

- Report reproducible bugs with clear steps, expected behavior, and actual behavior.
- Include relevant environment details such as auth provider, payment provider, deployment target, and whether the issue occurs locally or in production.
- For payment or auth issues, include sanitized logs or screenshots where helpful, but never send secrets.
- For feature requests, describe the use case and the business constraint, not just the desired UI.

Security issues should be reported privately. Do not post exploitable details publicly.

---

## Code Standards

### TypeScript

- Use strict TypeScript and avoid `any` unless there is a strong reason.
- Prefer `interface` for object shapes and `type` for unions/intersections.
- Use Zod schemas for runtime validation, not just TypeScript types.

### File Naming

- Components: `PascalCase.tsx`
- Lib modules: `kebab-case.ts`
- Test files: `kebab-case.test.ts`
- API routes: `route.ts` inside descriptive directory paths

### Imports

- Use the `@/` path alias for internal imports.
- Never import vendor-specific auth or payment modules directly in business logic.
- Group imports in a consistent order: external packages, internal modules, then types.

### Components

- Default to server components and add `'use client'` only when needed.
- Reuse existing UI primitives from `components/ui/` before creating new ones.
- Keep domain-specific components in their corresponding subdirectories.

---

## Testing Guidelines

Test the behavior that actually carries risk:

- business logic in `lib/`
- API route handler behavior
- subscription and token state transitions
- webhook success and error paths
- auth and permission boundaries
- edge cases and failure modes

Common commands:

```bash
npm test
npm test -- --watch
npm test -- tests/my-feature.test.ts
```

---

## High-Risk Change Areas

### Payment Providers

See [docs/adding-payment-providers.md](docs/adding-payment-providers.md) for the full guide.

Minimum checklist:

- implement `PaymentProvider` from `lib/payment/types.ts`
- register the provider in `lib/payment/registry.ts`
- handle webhook verification and normalization correctly
- add any required client scripts to `components/PaymentProviderScripts.tsx`
- document env vars in `.env.example`
- add unit or integration coverage
- update README if the supported provider matrix changes

### Admin Features

1. Create the page in `app/admin/(valid)/...`
2. Add matching admin API routes where needed
3. Update moderator permission mapping if the section should be assignable
4. Log admin actions using the existing admin action helpers for that area
5. Add the navigation entry in the admin layout

### Database Schema Changes

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name describe-change`
3. Add a data migration script if the schema change needs one
4. Test against both SQLite and PostgreSQL assumptions
5. Document any rollout or compatibility impact

---

## Documentation Expectations

- Update [README.md](README.md) for user-facing changes.
- Update [PATTERNS.md](PATTERNS.md) when introducing a new pattern worth repeating.
- Update [TECH_STACK.md](TECH_STACK.md) when adding or removing important dependencies.
- Update [ARCHITECTURE.md](ARCHITECTURE.md) when the system structure changes.
- Add inline comments only when they explain a non-obvious reason, not obvious mechanics.

---

## Security Checklist

Before merging work that touches auth, payments, or user data, verify:

- [ ] input is validated with Zod
- [ ] rate limiting is present where required
- [ ] auth and role checks match the route type
- [ ] logs do not expose sensitive data
- [ ] production error responses do not leak internals
- [ ] webhook signatures are verified before processing
- [ ] raw queries, if any, are reviewed carefully
- [ ] tests cover both allowed and denied access paths where relevant

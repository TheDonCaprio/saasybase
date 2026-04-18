# CONTRIBUTING.md — How to Contribute to SaaSyBase

> Guidelines for contributing to the SaaSyBase boilerplate — whether you're fixing bugs, adding features, or extending provider support.

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

## Workflow

1. **Create a branch** from `main` with a descriptive name: `feature/add-widget`, `fix/webhook-retry`
2. **Make changes** following the patterns in [PATTERNS.md](PATTERNS.md)
3. **Run tests** before committing:
   ```bash
   npm test              # Unit tests
   npm run typecheck     # Type checking
   npm run lint          # Linting
   ```
4. **Write tests** for any new business logic (see Testing section below)
5. **Commit** with clear, descriptive messages
6. **Open a PR** with a description of what changed and why

---

## Code Style

### TypeScript
- Use strict TypeScript — avoid `any` unless absolutely necessary
- Prefer `interface` for object shapes, `type` for unions/intersections
- Use Zod schemas for runtime validation (not just TypeScript types)

### File Naming
- Components: `PascalCase.tsx` (e.g., `PricingCard.tsx`)
- Lib modules: `kebab-case.ts` (e.g., `subscription-utils.ts`)
- Test files: `kebab-case.test.ts` (e.g., `stripe-webhook.test.ts`)
- API routes: `route.ts` inside descriptive directory paths

### Imports
- Use `@/` path alias for all imports (e.g., `import { prisma } from '@/lib/prisma'`)
- Never import vendor-specific auth/payment modules directly — use the abstraction layers
- Group imports: external packages → internal modules → types

### Components
- Server components by default — only add `'use client'` when needed (event handlers, hooks, browser APIs)
- Reuse existing UI components from `components/ui/` before creating new ones
- Co-locate domain-specific components in subdirectories (e.g., `components/billing/`)

---

## Testing Guidelines

### What to Test
- Business logic in `lib/` modules
- API route handler behavior (mock auth, DB, and external services)
- State transitions (subscription lifecycle, token spending)
- Webhook event handling (both success and error cases)
- Edge cases and error paths

### Test Structure
```typescript
// tests/my-feature.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('myFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle the happy path', async () => {
    // Arrange
    // Act
    // Assert
  });

  it('should handle errors gracefully', async () => {
    // Test error cases
  });
});
```

### Running Tests
```bash
npm test                              # All unit tests
npm test -- --watch                   # Watch mode
npm test -- tests/my-feature.test.ts  # Single file
npm run test:e2e                      # E2E tests (Playwright)
npm run test:e2e:headed               # E2E with browser visible
```

---

## Adding a New Payment Provider

See [docs/adding-payment-providers.md](docs/adding-payment-providers.md) for the complete guide.

Quick checklist:
- [ ] Implement `PaymentProvider` interface from `lib/payment/types.ts`
- [ ] Register in `lib/payment/registry.ts`
- [ ] Handle webhooks in `/api/webhooks/payments` (signature auto-detection)
- [ ] Add client scripts to `components/PaymentProviderScripts.tsx` if needed
- [ ] Add env vars to `.env.example`
- [ ] Write unit tests
- [ ] Update provider feature matrix in README

---

## Adding a New Admin Section

1. Create page in `app/admin/(valid)/my-section/page.tsx`
2. Add API routes in `app/api/admin/my-section/route.ts`
3. Add the section to moderator permissions in `lib/moderator-shared.ts` (MODERATOR_SECTIONS)
4. Log admin actions to `AdminActionLog` using the existing admin action helpers for that area
5. Add navigation entry in the admin layout

---

## Database Schema Changes

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name describe-change`
3. If the change requires data migration, create a script in `scripts/`
4. Test against both SQLite (dev) and PostgreSQL (prod)
5. Document the migration in your PR description

---

## Documentation

- Update [README.md](README.md) for user-facing feature changes
- Update [PATTERNS.md](PATTERNS.md) if introducing a new pattern
- Update [TECH_STACK.md](TECH_STACK.md) if adding a new dependency
- Update [ARCHITECTURE.md](ARCHITECTURE.md) for structural changes
- Add inline code comments only when the "why" isn't obvious from the code

---

## Security Checklist

Before submitting a PR that touches auth, payments, or user data:

- [ ] Input validated with Zod schemas
- [ ] Rate limiting applied to new endpoints
- [ ] Appropriate auth/role check present for the route type (`authService.requireUserId()`, `requireAdmin()`, `requireAdminOrModerator()`, etc.)
- [ ] No sensitive data in logs (use `Logger` which auto-redacts)
- [ ] Error responses don't leak internal details in production
- [ ] Webhook signatures verified before processing
- [ ] SQL injection prevented (Prisma handles this, but double-check raw queries)
- [ ] Tests cover both auth'd and unauth'd access attempts

# Switching Authentication Providers

**Can I switch authentication providers (Clerk, NextAuth, Better Auth) on the fly?**

During development and testing: **Yes.** Changing the `AUTH_PROVIDER` environment variable will instantly swap the UI and backend logic to use the selected provider.

In production (with live user data): **It depends on which providers you are switching between.**

## What Is Actually Swappable

SaaSyBase currently has two auth data lanes:

1. **Clerk**: A hosted identity lane. Users, passwords, and sessions live in Clerk's cloud, with selected records mirrored into your local database.
2. **Self-hosted Prisma auth**: NextAuth and Better Auth both operate on the app's local Prisma-backed auth tables in the current repo.

### NextAuth And Better Auth

NextAuth and Better Auth are now designed to coexist on the same underlying Prisma auth data:

- shared `User`, `Account`, `Session`, and verification compatibility fields
- credential-hash compatibility for the self-hosted email/password lane
- compatibility normalization for OAuth account fields and verification state

That means switching between `AUTH_PROVIDER="nextauth"` and `AUTH_PROVIDER="betterauth"` does **not** require exporting/importing users or running a one-time production user migration just to preserve sign-in capability.

Practical caveats still apply:

- active sessions may not survive the switch cleanly, so users can still be forced to sign in again
- if your database predates the current coexistence shape, you should normalize it before assuming a seamless switch
- this statement applies to the self-hosted lane only, not to Clerk

### Clerk

If you launch your app with NextAuth or Better Auth and later change `AUTH_PROVIDER="clerk"`, your local users do not automatically appear in Clerk's cloud database. The reverse is also true: switching away from Clerk is still a real identity migration problem unless you separately provision those users into the self-hosted lane.

## Recommendation

**Pick your auth lane before launching to production.**

- Switching between **NextAuth and Better Auth** is supported on the shared self-hosted Prisma auth lane, with the expectation that you may still rotate sessions or ask users to sign in again.
- Switching **to or from Clerk** still requires a formal identity migration strategy because Clerk is not just another view over the same local auth tables.

# Switching Authentication Providers

**Can I switch authentication providers (Clerk, NextAuth, Better Auth) on the fly?**

During development and testing: **Yes.** Changing the `AUTH_PROVIDER` environment variable will instantly swap the UI and backend logic to use the selected provider.

In production (with live user data): **No. Data does not port across providers.**

## Why Data Does Not Port

SaaSyBase allows you to choose your provider, but each provider manages data entirely differently:

1. **Clerk**: A hosted service. It stores user identities, passwords, and sessions in its own cloud database. It syncs minimal data to your local Prisma database via Webhooks.
2. **NextAuth (Auth.js)**: A self-hosted library. It stores users in your Prisma database (`User`, `Account`, `Session`, `VerificationToken`) using NextAuth's specific schema.
3. **Better Auth**: A self-hosted library. It stores users in your Prisma database using a completely different schema structure than NextAuth (e.g., `account` vs `Account`, different password storage mappings, different org structures depending on plugins).

### The Migration Reality

If you launch your app with NextAuth and get 1,000 sign-ups, those users exist in the NextAuth `User` table with NextAuth-compatible password hashes. 

If you just change `AUTH_PROVIDER="clerk"`, those 1,000 NextAuth users do not exist in Clerk's cloud database. The users will appear logged out and will be unable to log in because Clerk has no record of them.

If you change `AUTH_PROVIDER="betterauth"`, Better Auth will look at its own tables and fail to find the NextAuth sessions or mappings. 

## Recommendation

**Pick your auth provider before launching to production.**

If you must switch providers after your product is live, you will need to perform a formal data migration. You must export your users (and potentially password hashes, depending on the target provider's hash compatibility) and import them into the new provider's system. SaaSyBase provides the unified abstraction to write the code against, but we *do not* provide automated inter-provider data migration scripts.

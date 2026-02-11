// SendWelcomeOnVerified component removed — welcome emails are now triggered
// exclusively via server-side Clerk webhooks and `app/api/webhooks/clerk/route.ts`.
// The old client-side implementation was fragile (relied on browser execution)
// and has been intentionally disabled. The file remains as a deprecation stub
// to avoid accidental imports; remove the file completely if you prefer.

export default function SendWelcomeOnVerified() {
  return null;
}

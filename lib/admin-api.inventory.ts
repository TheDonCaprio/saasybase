// Curated admin API inventory used by the admin docs.
// Update this file manually when admin routes or summaries change.

export type AdminApiInventoryEndpoint = {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
  access: 'admin' | 'user' | 'public';
  notes?: string[];
  source: string;
};

export const ADMIN_API_INVENTORY: AdminApiInventoryEndpoint[] = [
  {
    "method": "GET",
    "path": "/api/admin/analytics",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/analytics",
    "source": "app/api/admin/analytics/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/billing/paddle-config",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/billing/paddle-config",
    "source": "app/api/admin/billing/paddle-config/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/billing/sync",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/billing/sync",
    "source": "app/api/admin/billing/sync/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/blog",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/blog",
    "source": "app/api/admin/blog/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/blog",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/blog",
    "source": "app/api/admin/blog/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/admin/blog/[id]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/blog/[id]",
    "source": "app/api/admin/blog/[id]/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/blog/[id]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/blog/[id]",
    "source": "app/api/admin/blog/[id]/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/admin/blog/[id]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/blog/[id]",
    "source": "app/api/admin/blog/[id]/route.ts"
  },
  {
    "method": "PUT",
    "path": "/api/admin/blog/[id]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/blog/[id]",
    "source": "app/api/admin/blog/[id]/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/blog/bulk",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/blog/bulk",
    "source": "app/api/admin/blog/bulk/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/blog/categories",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/blog/categories",
    "source": "app/api/admin/blog/categories/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/blog/categories",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/blog/categories",
    "source": "app/api/admin/blog/categories/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/admin/blog/categories/[id]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/blog/categories/[id]",
    "source": "app/api/admin/blog/categories/[id]/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/admin/blog/categories/[id]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/blog/categories/[id]",
    "source": "app/api/admin/blog/categories/[id]/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/coupons",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/coupons",
    "source": "app/api/admin/coupons/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/coupons",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/coupons",
    "source": "app/api/admin/coupons/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/admin/coupons/[couponId]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/coupons/[couponId]",
    "source": "app/api/admin/coupons/[couponId]/route.ts"
  },
  {
    "method": "PUT",
    "path": "/api/admin/coupons/[couponId]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/coupons/[couponId]",
    "source": "app/api/admin/coupons/[couponId]/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/emails",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/emails",
    "source": "app/api/admin/emails/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/emails",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/emails",
    "source": "app/api/admin/emails/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/admin/emails/[templateId]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/emails/[templateId]",
    "source": "app/api/admin/emails/[templateId]/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/emails/[templateId]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/emails/[templateId]",
    "source": "app/api/admin/emails/[templateId]/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/admin/emails/[templateId]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/emails/[templateId]",
    "source": "app/api/admin/emails/[templateId]/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/emails/seed",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/emails/seed",
    "source": "app/api/admin/emails/seed/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/emails/test",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/emails/test",
    "notes": [
      "Test helper endpoint (do not expose publicly)."
    ],
    "source": "app/api/admin/emails/test/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/admin/file/delete",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/file/delete",
    "source": "app/api/admin/file/delete/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/file/list",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/file/list",
    "source": "app/api/admin/file/list/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/file/upload",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/file/upload",
    "source": "app/api/admin/file/upload/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/logo/upload",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/logo/upload",
    "source": "app/api/admin/logo/upload/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/admin/logs",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/logs",
    "source": "app/api/admin/logs/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/logs",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/logs",
    "source": "app/api/admin/logs/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/maintenance/discounted-subscription-price-cache",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/maintenance/discounted-subscription-price-cache",
    "source": "app/api/admin/maintenance/discounted-subscription-price-cache/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/maintenance/discounted-subscription-price-cache",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/maintenance/discounted-subscription-price-cache",
    "source": "app/api/admin/maintenance/discounted-subscription-price-cache/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/admin/moderator-actions",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/moderator-actions",
    "source": "app/api/admin/moderator-actions/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/moderator-actions",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/moderator-actions",
    "source": "app/api/admin/moderator-actions/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/notifications",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/notifications",
    "source": "app/api/admin/notifications/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/notifications/create",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/notifications/create",
    "source": "app/api/admin/notifications/create/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/organizations",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/organizations",
    "source": "app/api/admin/organizations/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/organizations/[orgId]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/organizations/[orgId]",
    "source": "app/api/admin/organizations/[orgId]/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/admin/organizations/[orgId]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/organizations/[orgId]",
    "source": "app/api/admin/organizations/[orgId]/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/organizations/[orgId]/adjust-balance",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/organizations/[orgId]/adjust-balance",
    "source": "app/api/admin/organizations/[orgId]/adjust-balance/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/admin/organizations/[orgId]/delete",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/organizations/[orgId]/delete",
    "source": "app/api/admin/organizations/[orgId]/delete/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/organizations/[orgId]/members",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/organizations/[orgId]/members",
    "source": "app/api/admin/organizations/[orgId]/members/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/admin/organizations/[orgId]/members/[membershipId]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/organizations/[orgId]/members/[membershipId]",
    "source": "app/api/admin/organizations/[orgId]/members/[membershipId]/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/pages",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/pages",
    "source": "app/api/admin/pages/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/pages",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/pages",
    "source": "app/api/admin/pages/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/admin/pages/[id]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/pages/[id]",
    "source": "app/api/admin/pages/[id]/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/pages/[id]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/pages/[id]",
    "source": "app/api/admin/pages/[id]/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/admin/pages/[id]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/pages/[id]",
    "source": "app/api/admin/pages/[id]/route.ts"
  },
  {
    "method": "PUT",
    "path": "/api/admin/pages/[id]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/pages/[id]",
    "source": "app/api/admin/pages/[id]/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/pages/bulk",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/pages/bulk",
    "source": "app/api/admin/pages/bulk/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/payment-providers",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/payment-providers",
    "source": "app/api/admin/payment-providers/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/payments",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/payments",
    "source": "app/api/admin/payments/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/payments/[paymentId]/refund",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/payments/[paymentId]/refund",
    "source": "app/api/admin/payments/[paymentId]/refund/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/payments/backfill-invoices",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/payments/backfill-invoices",
    "source": "app/api/admin/payments/backfill-invoices/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/plans",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/plans",
    "source": "app/api/admin/plans/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/plans",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/plans",
    "source": "app/api/admin/plans/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/admin/plans/[planId]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/plans/[planId]",
    "source": "app/api/admin/plans/[planId]/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/admin/plans/[planId]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/plans/[planId]",
    "source": "app/api/admin/plans/[planId]/route.ts"
  },
  {
    "method": "PUT",
    "path": "/api/admin/plans/[planId]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/plans/[planId]",
    "source": "app/api/admin/plans/[planId]/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/plans/[planId]/create-stripe",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/plans/[planId]/create-stripe",
    "source": "app/api/admin/plans/[planId]/create-stripe/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/plans/verify",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/plans/verify",
    "source": "app/api/admin/plans/verify/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/purchases",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/purchases",
    "source": "app/api/admin/purchases/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/purchases/[id]/[action]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/purchases/[id]/[action]",
    "source": "app/api/admin/purchases/[id]/[action]/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/purchases/[id]/expire",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/purchases/[id]/expire",
    "source": "app/api/admin/purchases/[id]/expire/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/settings",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/settings",
    "source": "app/api/admin/settings/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/admin/settings",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/settings",
    "source": "app/api/admin/settings/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/settings",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/settings",
    "source": "app/api/admin/settings/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/settings/export",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/settings/export",
    "source": "app/api/admin/settings/export/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/settings/import",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/settings/import",
    "source": "app/api/admin/settings/import/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/subscriptions",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/subscriptions",
    "source": "app/api/admin/subscriptions/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/subscriptions/[id]/edit",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/subscriptions/[id]/edit",
    "source": "app/api/admin/subscriptions/[id]/edit/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/subscriptions/[id]/expire",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/subscriptions/[id]/expire",
    "source": "app/api/admin/subscriptions/[id]/expire/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/subscriptions/[id]/force-cancel",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/subscriptions/[id]/force-cancel",
    "source": "app/api/admin/subscriptions/[id]/force-cancel/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/subscriptions/[id]/schedule-cancel",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/subscriptions/[id]/schedule-cancel",
    "source": "app/api/admin/subscriptions/[id]/schedule-cancel/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/subscriptions/[id]/undo",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/subscriptions/[id]/undo",
    "source": "app/api/admin/subscriptions/[id]/undo/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/support/tickets",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/support/tickets",
    "source": "app/api/admin/support/tickets/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/support/tickets",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/support/tickets",
    "source": "app/api/admin/support/tickets/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/support/tickets/[ticketId]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/support/tickets/[ticketId]",
    "source": "app/api/admin/support/tickets/[ticketId]/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/admin/support/tickets/[ticketId]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/support/tickets/[ticketId]",
    "source": "app/api/admin/support/tickets/[ticketId]/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/support/tickets/[ticketId]/reply",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/support/tickets/[ticketId]/reply",
    "source": "app/api/admin/support/tickets/[ticketId]/reply/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/theme",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/theme",
    "source": "app/api/admin/theme/route.ts"
  },
  {
    "method": "PUT",
    "path": "/api/admin/theme",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/theme",
    "source": "app/api/admin/theme/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/theme/export",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/theme/export",
    "source": "app/api/admin/theme/export/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/theme/import",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/theme/import",
    "source": "app/api/admin/theme/import/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/traffic",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/traffic",
    "source": "app/api/admin/traffic/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/admin/upload",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/upload",
    "source": "app/api/admin/upload/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/users",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/users",
    "source": "app/api/admin/users/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/admin/users/[userId]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/users/[userId]",
    "source": "app/api/admin/users/[userId]/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/users/[userId]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/users/[userId]",
    "source": "app/api/admin/users/[userId]/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/admin/users/[userId]",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/users/[userId]",
    "source": "app/api/admin/users/[userId]/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/users/[userId]/payments",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/users/[userId]/payments",
    "source": "app/api/admin/users/[userId]/payments/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/admin/users/[userId]/role",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/users/[userId]/role",
    "source": "app/api/admin/users/[userId]/role/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/admin/users/search",
    "access": "admin",
    "summary": "Inventory entry for /api/admin/users/search",
    "source": "app/api/admin/users/search/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/auth/credentials-login",
    "access": "public",
    "summary": "Inventory entry for /api/auth/credentials-login",
    "source": "app/api/auth/credentials-login/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/auth/forgot-password",
    "access": "public",
    "summary": "Inventory entry for /api/auth/forgot-password",
    "source": "app/api/auth/forgot-password/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/auth/login-status",
    "access": "public",
    "summary": "Inventory entry for /api/auth/login-status",
    "source": "app/api/auth/login-status/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/auth/register",
    "access": "public",
    "summary": "Inventory entry for /api/auth/register",
    "source": "app/api/auth/register/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/auth/resend-verification",
    "access": "public",
    "summary": "Inventory entry for /api/auth/resend-verification",
    "source": "app/api/auth/resend-verification/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/auth/reset-password",
    "access": "public",
    "summary": "Inventory entry for /api/auth/reset-password",
    "source": "app/api/auth/reset-password/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/auth/verify-email",
    "access": "public",
    "summary": "Inventory entry for /api/auth/verify-email",
    "source": "app/api/auth/verify-email/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/auth/verify-email",
    "access": "public",
    "summary": "Inventory entry for /api/auth/verify-email",
    "source": "app/api/auth/verify-email/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/billing/cancel",
    "access": "user",
    "summary": "Inventory entry for /api/billing/cancel",
    "source": "app/api/billing/cancel/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/billing/customer-portal",
    "access": "user",
    "summary": "Inventory entry for /api/billing/customer-portal",
    "source": "app/api/billing/customer-portal/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/billing/invoice/[paymentId]",
    "access": "user",
    "summary": "Inventory entry for /api/billing/invoice/[paymentId]",
    "source": "app/api/billing/invoice/[paymentId]/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/billing/refund-receipt/[paymentId]",
    "access": "user",
    "summary": "Inventory entry for /api/billing/refund-receipt/[paymentId]",
    "source": "app/api/billing/refund-receipt/[paymentId]/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/billing/test",
    "access": "user",
    "summary": "Inventory entry for /api/billing/test",
    "notes": [
      "Test helper endpoint (do not expose publicly)."
    ],
    "source": "app/api/billing/test/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/billing/undo-cancel",
    "access": "user",
    "summary": "Inventory entry for /api/billing/undo-cancel",
    "source": "app/api/billing/undo-cancel/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/checkout",
    "access": "public",
    "summary": "Inventory entry for /api/checkout",
    "source": "app/api/checkout/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/checkout/confirm",
    "access": "public",
    "summary": "Inventory entry for /api/checkout/confirm",
    "source": "app/api/checkout/confirm/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/checkout/embedded",
    "access": "public",
    "summary": "Inventory entry for /api/checkout/embedded",
    "source": "app/api/checkout/embedded/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/checkout/embedded",
    "access": "public",
    "summary": "Inventory entry for /api/checkout/embedded",
    "source": "app/api/checkout/embedded/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/checkout/embedded/confirm",
    "access": "public",
    "summary": "Inventory entry for /api/checkout/embedded/confirm",
    "source": "app/api/checkout/embedded/confirm/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/contact",
    "access": "public",
    "summary": "Inventory entry for /api/contact",
    "source": "app/api/contact/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/cron/process-expiry",
    "access": "public",
    "summary": "Inventory entry for /api/cron/process-expiry",
    "notes": [
      "Cron endpoint; protect via secret/token in production."
    ],
    "source": "app/api/cron/process-expiry/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/dashboard/coupons",
    "access": "user",
    "summary": "Inventory entry for /api/dashboard/coupons",
    "source": "app/api/dashboard/coupons/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/dashboard/coupons",
    "access": "user",
    "summary": "Inventory entry for /api/dashboard/coupons",
    "source": "app/api/dashboard/coupons/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/dashboard/payments",
    "access": "user",
    "summary": "Inventory entry for /api/dashboard/payments",
    "source": "app/api/dashboard/payments/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/fix-status",
    "access": "public",
    "summary": "Inventory entry for /api/fix-status",
    "source": "app/api/fix-status/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/health",
    "access": "public",
    "summary": "Inventory entry for /api/health",
    "notes": [
      "Health endpoint; detailed mode may require HEALTHCHECK_TOKEN."
    ],
    "source": "app/api/health/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/internal/payment-scripts",
    "access": "public",
    "summary": "Inventory entry for /api/internal/payment-scripts",
    "notes": [
      "Internal endpoint (used by the app runtime)."
    ],
    "source": "app/api/internal/payment-scripts/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/internal/spend-tokens",
    "access": "public",
    "summary": "Inventory entry for /api/internal/spend-tokens",
    "notes": [
      "Internal endpoint (used by the app runtime)."
    ],
    "source": "app/api/internal/spend-tokens/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/internal/track-visit",
    "access": "public",
    "summary": "Inventory entry for /api/internal/track-visit",
    "notes": [
      "Internal endpoint (used by the app runtime)."
    ],
    "source": "app/api/internal/track-visit/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/minimal",
    "access": "public",
    "summary": "Inventory entry for /api/minimal",
    "source": "app/api/minimal/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/notifications",
    "access": "user",
    "summary": "Inventory entry for /api/notifications",
    "source": "app/api/notifications/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/notifications/[id]/read",
    "access": "user",
    "summary": "Inventory entry for /api/notifications/[id]/read",
    "source": "app/api/notifications/[id]/read/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/notifications/[id]/read",
    "access": "user",
    "summary": "Inventory entry for /api/notifications/[id]/read",
    "source": "app/api/notifications/[id]/read/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/notifications/mark-all-read",
    "access": "user",
    "summary": "Inventory entry for /api/notifications/mark-all-read",
    "source": "app/api/notifications/mark-all-read/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/plan-preview",
    "access": "public",
    "summary": "Inventory entry for /api/plan-preview",
    "source": "app/api/plan-preview/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/recent-sessions",
    "access": "public",
    "summary": "Inventory entry for /api/recent-sessions",
    "source": "app/api/recent-sessions/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/sessions/[sessionId]",
    "access": "user",
    "summary": "Inventory entry for /api/sessions/[sessionId]",
    "source": "app/api/sessions/[sessionId]/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/sessions/[sessionId]",
    "access": "user",
    "summary": "Inventory entry for /api/sessions/[sessionId]",
    "source": "app/api/sessions/[sessionId]/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/sessions/[sessionId]/revoke",
    "access": "user",
    "summary": "Inventory entry for /api/sessions/[sessionId]/revoke",
    "source": "app/api/sessions/[sessionId]/revoke/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/sessions/[sessionId]/revoke",
    "access": "user",
    "summary": "Inventory entry for /api/sessions/[sessionId]/revoke",
    "source": "app/api/sessions/[sessionId]/revoke/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/sessions/revoke-others",
    "access": "user",
    "summary": "Inventory entry for /api/sessions/revoke-others",
    "source": "app/api/sessions/revoke-others/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/sessions/revoke-others",
    "access": "user",
    "summary": "Inventory entry for /api/sessions/revoke-others",
    "source": "app/api/sessions/revoke-others/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/settings/format",
    "access": "public",
    "summary": "Inventory entry for /api/settings/format",
    "source": "app/api/settings/format/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/settings/tokens",
    "access": "public",
    "summary": "Inventory entry for /api/settings/tokens",
    "source": "app/api/settings/tokens/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/site-info",
    "access": "public",
    "summary": "Inventory entry for /api/site-info",
    "source": "app/api/site-info/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/stripe/webhook",
    "access": "public",
    "summary": "Inventory entry for /api/stripe/webhook",
    "source": "app/api/stripe/webhook/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/subscription",
    "access": "user",
    "summary": "Inventory entry for /api/subscription",
    "source": "app/api/subscription/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/subscription/activate",
    "access": "user",
    "summary": "Inventory entry for /api/subscription/activate",
    "source": "app/api/subscription/activate/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/subscription/proration",
    "access": "user",
    "summary": "Inventory entry for /api/subscription/proration",
    "source": "app/api/subscription/proration/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/subscription/proration",
    "access": "user",
    "summary": "Inventory entry for /api/subscription/proration",
    "source": "app/api/subscription/proration/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/support/tickets",
    "access": "public",
    "summary": "Inventory entry for /api/support/tickets",
    "source": "app/api/support/tickets/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/support/tickets",
    "access": "public",
    "summary": "Inventory entry for /api/support/tickets",
    "source": "app/api/support/tickets/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/support/tickets/[ticketId]",
    "access": "public",
    "summary": "Inventory entry for /api/support/tickets/[ticketId]",
    "source": "app/api/support/tickets/[ticketId]/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/support/tickets/[ticketId]",
    "access": "public",
    "summary": "Inventory entry for /api/support/tickets/[ticketId]",
    "source": "app/api/support/tickets/[ticketId]/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/support/tickets/[ticketId]/reply",
    "access": "public",
    "summary": "Inventory entry for /api/support/tickets/[ticketId]/reply",
    "source": "app/api/support/tickets/[ticketId]/reply/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/team/invite",
    "access": "user",
    "summary": "Inventory entry for /api/team/invite",
    "source": "app/api/team/invite/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/team/invite/accept",
    "access": "user",
    "summary": "Inventory entry for /api/team/invite/accept",
    "source": "app/api/team/invite/accept/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/team/invite/decline",
    "access": "user",
    "summary": "Inventory entry for /api/team/invite/decline",
    "source": "app/api/team/invite/decline/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/team/invite/resend",
    "access": "user",
    "summary": "Inventory entry for /api/team/invite/resend",
    "source": "app/api/team/invite/resend/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/team/invite/revoke",
    "access": "user",
    "summary": "Inventory entry for /api/team/invite/revoke",
    "source": "app/api/team/invite/revoke/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/team/members/cap-override",
    "access": "user",
    "summary": "Inventory entry for /api/team/members/cap-override",
    "source": "app/api/team/members/cap-override/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/team/members/remove",
    "access": "user",
    "summary": "Inventory entry for /api/team/members/remove",
    "source": "app/api/team/members/remove/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/team/provision",
    "access": "user",
    "summary": "Inventory entry for /api/team/provision",
    "source": "app/api/team/provision/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/team/settings",
    "access": "user",
    "summary": "Inventory entry for /api/team/settings",
    "source": "app/api/team/settings/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/team/summary",
    "access": "user",
    "summary": "Inventory entry for /api/team/summary",
    "source": "app/api/team/summary/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/user/active-org",
    "access": "user",
    "summary": "Inventory entry for /api/user/active-org",
    "source": "app/api/user/active-org/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/user/active-org",
    "access": "user",
    "summary": "Inventory entry for /api/user/active-org",
    "source": "app/api/user/active-org/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/user/change-password",
    "access": "user",
    "summary": "Inventory entry for /api/user/change-password",
    "source": "app/api/user/change-password/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/user/delete-account",
    "access": "user",
    "summary": "Inventory entry for /api/user/delete-account",
    "source": "app/api/user/delete-account/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/user/export-account-data",
    "access": "user",
    "summary": "Inventory entry for /api/user/export-account-data",
    "source": "app/api/user/export-account-data/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/user/grace-status",
    "access": "user",
    "summary": "Inventory entry for /api/user/grace-status",
    "source": "app/api/user/grace-status/route.ts"
  },
  {
    "method": "DELETE",
    "path": "/api/user/pending-email-change",
    "access": "user",
    "summary": "Inventory entry for /api/user/pending-email-change",
    "source": "app/api/user/pending-email-change/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/user/ping-expiry-cleanup",
    "access": "user",
    "summary": "Inventory entry for /api/user/ping-expiry-cleanup",
    "source": "app/api/user/ping-expiry-cleanup/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/user/profile",
    "access": "user",
    "summary": "Inventory entry for /api/user/profile",
    "source": "app/api/user/profile/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/user/profile",
    "access": "user",
    "summary": "Inventory entry for /api/user/profile",
    "source": "app/api/user/profile/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/user/sessions",
    "access": "user",
    "summary": "Inventory entry for /api/user/sessions",
    "source": "app/api/user/sessions/route.ts"
  },
  {
    "method": "GET",
    "path": "/api/user/settings",
    "access": "user",
    "summary": "Inventory entry for /api/user/settings",
    "source": "app/api/user/settings/route.ts"
  },
  {
    "method": "PATCH",
    "path": "/api/user/settings",
    "access": "user",
    "summary": "Inventory entry for /api/user/settings",
    "source": "app/api/user/settings/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/user/spend-tokens",
    "access": "user",
    "summary": "Inventory entry for /api/user/spend-tokens",
    "source": "app/api/user/spend-tokens/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/user/validate-org-access",
    "access": "user",
    "summary": "Inventory entry for /api/user/validate-org-access",
    "source": "app/api/user/validate-org-access/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/user/welcome",
    "access": "user",
    "summary": "Inventory entry for /api/user/welcome",
    "source": "app/api/user/welcome/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/webhooks/clerk",
    "access": "public",
    "summary": "Inventory entry for /api/webhooks/clerk",
    "notes": [
      "Webhook endpoint; verify signature headers per provider."
    ],
    "source": "app/api/webhooks/clerk/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/webhooks/paddle",
    "access": "public",
    "summary": "Inventory entry for /api/webhooks/paddle",
    "notes": [
      "Webhook endpoint; verify signature headers per provider."
    ],
    "source": "app/api/webhooks/paddle/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/webhooks/payments",
    "access": "public",
    "summary": "Inventory entry for /api/webhooks/payments",
    "notes": [
      "Webhook endpoint; verify signature headers per provider."
    ],
    "source": "app/api/webhooks/payments/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/webhooks/paystack",
    "access": "public",
    "summary": "Inventory entry for /api/webhooks/paystack",
    "notes": [
      "Webhook endpoint; verify signature headers per provider."
    ],
    "source": "app/api/webhooks/paystack/route.ts"
  },
  {
    "method": "POST",
    "path": "/api/webhooks/stripe",
    "access": "public",
    "summary": "Inventory entry for /api/webhooks/stripe",
    "notes": [
      "Webhook endpoint; verify signature headers per provider."
    ],
    "source": "app/api/webhooks/stripe/route.ts"
  }
] as const;

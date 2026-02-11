#!/bin/bash
# Archived: fix-api-auth.sh (2025-10)
# Clerk auth migration helper kept for history; paths were machine specific.

# List of API route files that need to be updated
files=(
  "/Users/doncaprio/Documents/GitHub/skrinsot/pro-app/app/api/checkout/route.ts"
  "/Users/doncaprio/Documents/GitHub/skrinsot/pro-app/app/api/user/settings/route.ts"
  "/Users/doncaprio/Documents/GitHub/skrinsot/pro-app/app/api/admin/support/tickets/[ticketId]/route.ts"
  "/Users/doncaprio/Documents/GitHub/skrinsot/pro-app/app/api/admin/support/tickets/[ticketId]/reply/route.ts"
  "/Users/doncaprio/Documents/GitHub/skrinsot/pro-app/app/api/notifications/[id]/read/route.ts"
  "/Users/doncaprio/Documents/GitHub/skrinsot/pro-app/app/api/notifications/mark-all-read/route.ts"
  "/Users/doncaprio/Documents/GitHub/skrinsot/pro-app/app/api/admin/notifications/create/route.ts"
)

echo "Updating API routes to use Clerk v5 authentication..."

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "Updating: $file"
    
    # Replace import statement
    sed -i '' 's/import { getAuthSafe } from.*auth\.ts.*/import { auth } from '\''@clerk\/nextjs\/server'\'';/' "$file"
    sed -i '' 's/import { getAuthSafe } from.*auth\.js.*/import { auth } from '\''@clerk\/nextjs\/server'\'';/' "$file"
    
    # Replace getAuthSafe() calls with auth()
    sed -i '' 's/const auth = await getAuthSafe();/const { userId } = auth();/' "$file"
    sed -i '' 's/if (!auth?.userId)/if (!userId)/' "$file"
    sed -i '' 's/auth\.userId/userId/g' "$file"
    
  else
    echo "File not found: $file"
  fi
 done

echo "API authentication update complete!"

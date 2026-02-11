#!/bin/bash
# Archived: fix-admin-imports.sh (2025-10)
# Admin import fixer kept for history; do not rely on these sed commands.

echo "Fixing admin route imports..."

# Fix all .js imports to .ts in admin routes
find app/api/admin -name "*.ts" -type f -exec sed -i '' 's/from '\''.*\/auth\.js'\''/from '\''..\/..\/..\/..\/..\/lib\/auth.ts'\''/g' {} \;
find app/api/admin -name "*.ts" -type f -exec sed -i '' 's/from '\''.*\/prisma\.js'\''/from '\''..\/..\/..\/..\/..\/lib\/prisma.ts'\''/g' {} \;
find app/api/admin -name "*.ts" -type f -exec sed -i '' 's/from '\''.*\/stripe\.js'\''/from '\''..\/..\/..\/..\/..\/lib\/stripe.ts'\''/g' {} \;

# Fix deeper nested routes
find app/api/admin -name "*.ts" -type f -exec sed -i '' 's/from '\''.*\/..\/..\/..\/..\/..\/..\/lib\/auth\.js'\''/from '\''..\/..\/..\/..\/..\/..\/lib\/auth.ts'\''/g' {} \;
find app/api/admin -name "*.ts" -type f -exec sed -i '' 's/from '\''.*\/..\/..\/..\/..\/..\/..\/lib\/prisma\.js'\''/from '\''..\/..\/..\/..\/..\/..\/lib\/prisma.ts'\''/g' {} \;
find app/api/admin -name "*.ts" -type f -exec sed -i '' 's/from '\''.*\/..\/..\/..\/..\/..\/..\/lib\/stripe\.js'\''/from '\''..\/..\/..\/..\/..\/..\/lib\/stripe.ts'\''/g' {} \;

# More specific fixes for exact patterns
sed -i '' 's/from '\''..\/..\/..\/..\/..\/lib\/auth\.js'\''/from '\''..\/..\/..\/..\/..\/lib\/auth.ts'\''/g' app/api/admin/settings/route.ts
sed -i '' 's/from '\''..\/..\/..\/..\/..\/lib\/prisma\.js'\''/from '\''..\/..\/..\/..\/..\/lib\/prisma.ts'\''/g' app/api/admin/settings/route.ts

sed -i '' 's/from '\''..\/..\/..\/..\/..\/..\/lib\/auth\.js'\''/from '\''..\/..\/..\/..\/..\/..\/lib\/auth.ts'\''/g' app/api/admin/plans/*/route.ts
sed -i '' 's/from '\''..\/..\/..\/..\/..\/..\/lib\/prisma\.js'\''/from '\''..\/..\/..\/..\/..\/..\/lib\/prisma.ts'\''/g' app/api/admin/plans/*/route.ts

sed -i '' 's/from '\''..\/..\/..\/..\/..\/..\/..\/lib\/auth\.js'\''/from '\''..\/..\/..\/..\/..\/..\/..\/lib\/auth.ts'\''/g' app/api/admin/payments/*/refund/route.ts
sed -i '' 's/from '\''..\/..\/..\/..\/..\/..\/..\/lib\/prisma\.js'\''/from '\''..\/..\/..\/..\/..\/..\/..\/lib\/prisma.ts'\''/g' app/api/admin/payments/*/refund/route.ts
sed -i '' 's/from '\''..\/..\/..\/..\/..\/..\/..\/lib\/stripe\.js'\''/from '\''..\/..\/..\/..\/..\/..\/..\/lib\/stripe.ts'\''/g' app/api/admin/payments/*/refund/route.ts

echo "Admin route imports fixed!"

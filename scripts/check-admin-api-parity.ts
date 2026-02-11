import fs from 'fs';
import path from 'path';

function extractCuratedKeys(text: string): Set<string> {
  const keys = new Set<string>();

  // Curated entries are objects like:
  // { method: 'GET', path: '/api/admin/...' }
  // Keep this intentionally simple and resilient to whitespace.
  const re = /method:\s*'([A-Z]+)'\s*,\s*\n\s*path:\s*'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    keys.add(`${match[1]} ${match[2]}`);
  }

  return keys;
}

function extractInventoryKeys(text: string): string[] {
  const keys: string[] = [];

  // Inventory is emitted as JSON-like objects containing:
  // "method": "GET", "path": "/api/admin/..."
  const re = /"method"\s*:\s*"([A-Z]+)"[\s\S]*?"path"\s*:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    keys.push(`${match[1]} ${match[2]}`);
  }

  return keys;
}

function main() {
  const root = process.cwd();
  const curatedPath = path.join(root, 'lib', 'admin-api.ts');
  const inventoryPath = path.join(root, 'lib', 'admin-api.inventory.ts');

  if (!fs.existsSync(curatedPath)) {
    console.error(`Missing curated file: ${curatedPath}`);
    process.exit(2);
  }
  if (!fs.existsSync(inventoryPath)) {
    console.error(`Missing inventory file: ${inventoryPath}`);
    process.exit(2);
  }

  const curatedText = fs.readFileSync(curatedPath, 'utf8');
  const inventoryText = fs.readFileSync(inventoryPath, 'utf8');

  const curated = extractCuratedKeys(curatedText);
  const invKeys = extractInventoryKeys(inventoryText);

  const remaining = invKeys
    .filter((key) => key.includes(' /api/admin/') && !curated.has(key))
    .sort();

  if (remaining.length > 0) {
    console.error(`Admin API docs parity check failed: ${remaining.length} endpoint(s) not curated.`);
    for (const key of remaining) {
      console.error(key);
    }
    process.exit(1);
  }

  console.log('Admin API docs parity check passed (all /api/admin endpoints are curated).');
}

main();

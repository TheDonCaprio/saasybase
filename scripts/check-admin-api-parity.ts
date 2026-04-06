import fs from 'fs';
import path from 'path';

function normalizeApiPath(value: string): string {
  return value.replace(/\?.*$/, '');
}

function extractCuratedKeys(text: string): Set<string> {
  const keys = new Set<string>();

  // Curated entries are objects like:
  // { method: 'GET', path: '/api/admin/...' }
  // Keep this intentionally simple and resilient to whitespace.
  const re = /method:\s*'([A-Z]+)'\s*,\s*\n\s*path:\s*'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    keys.add(`${match[1]} ${normalizeApiPath(match[2])}`);
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
    keys.push(`${match[1]} ${normalizeApiPath(match[2])}`);
  }

  return keys;
}

function extractAuthenticationSection(text: string): string | null {
  const match = text.match(/getAdminApiCatalog\(\): Promise<AdminApiCatalog> \{[\s\S]*?authentication:\s*\{([\s\S]*?)\n\s*\},\n\s*rateLimiting:/);
  return match ? match[1] : null;
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
  const inventoryKeySet = new Set(invKeys);

  const missingFromInventory = Array.from(curated)
    .filter((key) => !inventoryKeySet.has(key))
    .sort();

  if (missingFromInventory.length > 0) {
    console.error(`Admin API docs parity check failed: ${missingFromInventory.length} curated endpoint(s) are missing from inventory.`);
    for (const key of missingFromInventory) {
      console.error(key);
    }
    process.exit(1);
  }

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

  const authSection = extractAuthenticationSection(curatedText);
  if (!authSection) {
    console.error('Admin API docs parity check failed: could not locate authentication section.');
    process.exit(1);
  }

  const forbiddenAuthPhrases = ['Clerk session', 'Clerk session cookies'];
  const authPhrase = forbiddenAuthPhrases.find((phrase) => authSection.includes(phrase));
  if (authPhrase) {
    console.error(`Admin API docs parity check failed: authentication copy still hardcodes provider-specific phrasing (${authPhrase}).`);
    process.exit(1);
  }

  console.log('Admin API docs parity check passed (inventory coverage and shared auth copy are in sync).');
}

main();

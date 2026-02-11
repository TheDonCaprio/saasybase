#!/usr/bin/env node
/*
  ARCHIVED: fix-imports.js

  Reason: This is a development-only utility that mass-updates import statements
  to remove .ts/.tsx extensions. Moved to archive to reduce top-level script noise.

  To restore: copy this file back to pro-app/scripts/ and remove this header.
*/

// Script to fix TypeScript import extensions in Next.js project
// Next.js requires no .ts/.tsx extensions in imports

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const projectRoot = path.join(__dirname, '..', '..');

// Find all TypeScript/TSX files
const files = glob.sync('**/*.{ts,tsx}', {
  cwd: projectRoot,
  ignore: ['node_modules/**', '.next/**', 'dist/**']
});

console.log(`Found ${files.length} TypeScript files to check...`);

let totalFixed = 0;

files.forEach(filePath => {
  const fullPath = path.join(projectRoot, filePath);
  const content = fs.readFileSync(fullPath, 'utf8');
  
  // Fix imports ending with .ts or .tsx
  const fixedContent = content
    .replace(/import\s+(.+?)\s+from\s+['"](.+?)\.ts['"]/g, "import $1 from '$2'")
    .replace(/import\s+(.+?)\s+from\s+['"](.+?)\.tsx['"]/g, "import $1 from '$2'")
    .replace(/import\s+['"](.+?)\.ts['"]/g, "import '$1'")
    .replace(/import\s+['"](.+?)\.tsx['"]/g, "import '$1'");
  
  if (content !== fixedContent) {
    fs.writeFileSync(fullPath, fixedContent);
    console.log(`Fixed imports in: ${filePath}`);
    totalFixed++;
  }
});

console.log(`\nFixed ${totalFixed} files with import extension issues.`);

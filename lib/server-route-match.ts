import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { cache } from 'react';

const PAGE_FILE_CANDIDATES = [
  'page.tsx',
  'page.ts',
  'page.jsx',
  'page.js',
  'page.mdx',
];

function isRouteGroup(name: string) {
  return name.startsWith('(') && name.endsWith(')');
}

function isParallelRoute(name: string) {
  return name.startsWith('@');
}

function isOptionalCatchAll(name: string) {
  return /^\[\[\.\.\.[^/]+\]\]$/.test(name);
}

function isCatchAll(name: string) {
  return /^\[\.\.\.[^/]+\]$/.test(name) || isOptionalCatchAll(name);
}

function isSingleDynamic(name: string) {
  return /^\[[^.[/][^/]*\]$/.test(name);
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasPageFile(dirPath: string) {
  for (const fileName of PAGE_FILE_CANDIDATES) {
    if (await fileExists(path.join(dirPath, fileName))) {
      return true;
    }
  }
  return false;
}

async function listDirectories(dirPath: string) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [] as string[];
  }
}

const matchRouteFromDir = cache(async function matchRouteFromDir(dirPath: string, segments: string[]): Promise<boolean> {
  const childDirs = await listDirectories(dirPath);

  for (const groupName of childDirs) {
    if (isRouteGroup(groupName)) {
      if (await matchRouteFromDir(path.join(dirPath, groupName), segments)) {
        return true;
      }
    }
  }

  if (segments.length === 0) {
    if (await hasPageFile(dirPath)) {
      return true;
    }

    for (const childName of childDirs) {
      if (isOptionalCatchAll(childName) && await hasPageFile(path.join(dirPath, childName))) {
        return true;
      }
    }

    return false;
  }

  const [segment, ...rest] = segments;
  const exactDir = childDirs.find((childName) => childName === segment);
  if (exactDir && await matchRouteFromDir(path.join(dirPath, exactDir), rest)) {
    return true;
  }

  for (const childName of childDirs) {
    if (isParallelRoute(childName) || isRouteGroup(childName) || childName === segment) {
      continue;
    }

    if (isCatchAll(childName) && await hasPageFile(path.join(dirPath, childName))) {
      return true;
    }

    if (isSingleDynamic(childName) && await matchRouteFromDir(path.join(dirPath, childName), rest)) {
      return true;
    }
  }

  return false;
});

export async function hasMatchingAppRoute(area: 'admin' | 'dashboard', pathname: string | null | undefined) {
  if (!pathname) return false;

  const normalized = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  const areaPrefix = `/${area}`;
  if (normalized === areaPrefix) {
    return true;
  }
  if (!normalized.startsWith(`${areaPrefix}/`)) {
    return false;
  }

  const relativeSegments = normalized.slice(areaPrefix.length + 1).split('/').filter(Boolean);
  if (relativeSegments.length === 0) {
    return true;
  }

  const areaDir = path.join(process.cwd(), 'app', area);
  return matchRouteFromDir(areaDir, relativeSegments);
}
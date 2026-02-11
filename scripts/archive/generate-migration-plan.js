#!/usr/bin/env node
// Archived: generate-migration-plan.js (2025-10)
// Logger migration helper retained for posterity.

/**
 * Security Migration Script - Automated Logger Migration
 * Helps replace console.log statements with secure Logger calls
 */

const fs = require('fs').promises;
const path = require('path');

const HIGH_PRIORITY_PATHS = [
  'app/api',
  'lib',
  'components'
];

const SENSITIVE_PATTERNS = [
  /console\.log.*user.*id/i,
  /console\.log.*email/i,
  /console\.log.*password/i,
  /console\.log.*token/i,
  /console\.log.*key/i,
  /console\.log.*secret/i,
  /console\.log.*payment/i,
  /console\.log.*stripe/i,
  /console\.error.*user/i,
  /console\.error.*payment/i
];

async function getMigrationCandidates() {
  const candidates = [];
  
  for (const dir of HIGH_PRIORITY_PATHS) {
    try {
      const dirPath = path.join(process.cwd(), dir);
      await collectFiles(dirPath, candidates);
    } catch (error) {
      console.log(`Directory ${dir} not found, skipping...`);
    }
  }
  
  return candidates;
}

async function collectFiles(dir, candidates) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      await collectFiles(fullPath, candidates);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      const content = await fs.readFile(fullPath, 'utf8');
      const issues = analyzeFile(content, fullPath);
      
      if (issues.length > 0) {
        candidates.push({
          file: fullPath,
          issues: issues
        });
      }
    }
  }
}

function analyzeFile(content, filePath) {
  const lines = content.split('\n');
  const issues = [];
  
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    if (trimmed.includes('console.log') || trimmed.includes('console.error') || trimmed.includes('console.warn')) {
      let severity = 'LOW';
      
      // Check for sensitive patterns
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(trimmed)) {
          severity = 'HIGH';
          break;
        }
      }
      
      // Check for user IDs, emails, etc.
      if (trimmed.includes('userId') || trimmed.includes('user.email') || 
          trimmed.includes('paymentId') || trimmed.includes('customerId')) {
        severity = 'HIGH';
      }
      
      issues.push({
        line: index + 1,
        content: trimmed,
        severity: severity,
        type: getLogType(trimmed)
      });
    }
  });
  
  return issues;
}

function getLogType(line) {
  if (line.includes('console.error')) return 'error';
  if (line.includes('console.warn')) return 'warn';
  if (line.includes('console.log')) return 'log';
  return 'unknown';
}

async function generateMigrationPlan(candidates) {
  console.log('🔧 MIGRATION PLAN GENERATOR\n');
  
  // Sort by priority (high severity issues first)
  candidates.sort((a, b) => {
    const aHigh = a.issues.filter(i => i.severity === 'HIGH').length;
    const bHigh = b.issues.filter(i => i.severity === 'HIGH').length;
    return bHigh - aHigh;
  });
  
  console.log('📋 MIGRATION PRIORITY ORDER:\n');
  
  candidates.slice(0, 20).forEach((candidate, index) => {
    const highCount = candidate.issues.filter(i => i.severity === 'HIGH').length;
    const totalCount = candidate.issues.length;
    
    console.log(`${index + 1}. ${path.relative(process.cwd(), candidate.file)}`);
    console.log(`   🚨 High Priority: ${highCount} | 📊 Total: ${totalCount}`);
    
    // Show top 3 high-severity issues
    const highIssues = candidate.issues.filter(i => i.severity === 'HIGH').slice(0, 3);
    highIssues.forEach(issue => {
      console.log(`   Line ${issue.line}: ${issue.content.substring(0, 80)}...`);
    });
    console.log('');
  });
  
  return candidates;
}

async function generateReplacements(candidates) {
  console.log('\n💡 SUGGESTED REPLACEMENTS:\n');
  
  const suggestions = [
    {
      pattern: /console\.log\(['"]([^'"]+)['"],\s*(.+)\)/,
      replacement: "Logger.info('$1', $2)",
      description: "Basic console.log with data"
    },
    {
      pattern: /console\.log\(['"]([^'"]+)['"]\)/,
      replacement: "Logger.info('$1')",
      description: "Simple console.log message"
    },
    {
      pattern: /console\.error\(['"]([^'"]+)['"],\s*(.+)\)/,
      replacement: "Logger.error('$1', $2)",
      description: "Console.error with data"
    },
    {
      pattern: /console\.warn\(['"]([^'"]+)['"],\s*(.+)\)/,
      replacement: "Logger.warn('$1', $2)",
      description: "Console.warn with data"
    }
  ];
  
  suggestions.forEach((suggestion, index) => {
    console.log(`${index + 1}. ${suggestion.description}:`);
    console.log(`   Pattern: ${suggestion.pattern}`);
    console.log(`   Replace: ${suggestion.replacement}\n`);
  });
}

async function main() {
  console.log('🔍 Analyzing codebase for migration opportunities...\n');
  
  const candidates = await getMigrationCandidates();
  
  if (candidates.length === 0) {
    console.log('✅ No migration candidates found!');
    return;
  }
  
  await generateMigrationPlan(candidates);
  await generateReplacements(candidates);
  
  // Summary
  const totalIssues = candidates.reduce((sum, c) => sum + c.issues.length, 0);
  const highSeverityCount = candidates.reduce((sum, c) => 
    sum + c.issues.filter(i => i.severity === 'HIGH').length, 0
  );
  
  console.log('📈 MIGRATION SUMMARY:');
  console.log(`   Files to migrate: ${candidates.length}`);
  console.log(`   Total issues: ${totalIssues}`);
  console.log(`   High priority: ${highSeverityCount}`);
  console.log(`   Estimated time: ${Math.ceil(candidates.length * 2)} minutes\n`);
  
  console.log('🚀 NEXT STEPS:');
  console.log('1. Start with high-priority files (listed above)');
  console.log('2. Add Logger import: import { Logger } from "@/lib/logger"');
  console.log('3. Replace console statements using suggested patterns');
  console.log('4. Test each file after migration');
  console.log('5. Run security analysis again to track progress\n');
  
  if (highSeverityCount > 0) {
    console.log('⚠️  SECURITY WARNING: Fix high-priority issues immediately!');
    console.log('   These may expose sensitive data in production logs.\n');
  }
}

main().catch(console.error);

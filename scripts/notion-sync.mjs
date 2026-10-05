#!/usr/bin/env node
/**
 * Notion Task Sync Script
 * 
 * Scans git commit messages for task identifiers (e.g. TGLA-041, TGLA-105)
 * and updates their status in the Notion Tasks Database.
 * 
 * Usage:
 *   node scripts/notion-sync.mjs [--dry-run] [--commit <sha|message>]
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Auto-load .env file if running locally
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1].trim()]) {
        process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
} catch {
  // Ignore error if .env cannot be read
}

const NOTION_API_KEY = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
const NOTION_TASKS_DB_ID = process.env.NOTION_TASKS_DB_ID || '73594813-9137-82eb-887a-8157fd353c7a';
const isDryRun = process.argv.includes('--dry-run');

function getCommitInfo() {
  const commitArgIndex = process.argv.indexOf('--commit');
  if (commitArgIndex !== -1 && process.argv[commitArgIndex + 1]) {
    return {
      sha: 'manual',
      message: process.argv[commitArgIndex + 1],
    };
  }

  try {
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const message = execSync('git log -n 1 --pretty=%B', { encoding: 'utf8' }).trim();
    return { sha, message };
  } catch (err) {
    console.warn('⚠️ Could not extract git commit info:', err.message);
    return { sha: 'unknown', message: '' };
  }
}

function extractTaskIds(message) {
  const matches = message.match(/TGLA-\d+/gi) || [];
  return [...new Set(matches.map(id => id.toUpperCase()))];
}

async function queryNotionTask(taskId) {
  const url = `https://api.notion.com/v1/databases/${NOTION_TASKS_DB_ID}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: {
        property: 'ID of tasks',
        rich_text: {
          equals: taskId,
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to query Notion database: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.results[0] || null;
}

async function updateNotionTask(pageId, taskId, commitSha) {
  const url = `https://api.notion.com/v1/pages/${pageId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        Statut: {
          status: {
            name: 'Fait',
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update Notion task ${taskId}: ${res.status} ${text}`);
  }

  // Add comment with commit reference
  try {
    await fetch('https://api.notion.com/v1/comments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { page_id: pageId },
        rich_text: [
          {
            text: {
              content: `✅ Automatiquement marqué comme "Fait" par GitHub Actions suite au commit ${commitSha.slice(0, 7)}`,
            },
          },
        ],
      }),
    });
  } catch (commentErr) {
    console.warn(`Could not add comment to task ${taskId}:`, commentErr.message);
  }
}

async function main() {
  console.log('🔄 Checking commits for Notion Task Sync...');
  const { sha, message } = getCommitInfo();
  console.log(`📌 Commit: ${sha.slice(0, 7)} — "${message.split('\n')[0]}"`);

  const taskIds = extractTaskIds(message);
  if (taskIds.length === 0) {
    console.log('ℹ️ No TGLA-xxx task identifier found in commit message. Skipping sync.');
    process.exit(0);
  }

  console.log(`🎯 Found task(s): ${taskIds.join(', ')}`);

  if (isDryRun) {
    console.log('🧪 DRY-RUN mode: Notion updates simulated successfully.');
    process.exit(0);
  }

  if (!NOTION_API_KEY) {
    console.warn('⚠️ NOTION_API_KEY is not set. Cannot update Notion.');
    console.warn('   Add NOTION_API_KEY to your GitHub repository secrets.');
    process.exit(0);
  }

  for (const taskId of taskIds) {
    try {
      console.log(`🔍 Searching Notion task ${taskId}...`);
      const page = await queryNotionTask(taskId);
      if (!page) {
        console.warn(`⚠️ Task ${taskId} not found in Notion database.`);
        continue;
      }

      console.log(`✅ Updating ${taskId} (Page ID: ${page.id}) to "Fait"...`);
      await updateNotionTask(page.id, taskId, sha);
      console.log(`🎉 Successfully synced ${taskId} on Notion!`);
    } catch (err) {
      console.error(`❌ Error syncing task ${taskId}:`, err.message);
    }
  }
}

main().catch(err => {
  console.error('Fatal error in notion-sync:', err);
  process.exit(1);
});

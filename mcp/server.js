#!/usr/bin/env node
/**
 * Chronicle MCP Server
 * Exposes two tools to Jarvis:
 *   chronicle_read  — fetch live data.json from GitHub
 *   chronicle_write — atomically write data.json (always fetches fresh SHA first)
 *
 * Config via env:
 *   CHRONICLE_PAT   — GitHub personal access token (repo scope)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import https from 'https';

const PAT    = process.env.CHRONICLE_PAT;
const OWNER  = 'rayyanali722-cmyk';
const REPO   = 'chronicle';
const FILE   = 'data.json';
const BRANCH = 'main';

if (!PAT) {
  process.stderr.write('CHRONICLE_PAT env var is required\n');
  process.exit(1);
}

// ── GitHub API helper ────────────────────────────────────────────────────────

function ghRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `token ${PAT}`,
        'User-Agent':    'chronicle-mcp/1.0',
        'Accept':        'application/vnd.github.v3+json',
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try   { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── MCP server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name:    'chronicle',
  version: '1.0.0'
});

// ── Tool: chronicle_read ─────────────────────────────────────────────────────

server.tool(
  'chronicle_read',
  'Fetch the live Chronicle data.json from GitHub. Returns the full parsed data object ' +
  '(projects, tasks, focus, meta). Call this at the start of every Jarvis session.',
  {},
  async () => {
    const res = await ghRequest(
      'GET',
      `/repos/${OWNER}/${REPO}/contents/${FILE}?ref=${BRANCH}`,
      null
    );

    if (res.status !== 200) {
      return {
        content: [{ type: 'text', text: `Error ${res.status}: ${res.body.message || res.body}` }],
        isError: true
      };
    }

    let data;
    try {
      const raw = Buffer.from(res.body.content.replace(/\n/g, ''), 'base64').toString('utf8');
      data = JSON.parse(raw);
    } catch (e) {
      return {
        content: [{ type: 'text', text: `Failed to parse data.json: ${e.message}` }],
        isError: true
      };
    }

    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  }
);

// ── Tool: chronicle_write ────────────────────────────────────────────────────

server.tool(
  'chronicle_write',
  'Write the full updated Chronicle data.json to GitHub. ' +
  'ALWAYS fetches a fresh SHA immediately before writing — stale SHA errors are impossible. ' +
  'Before calling, set meta.lastUpdated to the current ISO timestamp. ' +
  'Returns { success: true, commit: "<sha>" } on success.',
  {
    data:    z.record(z.any()).describe('The complete updated data.json object to write'),
    message: z.string().optional().describe('Commit message — defaults to "Jarvis: update data.json [YYYY-MM-DD]"')
  },
  async ({ data, message }) => {
    // 1. Always fetch a fresh SHA right before writing
    const getRes = await ghRequest(
      'GET',
      `/repos/${OWNER}/${REPO}/contents/${FILE}?ref=${BRANCH}`,
      null
    );
    if (getRes.status !== 200) {
      return {
        content: [{ type: 'text', text: `SHA fetch failed ${getRes.status}: ${getRes.body.message || getRes.body}` }],
        isError: true
      };
    }
    const sha = getRes.body.sha;

    // 2. Encode and PUT
    const today         = new Date().toISOString().split('T')[0];
    const commitMessage = message || `Jarvis: update data.json [${today}]`;
    const content       = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

    const putRes = await ghRequest(
      'PUT',
      `/repos/${OWNER}/${REPO}/contents/${FILE}`,
      { message: commitMessage, content, sha, branch: BRANCH }
    );

    if (putRes.status === 200 || putRes.status === 201) {
      const commitSha = putRes.body.commit?.sha || 'ok';
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, commit: commitSha }) }]
      };
    }

    return {
      content: [{ type: 'text', text: `Write failed ${putRes.status}: ${putRes.body.message || putRes.body}` }],
      isError: true
    };
  }
);

// ── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

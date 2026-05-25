#!/usr/bin/env node
/**
 * Chronicle Jarvis — GitHub write helper.
 * Usage: node write_data.js <pat> <data-json-string>
 * Reads current SHA, then PUTs the new data.json to GitHub.
 * Exits 0 on success, 1 on error. Prints result JSON to stdout.
 */

const https = require('https');

const [,, pat, dataStr] = process.argv;
if (!pat || !dataStr) {
  console.error('Usage: node write_data.js <pat> <data-json-string>');
  process.exit(1);
}

const OWNER = 'rayyanali722-cmyk';
const REPO  = 'chronicle';
const PATH  = 'data.json';
const BRANCH = 'main';

function ghRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'chronicle-jarvis',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  const getRes = await ghRequest('GET', `/repos/${OWNER}/${REPO}/contents/${PATH}?ref=${BRANCH}`, null, pat);
  if (getRes.status !== 200) {
    console.error('Failed to GET current file:', getRes.status, getRes.body.message);
    process.exit(1);
  }
  const sha = getRes.body.sha;

  let parsed;
  try { parsed = JSON.parse(dataStr); }
  catch (e) { console.error('Invalid JSON provided:', e.message); process.exit(1); }

  const content = Buffer.from(JSON.stringify(parsed, null, 2)).toString('base64');
  const putRes = await ghRequest('PUT', `/repos/${OWNER}/${REPO}/contents/${PATH}`, {
    message: `Jarvis: update data.json [${new Date().toISOString().split('T')[0]}]`,
    content,
    sha,
    branch: BRANCH
  }, pat);

  if (putRes.status === 200 || putRes.status === 201) {
    console.log(JSON.stringify({ success: true, commit: putRes.body.commit?.sha || 'ok' }));
  } else {
    console.error('PUT failed:', putRes.status, putRes.body.message);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

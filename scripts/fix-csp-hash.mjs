// Recompute the inline-script CSP hash in index.html, in place.
//
// The app is a single file with no build step, so hand-editing the inline
// <script> leaves the <meta Content-Security-Policy> hash stale — and a stale
// hash makes CSP block the only script the page has, which dead-parses the whole
// app. refresh-data.mjs regenerates the hash, but it also rewrites the dataset
// from Overpass, so it is not a safe thing to run just to fix a hash after an
// edit. This script does only the hash, and nothing else.
//
// It reuses the exact normalisation refresh-data.mjs uses (CRLF/CR -> LF, which
// is what the HTML input preprocessor does before hashing), so the two agree.
//
// Usage: node scripts/fix-csp-hash.mjs [--check]
//   --check  exit 1 if the on-disk hash is stale, write nothing.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = path.join(root, 'index.html');
const checkOnly = process.argv.includes('--check');

const lf = (s) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const html = fs.readFileSync(file, 'utf8');

const hashes = [...lf(html).matchAll(/<script(?![^>]*\bsrc)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => crypto.createHash('sha256').update(m[1], 'utf8').digest('base64'))
  .map((h) => `'sha256-${h}'`);

if (!hashes.length) throw new Error('no inline <script> to hash — CSP would leave the page un-executable');

const policy = `default-src 'self'; script-src 'self' ${hashes.join(' ')}; `
  + `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; `
  + `font-src https://fonts.gstatic.com; img-src 'self'; connect-src 'self'; `
  + `object-src 'none'; base-uri 'none'; form-action 'none'`;

const current = html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1];
if (current === policy) {
  console.log('CSP hash up to date: ' + hashes.join(' '));
  process.exit(0);
}

if (checkOnly) {
  console.log('CSP hash STALE.');
  console.log('  on disk: ' + (current || '(no CSP meta tag)'));
  console.log('  expected: ' + policy);
  process.exit(1);
}

const next = html
  .replace(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>\r?\n?/g, '')
  .replace(/<\/title>/, `</title>\n<meta http-equiv="Content-Security-Policy" content="${policy}">`);

if (next === html) throw new Error('CSP rewrite produced no change but hash was stale — inspect index.html manually');
fs.writeFileSync(file, next);
console.log('CSP hash regenerated: ' + hashes.join(' '));
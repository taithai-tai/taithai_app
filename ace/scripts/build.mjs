import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function buildACE({ output = path.join(root, 'public'), basePath = '', siteUrl = '', apiPath = '/api/ace/' } = {}) {
  if (basePath && !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(basePath)) throw new Error('Invalid ACE base path');
  if (!/^\/api\/[A-Za-z0-9_/-]+$/.test(apiPath)) throw new Error('Invalid ACE API path');
  const source = path.join(root, 'site');
  await fs.mkdir(output, { recursive: true });
  async function copy(directory, destination) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const from = path.join(directory, entry.name);
      const to = path.join(destination, entry.name);
      if (entry.isDirectory()) { await fs.mkdir(to, { recursive: true }); await copy(from, to); continue; }
      if (/\.(html|js|css|xml|txt)$/.test(entry.name)) {
        let content = await fs.readFile(from, 'utf8');
        content = content.replaceAll('/api/ai', apiPath);
        // Prefix browser URL literals, including those in shared HTML templates.
        // The server endpoint stays at its dedicated root API route.
        content = content.replace(/(["'`])\/(?!\/)([^"'`\s<>]*)/g, (match, quote, route) => {
          if (route.startsWith('api/')) return match;
          return `${quote}${basePath}/${route}`;
        });
        const oldOrigin = 'https://ace-everyday-taithai.taithai5002.chatgpt.site';
        content = content.replaceAll(oldOrigin, siteUrl || basePath || '/');
        if (entry.name === 'site.js' && basePath) {
          content = content.replace('<strong>สำรวจเว็บไซต์</strong>', '<strong>สำรวจเว็บไซต์</strong><a href="/">กลับ Taithai Apps</a>');
        }
        await fs.writeFile(to, content);
      } else await fs.copyFile(from, to);
    }
  }
  await copy(source, output);
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`ACE built in ${await buildACE({ basePath: process.env.ACE_BASE_PATH || '', siteUrl: process.env.ACE_SITE_URL || '' })}`);
}

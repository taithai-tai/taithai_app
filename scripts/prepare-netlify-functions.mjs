import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const netlifyFunctionsDirectory = path.join(root, 'netlify', 'generated-functions');
const source = path.join(root, 'netlify', 'functions');
const membershipFunctions = new Set(['membership.js', 'membership-webhook.js']);

export async function prepareNetlifyFunctions() {
  await rm(netlifyFunctionsDirectory, { recursive: true, force: true });
  await mkdir(netlifyFunctionsDirectory, { recursive: true });
  const files = (await readdir(source)).filter(file => file.endsWith('.js')).sort();
  for (const file of files) {
    if (!membershipFunctions.has(file)) {
      // A sibling directory retains the original relative imports. These nine
      // handlers are copied byte-for-byte, including their routes and gates.
      await cp(path.join(source, file), path.join(netlifyFunctionsDirectory, file));
      continue;
    }
    // Netlify's API-v2 packager uses NFT even when node_bundler is esbuild.
    // Compile Firebase Admin + jwks-rsa + ESM-only jose before that tracing
    // step, keeping the latest security fixes without Lambda experimental flags.
    // NFT supplies its own CJS compatibility prelude; duplicating it here would
    // create colliding declarations in the deployed module.
    await build({
      entryPoints: [path.join(source, file)],
      outfile: path.join(netlifyFunctionsDirectory, file.replace(/\.js$/, '.mjs')),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      // Firebase's bundled CommonJS wrapper reaches this package through an
      // esbuild helper. Keep a static import so NFT traces its runtime files.
      banner: { js: "import '@google-cloud/firestore';" },
      external: ['@google-cloud/firestore', 'imapflow', 'nodemailer', 'mailparser', 'stripe'],
      logLevel: 'warning',
    });
  }
  return files.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Prepared ${await prepareNetlifyFunctions()} Netlify functions`);
}

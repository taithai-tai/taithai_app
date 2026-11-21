// Release check against Netlify's real NFT packages, not only source imports.
// Pass the official zip-it-and-ship-it module path when installed outside this
// repository. NETLIFY_COMPAT_NODE can select the deployed Node.js major.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { prepareNetlifyFunctions, netlifyFunctionsDirectory } from './prepare-netlify-functions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packager = process.argv[2] ? pathToFileURL(path.resolve(process.argv[2])).href : '@netlify/zip-it-and-ship-it';
const { zipFunction } = await import(packager);
const source = path.join(root, 'netlify', 'functions');
const files = (await readdir(source)).filter(file => file.endsWith('.js')).sort();
const hash = value => createHash('sha256').update(value).digest('hex');
const before = new Map(await Promise.all(files.map(async file => [file, hash(await readFile(path.join(source, file)))])));
assert.equal(await prepareNetlifyFunctions(), 14);
assert.equal((await readdir(netlifyFunctionsDirectory)).length, 14);
for (const file of files) {
  assert.equal(hash(await readFile(path.join(source, file))), before.get(file), `Source was overwritten: ${file}`);
  if (!file.startsWith('membership') && !['site-admin.js','social.js','social-media.js'].includes(file)) {
    assert.equal(hash(await readFile(path.join(netlifyFunctionsDirectory, file))), before.get(file), `Handler changed: ${file}`);
  }
}

const output = await mkdtemp(path.join(os.tmpdir(), 'taithai-netlify-package-'));
try {
  for (const name of ['membership', 'membership-webhook', 'site-admin', 'social', 'social-media']) {
    const artifact = await zipFunction(path.join(netlifyFunctionsDirectory, name + '.mjs'), output, {
      archiveFormat: 'none', basePath: root, repositoryRoot: root,
      config: { '*': { nodeVersion: '22', nodeBundler: 'esbuild',
        externalNodeModules: ['firebase-admin', '@google-cloud/firestore', 'imapflow', 'nodemailer', 'mailparser', 'stripe'] } },
    });
    assert.equal(artifact.runtimeAPIVersion, 2);
    assert.equal(artifact.bundler, 'nft');
    const bootstrap = await readFile(path.join(artifact.path, '___netlify-entry-point.mjs'), 'utf8');
    const entry = bootstrap.match(/getLambdaHandler\('([^']+)'\)/)?.[1];
    assert.ok(entry, 'Packaged function entry missing');
    const moduleUrl = pathToFileURL(path.resolve(artifact.path, entry)).href;
    const code = `
      import assert from 'node:assert/strict';
      import { generateKeyPairSync } from 'node:crypto';
      const { default: handler, config } = await import(${JSON.stringify(moduleUrl)});
      const base='https://trial-example.netlify.app', name=${JSON.stringify(name)};
      assert.deepEqual(config.path,['/api/'+name,'/api/'+name+'/']);
      assert.equal((await handler(new Request(base+'/.netlify/functions/'+name))).status,404);
      if (name==='membership') {
        const response=await handler(new Request(base+'/api/membership/?action=status'));
        assert.equal(response.status,200);
        const status=await response.json();
        assert.equal(status.ready,false);assert.equal(status.adminOnly,true);assert.equal(status.ownerAccess,false);
        assert.equal(status.paid,false);assert.equal(status.ownerTrial,false);assert.equal(status.canCreate,false);assert.equal(status.canSend,false);
        assert.ok(status.setupReasons.includes('MEMBERSHIP_NOT_READY'));
        // Initialize the packaged Auth and named Firestore clients using a
        // locally generated fixture key. A malformed bearer fails before any
        // network request. This detects missing external SDK files as well.
        const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON=JSON.stringify({project_id:'gen-lang-client-0141234491',client_email:'fixture@example.invalid',private_key:privateKey});
        const denied=await handler(new Request(base+'/api/membership/?action=admin-status',{headers:{authorization:'Bearer short'}}));
        assert.equal(denied.status,401);assert.equal((await denied.json()).error.code,'AUTH_REQUIRED');
      } else if (name==='social-media') {
        const response=await handler(new Request(base+'/api/social-media/?action=health'));
        assert.equal(response.status,401);assert.equal((await response.json()).error.code,'AUTH_REQUIRED');
      } else if (name==='site-admin' || name==='social') {
        const action=name==='social'?'me':'access';
        const response=await handler(new Request(base+'/api/'+name+'/?action='+action));
        assert.equal(response.status,401);assert.equal((await response.json()).error.code,'AUTH_REQUIRED');
        const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON=JSON.stringify({project_id:'gen-lang-client-0141234491',client_email:'fixture@example.invalid',private_key:privateKey});
        const denied=await handler(new Request(base+'/api/'+name+'/?action='+action,{headers:{authorization:'Bearer fixture-not-a-jwt-minimum-20'}}));
        assert.equal(denied.status,401);assert.equal((await denied.json()).error.code,'AUTH_REQUIRED');
      } else {
        const response=await handler(new Request(base+'/api/membership-webhook/',{method:'POST',body:'{}'}));
        assert.equal(response.status,403);assert.equal((await response.json()).error.code,'BILLING_DISABLED');
      }
      console.log(JSON.stringify({function:name,node:process.version,packaged:true,passed:true}));
    `;
    const { stdout } = await promisify(execFile)(process.env.NETLIFY_COMPAT_NODE || process.execPath,
      ['--no-experimental-require-module', '--no-experimental-detect-module', '--input-type=module', '-e', code],
      { cwd: artifact.path, env: { PATH: process.env.PATH || '', NODE_ENV: 'production' }, timeout: 30000, maxBuffer: 1024 * 1024 });
    process.stdout.write(stdout);
  }
} finally {
  await rm(output, { recursive: true, force: true });
}

// Run from this repository; private inputs MUST stay outside the repository.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {marketStatus} from '../taithai/news/markets.js';
import {importPair,encrypt,decrypt,validateArchive} from '../taithai/news/crypto.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [source,pairPath]=process.argv.slice(2);
if(!source||!pairPath)throw new Error('Usage: node scripts/publish-new-edition.mjs <private-edition.json> <private-pairing.json>');
for(const p of [source,pairPath]){const rel=path.relative(root,path.resolve(p));if(!rel.startsWith('..'+path.sep))throw new Error('Private inputs must be outside the repository / public build.');}
let pair;
try{pair=JSON.parse(await readFile(pairPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;pair={version:1,feed:randomUUID(),key:randomBytes(32).toString('base64url')};await mkdir(path.dirname(path.resolve(pairPath)),{recursive:true,mode:0o700});await writeFile(pairPath,JSON.stringify(pair),{mode:0o600,flag:'wx'});}
const imported=await importPair(pair),destination=path.join(root,'taithai/news/feeds',pair.feed+'.json');
let editions=[];try{const old=validateArchive(await decrypt(imported.key,JSON.parse(await readFile(destination,'utf8'))));editions=old.editions;}catch(e){if(e.code!=='ENOENT')throw e;}
const edition=JSON.parse(await readFile(source,'utf8'));
if(edition.markets && marketStatus(edition.markets)==='invalid')throw new Error('Invalid market plan; check prices, dates, targets, and sources.');
if(editions.some(e=>e.id===edition.id))throw new Error('Edition ids are immutable; use a new id for an actual new edition.');
const archive=validateArchive({version:1,editions:[edition,...editions]});
await mkdir(path.dirname(destination),{recursive:true});
await writeFile(destination,JSON.stringify(await encrypt(imported.key,archive))+'\n');
console.log(`Encrypted archive published: ${archive.editions.length} edition(s). Pairing key was not printed.`);

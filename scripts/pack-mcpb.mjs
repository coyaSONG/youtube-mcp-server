// MCPB unsigned bundles are ZIP archives; signing is deliberately a separate operation.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { zipSync } from 'fflate';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const stage = join(root, '.mcpb-stage');
const manifest = JSON.parse(await readFile(join(stage, 'manifest.json'), 'utf8'));
const schema = JSON.parse(await readFile(join(root, 'scripts/vendor/mcpb-manifest-v0.4.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
assert.ok(ajv.validate(schema, manifest), ajv.errorsText());

const entries = Object.create(null);
async function collect(directory, prefix = '') {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    // npm executable shims are unnecessary: the manifest launches node directly.
    if (entry.name === '.bin') continue;
    const name = prefix + entry.name;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path, `${name}/`);
    else if (entry.isFile()) entries[name] = await readFile(path);
    else throw new Error(`Unsupported bundle entry: ${name}`);
  }
}
await collect(stage);
assert.ok(entries[manifest.server.entry_point], 'Bundle entry point must exist');
const artifact = join(root, 'artifacts/youtube-research-mcp.mcpb');
await writeFile(artifact, zipSync(entries, { level: 6 }));
console.log(`Packed ${Object.keys(entries).length} files into ${artifact}`);

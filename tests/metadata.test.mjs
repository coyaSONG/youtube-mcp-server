import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
}

test('distribution manifests describe the same release', async () => {
  const [packageJson, registryManifest, mcpbManifest] = await Promise.all([
    readJson('../package.json'),
    readJson('../server.json'),
    readJson('../mcpb/manifest.json'),
  ]);

  assert.equal(registryManifest.version, packageJson.version);
  assert.equal(mcpbManifest.version, packageJson.version);
  assert.equal(registryManifest.name, packageJson.mcpName);
  assert.equal(mcpbManifest.display_name, registryManifest.title);
  assert.equal(mcpbManifest.tools_generated, false);
  assert.equal(mcpbManifest.tools.length, 14);
  assert.equal(new Set(mcpbManifest.tools.map(({ name }) => name)).size, 14);
  assert.ok(
    mcpbManifest.tools.every(({ name, description }) => name && description),
  );
  assert.equal(
    mcpbManifest.repository.url,
    registryManifest.repository.url,
  );
});

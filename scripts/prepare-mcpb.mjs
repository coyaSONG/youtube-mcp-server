import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const stage = join(projectRoot, '.mcpb-stage');
const artifactDirectory = join(projectRoot, 'artifacts');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const packageJson = JSON.parse(
  await readFile(join(projectRoot, 'package.json'), 'utf8'),
);
const manifest = JSON.parse(
  await readFile(join(projectRoot, 'mcpb', 'manifest.json'), 'utf8'),
);

assert.equal(
  manifest.version,
  packageJson.version,
  'MCPB manifest and package versions must match',
);

await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await mkdir(artifactDirectory, { recursive: true });

for (const file of [
  'package.json',
  'package-lock.json',
  'README.md',
  'LICENSE',
  'SECURITY.md',
]) {
  await cp(join(projectRoot, file), join(stage, file));
}
await cp(join(projectRoot, 'mcpb', 'manifest.json'), join(stage, 'manifest.json'));
await cp(join(projectRoot, 'dist'), join(stage, 'dist'), { recursive: true });

execFileSync(
  npmCommand,
  ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
  { cwd: stage, stdio: 'inherit' },
);

console.log(`Prepared MCPB staging directory at ${stage}`);

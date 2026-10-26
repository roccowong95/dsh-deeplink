import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('packed production install works without checkout dependencies or a shared Host runtime', { timeout: 180000 }, async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-deeplink-install-'));
  const env = { ...process.env, NODE_PATH: '', npm_config_cache: process.env.npm_config_cache || join(temp, 'cache') };
  const run = (command, args, cwd) => execFileSync(command, args, { cwd, env, encoding: 'utf8', timeout: 150000 });
  try {
    const consumer = join(temp, 'consumer');
    await mkdir(consumer);
    await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', temp], root));
    const tarball = join(temp, packed[0].filename);
    run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', tarball], consumer);
    const packageDir = join(consumer, 'node_modules/dsh-deeplink');
    assert.equal(await realpath(packageDir), packageDir, 'must install a copy, not link the checkout');
    const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
    for (const file of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml']) await readFile(join(packageDir, file));
    assert.equal(manifest.main, 'lib/index.js');
    await assert.rejects(realpath(join(consumer, 'node_modules/@deepseek-ai/dsh-api-gateway')), { code: 'ENOENT' });
    const result = run(process.execPath, [join(root, 'test/helpers/installed-gateway.mjs'), root, consumer], consumer);
    assert.match(result, /owner guard passed/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

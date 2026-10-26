import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
test('missing local-link dependencies are recovered by replacing the link and restarting the process', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-deeplink-recovery-'));
  try {
    const checkout = join(temp, 'checkout');
    const consumer = join(temp, 'consumer');
    await mkdir(checkout);
    await mkdir(join(consumer, 'node_modules'), { recursive: true });
    await cp(join(root, 'package.json'), join(checkout, 'package.json'));
    await cp(join(root, 'lib'), join(checkout, 'lib'), { recursive: true });
    await symlink(checkout, join(consumer, 'node_modules/dsh-deeplink'), 'dir');
    await writeFile(join(consumer, 'recovery.mjs'), `
      import assert from 'node:assert/strict';
      import { rmSync, symlinkSync } from 'node:fs';
      import { execFileSync } from 'node:child_process';
      await assert.rejects(import('dsh-deeplink'), error => error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('@deepseek-ai/dsh-typert-protocol'));
      rmSync('node_modules/dsh-deeplink');
      symlinkSync(${JSON.stringify(root)}, 'node_modules/dsh-deeplink', 'dir');
      // Node may retain the old realpath/failed module job even after package replacement.
      // A fresh process is the supported recovery; do not require a cache implementation.
      try { await import('dsh-deeplink'); } catch (error) { assert.equal(error.code, 'ERR_MODULE_NOT_FOUND'); }
      const output = execFileSync(process.execPath, ['--input-type=module', '-e', "import('dsh-deeplink').then(m => console.log(m.name))"], { encoding: 'utf8' });
      assert.equal(output.trim(), 'deeplink');
      console.log('recovered');
    `);
    assert.equal(execFileSync(process.execPath, ['recovery.mjs'], { cwd: consumer, encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } }).trim(), 'recovered');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

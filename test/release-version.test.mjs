import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { releaseVersion } from '../scripts/release-version.mjs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
const shellVersion = version => execFileSync('bash', ['macos/version.sh', version], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('plugin release must match both committed package and lock versions', () => {
  assert.equal(releaseVersion('plugin', `v${manifest.version}`, manifest, lock), manifest.version);
  for (const badLock of [{ ...lock, version: '99.0.0' }, { ...lock, packages: { '': { version: '99.0.0' } } }]) {
    assert.throws(() => releaseVersion('plugin', `v${manifest.version}`, manifest, badLock));
  }
  assert.throws(() => releaseVersion('plugin', 'v99.0.0', manifest, lock));
});

test('tag namespaces stay separate and unsafe/malformed versions fail closed', () => {
  for (const version of ['01.2.3', '1.02.3', '1.2', '1.2.3/evil', '1.2.3\nversion=evil', '1.2.3\n', '1.2.3$(id)', '-1.2.3', '1.2.3 ']) {
    assert.throws(() => releaseVersion('companion', `companion-v${version}`));
    assert.throws(() => shellVersion(version));
    assert.throws(() => releaseVersion('plugin', `v${version}`));
  }
  assert.throws(() => releaseVersion('companion', 'v1.2.3'));
  assert.throws(() => releaseVersion('plugin', 'companion-v1.2.3', manifest, lock));
  assert.throws(() => releaseVersion('other', 'v1.2.3'));
});

test('companion versions are independent stable versions; plugin supports valid SemVer prereleases', () => {
  for (const version of ['0.1.0', '1.2.3', '10.20.30']) {
    assert.equal(releaseVersion('companion', `companion-v${version}`), version);
    assert.equal(shellVersion(version), version);
  }
  assert.equal(shellVersion(''), readFileSync(new URL('../macos/VERSION', import.meta.url), 'utf8').trim());
  for (const version of ['1.2.3-rc.1', '1.2.3+build.1']) {
    assert.equal(releaseVersion('plugin', `v${version}`, { version }, { version, packages: { '': { version } } }), version);
    assert.throws(() => releaseVersion('companion', `companion-v${version}`));
    assert.throws(() => shellVersion(version));
  }
  assert.throws(() => releaseVersion('plugin', 'v1.2.3-01', manifest, lock));
});

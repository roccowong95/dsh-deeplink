import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Stable versions only for the native app's Apple bundle version fields.
export function releaseVersion(kind, tag, manifest, lock) {
  const prefix = kind === 'plugin' ? 'v' : kind === 'companion' ? 'companion-v' : null;
  if (!prefix || !tag?.startsWith(prefix)) throw new Error('Unexpected release tag');
  const version = tag.slice(prefix.length);
  const core = '(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)';
  const identifier = '(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)';
  const suffix = kind === 'plugin' ? `(?:-${identifier}(?:\\.${identifier})*)?(?:\\+[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*)?` : '';
  if (version.trim() !== version || !new RegExp(`^${core}${suffix}$`).test(version)) throw new Error('Invalid release version');
  if (kind === 'plugin' && [manifest?.version, lock?.version, lock?.packages?.['']?.version].some(value => value !== version)) {
    throw new Error('Plugin tag must match package.json and both package-lock.json versions');
  }
  return version;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [kind, tag] = process.argv.slice(2);
  const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
  console.log(releaseVersion(kind, tag, kind === 'plugin' ? json('../package.json') : undefined,
    kind === 'plugin' ? json('../package-lock.json') : undefined));
}

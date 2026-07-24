import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const source = path.join(root, 'dist');
const destination = path.resolve(root, process.env.PUBLISH_DIR || 'public');
const staticAssets = path.join(root, 'static');
const manifestName = '.asset-manifest.json';
const manifestVersion = 2;
const legacyManifestAssetLimit = 500;
const generatedRootEntries = new Set(['assets', 'index.html', manifestName]);

function normaliseAssetPath(asset) {
  return asset.replaceAll('\\', '/');
}

function isSafeAssetPath(asset) {
  const normalised = normaliseAssetPath(asset);
  return normalised.startsWith('assets/')
    && !normalised.startsWith('assets/../')
    && !normalised.includes('/../')
    && !path.isAbsolute(normalised);
}

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path.join(directory, entry.name), relative));
    } else if (entry.isFile()) {
      files.push(normaliseAssetPath(relative));
    }
  }

  return files;
}

const sourceStats = await stat(source).catch(() => null);
if (!sourceStats?.isDirectory()) {
  throw new Error('Vite output directory "dist" was not found. Run the Vite build first.');
}

const currentReleaseAssets = [...new Set(
  (await listFiles(path.join(source, 'assets'), 'assets')).filter(isSafeAssetPath),
)].sort();
let previousReleaseAssets = [];

try {
  const manifest = JSON.parse(await readFile(path.join(destination, manifestName), 'utf8'));
  const recordedAssets = Array.isArray(manifest.currentAssets)
    ? manifest.currentAssets
    : Array.isArray(manifest.assets)
      ? manifest.assets
      : [];
  const safeRecordedAssets = [...new Set(
    recordedAssets
      .filter(asset => typeof asset === 'string')
      .map(normaliseAssetPath)
      .filter(isSafeAssetPath),
  )].sort();

  if (manifest.version === 1 && safeRecordedAssets.length > legacyManifestAssetLimit) {
    console.warn(
      `Skipping ${safeRecordedAssets.length} legacy assets from a polluted production manifest.`,
    );
  } else {
    previousReleaseAssets = safeRecordedAssets;
  }
} catch {
  const existingAssets = [...new Set(
    (await listFiles(path.join(destination, 'assets'), 'assets')).filter(isSafeAssetPath),
  )].sort();
  if (existingAssets.length <= legacyManifestAssetLimit) {
    previousReleaseAssets = existingAssets;
  } else {
    console.warn(
      `Skipping ${existingAssets.length} untracked legacy assets during production cleanup.`,
    );
  }
}

const preservedRoot = await mkdtemp(path.join(os.tmpdir(), 'planyx-static-'));
const preservationMap = new Map([
  ['coming-soon', 'coming-soon'],
  [path.join('assets', 'js', 'coming-soon.js'), path.join('assets', 'js', 'coming-soon.js')],
]);

// Preserve deliberate Cloudflare and compatibility files at the production
// root while allowing generated index/manifest files and obsolete hashed assets
// to be replaced. This protects _headers, _redirects, analytics and runtime
// helpers during every clean production build.
const existingRootEntries = await readdir(destination, { withFileTypes: true }).catch(() => []);
for (const entry of existingRootEntries) {
  if (generatedRootEntries.has(entry.name)) continue;
  preservationMap.set(entry.name, entry.name);
}

for (const asset of previousReleaseAssets) {
  preservationMap.set(asset, asset);
}

try {
  for (const [sourceRelative, targetRelative] of preservationMap) {
    const existing = path.join(destination, sourceRelative);
    const existingStats = await stat(existing).catch(() => null);
    if (!existingStats) continue;
    const preserved = path.join(preservedRoot, targetRelative);
    await mkdir(path.dirname(preserved), { recursive: true });
    await cp(existing, preserved, { recursive: true });
  }

  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true });

  const staticStats = await stat(staticAssets).catch(() => null);
  if (staticStats?.isDirectory()) {
    await cp(staticAssets, destination, { recursive: true });
  }

  for (const [, targetRelative] of preservationMap) {
    const preserved = path.join(preservedRoot, targetRelative);
    const preservedStats = await stat(preserved).catch(() => null);
    if (!preservedStats) continue;
    const target = path.join(destination, targetRelative);
    const targetStats = await stat(target).catch(() => null);
    if (targetStats) continue;
    await mkdir(path.dirname(target), { recursive: true });
    await cp(preserved, target, { recursive: true });
  }

  await writeFile(
    path.join(destination, manifestName),
    `${JSON.stringify({ version: manifestVersion, currentAssets: currentReleaseAssets }, null, 2)}\n`,
    'utf8',
  );
} finally {
  await rm(preservedRoot, { recursive: true, force: true });
}

console.log(`Published Vite output to ${path.relative(root, destination) || destination}`);

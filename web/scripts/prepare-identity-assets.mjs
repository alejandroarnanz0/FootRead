import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const catalog = join(webRoot, 'src/media/catalog');
const media = join(webRoot, 'public/media');
const lists = { players: 'player', clubs: 'club', nationalTeams: 'national' };
const dirs = { player: 'players', club: 'clubs', national: 'national-teams' };
const hosts = new Set(['upload.wikimedia.org', 'thumb.wikimedia.org']);
const canDownload = process.argv.includes('--download');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function validate(record, type) {
  const { id, name, source, author, license, terms, download, file, sha256, status, birthDate, bytes } = record;
  if (record.type !== type || !/^\d+$/.test(id) || typeof id !== 'string' || !name || !author ||
      !source?.startsWith('https://') || !terms?.startsWith('https://') || !license || status !== 'verified' ||
      !new RegExp(`^${dirs[type]}/[a-z0-9-]+\\.(jpg|png|svg)$`).test(file) ||
      !/^[a-f0-9]{64}$/.test(sha256) || !Number.isInteger(bytes) || bytes < 1 || bytes > 1_000_000 ||
      (type === 'player' && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate))) {
    throw new Error(`Invalid identity record: ${name ?? id}`);
  }
  const url = new URL(download);
  if (url.protocol !== 'https:' || !hosts.has(url.hostname)) throw new Error(`Unsupported asset host for ${name}`);
}

async function ensureAsset(record) {
  const path = join(media, record.file);
  let bytes;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if (error.code !== 'ENOENT' || !canDownload) throw error;
    const response = await fetch(record.download, {
      headers: { 'User-Agent': 'Footboard/1.0 (https://github.com/alejandroarnanz0/FootRead)' },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`${record.file}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (record.file.endsWith('.svg')) {
      bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, ''));
    }
    checkBytes(record, bytes);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
    await sleep(350);
  }
  checkBytes(record, bytes);
}

function checkBytes(record, bytes) {
  if (bytes.length !== record.bytes || hash(bytes) !== record.sha256) {
    throw new Error(`Unexpected file contents for ${record.file}. Review the source and hash before changing it.`);
  }
}

const files = new Set();
const counts = [];
for (const [list, type] of Object.entries(lists)) {
  const records = JSON.parse(await readFile(join(catalog, `${list}.json`), 'utf8'));
  const ids = new Set();
  for (const record of records) {
    validate(record, type);
    if (ids.has(record.id) || files.has(record.file)) throw new Error(`Duplicate asset: ${record.file}`);
    ids.add(record.id);
    files.add(record.file);
    await ensureAsset(record);
  }
  counts.push(`${type}=${ids.size}`);
}
console.log(`Identity catalog verified: ${counts.join(', ')}`);

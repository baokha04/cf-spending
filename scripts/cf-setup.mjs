#!/usr/bin/env node
// Dựng sẵn mọi tài nguyên Cloudflare mà app cần: D1, chỉ mục Vectorize kèm hai
// chỉ mục metadata, .dev.vars, và migration cục bộ. Chạy lại được nhiều lần —
// mỗi bước tự kiểm tra thứ đã có rồi mới tạo, nên không bao giờ tạo trùng.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONFIG_FILE = join(ROOT, 'wrangler.jsonc');
const DB_NAME = 'cf-spending';
const INDEX_NAME = 'spending-tx';
const DIMENSIONS = 1024; // khớp @cf/baai/bge-m3
const METRIC = 'cosine';
const METADATA_PROPS = ['household_id', 'occurred_on'];
const PLACEHOLDER = 'REPLACE_WITH_YOUR_D1_DATABASE_ID';

const args = new Set(process.argv.slice(2));
if (args.has('--help') || args.has('-h')) {
  console.log(`npm run cf:setup [-- <tuỳ chọn>]

  --local-only   Chỉ chuẩn bị máy mình (.dev.vars + migration local), không đụng tài khoản Cloudflare
  --remote       Áp migration cho cả D1 trên Cloudflare, không chỉ bản local
  --dry-run      In ra những lệnh sẽ chạy rồi dừng, không thay đổi gì
`);
  process.exit(0);
}
const LOCAL_ONLY = args.has('--local-only');
const WITH_REMOTE = args.has('--remote');
const DRY_RUN = args.has('--dry-run');

let step = 0;
const notes = [];
const heading = (text) => console.log(`\n\x1b[1m[${++step}] ${text}\x1b[0m`);
const ok = (text) => console.log(`    \x1b[32m✓\x1b[0m ${text}`);
const info = (text) => console.log(`    · ${text}`);
const warn = (text) => {
  console.log(`    \x1b[33m!\x1b[0m ${text}`);
  notes.push(text);
};

function fail(message, hint) {
  console.error(`\n\x1b[31m✗ ${message}\x1b[0m`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

/** Chạy lệnh và cho output chảy thẳng ra terminal (bước có thể chạy lâu). */
function run(cmd, argv, { allowFailure = false } = {}) {
  if (DRY_RUN) {
    info(`(dry-run) ${cmd} ${argv.join(' ')}`);
    return true;
  }
  const res = spawnSync(cmd, argv, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0 && !allowFailure) {
    fail(`Lệnh thất bại: ${cmd} ${argv.join(' ')}`);
  }
  return res.status === 0;
}

/** Chạy wrangler và nuốt output để đọc kết quả. */
function capture(argv) {
  const res = spawnSync('npx', ['--no-install', 'wrangler', ...argv], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return { code: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** Wrangler chèn banner quanh JSON, nên cắt lấy khối JSON đầu tiên. */
function parseJson(text) {
  const start = text.search(/[[{]/);
  if (start === -1) return null;
  const opener = text[start];
  const closer = opener === '[' ? ']' : '}';
  const end = text.lastIndexOf(closer);
  if (end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function captureJson(argv) {
  const { code, stdout, stderr } = capture(argv);
  return { code, data: parseJson(stdout) ?? parseJson(stderr), stderr: stderr || stdout };
}

// ── 1. Phụ thuộc ────────────────────────────────────────────────────────────
heading('Kiểm tra phụ thuộc');
if (!existsSync(join(ROOT, 'node_modules', 'wrangler'))) {
  if (DRY_RUN) {
    info('(dry-run) chưa có node_modules — sẽ chạy npm install');
  } else {
    info('Chưa có node_modules — chạy npm install');
    run('npm', ['install']);
  }
}
if (!DRY_RUN) {
  const { code, stdout } = capture(['--version']);
  if (code !== 0) fail('Không gọi được wrangler', 'Thử `npm install` rồi chạy lại.');
  ok(`wrangler ${stdout.trim().split('\n').pop()}`);
} else {
  info('(dry-run) npx wrangler --version');
}

// ── 2. Biến môi trường cho dev cục bộ ───────────────────────────────────────
heading('Chuẩn bị .dev.vars');
const devVars = join(ROOT, '.dev.vars');
if (existsSync(devVars)) {
  ok('.dev.vars đã có, giữ nguyên');
} else if (DRY_RUN) {
  info('(dry-run) cp .dev.vars.example .dev.vars');
} else {
  copyFileSync(join(ROOT, '.dev.vars.example'), devVars);
  ok('Đã tạo .dev.vars từ .dev.vars.example (AI_FEATURES=off)');
}

if (LOCAL_ONLY) {
  heading('Áp migration cho D1 cục bộ');
  run('npx', ['--no-install', 'wrangler', 'd1', 'migrations', 'apply', DB_NAME, '--local']);
  ok('Xong. Bỏ --local-only khi muốn dựng tài nguyên trên Cloudflare.');
  process.exit(0);
}

// ── 3. Đăng nhập ────────────────────────────────────────────────────────────
heading('Kiểm tra đăng nhập Cloudflare');
if (DRY_RUN) {
  info('(dry-run) npx wrangler whoami');
} else {
  const { code, stdout, stderr } = capture(['whoami']);
  const out = `${stdout}${stderr}`;
  if (code !== 0 || /not authenticated|You are not logged in/i.test(out)) {
    fail(
      'Chưa đăng nhập Cloudflare.',
      'Chạy `npx wrangler login`, hoặc đặt CLOUDFLARE_API_TOKEN và CLOUDFLARE_ACCOUNT_ID rồi thử lại.\n' +
        '  Chỉ muốn dựng máy mình thì dùng: npm run cf:setup -- --local-only',
    );
  }
  const email = out.match(/[\w.+-]+@[\w.-]+/)?.[0];
  ok(email ? `Đang dùng tài khoản ${email}` : 'Đã đăng nhập');
}

// ── 4. D1 ───────────────────────────────────────────────────────────────────
heading(`Cơ sở dữ liệu D1 "${DB_NAME}"`);

function findDatabaseId() {
  const { code, data, stderr } = captureJson(['d1', 'list', '--json']);
  if (code !== 0) fail('Không liệt kê được D1', stderr.trim());
  const list = Array.isArray(data) ? data : (data?.result ?? []);
  const found = list.find((db) => db?.name === DB_NAME);
  return found?.uuid ?? found?.database_id ?? null;
}

let databaseId = null;
if (DRY_RUN) {
  info('(dry-run) npx wrangler d1 list --json');
  info(`(dry-run) tạo ${DB_NAME} nếu chưa có, rồi ghi database_id vào wrangler.jsonc`);
} else {
  databaseId = findDatabaseId();
  if (databaseId) {
    ok(`Đã có sẵn (${databaseId})`);
  } else {
    info('Chưa có — đang tạo');
    run('npx', ['--no-install', 'wrangler', 'd1', 'create', DB_NAME]);
    databaseId = findDatabaseId();
    if (!databaseId) fail('Tạo xong nhưng không đọc lại được database_id', 'Chạy `npx wrangler d1 list` để lấy tay.');
    ok(`Đã tạo (${databaseId})`);
  }

  // Ghi id vào wrangler.jsonc, nhưng không đè lên id người dùng tự điền.
  const config = readFileSync(CONFIG_FILE, 'utf8');
  const match = config.match(/("database_id"\s*:\s*")([^"]*)(")/);
  if (!match) {
    warn('Không tìm thấy trường database_id trong wrangler.jsonc — cần điền tay.');
  } else if (match[2] === databaseId) {
    ok('wrangler.jsonc đã trỏ đúng database_id');
  } else if (match[2] === PLACEHOLDER || match[2] === '') {
    writeFileSync(CONFIG_FILE, config.replace(match[0], `${match[1]}${databaseId}${match[3]}`));
    ok('Đã ghi database_id vào wrangler.jsonc');
  } else {
    warn(`wrangler.jsonc đang giữ database_id khác (${match[2]}); để nguyên. Sửa tay nếu muốn dùng ${databaseId}.`);
  }
}

// ── 5. Vectorize ────────────────────────────────────────────────────────────
heading(`Chỉ mục Vectorize "${INDEX_NAME}"`);
if (DRY_RUN) {
  info('(dry-run) npx wrangler vectorize list --json');
  info(`(dry-run) tạo chỉ mục ${DIMENSIONS} chiều (${METRIC}) và metadata index: ${METADATA_PROPS.join(', ')}`);
} else {
  const indexes = captureJson(['vectorize', 'list', '--json']);
  if (indexes.code !== 0) fail('Không liệt kê được chỉ mục Vectorize', indexes.stderr.trim());
  const list = Array.isArray(indexes.data) ? indexes.data : (indexes.data?.result ?? []);
  const existing = list.find((idx) => idx?.name === INDEX_NAME);

  if (existing) {
    const dims = existing.config?.dimensions;
    const metric = existing.config?.metric;
    ok(`Đã có sẵn (${dims ?? '?'} chiều, ${metric ?? '?'})`);
    if (dims && dims !== DIMENSIONS) {
      warn(`Chỉ mục đang ${dims} chiều, model bge-m3 cần ${DIMENSIONS}. Xoá và tạo lại nếu muốn dùng tìm kiếm ngữ nghĩa.`);
    }
  } else {
    info('Chưa có — đang tạo');
    run('npx', [
      '--no-install', 'wrangler', 'vectorize', 'create', INDEX_NAME,
      `--dimensions=${DIMENSIONS}`, `--metric=${METRIC}`,
    ]);
    ok(`Đã tạo chỉ mục ${DIMENSIONS} chiều (${METRIC})`);
  }

  // Thiếu metadata index thì truy vấn không lọc được theo hộ — bắt buộc phải có.
  const meta = captureJson(['vectorize', 'list-metadata-index', INDEX_NAME, '--json']);
  const metaList = Array.isArray(meta.data) ? meta.data : (meta.data?.metadataIndexes ?? meta.data?.result ?? []);
  const present = new Set(
    (Array.isArray(metaList) ? metaList : []).map((m) => m?.propertyName ?? m?.property_name).filter(Boolean),
  );
  if (meta.code !== 0) warn('Không đọc được danh sách metadata index, sẽ thử tạo cả hai.');

  for (const prop of METADATA_PROPS) {
    if (present.has(prop)) {
      ok(`metadata index ${prop} đã có`);
      continue;
    }
    const created = run(
      'npx',
      ['--no-install', 'wrangler', 'vectorize', 'create-metadata-index', INDEX_NAME, `--property-name=${prop}`, '--type=string'],
      { allowFailure: true },
    );
    if (created) ok(`Đã tạo metadata index ${prop}`);
    else warn(`Chưa tạo được metadata index ${prop} — chạy tay: npx wrangler vectorize create-metadata-index ${INDEX_NAME} --property-name=${prop} --type=string`);
  }
}

// ── 6. Migration ────────────────────────────────────────────────────────────
heading('Áp migration cho D1');
run('npx', ['--no-install', 'wrangler', 'd1', 'migrations', 'apply', DB_NAME, '--local']);
if (!DRY_RUN) ok('Xong bản local');
if (WITH_REMOTE) {
  run('npx', ['--no-install', 'wrangler', 'd1', 'migrations', 'apply', DB_NAME, '--remote']);
  if (!DRY_RUN) ok('Xong bản trên Cloudflare');
} else {
  info('Bỏ qua D1 trên Cloudflare — thêm `-- --remote` (hoặc chạy npm run db:migrate) khi cần.');
}

console.log('\n\x1b[1mSẵn sàng.\x1b[0m Chạy `npm run build` rồi `npx wrangler pages dev` để mở http://localhost:8788');
if (notes.length) {
  console.log('\nCòn vướng:');
  for (const note of notes) console.log(`  - ${note}`);
}

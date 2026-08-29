import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

// Migration được đọc ở phía Node lúc cấu hình rồi truyền vào Worker qua binding,
// vì bên trong Workers runtime không có fs.
const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));

export default defineWorkersConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/apply-migrations.ts'],
    poolOptions: {
      workers: {
        singleWorker: true,
        miniflare: {
          compatibilityDate: '2024-12-30',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DB'],
          bindings: {
            TEST_MIGRATIONS: migrations,
            // AI và Vectorize không có bản mô phỏng local, nên test chạy ở nhánh
            // không dùng AI — đúng với cách phát triển offline.
            AI_FEATURES: 'off',
          },
        },
      },
    },
  },
});

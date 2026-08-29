import { applyD1Migrations, env } from 'cloudflare:test';

// Chạy trong tầng lưu trữ "seed": mọi test kế thừa schema này, và isolatedStorage
// của pool tự hoàn tác dữ liệu sau từng test nên không cần dọn thủ công.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

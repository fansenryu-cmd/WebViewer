/**
 * sql.js WASM 파일을 public/에 복사.
 * 외부 CDN 요청 시 CORS로 실패할 수 있어, 같은 출처에서 서빙하기 위해 실행.
 * npm install 후 자동 실행(postinstall) 또는 수동: node scripts/copy-sql-wasm.cjs
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const SQLJS_VERSION = '1.14.0';
const WASM_URL = `https://cdn.jsdelivr.net/npm/sql.js@${SQLJS_VERSION}/dist/sql-wasm.wasm`;
const ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'src', 'assets');
const OUT_FILE = path.join(ASSETS_DIR, 'sql-wasm.wasm');

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

const file = fs.createWriteStream(OUT_FILE);
https.get(WASM_URL, (res) => {
  if (res.statusCode !== 200) {
    console.error('copy-sql-wasm: download failed', res.statusCode);
    process.exit(1);
  }
  res.pipe(file);
  file.on('finish', () => {
    file.close();
    console.log('copy-sql-wasm: src/assets/sql-wasm.wasm OK');
  });
}).on('error', (err) => {
  fs.unlink(OUT_FILE, () => {});
  console.error('copy-sql-wasm:', err.message);
  process.exit(1);
});

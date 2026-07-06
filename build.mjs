// ── 📦 배포 빌드 — 팀원에게 줄 실행 프로그램(zip) 생성 ─────────────────────
// 실행: npm run dist  →  dist/아수라장 내전.zip (팀원은 풀고 exe 더블클릭)
// 단계: ① icon.png → icon.ico  ② @electron/packager로 win32 앱 폴더  ③ archiver로 zip
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const packagerMod = require('@electron/packager');
const packager = packagerMod.packager || packagerMod.default || packagerMod;
const archiver = require('archiver');
const pngToIcoMod = require('png-to-ico');
const pngToIco = pngToIcoMod.default || pngToIcoMod;

const APP_NAME = '아수라장내전';
const OUT = 'dist';

(async () => {
  // ① 아이콘 (png → ico, exe/작업표시줄용)
  console.log('① 아이콘 생성…');
  fs.writeFileSync('assets/icon.ico', await pngToIco('assets/icon.png'));

  // ② 앱 패키징 — 소스 + Electron 런타임을 win32 x64 폴더로
  console.log('② 앱 패키징 (Electron win32 x64)…');
  fs.rmSync(OUT, { recursive: true, force: true });
  const [appDir] = await packager({
    dir: '.', name: APP_NAME, platform: 'win32', arch: 'x64',
    icon: 'assets/icon.ico', out: OUT, overwrite: true, appCopyright: 'SOHADA2',
    // 배포에 불필요한 개발 파일 제외(소스 중 앱 실행에 쓰는 것만 번들)
    ignore: [/^\/dist/, /^\/\.git/, /(^|\/)make-icon\.mjs$/, /(^|\/)build\.mjs$/,
             /(^|\/)CLAUDE\.md$/, /(^|\/)README\.md$/, /(^|\/)package-lock\.json$/,
             /(^|\/)_test.*\.html$/, /(^|\/)_wrap.*\.html$/, /(^|\/)내전 오버레이/],
  });
  console.log('   →', appDir);

  // ③ zip — 팀원 배포용
  console.log('③ zip 압축…');
  const zipPath = path.join(OUT, `아수라장 내전 v${require('./package.json').version}.zip`);
  await new Promise((res, rej) => {
    const out = fs.createWriteStream(zipPath);
    const zip = archiver('zip', { zlib: { level: 6 } });
    out.on('close', res); zip.on('error', rej);
    zip.pipe(out);
    zip.directory(appDir, path.basename(appDir));   // 폴더째 담아 팀원이 풀면 폴더 하나
    zip.finalize();
  });
  const mb = (fs.statSync(zipPath).size / 1048576).toFixed(1);
  console.log(`\n✅ 배포 완료: ${zipPath} (${mb} MB)`);
  console.log('   팀원에게 이 zip을 전달 → 압축 풀고 「' + APP_NAME + '.exe」 더블클릭');
})().catch(e => { console.error('❌ 빌드 실패:', e); process.exit(1); });

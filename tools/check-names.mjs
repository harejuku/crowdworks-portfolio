/* ------------------------------------------------------------------
   公開されるファイルに実名が残っていないかを機械で確かめる。

     node tools/check-names.mjs

   探す語は tools/sources.local.json の置き換え表（anonymize）の「置き換え元」。
   このスクリプト自身には実名を1つも書かない（書くと公開されてしまうため）。

   2026-08-26 に手作業の grep で、人名のローマ字表記を大文字始まりだったために
   取りこぼした（小文字でしか探していなかった）。ここでは必ず大文字小文字を
   区別せずに探す。なお、このファイルに実名を例として書いてはいけない
   （このスクリプト自身が公開されるため。実際、上の一文に実名を書いてしまい、
   直したチェッカーに自分で検出された）。
   ------------------------------------------------------------------ */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONF = join(ROOT, 'tools', 'sources.local.json');
if (!existsSync(CONF)) { console.error('tools/sources.local.json がありません。'); process.exit(1); }
const conf = JSON.parse(readFileSync(CONF, 'utf8'));

/* 置き換え表を全部集める（案件ごとに分かれているので、まとめて拾う） */
const pairs = [];
const collect = (v) => {
  if (Array.isArray(v)) { if (v.length === 2 && typeof v[0] === 'string') pairs.push(v); else v.forEach(collect); }
  else if (v && typeof v === 'object') Object.values(v).forEach(collect);
};
collect(conf);
const needles = [...new Set(pairs.map(([f]) => f).filter((f) => f && f.length >= 3))];
if (needles.length === 0) { console.error('× 置き換え表が空です。'); process.exit(1); }

/* これから公開されうるファイル＝「追跡済み」＋「未追跡だが .gitignore で除外されていない」。
   追跡済みだけを見ると、足したばかりのファイルが素通りする（2026-08-26 に踏んだ）。 */
const files = execSync('git ls-files -z --cached --others --exclude-standard', { cwd: ROOT, maxBuffer: 1 << 28 })
  .toString().split('\0').filter(Boolean)
  .map((f) => join(ROOT, f))
  .filter((f) => existsSync(f) && statSync(f).isFile())
  .filter((f) => !/\.(woff2?|ttf|otf|eot|png|jpe?g|gif|webp|ico|pdf|zip|mp4)$/i.test(f));

const hits = [];
for (const f of files) {
  const text = readFileSync(f, 'latin1');           // バイナリでも落ちない読み方
  const lower = text.toLowerCase();
  for (const n of needles) {
    // 日本語は latin1 で読むと化けるので、UTF-8 のバイト列としても照合する
    const asBytes = Buffer.from(n, 'utf8').toString('latin1');
    if (lower.includes(n.toLowerCase()) || text.includes(asBytes)) {
      hits.push([f.replace(ROOT + '/', ''), n]);
    }
  }
}

if (hits.length) {
  console.error(`× 公開ファイルに置き換え元の語が ${hits.length} 件残っています：\n`);
  hits.forEach(([f, n]) => console.error(`   ${f}  ←  「${n}」`));
  console.error('\n置き換え表に足すか、そのファイルを公開対象から外してください。');
  process.exit(1);
}
console.log(`✅ 実名なし（${needles.length}語 × ${files.length}ファイルを確認）`);

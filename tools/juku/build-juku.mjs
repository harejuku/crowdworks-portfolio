/* ------------------------------------------------------------------
   学習塾システムの体験版を、本番のコードから作り直す。

     node tools/juku/build-juku.mjs

   手順：
     ①本番のソースを丸ごと一時フォルダへコピーする
     ②サーバーが要る画面（請求・給与・保護者向け・API）を外す
       （体験版はサーバーの無い静的なページなので、そのままでは書き出せない）
     ③overlay/ の中身を上書きする。中身は「Supabaseにつなぐ1ファイル」の差し替えと、
       ブラウザの中で動く偽データベース一式
     ④next build（output:'export'）で静的なページに書き出す
     ⑤書き出したものを juku/app/ へ置く

   ④より前でコードには一切手を入れていない。本番を直したら、これを流し直すだけで
   体験版も最新になる。

   本番のソースの場所は tools/sources.local.json の juku.repo に書く（公開しない）。
   ------------------------------------------------------------------ */
import { readFileSync, readdirSync, existsSync, rmSync, mkdirSync, cpSync, writeFileSync, symlinkSync, statSync, renameSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const CONF = join(ROOT, 'tools', 'sources.local.json');

if (!existsSync(CONF)) {
  console.error('tools/sources.local.json がありません。');
  process.exit(1);
}
const sources = JSON.parse(readFileSync(CONF, 'utf8'));
const REPO = sources.juku && sources.juku.repo;
if (!REPO || !existsSync(REPO)) {
  console.error(`本番のソースが見つかりません（sources.local.json の juku.repo）: ${REPO}`);
  process.exit(1);
}

/* 体験版から外す画面。理由はそれぞれ違うので、消す前に必ずここへ書く。 */
const DROP = [
  'src/app/api',                      // サーバー側の窓口。静的なページには置けない
  'src/app/actions',                  // 同上（フォームの送信先）
  'src/app/admin/billing',            // 請求。サーバーで組み立てる画面なので外し、
                                      // overlay 側の「ブラウザの中で組み立てる版」を置く（③で入る）
  'src/app/admin/lesson-prep',        // 授業準備。入口は予約管理タブに移っている
  'src/app/admin/materials',          // 手書き教材の管理。サーバーで組み立てる画面
  'src/app/admin/subsidy',            // 助成カード。外部サービスとの突合が要る
  'src/app/attendance',               // 勤怠・給与。サーバーで組み立てる画面
  'src/app/curry-kiosk',              // 併設事業のキオスク。塾システムの話ではない
  'src/app/invoice',                  // 請求書のPDF。サーバーで組み立てる
  'src/app/parent',                   // 保護者向け。サーバーで組み立てる画面
  'src/app/portal',                   // 同上
  'src/app/setsugekka',               // 飲食店のメニュー。別の案件
  'src/app/booking',                  // 生徒が予約を取る画面（URLに合言葉が要るので後日）
  'src/app/admin/students',           // 生徒の名簿（2026-10 に追加）。保護者の連絡先を扱う画面で、
                                      // サーバーで組み立てる（force-dynamic）ので静的に書き出せない
  'src/app/admin/booking/week',       // 授業枠の週の表（2026-10 に追加）。同上・サーバーで組み立てる。
                                      // 予約管理から入口があるので、overlay に「何の画面か」だけの1枚を置く
  'src/app/robots.ts',
  'src/app/sitemap.ts',
  // このほかに外すもの（実在の塾の公開サイトと、その写真フォルダ）は
  // sources.local.json の juku.dropExtra に書く。ここに書くと屋号が公開されるため
  ...(sources.juku.dropExtra || []),
];

/* 配信先のパス。next.config の basePath と、③-3 の画像パス補正で同じ値を使う */
const BASE = '/crowdworks-portfolio/juku/app';

const WORK = join(tmpdir(), 'ss-portfolio-juku-build');
const OUT = join(ROOT, 'juku', 'app');

console.log('① 本番のソースをコピー…');
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
cpSync(REPO, WORK, {
  recursive: true,
  // .env* は持ち込まない（本番の鍵が一時フォルダに残るうえ、NEXT_PUBLIC_ の付く値は書き出しに埋まる）
  filter: (src) => !/(^|\/)(node_modules|\.git|\.next|out|\.claude|\.env[^/]*)(\/|$)/.test(src.replace(REPO, '')),
});
// node_modules はコピーせず、本番のものを見に行かせる（コピーすると数分かかる）。
// ただし丸ごとの symlink にはしない（2026-10-21）。本番は 2026-09 に画面の部品を
// packages/*（npm workspaces・名前は @<スコープ>/quiz-core など）へ切り出しており、
// 丸ごと symlink だとそれが本番の packages/ に解決され、③-2 の置き換えを通らない
// 素のソースがビルドに入る。中身を1つずつ symlink し、workspaces のスコープだけは
// 一時フォルダの packages/（置き換え済み）へ向ける。
const WS_SCOPES = new Set();
mkdirSync(join(WORK, 'node_modules'), { recursive: true });
readdirSync(join(REPO, 'node_modules')).forEach((name) => {
  const src = join(REPO, 'node_modules', name);
  if (name.startsWith('@')) {
    const inner = readdirSync(src);
    const isWs = inner.some((p) => existsSync(join(WORK, 'packages', p)) &&
      JSON.parse(readFileSync(join(WORK, 'packages', p, 'package.json'), 'utf8')).name === `${name}/${p}`);
    if (isWs) {
      WS_SCOPES.add(name);
      mkdirSync(join(WORK, 'node_modules', name), { recursive: true });
      inner.forEach((p) => {
        const local = join(WORK, 'packages', p);
        // packages/ に無いもの（apps/ の公開アプリ）は塾の画面から使わないので繋がない
        if (existsSync(local)) symlinkSync(local, join(WORK, 'node_modules', name, p), 'dir');
      });
      return;
    }
  }
  symlinkSync(src, join(WORK, 'node_modules', name));
});

console.log('② サーバーが要る画面と、実在の塾の素材を外す…');
DROP.forEach((p) => rmSync(join(WORK, p), { recursive: true, force: true }));
// google◯◯.html（検索エンジンの所有権確認）は名前が変わりうるので、名前で拾って消す
readdirSync(join(WORK, 'public'))
  .filter((f) => /^google[0-9a-f]+\.html$/.test(f))
  .forEach((f) => rmSync(join(WORK, 'public', f), { force: true }));

/* ②-2 塾HPのルート名を変える。
   コードの中の文字列は ③-2 が置き換えるが、フォルダ名は置き換わらないので、
   そのままだと URL に実在の塾の名前が残る。元のルート名は屋号そのものなので、
   ここには書かず sources.local.json の juku.hpRoute から読む。 */
const HP_ROUTE = sources.juku.hpRoute;
if (!HP_ROUTE) {
  console.error('× sources.local.json の juku.hpRoute がありません。塾HPのルート名が分からないので止めます。');
  process.exit(1);
}
if (existsSync(join(WORK, 'src/app', HP_ROUTE))) {
  renameSync(join(WORK, 'src/app', HP_ROUTE), join(WORK, 'src/app/demo'));
}

console.log('③ 偽データベースを上書き…');
cpSync(join(HERE, 'overlay'), WORK, { recursive: true });

/* ③-1 管理画面の帯（ナビ）から、外した画面への行き先を抜く。
   2026-09-21 に本番のナビが AdminNav（overlay に体験版用の写しがある）から
   src/components/admin/AdminHeader.tsx に置き換わり、写しが効かなくなった。
   写しを増やすと本番とずれるので、ここで「外した画面」と「Super」の行だけを消す
   （Super は 2026-08-26 の判断どおり＝見学者に出す意味がない。画面は書き出しには残る）。 */
const HEADER = join(WORK, 'src/components/admin/AdminHeader.tsx');
if (existsSync(HEADER)) {
  // overlay で置き直した画面（請求）は残す＝この時点で実体が無い行き先だけを消す
  const gone = DROP.filter((p) => p.startsWith('src/app/') && !existsSync(join(WORK, p)))
    .map((p) => p.slice('src/app'.length));
  gone.push('/super-admin');
  const lines = readFileSync(HEADER, 'utf8').split('\n');
  const kept = lines.filter((l) => !gone.some((r) => l.includes(`href: '${r}'`)));
  console.log(`   管理画面の帯から ${lines.length - kept.length} 件の行き先を外しました`);
  writeFileSync(HEADER, kept.join('\n'));
}

/* ③-2 実名をつぶす。
   本番のコードには、入力例やプレースホルダの形で実在の人名・屋号が入っている
   （「例: ◯◯さん」「生徒: ◯◯ 様」など）。ビルドすると、それがそのまま
   公開されるJavaScriptに残る。置き換え表は sources.local.json の juku.anonymize。 */
const ANON = sources.juku.anonymize || [];
if (ANON.length === 0) {
  console.error('× sources.local.json の juku.anonymize がありません。実名が残るので止めます。');
  process.exit(1);
}
/* workspaces のスコープ（import '@xxx/quiz-core'）は置き換えると import が解決できなく
   なるので、置き換えの間だけ印に逃がす。モジュール名は書き出し後の JS には残らない
   （本番ビルドはモジュールを番号で呼ぶ）。残っていないかは check-names.mjs が見る。 */
const SCOPE_MARK = (i) => `\u0000WS${i}\u0000`;
const SCOPES = [...WS_SCOPES];
function scrub(dir) {
  readdirSync(dir).forEach((f) => {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) { scrub(full); return; }
    if (!/\.(ts|tsx|js|jsx|mjs|css|json|md)$/.test(f)) return;
    const before = readFileSync(full, 'utf8');
    let after = before;
    SCOPES.forEach((s, i) => { after = after.split(`${s}/`).join(SCOPE_MARK(i)); });
    ANON.forEach(([from, to]) => { after = after.split(from).join(to); });
    SCOPES.forEach((s, i) => { after = after.split(SCOPE_MARK(i)).join(`${s}/`); });
    if (after !== before) writeFileSync(full, after);
  });
}
scrub(join(WORK, 'src'));
// 画面の部品（packages/）も同じ表で置き換える。ここを通さないと、部品の中の文言が素のまま出る
if (existsSync(join(WORK, 'packages'))) scrub(join(WORK, 'packages'));

/* ③-3 塾HPだけの後始末。

   (1) next/image は unoptimized のとき basePath を付けてくれないので、画像の src だけ
       配信先のパスを手で補う。Link の href は next 側が付けるので触らない。
   (2) 人物写真はフリー素材（ぱくたそ）。規約上、人物素材をサンプル・デモに使うには
       「架空である注釈」が要る。素材のクレジットと合わせてフッターに出す。 */
const HP = join(WORK, 'src/app/demo/page.tsx');
if (existsSync(HP)) {
  let hp = readFileSync(HP, 'utf8');
  hp = hp.split('src="/demo/').join(`src="${BASE}/demo/`);

  const COPY = '&copy; 2026 Sora Juku. All rights reserved.</p>';
  if (!hp.includes(COPY)) {
    console.error('× 塾HPのフッターが見つかりません（注釈を入れられないので止めます）。');
    process.exit(1);
  }
  hp = hp.split(COPY).join(COPY + `
         <p className="text-[10px] leading-relaxed text-gray-500 mt-3 max-w-lg mx-auto">
           これはホームページ制作の<b>サンプル</b>です。塾名・人物・経歴・所在地・電話番号はすべて架空で、実在の塾ではありません。<br/>
           掲載している写真はフリー素材サイト「ぱくたそ」（https://www.pakutaso.com）の素材を使用しています。
         </p>`);
  writeFileSync(HP, hp);
}

writeFileSync(join(WORK, 'next.config.mjs'), `/** 体験版だけの設定（tools/juku/build-juku.mjs が作っています） */
const nextConfig = {
  output: 'export',
  // どの配信先でも同じURLで開けるよう、/quiz/index.html の形で書き出す
  trailingSlash: true,
  basePath: '${BASE}',
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};
export default nextConfig;
`);

console.log('④ 静的なページに書き出し…');
execSync('npx next build', {
  cwd: WORK,
  stdio: 'inherit',
  env: {
    ...process.env,
    // 体験版はここにつながない。画像のURLを組み立てるのに使うだけ
    NEXT_PUBLIC_SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'demo',
  },
});

console.log('⑤ juku/app/ へ配置…');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(WORK, 'out'), OUT, { recursive: true });
// GitHub Pages に _next/ を無視させないための印（.nojekyll はリポジトリの根にもある）
writeFileSync(join(OUT, '.nojekyll'), '');

console.log('\n完了：juku/app/ に書き出しました。');

/* ------------------------------------------------------------------
   体験版の画面を、納品したシステムの本物のコードから作り直す。

     node tools/build.mjs            （全部）
     node tools/build.mjs drink/     （出力先が drink/ で始まるものだけ）

   何をしているか：
     ①納品コード（Google Apps Script 用のHTMLの断片）を読む
     ②サーバーから値を差し込む場所（<?!= bootstrap ?>）を、偽サーバーの値に向け替える
     ③お客さんの屋号・実名が混ざる箇所を架空のものに置き換える
     ④<!doctype> と体験版の帯を足して、単体で開けるHTMLにする

   画面のコード自体には一切手を入れない。だから納品物を直したら、
   このスクリプトを流し直すだけで体験版も最新になる。

   素材の置き場所は tools/sources.local.json に書く（このファイルは公開しない）。
   雛形は tools/sources.example.json。
   ------------------------------------------------------------------ */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONF = join(ROOT, 'tools', 'sources.local.json');

if (!existsSync(CONF)) {
  console.error('tools/sources.local.json がありません。tools/sources.example.json をコピーして、素材の場所を書いてください。');
  process.exit(1);
}
const sources = JSON.parse(readFileSync(CONF, 'utf8'));

/* 納品コードに混ざっているお客さまの屋号・実名を、架空のものへ。
   置き換え表そのものが「誰の案件か」を明かしてしまうので、
   表は tools/sources.local.json（公開しない）の anonymize に置く。
   ここに書き足さないこと。 */
const ANONYMIZE = (sources.anonymize || []).map(([from, to]) => [new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to]);
if (ANONYMIZE.length === 0) {
  console.error('× sources.local.json に anonymize がありません。実名が残ったまま公開されるので止めます。');
  process.exit(1);
}

/* 本物の宛先（GAS・Pages・Workers・Drive の写真）を「呼ぶ形」で残してはいけない。
   コメントの中の説明（「GAS の画面は script.googleusercontent.com を…」）は呼び出しではないので対象外にし、
   URL の形（https://…）で書かれたものだけを止める。 */
const LIVE_URL = [/https?:\/\/[^\s'"`<>]*(script\.google|googleusercontent|pages\.dev|workers\.dev)/i];
// 精肉店のお客さん画面（Pages 版）が fetch する宛先。fake-server.js の DEMO_API と同じ文字にする
const SEINIKU_DEMO_API = 'demo:seiniku-api';

const jobs = [
  {
    /* お客さん画面は 2026-09-19 に GAS から Cloudflare Pages（静的な index.html・app.js・style.css）へ移った。
       本物は config.js の window.API（GAS の /exec）へ fetch する（?do=products で商品、POST で注文）。
       体験版は config.js を読む行を「体験版の宛先（demo: で始まる＝ネットに出ない）」に差し替え、
       その宛先への fetch だけを fake-server.js が受ける。app.js と style.css は納品物の複製。 */
    out: 'seiniku/index.html',
    mode: 'document',
    bootstrap: false,
    src: 'seiniku.shopPages',
    anonymize: 'seiniku.anonymize',
    title: 'みどり精肉店 ご注文（体験版）',
    page: 'shop',
    scripts: ['fake-server.js'],
    replacements: [
      [/<script src="config\.js"><\/script>/, `<script>window.API = ${JSON.stringify(SEINIKU_DEMO_API)};</script>`],
    ],
    mustReplace: true,
    forbid: [/<script[^>]*config\.js/, ...LIVE_URL],
    extraFiles: [
      { src: 'seiniku.shopApp', out: 'seiniku/app.js', forbid: LIVE_URL },
      { src: 'seiniku.shopCss', out: 'seiniku/style.css', forbid: LIVE_URL },
    ],
    home: '../taiken/',
    note: 'これは<b>体験版</b>です。お店も商品も注文もすべて架空で、実在の店舗にはつながっていません。',
    about: {
      title: '街の精肉店の「電話注文」を、そのまま画面にしたもの',
      sub: 'お客さん側の画面です。店主が見る管理画面は、この下のリンクから。',
      points: [
        { t: '注文を受けるところだけに絞っている',
          d: '会員登録も、ログインも、クレジット決済もありません。お支払いは受け取りのときに店頭で。「ネットで注文できる」ために本当に要るものだけを残しています。' },
        { t: 'グラム売りの「金額が確定しない」問題',
          d: '精肉店は100gいくらで売るので、注文の時点では金額が決まりません。そこで量り売りの品が1つでも入っていれば「概算」、セット商品だけなら「確定」と、画面・注文控え・お店への通知メールの言葉づかいを1つの判定でそろえています。' },
        { t: '押せない選択肢は最初から出さない',
          d: '受け取り日は一覧から選ぶ形にして、定休日と、締切時刻を過ぎた当日分は最初から並べません。選んでから断られるのがいちばん腹立たしいためです。' },
        { t: 'お客さんの画面だけ、Googleの外に置いている',
          d: 'はじめはGoogleの仕組み（Apps Script）の中で画面を出していましたが、上に「Googleのアプリです」という帯が出て、開くのにも数秒かかりました。お客さんが見る画面だけを静的なページとして別の場所に移し、商品と注文の受け付けだけをGoogle側に残しています。' },
        { t: '体験版で省いたこと',
          d: '注文を送るとお店へ通知メールが飛びますが、体験版では飛びません。同じ電話番号からの連続送信をはじく仕組みも、何度も試せるように外しています。' }
      ]
    },
    footerLinks: [{ href: 'kanri.html', label: '店主が見る管理画面をひらく →' }]
  },
  {
    out: 'seiniku/kanri.html',
    mode: 'fragment',
    bootstrap: true,
    src: 'seiniku.admin',
    forbid: LIVE_URL,
    title: 'みどり精肉店 注文管理（体験版）',
    page: 'admin',
    scripts: ['fake-server.js'],
    home: '../taiken/',
    note: 'これは<b>体験版</b>です。表示中の注文・商品はすべて架空で、実在の店舗にはつながっていません。',
    about: {
      title: '店主が、スマホ1台で全部さわれる管理画面',
      sub: '注文の確認、商品の追加、受付の停止まで。パソコンを開かなくても回るように作っています。',
      points: [
        { t: 'スプレッドシートを直接さわらせない',
          d: 'データはGoogleスプレッドシートに入っていますが、店主が開くのはこの画面だけです。行を消した・列をずらした、という事故が起きないようにしています。' },
        { t: '「本当に消しますか？」を出さない理由',
          d: 'この画面はGoogleの仕組み上、確認ダイアログを出しても【エラーにならず静かに無視される】ことがあります。そこで、ボタン自身が1回目で「本当に消す？」に変わり、2回目で実行する形にしました。5秒さわらなければ元に戻ります。' },
        { t: '電話で入った注文もここに入れる',
          d: 'ネット注文だけを別管理にすると、結局2か所を見ることになります。手入力した注文も同じ一覧に並ぶので、受け取り日ごとの一覧がそのまま作業表になります。' },
        { t: '商品写真はその場で撮って載せられる',
          d: '写真を選ぶと、送る前にブラウザ側で縮小してから保存します。体験版でも実際に試せます（画像はこのタブの中だけに残り、外へは一切送っていません）。' }
      ]
    },
    footerLinks: [{ href: './', label: 'お客さんが見る注文画面をひらく →' }]
  },
  {
    out: 'uriage/index.html',
    mode: 'document',      // それ自体が完成したHTML。head と body に差し込むだけ
    bootstrap: false,      // 最初の値もサーバー呼び出し（初期データ）で取りに行く作り
    src: 'uriage.form',
    forbid: LIVE_URL,
    title: 'さくら商店 売上入力（体験版）',
    scripts: ['fake-server.js'],
    home: '../taiken/',
    note: 'これは<b>体験版</b>です。表示中の売上・仕入はすべて架空で、実在のお店にはつながっていません。',
    about: {
      title: '紙の伝票をなくさずに、スマホから3タップで',
      sub: '複数の事業をやっている個人事業主が、日々の売上と経費をその場で記録するための画面です。',
      points: [
        { t: '入力の口を1つに決めている',
          d: 'スプレッドシートに直接打つ人と、この画面から入れる人が混在すると、月末に必ず食い違います。入力はこの画面だけ、シートは見るだけ、と決めてあります。' },
        { t: 'よく使う勘定科目が上に来る',
          d: '過去300件の入力を数えて、その事業でよく使う科目から順に並べています。「店頭販売なら売上と仕入」のように、指が覚えている順番になります。' },
        { t: '間違えたらすぐ取り消せる',
          d: '直前の5件がその場に出ていて、1タップで消せます。「あとで直す」と思った分は、たいてい直されないためです。' },
        { t: '「今月」タブが月次の答え',
          d: '事業ごとの当月収支と年度累計を、その場で出します。年度の開始月は7月始まりのように設定で変えられます（確定申告の締めに合わせるため）。' }
      ]
    }
  },
];

/* パン屋さんの会員制クイズ企画。1つのHTMLが mode で4つの顔を持つ作りなので、
   ここで mode を決め打ちして3枚に分ける（印刷用のQR一覧は体験版に入れていない）。 */
const QUIZ_REPLACE = (mode, studentId) => ([
  // 印刷用のQRライブラリ（外部サイトから読む）は体験版では使わないので、分岐ごと外す
  [/<\?\s*if \(mode !== 'kiosk'\) \{\s*\?>[\s\S]*?<\?\s*\}\s*\?>/g, ''],
  [/<\?=\s*mode\s*\?>/g, mode],
  [/<\?=\s*studentId\s*\?>/g, studentId],
  [/<\?=\s*scriptUrl\s*\?>/g, '#'],
  [/<\?=\s*quizSeconds\s*\?>/g, '30'],
  // v2.8：カメラの入口ページ（Cloudflare Pages）から来たときだけそこへ戻す仕組み。体験版は入口ページを持たないので「無し」にする
  [/<\?=\s*entryUrl\s*\?>/g, ''],
  [/<\?=\s*viaCam\s*\?>/g, 'false'],
  // 子ども向けの表示のシェフの絵は、そのお店だけの絵＝見ればお店が分かるので体験版では外す（2026-10-23）。
  // r-chef は JS 側が有無を確かめてから触るので、外しても落ちない
  [/<img class="chef[^"]*"[^>]*>/g, ''],
]);

// Code.gs の doGet が付けている viewport と同じもの
const QUIZ_VIEWPORT = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';

// 管理画面どうしの行き来。本物は同じURLに ?mode= を付けて開くが、
// 体験版は静的なページなので、読み込み後にリンク先を書き換える
const QUIZ_NAV = `
window.addEventListener('load', function () {
  setTimeout(function () {
    var map = { 'nav-register': 'kanri.html', 'nav-admin': 'dashboard.html', 'nav-nayose': 'nayose.html' };
    Object.keys(map).forEach(function (id) {
      var a = document.getElementById(id);
      if (a) a.href = map[id];
    });
    var pr = document.getElementById('nav-print');
    if (pr) pr.addEventListener('click', function (e) {
      e.preventDefault();
      Demo.toast('会員証のQRカードを、名簿から名刺用紙（A4に10枚）に一括で組版して印刷します。体験版では省いています。');
    });
  }, 0);
});`;

const QUIZ_ABOUT_POINTS = [
  { t: '「1日1問だけ」が企画の芯',
    d: 'QRをかざした時点で、まず「出題中」として記録を1行書きます。答える前に画面を閉じても、その日の権利は使われたことになる作り。これが無いと、むずかしい問題が出た子が閉じて引き直します。' },
  { t: '同じ問題は二度出さない',
    d: 'その子が過去に答えた問題を除いてから出します。全部答えたら、次は「前にまちがえた問題」から出ます。復習が自然に混ざるようにしてあります。' },
  { t: '学年ごとに問題を分け、その子に合わせて出す',
    d: '小3までから中3まで7段階。字がまだ読めない子には、影や数で答える絵の問題が先に出ます。中学生は、学校の定期テストの範囲の単元から先に出します。最近5問の正誤で「やさしめ／むずかしめ」も自動で寄せます。' },
  { t: '学年は毎年4月に自動で上がる',
    d: '4月1日を過ぎて最初に開いたときに、全員の学年が1つ上がります。学年が分からない小さい子には、レジ横の画面で「なんねんせい？」と1日1回だけ聞き、店の人があとで確かめます。' },
  { t: '同じ子が2つ登録される事故に備える',
    d: '手書きの名前から登録するので、同じ子が2アカウントになることが必ず起きます。「まとめる」機能は記録を1件も消さずに付け替えるだけにしてあり、正解数の集計が変わりません。' },
];



jobs.push(
  {
    out: 'quiz-kikaku/index.html',
    mode: 'document',
    bootstrap: false,
    src: 'quizkikaku.app',
    anonymize: 'quizkikaku.anonymize',
    viewport: QUIZ_VIEWPORT,
    forbid: LIVE_URL,
    title: 'まるやまベーカリー クイズ（体験版・レジ横の画面）',
    scripts: ['fake-server.js'],
    home: '../taiken/',
    replacements: QUIZ_REPLACE('kiosk', 'S0022'),   // 学年がまだ分からない「小3まで」の子（fake-server.js の KIOSK_KID）
    note: 'これは<b>体験版</b>です。お店も子どもの名前も記録もすべて架空で、実在の店舗にはつながっていません。',
    about: {
      title: 'パン屋さんが、子どもをリピーターにするための企画',
      sub: 'レジ横のタブレット。会員証のQRをかざすと、その子の学年の問題が1日1問だけ出ます。',
      points: QUIZ_ABOUT_POINTS,
    },
    footerLinks: [
      { href: 'kanri.html', label: 'お店の人が見る名簿の画面をひらく →' },
      { href: 'dashboard.html', label: '企画の成果を見るダッシュボードをひらく →' },
    ],
    extraScript: QUIZ_NAV,
  },
  {
    out: 'quiz-kikaku/kanri.html',
    mode: 'document',
    bootstrap: false,
    src: 'quizkikaku.app',
    anonymize: 'quizkikaku.anonymize',
    viewport: QUIZ_VIEWPORT,
    forbid: LIVE_URL,
    title: 'まるやまベーカリー クイズ 名簿（体験版）',
    scripts: ['fake-server.js'],
    home: '../taiken/',
    replacements: QUIZ_REPLACE('register', ''),
    // 名簿の画面のタブの横はみ出し（幅375pxで約90px）は、2026-10-21 に納品コード側（v2.15.1）で直したので、体験版で隠す CSS は外した
    note: 'これは<b>体験版</b>です。名簿も記録もすべて架空で、実在の店舗にはつながっていません。',
    about: {
      title: '会員の登録と、今日の結果を見る画面',
      sub: 'お店の人が、レジの合間にスマホで開くことを前提にしています。',
      points: QUIZ_ABOUT_POINTS,
    },
    footerLinks: [
      { href: './', label: 'レジ横の画面（子どもがさわる側）をひらく →' },
      { href: 'nayose.html', label: '同じ子の2つ目の登録をまとめる画面をひらく →' },
    ],
    extraScript: QUIZ_NAV,
  },
  {
    out: 'quiz-kikaku/dashboard.html',
    mode: 'document',
    bootstrap: false,
    src: 'quizkikaku.app',
    anonymize: 'quizkikaku.anonymize',
    viewport: QUIZ_VIEWPORT,
    forbid: LIVE_URL,
    title: 'まるやまベーカリー クイズ 成果（体験版）',
    scripts: ['fake-server.js'],
    home: '../taiken/',
    replacements: QUIZ_REPLACE('admin', ''),
    note: 'これは<b>体験版</b>です。表示中の数字はすべて架空で、実在の店舗にはつながっていません。',
    about: {
      title: '「この企画は効いているのか」を数字で見る画面',
      sub: '正答率だけでなく、また来てくれた割合（リピート率）と、ごぶさたの子を出します。',
      points: [
        { t: '見るべきは正答率ではなくリピート率',
          d: '企画の目的は「また来てもらうこと」なので、2日以上来た子の割合を主役にしています。正答率は問題の難易度調整のための材料です。' },
        { t: 'むずかしすぎる問題が名指しで出る',
          d: '3回以上出した問題のうち、正答率が低い順に並びます。「この問題は難しすぎた」がその場で分かるので、差し替えられます。' },
        { t: 'ごぶさたリスト',
          d: '5回以上遊んだのに2週間来ていない子を出します。声をかける相手を決めるための一覧です。' },
        { t: '問題の在庫が切れる前に警告する',
          d: '学年ごとに「今月ぶん・来月ぶん・通年」の問題数を出します。在庫が切れると企画そのものが止まるためです。' },
      ],
    },
    footerLinks: [{ href: './', label: 'レジ横の画面（子どもがさわる側）をひらく →' }],
    extraScript: QUIZ_NAV,
  },
  {
    out: 'quiz-kikaku/nayose.html',
    mode: 'document',
    bootstrap: false,
    src: 'quizkikaku.app',
    anonymize: 'quizkikaku.anonymize',
    viewport: QUIZ_VIEWPORT,
    forbid: LIVE_URL,
    title: 'まるやまベーカリー クイズ おなじ子をまとめる（体験版）',
    scripts: ['fake-server.js'],
    home: '../taiken/',
    replacements: QUIZ_REPLACE('nayose', ''),
    note: 'これは<b>体験版</b>です。名簿も記録もすべて架空で、実在の店舗にはつながっていません。',
    about: {
      title: '「同じ子の2つ目の登録」を、押すだけで片付ける画面',
      sub: '手書きの名前から登録するので、同じ子が2つになるのは避けられません。どれが同じ子かを決められるのは、顔を知っているお店の人だけです。',
      points: [
        { t: '1組ずつ「おなじ子／べつの子」を押すだけ',
          d: '名前が重なっている組ごとに、登録日・遊んだ回数・最後に来た日を並べます。残す方は「いちばん最近遊んでいる方（＝今その子が持っているQR）」を最初から選んでおきます。' },
        { t: '「べつの子」と決めた組は二度と出さない',
          d: '同じ名前の別の子は実際に多いので、決めた組を覚えておかないと毎回同じ組が並びます。「べつの子」はあとから「もどす」で取り消せます。' },
        { t: 'まとめても記録は1件も消えない',
          d: '「おなじ子」にすると、遊んだ記録を残す方へ付け替えてから、もう片方を名簿から外します。正解数やダッシュボードの集計は変わりません。' },
        { t: 'ここが終わってからQRカードを刷る',
          d: '先にカードを刷ると、片付けた方の子のカードが使えなくなるためです。' },
      ],
    },
    footerLinks: [{ href: 'kanri.html', label: 'お店の人が見る名簿の画面をひらく →' }],
    extraScript: QUIZ_NAV,
  },
);

jobs.push({
  out: 'nomikai/index.html',
  mode: 'document',
  bootstrap: false,
  src: 'nomikai.app',
  title: '飲み会の割り勘・精算（体験版）',
  // サーバーを使わない道具なので偽サーバーは要らない。見本の飲み会を1件だけ先に入れる
  scripts: ['demo-data.js'],
  home: '../taiken/',
  note: 'これは<b>体験版</b>です。名前も金額も自由に書き換えられます。入力はこのタブの中だけに残ります。',
  about: {
    title: '均等割りではない飲み会のための、1画面の道具',
    sub: 'もとはExcelの精算シート。幹事がその場でスマホから使えるように、同じ計算を画面に移しました。',
    points: [
      { t: '「多め・少なめ」を係数で決める',
        d: '先輩は1.3、学生は0.7、のように係数を入れると、その比で割ります。均等割りにすると誰かが黙って損をするためです。' },
      { t: '端数は切り上げてそろえる',
        d: '1円単位の請求は現場で回りません。100円単位（変更できます）に切り上げ、余りは幹事の手元に残る形にしています。' },
      { t: '受け渡しは幹事にまとめる',
        d: '参加者どうしで送金し合うと必ず取りこぼします。全員が幹事とだけやりとりする形に固定しました。' },
      { t: '計算はExcelと1円までそろえてある',
        d: 'もとのExcelと同じ答えが出ることを、自動の突き合わせで毎回確かめています。丸めの順序まで合わせているのは、ここがずれると誰かの支払額が変わるためです。' },
    ],
  },
  extraScript: `
// 帯の「最初から」を、見本の飲み会に戻す動きに差し替える
(function () {
  var b = document.querySelector('.ss-reset');
  if (!b) return;
  b.addEventListener('click', function (e) {
    e.stopImmediatePropagation();
    if (window.__demoResetNomikai) window.__demoResetNomikai();
    Demo.clearAll();
    location.reload();
  }, true);
})();`,
});

/* ドリンクおすすめ診断。画面（index.html）と診断の本体（app.js）は納品コードの複製。
   メニュー（drink/data.js）だけは納品先のものを写さず、体験版のために手で書いた架空のものを置いている
   （build はこのファイルに触らない）。
   本番はメニューを API から取る作りだが、API の宛先（config.js）を読み込む行を「宛先なし」に差し替えるので、
   取りに行く処理そのものが走らない＝どこにも接続しない。
   保存先のキーは、同じサイト（オリジン）にある他の体験版と混ざらないよう、すべて drinkdemo. で始まる名前に
   付け替える（付け替えの表は sources.local.json の drink.anonymize。キーの元の名前が屋号を含むため）。 */
const DRINK_KEY_PREFIX = 'drinkdemo.';
jobs.push({
  out: 'drink/index.html',
  mode: 'document',
  bootstrap: false,
  src: 'drink.index',
  anonymize: 'drink.anonymize',
  title: 'ジューススタンド ことり ドリンク診断（体験版）',
  scripts: [],
  home: '../taiken/',
  replacements: [
    // API の宛先を読み込む行 → 宛先なし（メニューは drink/data.js の架空のものだけを使う）
    [/<script src="config\.js"><\/script>/, '<script>window.API = \'\';</script>'],
    // 画面の下の1行（本番にはお店用の入力画面へのリンクがある。体験版には入れていない）
    [/<footer id="foot">[\s\S]*?<\/footer>/, '<footer id="foot">見本です。お店・メニューの名前と値段は架空のものです。</footer>'],
  ],
  // 結果のチケットの左右の切り欠き（飾り）が、幅375pxで画面の外へ1〜4pxはみ出し、横に少し揺れる（納品コードのまま）。
  // 画面のコードは直さず、体験版の側で切り落とす（clip は sticky の帯を壊さない。hidden は壊す）
  extraCss: '  main{overflow-x:clip}',
  mustReplace: true,       // 差し替え先が見つからなければ止める（納品コードの形が変わった時に、宛先が残ったまま出さない）
  forbid: [/config\.js/, /admin\.html/i, /script\.google/i, /pages\.dev/i, /instagram/i],
  extraFiles: [
    { src: 'drink.app', out: 'drink/app.js',
      forbid: [/script\.google/i, /pages\.dev/i, /instagram/i],
      storagePrefix: DRINK_KEY_PREFIX },
  ],
  note: 'これは<b>体験版</b>です。お店もメニューも値段もすべて架空で、実在のお店にはつながっていません。',
  about: {
    title: 'メニューのQRから、6回のタップで「今日の1杯」を出す',
    sub: 'ジュースとスムージーのお店で、注文に迷うお客さんのための画面です。お店の人は、メニューの入れ替えだけをします。',
    points: [
      { t: '質問は6つ、味は「メニューの言葉」で聞く',
        d: '温度・甘さ・好きな果物・野菜の味・飲み口・今日のテーマ。「酸味の強さは？」のような専門的な聞き方はせず、メニューの分け方（果物か野菜か、ジュースかスムージーか）と同じ言葉で聞いています。' },
      { t: '1杯を大きく、残り2杯は「タイプ違い」で',
        d: '2位には、点差が小さければ1位と種類の違うもの（ジュースが1位ならスムージー）を出します。3杯とも似た味になって、選ぶ意味がなくなるのを防ぐためです。' },
      { t: '全部の答え方で偏りを確かめてある',
        d: '答え方の組み合わせ（つめたい側だけで1,440通り）を全部まわして、3杯がそろわない答え方が0であること、1つの品が出すぎないことを確かめてから、お店に渡しています。' },
      { t: 'メニューはお店がスマホで入れ替える',
        d: '本番では、お店の人が専用の入力画面で「提供中／お休み」や期間限定の日付を切り替えると、その日のうちに診断に反映されます。体験版では入力画面を外し、架空のメニューを焼き込んでいます。' },
    ],
  },
  extraScript: `
// 帯の「最初から」で、この体験版が覚えている答え（drinkdemo. で始まるキー）も消す
(function () {
  var b = document.querySelector('.ss-reset');
  if (!b) return;
  b.addEventListener('click', function () {
    [window.sessionStorage, window.localStorage].forEach(function (s) {
      try {
        var doomed = [];
        for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k && k.indexOf(${JSON.stringify(DRINK_KEY_PREFIX)}) === 0) doomed.push(k); }
        doomed.forEach(function (k) { s.removeItem(k); });
      } catch (e) {}
    });
  }, true);
})();`,
});

/* 置き換え表（案件ごとの分も含む）を正規表現にする */
function toRegexPairs(list) {
  return (list || []).map(([from, to]) => [new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to]);
}

/* 公開物に残ってはいけない語・保存キーの決まりを確かめる（見つかったら止める） */
function assertClean(label, text, forbid, storagePrefix) {
  for (const re of (forbid || [])) {
    if (re.test(text)) {
      console.error(`× ${label}: 残ってはいけない語が残っています（${re}）`);
      process.exit(1);
    }
  }
  if (storagePrefix) {
    // 保存キーらしい文字列（…-v数字）は、すべて決めた頭文字で始まっていること
    const keys = [...text.matchAll(/['"]([\w.-]+-v\d+)['"]/g)].map((m) => m[1]);
    const bad = keys.filter((k) => !k.startsWith(storagePrefix));
    if (bad.length) {
      console.error(`× ${label}: 保存キーが ${storagePrefix} で始まっていません：${bad.join(', ')}`);
      process.exit(1);
    }
    if (keys.length === 0) {
      console.error(`× ${label}: 保存キーが1つも見つかりません（納品コードの形が変わった？）`);
      process.exit(1);
    }
  }
}

function pick(path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), sources);
}

/* 体験版の帯を出すための差し込み。断片でも完成HTMLでも中身は同じ */
function head(job) {
  return `<link rel="icon" href="../assets/favicon.svg">
<link rel="stylesheet" href="../assets/demo.css">
<style>
  .ss-next{
    display:block;max-width:640px;margin:26px auto 34px;padding:15px 18px;
    background:#161a20;color:#fff;border-radius:12px;text-decoration:none;
    font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;
    font-size:15px;font-weight:700;text-align:center;
  }
${job.extraCss ? job.extraCss + '\n' : ''}</style>`;
}
function headScripts(job) {
  return [
    job.page ? `<script>window.DEMO_PAGE = ${JSON.stringify(job.page)};</script>` : '',
    '<script src="../assets/demo.js"></script>',
    ...job.scripts.map(s => `<script src="${s}"></script>`)
  ].filter(Boolean).join('\n');
}
function tail(job) {
  const footer = (job.footerLinks || []).map(l =>
    `<a class="ss-next" href="${l.href}">${l.label}</a>`).join('\n');
  return `${footer}
<script>
Demo.init({
  home: ${JSON.stringify(job.home)},
  note: ${JSON.stringify(job.note)},
  about: ${JSON.stringify(job.about)}
});
${job.extraScript || ''}
</script>`;
}

const KEEP_OUT = `<!-- ============================================================
     ここから下は、実際に納品したシステムのコードをそのまま置いたもの。
     体験版のために向け先を変えているのは、サーバーを呼ぶところだけ。
     （tools/build.mjs が自動で作っています。直接直さないこと）
     ============================================================ -->`;

/* 引数を付けると、出力先がその文字で始まる体験版だけを作り直す（例：node tools/build.mjs drink/）。
   納品物は案件ごとに直る時期が違うので、1つ足すたびに全部を作り直すと、
   見るつもりのなかった他の体験版まで中身が変わる（2026-10-21 に踏みかけた）。 */
const only = process.argv.slice(2);
const targets = only.length ? jobs.filter((j) => only.some((o) => j.out.startsWith(o))) : jobs;
if (only.length && targets.length === 0) { console.error(`× ${only.join(' ')} に当たる体験版がありません`); process.exit(1); }

let built = 0;
for (const job of targets) {
  const src = pick(job.src);
  if (!src) { console.error(`× ${job.out}: sources.local.json に ${job.src} がありません`); process.exit(1); }
  if (!existsSync(src)) { console.error(`× ${job.out}: 素材が見つかりません ${src}`); process.exit(1); }

  let html = readFileSync(src, 'utf8');

  // ①サーバーから値を差し込む場所を、偽サーバーの値へ向け替える
  if (job.bootstrap) {
    const before = html;
    html = html.replace(/<\?!=\s*bootstrap\s*\?>/g, 'DEMO_BOOTSTRAP');
    if (html === before) {
      console.error(`× ${job.out}: <?!= bootstrap ?> が見つかりません（納品コードの形が変わった？）`);
      process.exit(1);
    }
  }

  // ②案件ごとの差し替え（サーバーから差し込まれる値・サーバーでしか通らない分岐）
  for (const [re, to] of (job.replacements || [])) {
    if (job.mustReplace && !re.test(html)) {
      console.error(`× ${job.out}: 差し替え先（${re}）が見つかりません（納品コードの形が変わった？）`);
      process.exit(1);
    }
    html = html.replace(re, to);
  }

  // ③実名をつぶす（案件ごとの表があれば先に。そのあと全体の表）
  const jobAnon = job.anonymize ? toRegexPairs(pick(job.anonymize)) : [];
  if (job.anonymize && jobAnon.length === 0) {
    console.error(`× ${job.out}: sources.local.json に ${job.anonymize} がありません。実名が残ったまま公開されるので止めます。`);
    process.exit(1);
  }
  for (const [re, to] of [...jobAnon, ...ANONYMIZE]) html = html.replace(re, to);

  // ③差し込みの取りこぼしを機械的に見つける。GASの記法が残っていたら画面が壊れる
  if (/<\?(?!xml)/.test(html)) {
    const line = html.split('\n').findIndex(l => /<\?(?!xml)/.test(l)) + 1;
    console.error(`× ${job.out}: ${line}行目にGASの記法（<?）が残っています`);
    process.exit(1);
  }

  let out;
  if (job.mode === 'document') {
    // それ自体が開けるHTML。head と body の内側に差し込む
    if (!/<\/head>/i.test(html) || !/<body[^>]*>/i.test(html) || !/<\/body>/i.test(html)) {
      console.error(`× ${job.out}: head/body が見つかりません（mode:'document' の前提が崩れています）`);
      process.exit(1);
    }
    // 本物は GAS の doGet が addMetaTag('viewport', …) で付けている（HTML の中には無い）。
    // 体験版は静的なページなので、同じものをここで足す（無いとスマホで横に 3 倍の幅で描かれる）
    const vp = job.viewport && !/<meta[^>]+name=["']viewport["']/i.test(html)
      ? `<meta name="viewport" content="${job.viewport}">\n` : '';
    out = html
      .replace(/<\/head>/i, `${vp}<meta name="robots" content="noindex">\n${head(job)}\n</head>`)
      .replace(/(<body[^>]*>)/i, `$1\n${headScripts(job)}\n${KEEP_OUT}`)
      .replace(/<\/body>/i, `${tail(job)}\n</body>`);
    // タイトルは体験版と分かるものに差し替える
    out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${job.title}</title>`);
  } else {
    out = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${job.title}</title>
${head(job)}
</head>
<body>
${headScripts(job)}

${KEEP_OUT}
${html}
${tail(job)}
</body>
</html>
`;
  }

  assertClean(job.out, out, job.forbid);

  // 画面が読み込む別ファイル（診断の本体の .js など）も、同じ置き換え表を通して写す
  for (const ef of (job.extraFiles || [])) {
    const efSrc = pick(ef.src);
    if (!efSrc || !existsSync(efSrc)) { console.error(`× ${ef.out}: 素材が見つかりません ${efSrc || ef.src}`); process.exit(1); }
    let text = readFileSync(efSrc, 'utf8');
    for (const [re, to] of [...jobAnon, ...ANONYMIZE]) text = text.replace(re, to);
    assertClean(ef.out, text, ef.forbid, ef.storagePrefix);
    const efDest = join(ROOT, ef.out);
    mkdirSync(dirname(efDest), { recursive: true });
    writeFileSync(efDest, text);
    console.log(`○ ${ef.out}  ← ${efSrc}`);
    built++;
  }

  const dest = join(ROOT, job.out);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, out);
  console.log(`○ ${job.out}  ← ${src}`);
  built++;
}
console.log(`\n${built}枚を作り直しました。`);

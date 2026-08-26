/* ------------------------------------------------------------------
   請求管理だけは、データの出どころが Supabase ではない。

   本番は Google スプレッドシート3枚（生徒マスタ／請求トランザクション／設定マスタ）を
   サービスアカウントで読んでいる。だから偽Supabase（demo/engine.ts）は請求画面には
   一切効かない。ここで偽物にするのは **getSheets()** の方＝
   GAS案件で google.script.run を偽物にしたのと同じ手。

   返すのは「シートの生の行」（1行目が見出し）。本番の読み取りコード
   （src/utils/supabase/billing.ts・632行）は1行も直さずにそのまま動く。
   金額の計算も本番と同じ純粋関数（src/utils/billing/calc.ts）が走る。

   🚨 見出し行を1文字でも変えないこと。読み取り側は見出し名で列を引き、
      見つからないと黙って「位置で決め打ちした列」を読みにいく（＝変な数字が静かに出る）。

   数字・氏名はすべて架空。生徒8名は偽Supabase側（demo/seed.ts）と同じ顔ぶれにしてある
   （分析画面に出てくる生徒と請求書の生徒が食い違わないようにするため）。
   ------------------------------------------------------------------ */

/* 対象月は「開いた日」から決まる。固定の年月を書くと、来月見たときに
   「請求データが見つかりません」になるので、必ず今日を起点に組み立てる。 */
function monthKey(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${('0' + (d.getMonth() + 1)).slice(-2)}`;
}
/** 体験版で用意する対象月＝5か月前〜2か月後。画面の「←先月／次月→」で行き来できる範囲 */
const OFFSETS = [-5, -4, -3, -2, -1, 0, 1, 2];

type S = {
  id: string;
  name: string;
  parent: string;
  pay: '口座' | '現金' | '振り込み';
  card: boolean;          // 助成カードの利用申請あり
  refs: string;           // 紹介した生徒（毎月1,100円引きが続く）
  bookAcc: '保護者' | '本人';
  bookUrl: string;
  fee: number;            // 生徒ごとの個別月謝。0なら学年の基本額を使う
  from: number;           // 入塾した月（OFFSETS と同じ目盛り）
};

/* 架空の塾「そら塾」の生徒8名。学年はすべて中学生（偽Supabase側の中1〜中3と同じ8名）。
   ・青井家 … 助成カードあり
   ・海野家 … 兄弟2人。弟は旧価格の据え置き（生徒ごとの個別月謝の例）
   ・小森家 … 藤川けんとを紹介した世帯。紹介割引が毎月効く
   ・藤川家 … 今月入塾。初月だけ週割り＋入塾時割引＋現金、翌月から口座 */
const STUDENTS: S[] = [
  { id: 'S-1001', name: 'たいち', parent: '青井', pay: '口座',     card: true,  refs: '',       bookAcc: '保護者', bookUrl: 'https://example.com/booking/1c9f4b7e20', fee: 0, from: -99 },
  { id: 'S-1002', name: 'ゆい',   parent: '小森', pay: '口座',     card: false, refs: 'けんと', bookAcc: '本人',   bookUrl: 'https://example.com/booking/8f2c1d4a9b', fee: 0, from: -99 },
  { id: 'S-1003', name: 'みなと', parent: '海野', pay: '口座',     card: true,  refs: '',       bookAcc: '保護者', bookUrl: 'https://example.com/booking/6b02d7c9f4', fee: 0, from: -99 },
  { id: 'S-1004', name: 'そうた', parent: '海野', pay: '口座',     card: false, refs: '',       bookAcc: '保護者', bookUrl: 'https://example.com/booking/e58a3f1602', fee: 30800, from: -99 },
  { id: 'S-1005', name: 'あかり', parent: '木下', pay: '振り込み', card: true,  refs: '',       bookAcc: '本人',   bookUrl: 'https://example.com/booking/3a77e05c62', fee: 0, from: -99 },
  { id: 'S-1006', name: 'はると', parent: '白石', pay: '現金',     card: false, refs: '',       bookAcc: '保護者', bookUrl: 'https://example.com/booking/9d41c6b8a7', fee: 0, from: -99 },
  { id: 'S-1007', name: 'のぞみ', parent: '東',   pay: '口座',     card: true,  refs: '',       bookAcc: '保護者', bookUrl: 'https://example.com/booking/4f7b25e0dc', fee: 0, from: -99 },
  { id: 'S-1008', name: 'けんと', parent: '藤川', pay: '口座',     card: false, refs: '',       bookAcc: '保護者', bookUrl: 'https://example.com/booking/b30e8a5cf1', fee: 0, from: 0   },
];

/* ---------- ①生徒マスタ ----------
   見出しは本番のシートと同じ。末尾の「助成カード1〜12」は、その月の申請確認が
   済んだ印（対象月の列だけを見る）。請求文に入るお礼の一文の出し分けに使っている。 */
function masterSheet(): string[][] {
  const cardCols = Array.from({ length: 12 }, (_, i) => `助成カード${i + 1}`);
  const head = [
    '生徒ID', '生徒名', '保護者名', '学年', '支払い方法', '助成カード有無', '紹介者リスト',
    '予約アカウント', '予約URL', '基本月謝', '助成カード金額', ...cardCols,
  ];
  const rows = STUDENTS.map((s) => [
    s.id, s.name, s.parent, '中学生', s.pay, s.card ? 'TRUE' : 'FALSE', s.refs,
    s.bookAcc, s.bookUrl, s.fee ? String(s.fee) : '', s.card ? '10000' : '',
    ...cardCols.map(() => (s.card ? 'TRUE' : '')),
  ]);
  return [head, ...rows];
}

/* ---------- ②請求トランザクション ----------
   1行＝「1人の1か月分」。過去の月は「確定〜」列（スナップショット）を埋めてある＝
   あとから月謝を改定しても、請求済みの月の金額は動かない、という本番の作り。 */
function txSheet(): string[][] {
  const head = [
    '請求ID', '生徒ID', '生徒名', '対象年月', '当月ステータス', '入塾時割引',
    '確定学年', '確定基本額', '確定助成割引', '確定紹介割引', '週割り割合',
    '特例メッセージ', '支払期日（手動）', '発行日（手動）', '確定紹介者', '確定支払方法',
  ];
  const rows: string[][] = [];

  OFFSETS.forEach((off) => {
    const month = monthKey(off);
    const status = off >= 2 ? '未確定' : off === 1 ? 'ご請求中' : '入金済み';

    STUDENTS.forEach((s) => {
      if (off < s.from) return;                    // 入塾前の月には行が無い

      const isFirst = off === s.from;              // 入塾した月
      const isSecond = off === s.from + 1;         // 口座引き落としが始まる月
      const base = s.fee || 33000;
      // 過去の月は確定済み（スナップショット）。当月から先は生徒マスタから毎回計算する
      const fixed = off < 0 || isFirst;
      const rate = isFirst ? '0.5' : '1';          // 入塾した月は週割り（半月分）
      const subsidy = s.card ? Math.min(10000, base) : 0;

      rows.push([
        `INV-${month.replace('-', '')}-${s.id.slice(-4)}`,
        s.id,
        s.name,
        month,
        status,
        isFirst ? 'TRUE' : 'FALSE',
        fixed ? '中学生' : '',
        fixed ? String(base * parseFloat(rate)) : '',
        fixed ? String(isFirst ? 0 : subsidy) : '',
        fixed ? '0' : '',                          // 紹介割引は今月の入塾から効き始める
        rate,
        isFirst ? '入塾時（翌月口座）' : isSecond ? '口座初月' : '',
        '', '',
        '',                                        // 確定紹介者（過去分は紹介が無かったので空）
        fixed ? (isFirst ? '現金' : s.pay) : '',   // 初月だけ現金、翌月から口座
      ]);
    });
  });

  return [head, ...rows];
}

/* ---------- ③設定マスタ ----------
   LINEの文面・基本月謝・引き落とし日を、コードを触らずシートから変えられるようにしてある。
   ここに無いものはコード内の初期文面が使われる（画面の「設定状況」パネルがその内訳を出す）。
   最後の1行は、どこからも参照されていない設定名の例＝画面が黄色い注意書きで教えてくれる。 */
const SETTINGS: [string, string][] = [
  ['教室名', 'そら塾'],
  ['基本額_中学生', '33000'],
  ['基本額_小学生', '15400'],
  ['請求LINE_挨拶', '{{保護者名}} 様\nいつもお世話になっております。{{教室名}}です。\n{{当月}}月分の月謝をご案内いたします。\n\n'],
  ['請求LINE_単独ヘッダー', '【ご請求額】\n{{金額}}円\n\n'],
  ['請求LINE_合算ヘッダー', '【ご請求額（ごきょうだい合算）】\n{{合算金額}}円\n\n'],
  ['通常_口座', '※お支払いは口座引き落としをご利用いただいており、{{期日}}に引き落とし予定です。よろしくお願いいたします。'],
  ['通常_振込', '※{{期日}}までに指定の口座へお振込み、または教室にて現金でお支払いください。'],
  // 本番のシートはここが [[booking]]（LINE配信ツールが各家庭のURLに差し替える印）。
  // 体験版に配信ツールは無いので、同じ場所を {{URL}} にして予約URLを直接出している。
  ['予約案内_保護者', '▼下記より、授業日時のご確認・変更が可能です🙌\n{{URL}}'],
  ['請求LINE_結び', '{{当月}}月もどうぞよろしくお願いいたします。\n{{教室名}}'],
  ['メモ_2026年度の改定について', '4月から基本額を見直す。決まったら基本額_中学生を直す'],
];

/* ------------------------------------------------------------------
   本物の googleapis と同じ形（sheets.spreadsheets.values.get）で応じる。
   画面側・読み取り側は本物を呼んでいるつもりのまま動く。
   ------------------------------------------------------------------ */
export async function getDemoSheets() {
  return {
    spreadsheets: {
      values: {
        async get({ range }: { spreadsheetId?: string; range: string }) {
          const name = String(range).split('!')[0];
          if (name === '生徒マスタ') return { data: { values: masterSheet() } };
          if (name === '請求トランザクション') return { data: { values: txSheet() } };
          if (name === '設定マスタ') return { data: { values: SETTINGS.map(([k, v]) => [k, v]) } };
          return { data: { values: [] } };
        },
      },
    },
  };
}


/* ------------------------------------------------------------------
   世帯。本番は Supabase の households 表にあり（シートではない）、
   ごきょうだいの予約URL・請求URLを1本にまとめるのに使う。
   偽Supabase側（demo/seed.ts）がこれを読んで households 表を作る。
   ------------------------------------------------------------------ */
export const HOUSEHOLDS = [
  {
    // 20桁以上の長いトークン。請求文に貼るときは先頭10桁に切り詰められる
    // （本番にある短縮の仕組み。短いURLでも同じページに飛ぶ）
    token: '6b02d7c9f4e58a3f16021c9f4b7e',
    members: [{ billing_student_id: 'S-1003' }, { billing_student_id: 'S-1004' }],
  },
];

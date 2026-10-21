// data.js ── 体験版のメニュー（すべて架空）。
//   お店の名前・品名・材料の組み合わせ・値段・ひとことは、この体験版のために作ったもので、実在のお店のものではありません。
//   このファイルは tools/build.mjs が作るのではなく、手で書いて置いてあります（納品先のメニューを写さないため）。
//   項目の意味は納品したもの（本番ではお店が入力画面で入れる 1 行＝1 品）と同じです。
//
//   味の点数（1〜5）
//     sweet＝甘さ／acid＝酸味（説明文にだけ使う）／veg＝野菜の味／thick＝とろみ（さらっと 1 ↔ とろとろ 5）
//     easy＝はじめての人の飲みやすさ（結果の「飲みやすさ★」もここから計算）
//   cat＝種類（veg＝野菜と果物／fruit＝果物 100%／smoothie／hot）
//   items＝材料（診断の「好きな果物は？」と照らす）
//   goals＝「今日のテーマは？」と照らす印（energy／beauty／iron／detox／fill）
//   hot＝温かい、eatin＝お店で飲むときだけ、soup＝スープ、on＝提供中（false＝お休み）
//   lstart・lend＝期間限定の開始日・終了日（空＝限定なし）

window.SHOP = 'ジューススタンド ことり';
window.CATS = { veg: '野菜と果物のジュース', fruit: '果物100%ジュース', smoothie: 'スムージー', hot: 'ホット' };

window.DEFAULT_DRINKS = [
  // ── 野菜と果物のジュース（200ml）
  { id: 'v01', no: 1, name: 'あさやけキャロット', en: 'Sunrise Carrot', cat: 'veg', size: 200, price: 520,
    sweet: 4, acid: 3, veg: 2, thick: 1, easy: 5, items: ['人参', 'りんご', 'レモン'],
    effect: 'にんじんの甘さで、野菜ジュースがはじめての人にも', goals: ['beauty', 'energy'], hot: false, ice: true, on: true, lstart: '', lend: '', note: '' },
  { id: 'v02', no: 2, name: 'みどりのしずく', en: 'Green Drop', cat: 'veg', size: 200, price: 600,
    sweet: 2, acid: 3, veg: 5, thick: 1, easy: 2, items: ['小松菜', 'セロリ', 'りんご', 'パイン', 'レモン'],
    effect: '青菜をたっぷり。野菜が足りないなと思った日に', goals: ['iron', 'beauty', 'detox'], hot: false, ice: true, on: true, lstart: '', lend: '',
    note: '青菜の香りがしっかり。パインの甘さで後味は軽めです。' },
  { id: 'v03', no: 3, name: 'はたけのモーニング', en: 'Field Morning', cat: 'veg', size: 200, price: 480,
    sweet: 2, acid: 3, veg: 3, thick: 1, easy: 3, items: ['キャベツ', '人参', 'オレンジ', 'レモン'],
    effect: '朝の一杯に。すっきり軽い飲み口', goals: ['energy'], hot: false, ice: true, on: true, lstart: '', lend: '', note: 'あっさり。' },
  { id: 'v04', no: 4, name: 'ぴりっとジンジャー', en: 'Ginger Kick', cat: 'veg', size: 200, price: 560,
    sweet: 3, acid: 3, veg: 3, thick: 1, easy: 3, items: ['生姜', '人参', 'りんご', 'レモン'],
    effect: '生姜のぴりっとした香りで、気分をすっきり', goals: ['detox'], hot: false, ice: true, on: true, lstart: '', lend: '', note: '生姜が効いています。' },
  { id: 'v05', no: 5, name: 'ルビービーツ', en: 'Ruby Beets', cat: 'veg', size: 200, price: 620,
    sweet: 3, acid: 2, veg: 4, thick: 2, easy: 2, items: ['ビーツ', '人参', 'オレンジ'],
    effect: 'あざやかな赤。ビーツの土の香りとオレンジの甘さ', goals: ['iron'], hot: false, ice: true, on: true, lstart: '', lend: '',
    note: 'ビーツは独特の香りがあります。はじめての人は、まずひと口どうぞ。' },

  // ── 果物100%ジュース（300ml）
  { id: 'f06', no: 6, name: 'まるごとりんご 100%', en: 'Apple 100%', cat: 'fruit', size: 300, price: 640,
    sweet: 4, acid: 2, veg: 1, thick: 1, easy: 5, items: ['りんご'], goals: [], hot: false, ice: true, eatin: true, on: true, lstart: '', lend: '', note: '' },
  { id: 'f07', no: 7, name: 'たっぷりパイン 100%', en: 'Pineapple 100%', cat: 'fruit', size: 300, price: 620,
    sweet: 5, acid: 4, veg: 1, thick: 2, easy: 5, items: ['パイン'], goals: [], hot: false, ice: true, on: true, lstart: '', lend: '', note: '' },
  { id: 'f08', no: 8, name: 'パインとりんご 100%', en: 'Pineapple & Apple 100%', cat: 'fruit', size: 300, price: 650,
    sweet: 4, acid: 3, veg: 1, thick: 2, easy: 5, items: ['パイン', 'りんご'], goals: [], hot: false, ice: true, on: true, lstart: '', lend: '', note: '' },
  { id: 'f09', no: 9, name: 'しぼりたてオレンジ 100%', en: 'Orange 100%', cat: 'fruit', size: 300, price: 630,
    sweet: 3, acid: 4, veg: 1, thick: 1, easy: 5, items: ['オレンジ'], goals: [], hot: false, ice: true, on: true, lstart: '', lend: '', note: '' },
  { id: 'f10', no: 10, name: 'オレンジとりんご 100%', en: 'Orange & Apple 100%', cat: 'fruit', size: 300, price: 650,
    sweet: 3, acid: 3, veg: 1, thick: 1, easy: 5, items: ['オレンジ', 'りんご'], goals: [], hot: false, ice: true, on: true, lstart: '', lend: '', note: '' },
  { id: 'f11', no: 11, name: 'きょうの果物ミックス 100%', en: "Today's Fruit Mix 100%", cat: 'fruit', size: 300, price: 700,
    sweet: 2, acid: 4, veg: 1, thick: 2, easy: 5, items: ['旬の果物'], goals: [], hot: false, ice: true, on: true, lstart: '', lend: '',
    note: 'その日に入った旬の果物で作るので、中身は日によって変わります。' },

  // ── スムージー
  { id: 's12', no: 12, name: 'もったりバナナ', en: 'Thick Banana', cat: 'smoothie', price: 640,
    sweet: 4, acid: 1, veg: 1, thick: 5, easy: 5, items: ['バナナ'], goals: ['fill'], hot: false, ice: true, on: true, lstart: '', lend: '', note: '' },
  { id: 's13', no: 13, name: 'ひんやりパイン', en: 'Frozen Pineapple', cat: 'smoothie', price: 640,
    sweet: 2, acid: 4, veg: 1, thick: 4, easy: 5, items: ['パイン'], goals: ['fill'], hot: false, ice: true, on: true, lstart: '', lend: '', note: '' },
  { id: 's14', no: 14, name: 'パインとオレンジ', en: 'Pineapple & Orange', cat: 'smoothie', price: 660,
    sweet: 3, acid: 5, veg: 1, thick: 4, easy: 4, items: ['パイン', 'オレンジ'], goals: ['fill'], hot: false, ice: true, on: true, lstart: '', lend: '', note: '' },
  { id: 's15', no: 15, name: 'フルーツいろいろ', en: 'Fruit Medley', cat: 'smoothie', price: 710,
    sweet: 4, acid: 3, veg: 1, thick: 4, easy: 5, items: ['りんご', 'バナナ', 'パイン', 'オレンジ', 'マンゴー'], goals: ['fill'], hot: false, ice: true, on: true, lstart: '', lend: '', note: '' },
  { id: 's16', no: 16, name: 'デザートスムージー', en: 'Dessert Smoothie', cat: 'smoothie', price: 700,
    sweet: 5, acid: 2, veg: 1, thick: 5, easy: 5, items: ['いちご', 'バナナ', 'チョコ'], goals: ['fill'], hot: false, ice: true, on: true, lstart: '', lend: '', note: '' },
  { id: 's17', no: 17, name: 'グリーンスムージー', en: 'Green Smoothie', cat: 'smoothie', price: 710,
    sweet: 2, acid: 2, veg: 4, thick: 4, easy: 3, items: ['小松菜', 'りんご', 'バナナ'], goals: ['fill', 'iron', 'beauty'], hot: false, ice: true, on: true, lstart: '', lend: '', note: '' },
  { id: 's18', no: 18, name: 'ビーツとバナナ', en: 'Beets & Banana', cat: 'smoothie', price: 760,
    sweet: 4, acid: 2, veg: 3, thick: 5, easy: 3, items: ['ビーツ', 'バナナ', 'りんご'], goals: ['fill', 'iron'], hot: false, ice: true, on: false, lstart: '', lend: '', note: '' },

  // ── ホット（いまはりんご生姜だけ。スープ 2 つはお休み＝寒くなったら「提供中」に戻す想定）
  { id: 'h01', name: 'あったかりんご生姜', en: 'Warm Apple & Ginger', cat: 'hot', price: 400,
    sweet: 4, acid: 2, veg: 1, thick: 1, easy: 5, items: ['りんご', '生姜'], goals: ['detox'], hot: true, ice: false, on: true, lstart: '', lend: '', note: '' },
  { id: 'h02', name: 'とうもろこしのポタージュ', en: 'Corn Potage', cat: 'hot', price: 400, soup: true,
    sweet: 4, acid: 1, veg: 3, thick: 4, easy: 5, items: ['とうもろこし'], goals: ['fill'], hot: true, ice: false, on: false, lstart: '', lend: '', note: '' },
  { id: 'h03', name: '野菜のコンソメ', en: 'Vegetable Consomme', cat: 'hot', price: 360, soup: true,
    sweet: 2, acid: 1, veg: 3, thick: 1, easy: 5, items: ['野菜'], goals: [], hot: true, ice: false, on: false, lstart: '', lend: '', note: '' }
];

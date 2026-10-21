/* ------------------------------------------------------------------
   パン屋さんの「会員制クイズ企画」の偽サーバー。

   画面は、実際に納品したものと同じHTMLをそのまま置いている。
   本物はレジ横のタブレットで動き、子どもが自分のQRコードをかざすと
   その学年に合った問題が1日1問だけ出る、という仕組み。
   ここでは google.script.run だけを偽物に差し替えている。
   中の計算（出題の順番・難しさ合わせ・進級・名寄せ・ダッシュボードの集計）は、
   本物のサーバー（Code.gs）と同じ決まりを JavaScript で書き直したもの。

   お店・子どもの名前・記録はすべて架空。保存先はこのタブの中だけ。
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  /* ---------- 本物と同じ決まり（Code.gs の定数） ---------- */
  var GRADE_ORDER = ['小3まで', '小4', '小5', '小6', '中1', '中2', '中3', '卒業生'];        // 出題の箱
  var PLAYABLE = ['小3まで', '小4', '小5', '小6', '中1', '中2', '中3'];
  var SMALL_GRADES = ['年長', '小1', '小2', '小3'];                                       // この子たちは「小3まで」の箱で出題する
  var STUDENT_GRADE_ORDER = ['年長', '小1', '小2', '小3', '小3まで', '小4', '小5', '小6', '中1', '中2', '中3', '卒業生'];
  var NEXT_GRADE = { '年長':'小1', '小1':'小2', '小2':'小3', '小3':'小4', '小4':'小5', '小5':'小6',
                     '小6':'中1', '中1':'中2', '中2':'中3', '中3':'卒業生' };
  var PREV_GRADE = {}; Object.keys(NEXT_GRADE).forEach(function (k) { PREV_GRADE[NEXT_GRADE[k]] = k; });
  var SELF_GRADE_CHOICES = ['年長', '小1', '小2', '小3', '小4'];
  var RANGE_GRADES = ['中1', '中2', '中3'];
  var ANON_NAMES = ['男子', '女子', 'サッカー男子', 'サッカー女子', '塾生', 'うちの', 'だれか', 'ゲスト', 'テスト', 'test', 'てすと', '？', '?'];
  var ST_OPEN = '出題中', ST_DONE = '回答済', ST_TIMEUP = '時間切れ';
  var QUIZ_SECONDS = 30;
  var TUNE_RECENT_N = 5, TUNE_EASY_BELOW = 0.6, TUNE_HARD_ABOVE = 0.9;
  var TUNE_EASY_MIN_RATE = 0.75, TUNE_HARD_MAX_RATE = 0.70, TUNE_MIN_SHOWN = 2;
  var ADMIN_HARD_MIN_SHOWN = 2, ADMIN_INSIGHT_DAYS = 120, TUNE_LOG_VIEW_DAYS = 30, ADMIN_KID_MIN_ANSWERS = 5;
  var ADMIN_KID_BANDS = [
    { label: '0〜50%', lo: 0, hi: 50 },
    { label: '50〜70%', lo: 50, hi: 70 },
    { label: '70〜85%', lo: 70, hi: 85, target: true },
    { label: '85〜100%', lo: 85, hi: 101 }
  ];
  // 紛らわしい誤答の対（本物は36対。体験版の問題に出てくるものだけ）
  var CONFUSABLE_PAIRS = [['経線', '緯線'], ['動脈', '静脈'], ['線対称', '点対称'], ['輸出', '輸入'], ['化学変化', '状態変化']];
  var PLAY_KINDS = { 'かげ': 'kage', 'かぞえて': 'kazoete', 'なかまはずれ': 'nakama' };
  var PLAY_PROMPT = { kage: 'この かげは なーんだ？', kazoete: 'ぜんぶで いくつ？', nakama: 'なかまはずれは どれ？' };

  /* ---------- 問題（架空） ----------
     m は出題月：'this'＝今月ぶん、'next'＝来月ぶん、null＝通年（開いた月に合わせて下で数字に直す）。
     unit は定期テストの範囲の単元（中学生だけ。範囲に入っている間は、これを先に出す）。
     「小3まで」の【かげ】【かぞえて】【なかまはずれ】は、文字が読めない子のための絵の問題（あそび問題）。 */
  var Q = {
    '小3まで': [
      { id:'ay01', text:'【かげ】🐘', answer:'ぞう', wrongs:['りんご','くるま'], hint:'はなが ながい どうぶつだよ' },
      { id:'ay02', text:'【かげ】🐢', answer:'かめ', wrongs:['ばなな','ぼうし'], hint:'せなかに こうらが あるよ' },
      { id:'ay03', text:'【かげ】🦒', answer:'きりん', wrongs:['ぞう','ぺんぎん'], hint:'くびが とても ながいよ' },
      { id:'ay04', text:'【かげ】🚲', answer:'じてんしゃ', wrongs:['くるま','ふね'], hint:'ぺだるを こいで すすむよ' },
      { id:'ay05', text:'【かぞえて】🥐🥐🥐', answer:'3', wrongs:['1','5'], hint:'ひとつずつ ゆびで かぞえよう' },
      { id:'ay06', text:'【かぞえて】🍞🍞🍞🍞', answer:'4', wrongs:['2','6'], hint:'ひとつずつ ゆびで かぞえよう' },
      { id:'ay07', text:'【なかまはずれ】', answer:'🚗 くるま', wrongs:['🐟 さかな','🐙 たこ','🦀 かに'], hint:'くるまだけ いきものじゃ ないね' },
      { id:'ay08', text:'【なかまはずれ】', answer:'👟 くつ', wrongs:['🍎 りんご','🍌 ばなな','🍇 ぶどう'], hint:'くつは たべられないね' },
      { id:'q1', text:'パンを つくるときに、ふくらませるために いれるものは どれ？', answer:'いーすと', wrongs:['さとう','しお','こおり'], hint:'パンやさんの あさは、これを まぜるところから はじまるよ', m:'this' },
      { id:'q2', text:'メロンパンの うえに のっている、あみめの きじは なに？', answer:'くっきーの きじ', wrongs:['ちょこ','ぜりー','わたあめ'], hint:'さくさく しているよ', m:'this' },
      { id:'q3', text:'クロワッサンは、どこの くにで ゆうめいな パン？', answer:'ふらんす', wrongs:['あめりか','いんど','ちゅうごく'], hint:'えっふぇるとうの ある くにだよ', m:'next' }
    ],
    '小4': [
      { id:'q1', text:'パンの生地を休ませて、ふくらませることを何という？', answer:'発酵（はっこう）', wrongs:['冷凍','熟成','乾燥'], hint:'イースト菌がはたらいています。', m:'this' },
      { id:'q2', text:'日本で「あんパン」が生まれたのは、およそ何年前？', answer:'約150年前', wrongs:['約50年前','約500年前','約1000年前'], hint:'明治時代のはじめごろです。', m:'this' },
      { id:'q3', text:'小麦を育てるとき、たねをまくのはどの季節が多い？', answer:'秋', wrongs:['春','夏','冬'], hint:'冬をこして、初夏に実ります。', m:'next' },
      { id:'q4', text:'バターは、なにからつくられる？', answer:'牛乳', wrongs:['たまご','大豆','小麦'], hint:'白い液体をかきまぜて作ります。' },
      { id:'q5', text:'カレーパンは、ふつうどうやって仕上げる？', answer:'油であげる', wrongs:['蒸す','ゆでる','凍らせる'], hint:'まわりがさくさくしています。' }
    ],
    '小5': [
      { id:'q1', text:'パンがふくらむのは、イースト菌が出す何のはたらき？', answer:'二酸化炭素', wrongs:['酸素','水素','ちっ素'], hint:'炭酸ジュースのあわと同じ気体です。', m:'this' },
      { id:'q2', text:'日本の小麦の多くは、どこから輸入している？', answer:'アメリカ・カナダ・オーストラリア', wrongs:['フランス','中国','ブラジル'], hint:'太平洋をわたってきます。', m:'this' },
      { id:'q3', text:'外国から品物を買い入れることを何という？', answer:'輸入', wrongs:['輸出','生産','流通'], hint:'「入」の字が入っています。', m:'next' },
      { id:'q4', text:'こむぎこの「強力粉」と「薄力粉」。パンに向いているのはどっち？', answer:'強力粉', wrongs:['薄力粉','どちらも同じ','中力粉だけ'], hint:'もちもちの元になる成分が多いほうです。' },
      { id:'q5', text:'ベーカリーという言葉は、もともと何語？', answer:'英語', wrongs:['フランス語','ドイツ語','イタリア語'], hint:'bake（焼く）から来ています。' }
    ],
    '小6': [
      { id:'q1', text:'小麦粉に水を加えてこねると出てくる、もちもちの成分は？', answer:'グルテン', wrongs:['でんぷん','カルシウム','ビタミンC'], hint:'たんぱく質の一種です。', m:'this' },
      { id:'q2', text:'1本の直線で折ると、ぴったり重なる図形を何という？', answer:'線対称', wrongs:['点対称','合同','拡大図'], hint:'折り目の線を「対称の軸」といいます。', m:'this' },
      { id:'q3', text:'パンの原料になる小麦は、植物のどの部分を使う？', answer:'実（種子）', wrongs:['葉','根','花びら'], hint:'穂の先についている部分です。', m:'next' },
      { id:'q4', text:'デニッシュ生地に、バターを何度もはさんで折るのはなぜ？', answer:'層をつくってサクサクにするため', wrongs:['色をつけるため','日もちさせるため','重くするため'], hint:'切ると、うすい層が見えます。' },
      { id:'q5', text:'食品の「消費期限」と「賞味期限」。すぐ食べたほうがよいのはどっち？', answer:'消費期限', wrongs:['賞味期限','どちらも同じ','製造日'], hint:'いたみやすい食品につきます。' }
    ],
    '中1': [
      { id:'q1', text:'イースト菌のはたらきで、糖からアルコールと二酸化炭素ができる反応を何という？', answer:'アルコール発酵', wrongs:['光合成','中和','燃焼'], hint:'お酒づくりと同じしくみです。', m:'this' },
      { id:'q2', text:'地球上の位置を表すとき、北極と南極を結ぶ線を何という？', answer:'経線', wrongs:['緯線','赤道','日付変更線'], hint:'「経度」を表す線です。', m:'this' },
      { id:'q3', text:'食パン1枚（約60g）のエネルギーは、およそどれくらい？', answer:'約160kcal', wrongs:['約40kcal','約400kcal','約900kcal'], hint:'ごはん軽く1杯より少し少ないくらいです。', m:'next' },
      { id:'q4', text:'パンを冷蔵庫に入れると固くなりやすいのはなぜ？', answer:'でんぷんが老化するから', wrongs:['水分が増えるから','油が固まるから','菌が増えるから'], hint:'0〜5℃がいちばん進みます。' },
      { id:'q5', text:'−3 と +5 をたすと、いくつ？', answer:'+2', wrongs:['−8','+8','−2'], hint:'数直線で、−3 から右へ 5 進みます。', unit:'正の数・負の数' },
      { id:'q6', text:'0℃より 4℃低い温度を、符号を使って表すと？', answer:'−4℃', wrongs:['+4℃','4℃','−0.4℃'], hint:'0 より小さい数には − を付けます。', unit:'正の数・負の数' }
    ],
    '中2': [
      { id:'q1', text:'パン生地をこねると強くなる、グルテンの「網目」は何どうしの結びつき？', answer:'たんぱく質', wrongs:['脂質','糖質','無機物'], hint:'グリアジンとグルテニンが結びつきます。', m:'this' },
      { id:'q2', text:'心臓から送り出される血液が流れる血管を何という？', answer:'動脈', wrongs:['静脈','毛細血管','リンパ管'], hint:'かべが厚く、弾力があります。', m:'this' },
      { id:'q3', text:'酵母は、生物の分類でいうと何のなかま？', answer:'菌類', wrongs:['細菌','植物','原生生物'], hint:'きのこやカビと同じグループです。', m:'next' },
      { id:'q4', text:'パンの「窯（かま）のび」とは何のこと？', answer:'焼き始めに生地がふくらむこと', wrongs:['焼きすぎてこげること','冷めてしぼむこと','生地が固くなること'], hint:'オーブンに入れた直後に起こります。' },
      { id:'q5', text:'鉄と硫黄を加熱して、別の物質ができる変化を何という？', answer:'化学変化', wrongs:['状態変化','蒸発','溶解'], hint:'元の物質とは性質がちがう物質ができます。', unit:'化学変化と原子・分子' },
      { id:'q6', text:'物質をつくっている、それ以上分けられない小さな粒を何という？', answer:'原子', wrongs:['分子','イオン','結晶'], hint:'ドルトンが考えました。', unit:'化学変化と原子・分子' }
    ],
    '中3': [
      { id:'q1', text:'パンが焼けると香ばしくなるのは、糖とアミノ酸が起こす何反応？', answer:'メイラード反応', wrongs:['中和反応','酸化還元反応','加水分解'], hint:'肉の焼き色や、しょうゆの色も同じ反応です。', m:'this' },
      { id:'q2', text:'日本の食料自給率（カロリーベース）は、およそ何%？', answer:'約38%', wrongs:['約10%','約60%','約85%'], hint:'6割以上を輸入にたよっています。', m:'this' },
      { id:'q3', text:'「原価率」とは、売上に対する何の割合？', answer:'仕入れ・材料の費用', wrongs:['人件費','家賃','税金'], hint:'飲食店では3割前後が目安といわれます。', m:'next' },
      { id:'q4', text:'食品表示で「消費期限」を書かなければならないのは、どんな食品？', answer:'いたみやすい食品', wrongs:['冷凍食品','缶づめ','乾めん'], hint:'おおむね5日以内に品質が落ちるものです。' },
      { id:'q5', text:'x² = 9 を解くと？', answer:'x = ±3', wrongs:['x = 3','x = 9','x = ±9'], hint:'2乗して 9 になる数は 2 つあります。', unit:'二次方程式' },
      { id:'q6', text:'(x − 2)(x + 5) = 0 の解は？', answer:'x = 2, −5', wrongs:['x = −2, 5','x = 2, 5','x = −2, −5'], hint:'どちらかのかっこが 0 になればよい。', unit:'二次方程式' }
    ]
  };

  /* 定期テストの範囲（本物はシート「テスト範囲」から、今日の日付で「対策中／復習中／夏休み」を決める）。
     体験版はいつ開かれるか分からないので、学年ごとに決め打ちにしている。 */
  var RANGES = {
    '中1': { mode: 'review', label: '1期', units: ['正の数・負の数'] },
    '中2': { mode: 'prep',   label: '2中', units: ['化学変化と原子・分子'] },
    '中3': { mode: 'prep',   label: '2中', units: ['二次方程式'] }
  };

  function playOf(text) {
    var m = String(text == null ? '' : text).match(/^\s*【(かげ|かぞえて|なかまはずれ)】([\s\S]*)$/);
    if (!m) return null;
    var kind = PLAY_KINDS[m[1]];
    var rest = m[2].trim();
    var idx = rest.search(/[぀-ヿ㐀-鿿ｦ-ﾟ0-9A-Za-z０-９Ａ-Ｚａ-ｚ]/);
    var picture = (idx < 0 ? rest : rest.slice(0, idx)).replace(/\s+/g, '');
    var prompt = idx < 0 ? '' : rest.slice(idx).trim();
    return { kind: kind, picture: picture, prompt: prompt || PLAY_PROMPT[kind] };
  }

  /* 出題月を、開いた月に合わせて数字にする（全部を通年にすると「当月分なし」と毎回警告が出るため） */
  (function () {
    var m = new Date().getMonth() + 1;
    var nextM = (m === 12) ? 1 : m + 1;
    Object.keys(Q).forEach(function (g) {
      Q[g].forEach(function (q) {
        q.month = q.m === 'this' ? m : (q.m === 'next' ? nextM : null);
        q.unit = q.unit || '';
        q.play = playOf(q.text);
      });
    });
  })();

  /* ---------- 日付まわり ---------- */
  var DAY = 86400000;
  function pad(n) { return ('0' + n).slice(-2); }
  function todayStart() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function dayStart(offset) { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); return d.getTime(); }
  function dateKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayKey() { return dateKey(Date.now()); }
  function fmtDate(ms) { if (!ms) return ''; var d = new Date(ms); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); }
  function fmtDateTime(ms) { if (!ms) return ''; var d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function schoolYearOf(ms) { var d = new Date(ms); return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1; }
  function aprilStart(year) { return new Date(year, 3, 1).getTime(); }

  function quizBox(grade) { return SMALL_GRADES.indexOf(grade) >= 0 ? '小3まで' : grade; }
  function gradeIdx(g) { var i = STUDENT_GRADE_ORDER.indexOf(g); return i < 0 ? 999 : i; }
  /* 名前の表記ゆれ判定（カタカナをひらがなに寄せるだけ） */
  function nameKey(s) {
    var out = '', t = String(s || '').trim();
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      out += (c >= 0x30A1 && c <= 0x30F6) ? String.fromCharCode(c - 0x60) : t.charAt(i);
    }
    return out;
  }
  function ansKey(grade, qid) { return String(grade || '').trim() + ' ' + String(qid || '').trim(); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---------- 架空の子どもと記録 ---------- */
  // [名前, 今の学年, 目印, 正答のしやすさ]
  var KIDS = [
    ['ゆうと','小4','',0.62], ['さくら','小4','',0.78], ['はるき','小5','',0.72], ['あおい','小5','',0.84], ['りく','小6','',0.55],
    ['ひなた','小6','',0.75], ['そら','中1','',0.70], ['めい','中1','',0.80], ['かいと','中2','',0.66], ['ゆづき','中2','',0.88],
    ['たける','中3','',0.60], ['のあ','中3','',0.74], ['ことね','小2','',0.76], ['りょう','小1','',0.70], ['みお','小5','',0.81],
    ['そうすけ','中1','',0.73], ['あかね','小6','',0.69], ['ゆうき','中2','',0.77], ['はな','小4','',0.83], ['れん','中3','',0.71],
    // 同じ名前で2つ登録されてしまった例（「同名の統合」「おなじ子をまとめる」を見せるため）
    ['そら','小6','',0.70],
    // 学年がまだ分からない子（小3まで）。レジ横の画面で「なんねんせい？」と聞かれる
    ['つむぎ','小3まで','',0.74],
    ['いぶき','小3まで','',0.68],
    ['ひまり','小3','',0.79],
    ['こうた','年長','',0.72],
    // 名簿の「要対応」を見せるための2件（だれか分からない名前／同じ子が2つ）
    ['サッカー男子','小5','',0],
    ['ゆうと','小4','',0.62]
  ];
  var KIOSK_KID = 'S0022';   // レジ横の画面（体験版の最初のページ）が開くと、この子のQRをかざした状態から始まる

  function initialState() {
    var now = Date.now();
    var fy = schoolYearOf(now);
    var april = aprilStart(fy);
    var students = KIDS.map(function (k, i) {
      var reg = dayStart(-430 + i * 5);
      if (i === KIDS.length - 1) reg = dayStart(-9);         // 2つ目の「ゆうと」は最近うっかり作られた
      if (i === KIDS.length - 2) reg = dayStart(-20);        // 「サッカー男子」は名前の聞き取りに失敗した登録
      return { id: 'S' + ('000' + (i + 1)).slice(-4), name: k[0], grade: k[1], note: k[2], registered: reg, skill: k[3] };
    });

    // 今年度の4/1の進級を「済んだもの」として控える（ダッシュボードの［取り消す］を試せるように）
    var changes = [];
    students.forEach(function (s) {
      var from = PREV_GRADE[s.grade];
      if (!from || s.registered >= april) return;
      if (s.grade === '小3まで') return;
      changes.push(s.id + ':' + from + '>' + s.grade);
      s.prevGrade = from;
    });

    // 過去60日ぶんの回答記録。1日に何人かが来て、1人1問だけ答える
    var seed = 20261021;
    var rand = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    var records = [];
    var tune = {};
    function pushRecord(s, ms) {
      var g = (s.prevGrade && ms < april) ? s.prevGrade : s.grade;
      var box = quizBox(g);
      // テスト範囲の問題（unit つき）は、範囲を入れたばかりという設定にして過去の記録には入れない
      //（中学生がレジ横の画面で遊ぶと、まず範囲の問題が出る）
      var qs = (Q[box] || []).filter(function (q) { return !q.unit; });
      if (!qs.length) return;
      var q = qs[Math.floor(rand() * qs.length)];
      var ok = rand() < s.skill;
      var wrongPick = q.wrongs[Math.floor(rand() * q.wrongs.length)];
      var timeup = !ok && rand() < 0.15;
      records.push([new Date(ms).toISOString(), s.id, s.name, box, q.id, q.text,
                    ok, ok ? q.answer : (timeup ? '（時間切れ）' : wrongPick), q.answer, timeup ? ST_TIMEUP : ST_DONE]);
      var r = rand(), k = dateKey(ms);
      if (!tune[k]) tune[k] = [0, 0, 0];
      tune[k][r < 0.80 ? 0 : (r < 0.92 ? 1 : 2)]++;
    }
    for (var d = -60; d <= -1; d++) {
      students.forEach(function (s, i) {
        if (!s.skill) return;                                 // 1回も遊んでいない子
        if (i === KIDS.length - 1 && d < -9) return;          // 最近できたアカウント
        if (s.registered > dayStart(d)) return;
        // 2人だけ、2週間以上来ていない子（ダッシュボードの「ごぶさた」に出る）
        if ((s.name === 'りく' || s.name === 'かいと') && d > -18) return;
        if (rand() > 0.24) return;
        pushRecord(s, dayStart(d) + (10 + Math.floor(rand() * 8)) * 3600000 + Math.floor(rand() * 3600000));
      });
    }
    // 今日すでに来た子（名簿の「本日の結果」が空にならないように）。レジ横の画面の子は入れない
    var t0 = todayStart();
    ['S0002', 'S0010', 'S0016'].forEach(function (id, n) {
      var s = students.filter(function (x) { return x.id === id; })[0];
      var ms = Math.max(t0 + (n + 1) * 60000, now - (95 - n * 30) * 60000);
      pushRecord(s, Math.min(ms, now - 1000));
    });
    records.sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });

    students.forEach(function (s) { delete s.skill; delete s.prevGrade; });

    var gradeSelf = {};
    gradeSelf['S0024'] = { g: '小3', d: dateKey(dayStart(-2)) };   // 「ひまり」がレジ横の画面で自分で選んだ学年（店長の確認待ち）

    return {
      students: students, records: records,
      gradeAsk: {}, gradeSelf: gradeSelf,
      promoYear: fy,
      promoLog: { y: fy, at: april + 10 * 3600000, undone: false, c: changes },
      tuneLog: tune,
      nayoseBetsu: { pairs: {}, list: [] }, nayoseLog: []
    };
  }

  var store = Demo.store('quizkikaku.v2', initialState);
  var S = store.data;
  function commit() { store.commit(); }

  function recTime(r) { return new Date(r[0]).getTime(); }
  function isTrue(v) { return v === true; }
  function findStudent(id) { return S.students.filter(function (s) { return String(s.id) === String(id); })[0] || null; }
  function publicStudent(s) { return { id: String(s.id), name: String(s.name), grade: String(s.grade), note: String(s.note || '') }; }
  function findQuestion(grade, qid) {
    var all = Q[grade] || [];
    for (var i = 0; i < all.length; i++) if (all[i].id === qid) return { q: all[i], all: all };
    return null;
  }

  /* ---------- 出題（Code.gs の pickQuestion_・tunePool_・buildChoices_ と同じ決まり） ---------- */
  function tuneLevel(recentOk) {
    if (!recentOk || recentOk.length < TUNE_RECENT_N) return 'normal';
    var list = recentOk.slice(0, TUNE_RECENT_N);
    var rate = list.filter(function (x) { return x; }).length / list.length;
    if (rate < TUNE_EASY_BELOW) return 'easy';
    if (rate > TUNE_HARD_ABOVE) return 'hard';
    return 'normal';
  }
  function questionStats() {
    var st = {};
    S.records.forEach(function (r) {
      if (!r[4] || r[9] === ST_OPEN) return;
      var k = ansKey(r[3], r[4]);
      if (!st[k]) st[k] = [0, 0];
      st[k][0]++; if (isTrue(r[6])) st[k][1]++;
    });
    return st;
  }
  function tunePool(pool, grade, tune) {
    if (!tune || (tune.level !== 'easy' && tune.level !== 'hard') || !tune.stats) return { pool: pool, box: 'normal' };
    var pref = pool.filter(function (q) {
      var s = tune.stats[ansKey(grade, q.id)];
      if (!s || s[0] < TUNE_MIN_SHOWN) return false;
      var rate = s[1] / s[0];
      return tune.level === 'easy' ? rate >= TUNE_EASY_MIN_RATE : rate <= TUNE_HARD_MAX_RATE;
    });
    return pref.length ? { pool: pref, box: tune.level } : { pool: pool, box: 'normal' };
  }
  function pickOne(a) { return a[Math.floor(Math.random() * a.length)]; }
  function pickQuestion(grade, answered, wrongIds, tune) {
    var all = Q[grade] || [];
    // 中学生は、まず定期テストの範囲の単元の未回答から
    var rg = RANGE_GRADES.indexOf(grade) >= 0 ? RANGES[grade] : null;
    if (rg) {
      var cand = all.filter(function (q) { return q.unit && rg.units.indexOf(q.unit) >= 0 && !answered[ansKey(grade, q.id)]; });
      if (cand.length) {
        var rt = tunePool(cand, grade, tune);
        return { status: 'ok', question: pickOne(rt.pool), all: all, mode: 'normal', box: rt.box, grade: grade };
      }
    }
    if (!all.length) return { status: 'no_questions' };
    var unanswered = all.filter(function (q) { return !q.unit && !answered[ansKey(grade, q.id)]; });
    var pool, mode;
    var m = new Date().getMonth() + 1;
    var playRows = unanswered.filter(function (q) { return !!q.play; });
    if (playRows.length) {
      // 小3までは あそび問題が先（今月＋通年 → normal、他の月だけ → fallback）
      var near = playRows.filter(function (q) { return q.month === m || q.month === null; });
      if (near.length) { pool = near; mode = 'normal'; } else { pool = playRows; mode = 'fallback'; }
    } else if (unanswered.length) {
      var monthly = unanswered.filter(function (q) { return q.month === m; });
      if (monthly.length) { pool = monthly; mode = 'normal'; }
      else {
        var evergreen = unanswered.filter(function (q) { return q.month === null; });
        pool = evergreen.length ? evergreen : unanswered;
        mode = 'fallback';
      }
    } else {
      var wrongs = all.filter(function (q) { return wrongIds[q.id]; });
      pool = wrongs.length ? wrongs : all;
      mode = wrongs.length ? 'review' : 'replay';
    }
    var tuned = tunePool(pool, grade, tune);
    return { status: 'ok', question: pickOne(tuned.pool), all: all, mode: mode, box: tuned.box, grade: grade };
  }
  function buildChoices(q, all) {
    var choices = [];
    var push = function (v) { var s = String(v == null ? '' : v).trim(); if (!s || choices.indexOf(s) >= 0) return; choices.push(s); };
    push(q.answer);
    (q.wrongs || []).forEach(push);
    if (q.play) return { textShown: q.text, choices: shuffle(choices) };   // あそび問題は補充しない（誤答2つなら3択）
    for (var i = 0; i < all.length && choices.length < 4; i++) if (all[i].id !== q.id) push(all[i].answer);
    return { textShown: q.text, choices: shuffle(choices.slice(0, 4)) };
  }
  function logTuneBox(box) {
    var k = todayKey();
    if (!S.tuneLog[k]) S.tuneLog[k] = [0, 0, 0];
    S.tuneLog[k][box === 'easy' ? 1 : (box === 'hard' ? 2 : 0)]++;
  }
  function tuneLogSummary(days) {
    var from = dateKey(dayStart(-(days - 1)));
    var out = { days: days, since: from, normal: 0, easy: 0, hard: 0 };
    Object.keys(S.tuneLog).forEach(function (k) {
      if (k < from) return;
      out.normal += S.tuneLog[k][0]; out.easy += S.tuneLog[k][1]; out.hard += S.tuneLog[k][2];
    });
    return out;
  }
  function confusableKey(s) {
    return String(s == null ? '' : s).replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, '').replace(/する$/, '');
  }
  function hasConfusable(answer, wrongs) {
    var a = confusableKey(answer);
    return (wrongs || []).some(function (w) {
      var k = confusableKey(w);
      return CONFUSABLE_PAIRS.some(function (p) {
        var x = confusableKey(p[0]), y = confusableKey(p[1]);
        return (a === x && k === y) || (a === y && k === x);
      });
    });
  }

  /* ---------- 進級（4/1）・学年の確認 ---------- */
  function promoteAll(fy, nowMs) {
    var cutoff = aprilStart(fy), changes = [], moved = {};
    S.students.forEach(function (s) {
      var to = NEXT_GRADE[s.grade];
      if (!to) return;
      if (s.registered && s.registered >= cutoff) return;
      changes.push(s.id + ':' + s.grade + '>' + to);
      s.grade = to; moved[s.id] = to;
    });
    S.promoLog = { y: fy, at: nowMs, undone: false, c: changes };
    S.promoYear = fy;
    Object.keys(S.gradeSelf).forEach(function (id) { if (moved[id]) S.gradeSelf[id].g = moved[id]; });
    return { year: fy, count: changes.length };
  }
  function promoteIfDue() {
    var fy = schoolYearOf(Date.now());
    if (Number(S.promoYear) >= fy) return;
    promoteAll(fy, Date.now());
    commit();
  }
  function parsePromoChange(c) {
    var m = String(c).match(/^([^:]+):(.+)>(.+)$/);
    return m ? { id: m[1], from: m[2], to: m[3] } : null;
  }
  function getPromotionState() {
    var fy = schoolYearOf(Date.now());
    var log = S.promoLog;
    var out = {
      doneYear: Number(S.promoYear) || null,
      nextDate: (fy + 1) + '/4/1',
      last: null,
      unknownCount: S.students.filter(function (s) { return s.grade === '小3まで'; }).length
    };
    if (log) {
      var pairs = {};
      (log.c || []).forEach(function (c) {
        var x = parsePromoChange(c); if (!x) return;
        var k = x.from + '→' + x.to; pairs[k] = (pairs[k] || 0) + 1;
      });
      out.last = {
        year: log.y, at: fmtDate(log.at), count: (log.c || []).length, undone: !!log.undone, undoneAt: fmtDate(log.undoneAt || 0),
        pairs: Object.keys(pairs).map(function (k) { return { label: k, count: pairs[k] }; }),
        canUndo: !log.undone && log.y === fy && (log.c || []).length > 0,
        canRedo: !!log.undone && log.y === fy
      };
    }
    return out;
  }
  function gradeAskDue(id) { return S.gradeAsk[id] !== todayKey(); }
  function markGradeAsked(id) {
    var t = todayKey();
    Object.keys(S.gradeAsk).forEach(function (k) { if (S.gradeAsk[k] !== t) delete S.gradeAsk[k]; });
    S.gradeAsk[id] = t;
  }
  function gradeSelfDrop(id) { if (S.gradeSelf[id]) delete S.gradeSelf[id]; }

  /* ---------- 名寄せ（「べつの子」と決めた組を控える） ---------- */
  function betsuKey(a, b) { a = String(a); b = String(b); return a < b ? a + '|' + b : b + '|' + a; }
  function nayoseLogAdd(kind, text) {
    S.nayoseLog.unshift({ when: fmtDateTime(Date.now()), kind: kind, text: text });
    S.nayoseLog = S.nayoseLog.slice(0, 100);
  }

  function getMergeCandidates() {
    var groups = {};
    S.students.forEach(function (s) { (groups[nameKey(s.name)] = groups[nameKey(s.name)] || []).push(s); });
    var stat = {};
    S.records.forEach(function (r) {
      var id = String(r[1]), ts = recTime(r);
      var st = stat[id] || (stat[id] = { plays: 0, correct: 0, first: 0, last: 0, grades: {}, recent: [] });
      st.plays++;
      if (isTrue(r[6])) st.correct++;
      if (ts) { if (!st.first || ts < st.first) st.first = ts; if (ts > st.last) st.last = ts; }
      if (r[3]) st.grades[r[3]] = true;
      st.recent.push({ ts: ts, grade: r[3], question: r[5], correct: isTrue(r[6]), state: r[9] });
    });
    var t0 = todayStart(), out = [];
    Object.keys(groups).forEach(function (k) {
      var members = groups[k];
      if (members.length < 2) return;
      members = members.filter(function (a) {
        return members.some(function (b) { return a.id !== b.id && !S.nayoseBetsu.pairs[betsuKey(a.id, b.id)]; });
      });
      if (members.length < 2) return;
      members.sort(function (a, b) { return gradeIdx(a.grade) - gradeIdx(b.grade); });
      out.push({
        key: k, name: members[0].name,
        accounts: members.map(function (s) {
          var st = stat[s.id] || { plays: 0, correct: 0, first: 0, last: 0, grades: {}, recent: [] };
          st.recent.sort(function (a, b) { return b.ts - a.ts; });
          return {
            id: s.id, name: s.name, grade: s.grade, note: s.note,
            registered: fmtDate(s.registered),
            plays: st.plays, correct: st.correct,
            firstPlay: fmtDate(st.first), lastPlay: fmtDate(st.last),
            daysSinceLast: st.last ? Math.floor((t0 - st.last) / DAY) : -1,
            gradesPlayed: Object.keys(st.grades),
            recent: st.recent.slice(0, 5).map(function (r) {
              return { when: fmtDateTime(r.ts), grade: r.grade, question: r.question,
                       result: r.state === ST_OPEN ? '未完了' : (r.correct ? '正解' : '不正解') };
            })
          };
        })
      });
    });
    out.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
    return out;
  }

  function mergeStudents(keepId, dropIds) {
    keepId = String(keepId || '').trim();
    var drops = (dropIds || []).map(function (x) { return String(x).trim(); }).filter(function (x) { return x && x !== keepId; });
    if (!keepId) return { success: false, error: '残す方が選ばれていません。' };
    if (!drops.length) return { success: false, error: 'まとめる相手が選ばれていません。' };
    var keep = findStudent(keepId);
    if (!keep) return { success: false, error: '残す方のアカウントが見つかりません。画面を更新してやり直してください。' };
    var targets = [];
    for (var i = 0; i < drops.length; i++) {
      var s = findStudent(drops[i]);
      if (!s) return { success: false, error: 'まとめる相手が見つかりません。画面を更新してやり直してください。' };
      targets.push(s);
    }
    // 回答記録は1件も消さず、残す方へ付け替えるだけ（学年の列は当時の記録のまま）
    var moved = 0;
    S.records.forEach(function (r) { if (drops.indexOf(String(r[1])) >= 0) { r[1] = keepId; r[2] = keep.name; moved++; } });
    S.students = S.students.filter(function (x) { return drops.indexOf(String(x.id)) < 0; });
    commit();
    return { success: true, movedRecords: moved, mergedCount: targets.length, keep: publicStudent(keep),
             dropped: targets.map(function (x) { return { name: String(x.name), grade: String(x.grade) }; }) };
  }

  var SERVER = {

    /* ---------- レジ横のタブレット（QRをかざしたとき） ---------- */
    processScan: function (studentId, skipGradeAsk) {
      promoteIfDue();
      var stu = findStudent(studentId);
      if (!stu) return { success: false, status: 'error', message: 'この QR は登録されていません。お店の人をよんでね。' };
      if (stu.grade === '卒業生') return { success: false, status: 'error', message: '卒業生はクイズの対象外です。' };
      var box = quizBox(stu.grade);
      if (PLAYABLE.indexOf(box) < 0) {
        return { success: false, status: 'error', message: '学年が正しく登録されていません（' + stu.grade + '）。お店の人をよんでね。' };
      }

      var t0 = todayStart();
      var answered = {}, wrongIds = {}, correctCount = 0, today = null, recentOk = [];
      for (var i = S.records.length - 1; i >= 0; i--) {
        var r = S.records[i];
        if (String(r[1]) !== String(stu.id)) continue;
        var ts = recTime(r);
        if (!today && ts >= t0) today = { row: i + 2, ms: ts, state: r[9], qid: r[4], grade: r[3] };
        answered[ansKey(r[3], r[4])] = true;
        if (isTrue(r[6])) correctCount++;
        else if (r[3] === box) wrongIds[r[4]] = true;
        if (r[3] === box && recentOk.length < TUNE_RECENT_N && r[9] !== ST_OPEN) recentOk.push(isTrue(r[6]));
      }

      if (today) {
        // 「出題中」のまま2分以上たっている＝画面を閉じた等。同じ問題を出し直す
        if (today.state === ST_OPEN && (Date.now() - today.ms) > 120000) {
          var found = findQuestion(today.grade, today.qid);
          if (found) {
            var b0 = buildChoices(found.q, found.all);
            return { success: true, row: today.row, student: publicStudent(stu), correctCount: correctCount,
                     mode: 'resume', seconds: QUIZ_SECONDS,
                     question: { id: found.q.id, text: b0.textShown, choices: b0.choices, play: found.q.play || null } };
          }
        }
        return { success: false, status: 'already_played', message: '今日のクイズは もう終わっているよ！\nまた明日、挑戦してね！' };
      }

      // 学年がまだ分からない子（小3まで）には、1日1回だけ「なんねんせい？」を出す
      if (stu.grade === '小3まで' && !skipGradeAsk && gradeAskDue(stu.id)) {
        markGradeAsked(stu.id);
        commit();
        return { success: false, status: 'ask_grade', student: publicStudent(stu), choices: SELF_GRADE_CHOICES.slice() };
      }

      // 直近の調子で「やさしめ／むずかしめ」を優先する
      var level = tuneLevel(recentOk);
      var tune = level === 'normal' ? null : { level: level, stats: questionStats() };
      var picked = pickQuestion(box, answered, wrongIds, tune);
      if (picked.status === 'no_questions') {
        return { success: false, status: 'error', message: 'いま「' + box + '」の問題が用意されていません。\nお店の人をよんでね。' };
      }
      logTuneBox(picked.box);
      var q = picked.question;
      var built = buildChoices(q, picked.all);

      // 「出題中」として先に1行書く＝ここで今日ぶんの権利を使う（引き直しを防ぐ）
      S.records.push([new Date().toISOString(), stu.id, stu.name, picked.grade || box, q.id, built.textShown, '', '', q.answer, ST_OPEN]);
      commit();

      return { success: true, row: S.records.length + 1, student: publicStudent(stu),
               correctCount: correctCount, mode: picked.mode, seconds: QUIZ_SECONDS,
               question: { id: q.id, text: built.textShown, choices: built.choices, play: q.play || null } };
    },

    setOwnGrade: function (studentId, grade) {
      grade = String(grade || '').trim();
      if (SELF_GRADE_CHOICES.indexOf(grade) < 0) return { success: false, message: 'えらびなおしてね。' };
      var stu = findStudent(studentId);
      if (!stu) return { success: false, message: 'この QR は登録されていません。お店の人をよんでね。' };
      if (stu.grade !== '小3まで') return { success: true, grade: stu.grade, unchanged: true };
      stu.grade = grade;
      S.gradeSelf[stu.id] = { g: grade, d: todayKey() };
      commit();
      return { success: true, grade: grade };
    },

    recordAnswer: function (row, studentId, choice) {
      var i = parseInt(row, 10) - 2;
      var cur = S.records[i];
      if (!cur) return { success: false, message: '記録の場所が見つかりません。' };
      if (String(cur[1]) !== String(studentId)) return { success: false, message: '記録がずれています。お店の人をよんでね。' };
      var correctAnswer = cur[8];
      var hint = ((Q[cur[3]] || []).filter(function (q) { return q.id === cur[4]; })[0] || {}).hint || '';
      if (cur[9] !== ST_OPEN) {
        return { success: true, duplicated: true, isCorrect: isTrue(cur[6]), yourAnswer: cur[7], correctAnswer: correctAnswer, hint: hint };
      }
      var isTimeUp = String(choice) === '__TIMEUP__';
      var picked = isTimeUp ? '（時間切れ）' : String(choice).trim();
      var isCorrect = !isTimeUp && picked === correctAnswer;
      cur[6] = isCorrect; cur[7] = picked; cur[9] = isTimeUp ? ST_TIMEUP : ST_DONE;
      commit();
      return { success: true, duplicated: false, isCorrect: isCorrect, yourAnswer: picked, correctAnswer: correctAnswer, hint: hint };
    },

    /* ---------- 名簿 ---------- */
    searchStudents: function (query, includeGraduated, withIssues) {
      promoteIfDue();
      var q = String(query || '').trim();
      var nameCount = {}, recCount = {}, sameKeyGrade = {};
      if (withIssues) {
        S.records.forEach(function (r) { var id = String(r[1]); recCount[id] = (recCount[id] || 0) + 1; });
        S.students.forEach(function (s) { var k = nameKey(s.name) + '|' + s.grade; sameKeyGrade[k] = (sameKeyGrade[k] || 0) + 1; });
      }
      var out = [];
      S.students.forEach(function (s) {
        if (!s.name) return;
        if (!includeGraduated && s.grade === '卒業生') return;
        nameCount[s.name] = (nameCount[s.name] || 0) + 1;
        if (q === '' || s.name.indexOf(q) >= 0) {
          var item = { id: s.id, name: s.name, grade: s.grade, note: s.note };
          if (withIssues) {
            item.records = recCount[s.id] || 0;
            var issues = [];
            if (ANON_NAMES.indexOf(s.name) >= 0) issues.push('だれか分からない名前');
            if (sameKeyGrade[nameKey(s.name) + '|' + s.grade] > 1) issues.push('同じ子が2つある');
            if (item.records === 0) issues.push('1回も遊んでいない');
            if (STUDENT_GRADE_ORDER.indexOf(s.grade) < 0) issues.push('学年がおかしい');
            item.issues = issues;
          }
          out.push(item);
        }
      });
      out.forEach(function (r) {
        r.sameName = (nameCount[r.name] || 0) > 1;
        if (withIssues && r.sameName && !r.note && r.issues.indexOf('同じ子が2つある') < 0) r.issues.push('同名なのに目じるしが無い');
      });
      out.sort(function (a, b) {
        var ia = gradeIdx(a.grade), ib = gradeIdx(b.grade);
        if (ia !== ib) return ia - ib;
        return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
      });
      return out;
    },

    registerNewStudent: function (name, grade, note, force) {
      name = String(name || '').trim(); grade = String(grade || '').trim();
      if (!name) return { success: false, error: '名前を入力してください。' };
      if (STUDENT_GRADE_ORDER.indexOf(grade) < 0 || grade === '卒業生') return { success: false, error: '学年が不正です。' };
      if (!force) {
        var same = S.students.filter(function (s) { return nameKey(s.name) === nameKey(name); })
          .map(function (s) { return { id: s.id, grade: s.grade }; });
        if (same.length) return { success: false, needConfirm: true, duplicates: same, error: '同じ名前の子がすでに ' + same.length + ' 人います。' };
      }
      var max = 0;
      S.students.forEach(function (s) { var n = parseInt(String(s.id).slice(1), 10); if (n > max) max = n; });
      if (S.seqMax && S.seqMax > max) max = S.seqMax;   // 消した番号は使い回さない（本物の「高水位」と同じ）
      var id = 'S' + ('000' + (max + 1)).slice(-4);
      S.seqMax = max + 1;
      S.students.push({ id: id, name: name, grade: grade, note: String(note || '').trim(), registered: Date.now() });
      commit();
      return { success: true, id: id, name: name, grade: grade };
    },

    updateStudent: function (id, newName, newGrade, newNote) {
      newName = String(newName || '').trim(); newGrade = String(newGrade || '').trim();
      if (!newName) return { success: false, error: '名前が空です。' };
      if (STUDENT_GRADE_ORDER.indexOf(newGrade) < 0) return { success: false, error: '学年が不正です。' };
      var s = findStudent(id);
      if (!s) return { success: false, error: '生徒が見つかりません。' };
      if (newGrade !== s.grade) gradeSelfDrop(s.id);
      s.name = newName; s.grade = newGrade; s.note = String(newNote || '').trim();
      // 回答記録の名前だけ追従（学年は当時の記録として残す）
      var n = 0;
      S.records.forEach(function (r) { if (String(r[1]) === String(id) && r[2] !== newName) { r[2] = newName; n++; } });
      commit();
      return { success: true, updatedRecords: n };
    },

    deleteStudent: function (id) {
      var i = S.students.map(function (s) { return String(s.id); }).indexOf(String(id));
      if (i < 0) return { success: false, error: '生徒が見つかりません。' };
      var n = parseInt(String(id).slice(1), 10);
      if (!S.seqMax || n > S.seqMax) S.seqMax = n;
      S.students.splice(i, 1);
      commit();
      return { success: true };   // 回答記録は消さない（正解数などの集計を変えない）
    },

    getMergeCandidates: getMergeCandidates,
    mergeStudents: mergeStudents,

    /* ---------- 学年の確認（店長の画面） ---------- */
    getGradeCheckList: function () {
      promoteIfDue();
      var lastMs = {}, plays = {};
      S.records.forEach(function (r) {
        var id = String(r[1]), ms = recTime(r);
        plays[id] = (plays[id] || 0) + 1;
        if (!lastMs[id] || ms > lastMs[id]) lastMs[id] = ms;
      });
      var t0 = todayStart();
      var row = function (s) {
        var ms = lastMs[s.id] || 0;
        return { id: s.id, name: s.name, grade: s.grade, note: s.note, plays: plays[s.id] || 0,
                 lastPlay: fmtDate(ms), daysSinceLast: ms ? Math.max(0, Math.ceil((t0 - ms) / DAY)) : -1,
                 registered: fmtDate(s.registered), _ms: ms };
      };
      var unknown = S.students.filter(function (s) { return s.grade === '小3まで'; }).map(row)
        .sort(function (a, b) { return b._ms - a._ms || (a.name < b.name ? -1 : 1); });
      var byId = {};
      S.students.forEach(function (s) { byId[s.id] = s; });
      var self = Object.keys(S.gradeSelf).filter(function (id) { return byId[id] && byId[id].grade === S.gradeSelf[id].g; })
        .map(function (id) { var r = row(byId[id]); r.selfDate = S.gradeSelf[id].d; return r; })
        .sort(function (a, b) { return a.selfDate < b.selfDate ? 1 : -1; });
      [unknown, self].forEach(function (l) { l.forEach(function (r) { delete r._ms; }); });
      return { unknown: unknown, self: self, choices: SELF_GRADE_CHOICES.slice() };
    },

    setStudentGrade: function (id, grade) {
      grade = String(grade || '').trim();
      if (STUDENT_GRADE_ORDER.indexOf(grade) < 0) return { success: false, error: '学年が不正です。' };
      var s = findStudent(id);
      if (!s) return { success: false, error: '生徒が見つかりません。' };
      s.grade = grade;
      gradeSelfDrop(s.id);
      commit();
      return { success: true, name: s.name, grade: grade };
    },

    confirmSelfGrade: function (id) {
      gradeSelfDrop(String(id || '').trim());
      commit();
      return { success: true };
    },

    /* ---------- 名寄せページ（おなじ子／べつの子 を押すだけの画面） ---------- */
    getNayoseState: function () {
      return { groups: getMergeCandidates(), log: S.nayoseLog.slice(), betsu: S.nayoseBetsu.list.slice() };
    },

    nayoseDecide: function (keepId, sameIds, betsuIds) {
      keepId = String(keepId || '').trim();
      var same = (sameIds || []).map(String).filter(function (x) { return x && x !== keepId; });
      var betsuL = (betsuIds || []).map(String).filter(function (x) { return x && x !== keepId; });
      if (!keepId) return { success: false, error: '残す子が選ばれていません。' };
      if (!same.length && !betsuL.length) return { success: false, error: 'おなじ子／べつの子 が選ばれていません。' };
      var byId = {};
      S.students.forEach(function (s) { byId[s.id] = s; });
      var keep = byId[keepId];
      if (!keep) return { success: false, error: '残す子が見つかりません。画面を更新してやり直してください。' };
      var label = function (s) { return s ? (String(s.name) + '（' + String(s.grade) + '）') : '?'; };
      var merged = null;
      if (same.length) {
        merged = mergeStudents(keepId, same);
        if (!merged.success) return merged;
        nayoseLogAdd('merge', label(keep) + ' に ' + same.length + ' 件をまとめた（回答記録 ' + merged.movedRecords + ' 件を移動）');
      }
      if (betsuL.length) {
        betsuL.forEach(function (id) {
          var k = betsuKey(keepId, id);
          if (S.nayoseBetsu.pairs[k]) return;
          S.nayoseBetsu.pairs[k] = true;
          var b = byId[id];
          S.nayoseBetsu.list.push({ a: { id: keep.id, name: String(keep.name), grade: String(keep.grade) },
                                    b: { id: id, name: b ? String(b.name) : '', grade: b ? String(b.grade) : '' }, when: fmtDateTime(Date.now()) });
        });
        nayoseLogAdd('betsu', label(keep) + ' と ' + betsuL.map(function (id) { return label(byId[id]); }).join('・') + ' は べつの子');
      }
      commit();
      return { success: true, keep: publicStudent(keep), mergedCount: same.length,
               movedRecords: merged ? merged.movedRecords : 0, betsuCount: betsuL.length };
    },

    nayoseUndoBetsu: function (idA, idB) {
      var k = betsuKey(idA, idB);
      if (!S.nayoseBetsu.pairs[k]) return { success: false, error: 'その組は「べつの子」になっていません。' };
      delete S.nayoseBetsu.pairs[k];
      S.nayoseBetsu.list = S.nayoseBetsu.list.filter(function (p) { return betsuKey(p.a.id, p.b.id) !== k; });
      nayoseLogAdd('undo', String(idA) + ' と ' + String(idB) + ' の「べつの子」をもどした');
      commit();
      return { success: true };
    },

    /* ---------- 本日の結果 ---------- */
    getTodaysResults: function () {
      var t0 = todayStart(), out = [];
      for (var i = S.records.length - 1; i >= 0; i--) {
        var r = S.records[i];
        var ts = recTime(r);
        if (ts < t0) break;
        var d = new Date(ts);
        out.push({
          row: i + 2, time: pad(d.getHours()) + ':' + pad(d.getMinutes()),
          id: String(r[1]), name: r[2], grade: r[3], question: r[5],
          state: r[9] || ST_DONE, pending: r[9] === ST_OPEN,
          isCorrect: isTrue(r[6]),
          yourAnswer: r[7] || '—', correctAnswer: r[8] || '—'
        });
      }
      return out;
    },

    resetTodayForStudent: function (studentId) {
      var t0 = todayStart(), before = S.records.length;
      S.records = S.records.filter(function (r) { return !(String(r[1]) === String(studentId) && recTime(r) >= t0); });
      commit();
      return { success: true, deleted: before - S.records.length };
    },

    /* ---------- 進級の取り消し・やり直し（ダッシュボード） ---------- */
    undoPromotion: function () {
      var log = S.promoLog;
      if (!log || log.undone || !(log.c || []).length) return { success: false, error: '取り消せる進級がありません。' };
      if (log.y !== schoolYearOf(Date.now())) return { success: false, error: '取り消せるのは今年度の進級だけです。' };
      var restored = 0, skipped = 0;
      log.c.forEach(function (c) {
        var x = parsePromoChange(c);
        var s = x && findStudent(x.id);
        if (!s || s.grade !== x.to) { skipped++; return; }   // 進級のあとで学年を手で直した子・消えた子は触らない
        s.grade = x.from; restored++;
      });
      log.undone = true; log.undoneAt = Date.now();
      commit();
      return { success: true, restored: restored, skipped: skipped };
    },

    redoPromotion: function () {
      var fy = schoolYearOf(Date.now());
      var log = S.promoLog;
      if (!log || !log.undone || log.y !== fy) return { success: false, error: 'やり直せる進級がありません。' };
      var r = promoteAll(fy, Date.now());
      commit();
      return { success: true, count: r.count };
    },

    /* ---------- お店の人が見るダッシュボード ---------- */
    getDashboardData: function (period) {
      promoteIfDue();
      var t0 = todayStart();
      var now = new Date();
      var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      var from = (period === 'all') ? 0 : monthStart;

      var stats = {}, rawDist = {};
      S.students.forEach(function (s) {
        stats[s.id] = { name: s.name, grade: s.grade, correctCount: 0, playCount: 0, days: {}, lastMs: 0 };
        rawDist[s.grade] = (rawDist[s.grade] || 0) + 1;
      });

      var totalCorrect = 0, totalWrong = 0, totalPending = 0;
      var todayPlays = 0, todayCorrect = 0, todayPending = 0, todayPlayers = {};
      var byGrade = {}, byQuestion = {}, byDay = {}, deletedPlays = 0, deletedCorrect = 0;

      S.records.forEach(function (r) {
        var id = String(r[1]), ms = recTime(r);
        var pending = r[9] === ST_OPEN, ok = isTrue(r[6]), g = r[3];
        if (ms >= t0) { todayPlays++; todayPlayers[id] = true; if (pending) todayPending++; if (ok) todayCorrect++; }
        if (ms < from) return;
        if (pending) totalPending++; else if (ok) totalCorrect++; else totalWrong++;
        if (!pending) {
          if (!byGrade[g]) byGrade[g] = { correct: 0, total: 0 };
          byGrade[g].total++; if (ok) byGrade[g].correct++;
          var qk = g + ' ' + r[4];
          if (!byQuestion[qk]) byQuestion[qk] = { grade: g, id: r[4], text: r[5], correct: 0, total: 0 };
          byQuestion[qk].total++; if (ok) byQuestion[qk].correct++;
        }
        var dk = Math.floor((ms - t0) / DAY);
        byDay[dk] = (byDay[dk] || 0) + 1;
        if (stats[id]) {
          stats[id].playCount++;
          if (ok) stats[id].correctCount++;
          stats[id].days[Math.floor(ms / DAY)] = true;
          if (ms > stats[id].lastMs) stats[id].lastMs = ms;
        } else { deletedPlays++; if (ok) deletedCorrect++; }
      });

      var recent = S.records.slice(-12).map(function (r) {
        var d = new Date(recTime(r));
        return { time: pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()),
                 name: r[2], grade: r[3], state: r[9] || ST_DONE, isCorrect: isTrue(r[6]) };
      }).reverse();

      var list = Object.keys(stats).map(function (k) { return stats[k]; });
      var ranking = list.filter(function (s) { return s.correctCount > 0; })
        .sort(function (a, b) { return b.correctCount - a.correctCount; }).slice(0, 10);
      var active = list.filter(function (s) { return s.playCount > 0; });
      var repeatRate = active.length
        ? Math.round(active.filter(function (s) { return Object.keys(s.days).length >= 2; }).length / active.length * 100) : 0;

      var gradeAcc = [];
      GRADE_ORDER.forEach(function (g) {
        var b = byGrade[g];
        if (b && b.total) gradeAcc.push({ grade: g, total: b.total, correct: b.correct, rate: Math.round(b.correct / b.total * 100) });
      });

      var hard = Object.keys(byQuestion).map(function (k) { return byQuestion[k]; })
        .filter(function (q) { return q.total >= ADMIN_HARD_MIN_SHOWN; })
        .map(function (q) { q.rate = Math.round(q.correct / q.total * 100); return q; })
        .sort(function (a, b) { return a.rate - b.rate || b.total - a.total; }).slice(0, 10);

      var WD = ['日', '月', '火', '水', '木', '金', '土'];
      var trend = [], trendMax = 1;
      for (var d = -13; d <= 0; d++) {
        var c = byDay[d] || 0;
        if (c > trendMax) trendMax = c;
        var dd = new Date(dayStart(d));
        trend.push({ label: (dd.getMonth() + 1) + '/' + dd.getDate(), weekday: WD[dd.getDay()], count: c });
      }

      var away = list.filter(function (s) { return s.playCount >= 5 && s.lastMs && s.lastMs < dayStart(-13); })
        .map(function (s) { return { name: s.name, grade: s.grade, playCount: s.playCount, days: Math.floor((t0 - s.lastMs) / DAY) }; })
        .sort(function (a, b) { return a.days - b.days; }).slice(0, 12);

      var dist = [];
      STUDENT_GRADE_ORDER.forEach(function (g) { if (rawDist[g]) dist.push({ grade: g, count: rawDist[g] }); });

      var m = now.getMonth() + 1, nextM = (m === 12) ? 1 : m + 1;
      var stock = PLAYABLE.map(function (g) {
        var all = Q[g] || [];
        var monthly = all.filter(function (q) { return !q.unit; });
        var rg = RANGES[g] || null;
        return {
          grade: g, total: all.length,
          students: Object.keys(rawDist).reduce(function (n, sg) { return n + (quizBox(sg) === g ? rawDist[sg] : 0); }, 0),
          thisMonth: monthly.filter(function (q) { return q.month === m; }).length,
          nextMonth: monthly.filter(function (q) { return q.month === nextM; }).length,
          evergreen: monthly.filter(function (q) { return q.month === null; }).length,
          range: rg ? { mode: rg.mode, label: rg.label, units: rg.units.length,
                        questions: all.filter(function (q) { return q.unit && rg.units.indexOf(q.unit) >= 0; }).length } : null
        };
      });

      return {
        period: (period === 'all') ? 'all' : 'month',
        totalCorrect: totalCorrect, totalWrong: totalWrong, totalPending: totalPending,
        accuracy: (totalCorrect + totalWrong) ? Math.round(totalCorrect / (totalCorrect + totalWrong) * 100) : 0,
        todayPlays: todayPlays, todayCorrect: todayCorrect, todayPending: todayPending,
        todayUniquePlayersCount: Object.keys(todayPlayers).length,
        ranking: ranking, gradeDistribution: dist, repeatRate: repeatRate,
        recentHistory: recent, stock: stock, gradeAccuracy: gradeAcc, hardQuestions: hard,
        trend: trend, trendMax: trendMax, away: away,
        deletedPlays: deletedPlays, deletedCorrect: deletedCorrect,
        currentMonth: m, nextMonth: nextM, studentCount: S.students.length,
        hardMinShown: ADMIN_HARD_MIN_SHOWN,
        promotion: getPromotionState(),
        insights: adminInsights()
      };
    }
  };

  /* 管理画面の「正答率を7〜8割に近づけるための表」（名前は入れない＝人数と割合だけ） */
  function adminInsights() {
    var from = dayStart(-(ADMIN_INSIGHT_DAYS - 1));
    var qIndex = {};
    PLAYABLE.forEach(function (g) {
      (Q[g] || []).forEach(function (q) { qIndex[ansKey(g, q.id)] = { month: q.month, conf: hasConfusable(q.answer, q.wrongs) }; });
    });
    var add = function (o, ok) { o[0]++; if (ok) o[1]++; };
    var cellOf = function (o) { return (o && o[0]) ? { n: o[0], rate: Math.round(o[1] / o[0] * 100) } : null; };
    var gm = {}, cf = {}, kid = {}, monthsSeen = {}, cfAll = { yes: [0, 0], no: [0, 0] };
    var answers = 0, unknown = 0;
    S.records.forEach(function (r) {
      var ms = recTime(r);
      if (!ms || ms < from || r[9] === ST_OPEN) return;
      var g = r[3], ok = isTrue(r[6]);
      answers++;
      var sid = String(r[1]);
      add(kid[sid] = kid[sid] || [0, 0], ok);
      var qi = qIndex[ansKey(g, r[4])];
      if (!qi) { unknown++; return; }
      var mk = qi.month === null ? '通年' : String(qi.month);
      monthsSeen[mk] = true;
      gm[g] = gm[g] || {};
      add(gm[g][mk] = gm[g][mk] || [0, 0], ok);
      cf[g] = cf[g] || { yes: [0, 0], no: [0, 0] };
      add(cf[g][qi.conf ? 'yes' : 'no'], ok);
      add(cfAll[qi.conf ? 'yes' : 'no'], ok);
    });
    var months = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map(String).concat(['通年']).filter(function (k) { return monthsSeen[k]; });
    var gradeRows = [], confRows = [];
    PLAYABLE.forEach(function (g) {
      if (gm[g]) gradeRows.push({ grade: g, cells: months.map(function (k) { return cellOf(gm[g][k]); }) });
      if (cf[g]) confRows.push({ grade: g, yes: cellOf(cf[g].yes), no: cellOf(cf[g].no) });
    });
    var bands = ADMIN_KID_BANDS.map(function (b) { return { label: b.label, lo: b.lo, hi: b.hi, target: !!b.target, count: 0 }; });
    var kids = 0;
    Object.keys(kid).forEach(function (k) {
      var o = kid[k];
      if (o[0] < ADMIN_KID_MIN_ANSWERS) return;
      var rate = o[1] / o[0] * 100;
      for (var i = 0; i < bands.length; i++) { if (rate >= bands[i].lo && rate < bands[i].hi) { bands[i].count++; kids++; break; } }
    });
    return {
      days: ADMIN_INSIGHT_DAYS, since: fmtDate(from), answers: answers, unknown: unknown,
      gradeMonth: { months: months, rows: gradeRows },
      confusable: { rows: confRows, all: { yes: cellOf(cfAll.yes), no: cellOf(cfAll.no) } },
      kids: { minAnswers: ADMIN_KID_MIN_ANSWERS, total: kids, bands: bands },
      tune: tuneLogSummary(TUNE_LOG_VIEW_DAYS)
    };
  }

  /* google.script.run の偽物（本物と同じ書き方で呼べる） */
  function makeRunner() {
    var onOk = null, onFail = null;
    var runner = {
      withSuccessHandler: function (fn) { onOk = fn; return runner; },
      withFailureHandler: function (fn) { onFail = fn; return runner; }
    };
    Object.keys(SERVER).forEach(function (name) {
      runner[name] = function () {
        var args = [].slice.call(arguments);
        Demo.later(function () {
          var res;
          try { res = SERVER[name].apply(null, args); }
          catch (e) { if (onFail) onFail(e); return; }
          // 本物と同じく、返す値は JSON にできる形だけ（画面側が中身を書き換えても保存側に響かないように写しを渡す）
          if (onOk) onOk(JSON.parse(JSON.stringify(res)));
        });
      };
    });
    return runner;
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', { get: makeRunner });
})();

/* ------------------------------------------------------------------
   パン屋さんの「会員制クイズ企画」の偽サーバー。

   画面は、実際に納品したものと同じHTMLをそのまま置いている。
   本物はレジ横のタブレットで動き、子どもが自分のQRコードをかざすと
   その学年に合った問題が1日1問だけ出る、という仕組み。
   ここでは google.script.run だけを偽物に差し替えている。

   お店・子どもの名前・記録はすべて架空。保存先はこのタブの中だけ。
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  var GRADE_ORDER = ['小3まで', '小4', '小5', '小6', '中1', '中2', '中3', '卒業生'];
  var PLAYABLE = ['小3まで', '小4', '小5', '小6', '中1', '中2', '中3'];
  var ST_OPEN = '出題中', ST_DONE = '回答済', ST_TIMEUP = '時間切れ';
  var QUIZ_SECONDS = 30;

  /* ---------- 問題（架空。学年ごとに用意する） ----------
     month は「その月だけ出す問題」。null なら通年。 */
  var QUESTIONS = {
    '小3まで': [
      { id:'q1', text:'パンをつくるときに、ふくらませるために入れるものはどれ？', answer:'イースト', wrongs:['さとう','しお','こおり'], hint:'パン屋さんの朝は、これを混ぜるところから始まります。', month:null },
      { id:'q2', text:'食パンを1本まるごとのことを、なんと数える？', answer:'1斤（きん）', wrongs:['1本','1個','1枚'], hint:'「きん」と読みます。', month:null },
      { id:'q3', text:'メロンパンの上にのっている、あみめの生地はなに？', answer:'クッキー生地', wrongs:['チョコ','ゼリー','わたあめ'], hint:'さくさくしています。', month:null },
      { id:'q4', text:'小麦（こむぎ）からつくるこなを、なんという？', answer:'小麦粉', wrongs:['かたくり粉','こなゆき','ベーキングパウダー'], hint:'そのままの名前です。', month:null },
      { id:'q5', text:'クロワッサンは、どこの国で有名なパン？', answer:'フランス', wrongs:['アメリカ','インド','中国'], hint:'エッフェル塔のある国です。', month:null },
    ],
    '小4': [
      { id:'q1', text:'パンの生地を休ませて、ふくらませることを何という？', answer:'発酵（はっこう）', wrongs:['冷凍','熟成','乾燥'], hint:'イースト菌がはたらいています。', month:null },
      { id:'q2', text:'日本で「あんパン」が生まれたのは、およそ何年前？', answer:'約150年前', wrongs:['約50年前','約500年前','約1000年前'], hint:'明治時代のはじめごろです。', month:null },
      { id:'q3', text:'小麦を育てるとき、たねをまくのはどの季節が多い？', answer:'秋', wrongs:['春','夏','冬'], hint:'冬をこして、初夏に実ります。', month:null },
      { id:'q4', text:'バターは、なにからつくられる？', answer:'牛乳', wrongs:['たまご','大豆','小麦'], hint:'白い液体をかきまぜて作ります。', month:null },
      { id:'q5', text:'カレーパンは、ふつうどうやって仕上げる？', answer:'油であげる', wrongs:['蒸す','ゆでる','凍らせる'], hint:'まわりがさくさくしています。', month:null },
    ],
    '小5': [
      { id:'q1', text:'パンがふくらむのは、イースト菌が出す何のはたらき？', answer:'二酸化炭素', wrongs:['酸素','水素','ちっ素'], hint:'炭酸ジュースのあわと同じ気体です。', month:null },
      { id:'q2', text:'日本の小麦の多くは、どこから輸入している？', answer:'アメリカ・カナダ・オーストラリア', wrongs:['フランス','中国','ブラジル'], hint:'太平洋をわたってきます。', month:null },
      { id:'q3', text:'食パンの「耳」とよばれる部分は、なぜ茶色い？', answer:'焼けて色がついたから', wrongs:['しょうゆをぬったから','こげた砂糖をぬったから','もともと茶色い粉だから'], hint:'ホットケーキの表面と同じ理由です。', month:null },
      { id:'q4', text:'こむぎこの「強力粉」と「薄力粉」。パンに向いているのはどっち？', answer:'強力粉', wrongs:['薄力粉','どちらも同じ','中力粉だけ'], hint:'もちもちの元になる成分が多いほうです。', month:null },
      { id:'q5', text:'ベーカリーという言葉は、もともと何語？', answer:'英語', wrongs:['フランス語','ドイツ語','イタリア語'], hint:'bake（焼く）から来ています。', month:null },
    ],
    '小6': [
      { id:'q1', text:'小麦粉に水を加えてこねると出てくる、もちもちの成分は？', answer:'グルテン', wrongs:['でんぷん','カルシウム','ビタミンC'], hint:'たんぱく質の一種です。', month:null },
      { id:'q2', text:'給食に「コッペパン」が広まったのは、なにがきっかけ？', answer:'戦後の学校給食', wrongs:['オリンピック','万国博覧会','新幹線の開通'], hint:'昭和20年代の話です。', month:null },
      { id:'q3', text:'パンの原料になる小麦は、植物のどの部分を使う？', answer:'実（種子）', wrongs:['葉','根','花びら'], hint:'穂の先についている部分です。', month:null },
      { id:'q4', text:'デニッシュ生地に、バターを何度もはさんで折るのはなぜ？', answer:'層をつくってサクサクにするため', wrongs:['色をつけるため','日もちさせるため','重くするため'], hint:'切ると、うすい層が見えます。', month:null },
      { id:'q5', text:'食品の「消費期限」と「賞味期限」。すぐ食べたほうがよいのはどっち？', answer:'消費期限', wrongs:['賞味期限','どちらも同じ','製造日'], hint:'いたみやすい食品につきます。', month:null },
    ],
    '中1': [
      { id:'q1', text:'イースト菌のはたらきで、糖からアルコールと二酸化炭素ができる反応を何という？', answer:'アルコール発酵', wrongs:['光合成','中和','燃焼'], hint:'お酒づくりと同じしくみです。', month:null },
      { id:'q2', text:'小麦の生産量が世界でいちばん多い国は？', answer:'中国', wrongs:['アメリカ','フランス','インドネシア'], hint:'人口も世界有数の国です。', month:null },
      { id:'q3', text:'食パン1枚（約60g）のエネルギーは、およそどれくらい？', answer:'約160kcal', wrongs:['約40kcal','約400kcal','約900kcal'], hint:'ごはん軽く1杯より少し少ないくらいです。', month:null },
      { id:'q4', text:'パンを冷蔵庫に入れると固くなりやすいのはなぜ？', answer:'でんぷんが老化するから', wrongs:['水分が増えるから','油が固まるから','菌が増えるから'], hint:'0〜5℃がいちばん進みます。', month:null },
      { id:'q5', text:'「地産地消」とは、どういう意味？', answer:'その地域で作ったものをその地域で食べる', wrongs:['安い産地から買うこと','外国へ輸出すること','旬のものだけ食べること'], hint:'輸送の距離が短くなります。', month:null },
    ],
    '中2': [
      { id:'q1', text:'パン生地をこねると強くなる、グルテンの「網目」は何どうしの結びつき？', answer:'たんぱく質', wrongs:['脂質','糖質','無機物'], hint:'グリアジンとグルテニンが結びつきます。', month:null },
      { id:'q2', text:'食品ロスを減らす取り組みとして正しいものは？', answer:'手前に並ぶ商品から買う', wrongs:['奥の新しい商品を選ぶ','まとめ買いして残す','期限前に捨てる'], hint:'「てまえどり」と呼ばれます。', month:null },
      { id:'q3', text:'酵母は、生物の分類でいうと何のなかま？', answer:'菌類', wrongs:['細菌','植物','原生生物'], hint:'きのこやカビと同じグループです。', month:null },
      { id:'q4', text:'小麦アレルギーの人に配慮した表示として、法律で義務づけられているのは？', answer:'特定原材料の表示', wrongs:['産地の表示','カロリーの表示','価格の表示'], hint:'えび・かに・小麦・そば・卵・乳・落花生などが対象です。', month:null },
      { id:'q5', text:'パンの「窯（かま）のび」とは何のこと？', answer:'焼き始めに生地がふくらむこと', wrongs:['焼きすぎてこげること','冷めてしぼむこと','生地が固くなること'], hint:'オーブンに入れた直後に起こります。', month:null },
    ],
    '中3': [
      { id:'q1', text:'パンが焼けると香ばしくなるのは、糖とアミノ酸が起こす何反応？', answer:'メイラード反応', wrongs:['中和反応','酸化還元反応','加水分解'], hint:'肉の焼き色や、しょうゆの色も同じ反応です。', month:null },
      { id:'q2', text:'日本の食料自給率（カロリーベース）は、およそ何%？', answer:'約38%', wrongs:['約10%','約60%','約85%'], hint:'6割以上を輸入にたよっています。', month:null },
      { id:'q3', text:'個人商店がネット注文を始めるとき、いちばん先に決めるべきことは？', answer:'受け取り方法と締切', wrongs:['ロゴのデザイン','SNSの投稿頻度','店内のBGM'], hint:'お客さんとお店の両方が困らない約束事です。', month:null },
      { id:'q4', text:'「原価率」とは、売上に対する何の割合？', answer:'仕入れ・材料の費用', wrongs:['人件費','家賃','税金'], hint:'飲食店では3割前後が目安といわれます。', month:null },
      { id:'q5', text:'食品表示で「消費期限」を書かなければならないのは、どんな食品？', answer:'いたみやすい食品', wrongs:['冷凍食品','缶づめ','乾めん'], hint:'おおむね5日以内に品質が落ちるものです。', month:null },
    ],
  };

  /* 「出題月」は、開いた月によって在庫の見え方が変わる仕組み。
     体験版はいつ開かれるか分からないので、各学年の先頭2問を今月ぶん・
     3問目を来月ぶんに割り当てて、残りを通年にしておく。
     （全部を通年にすると、ダッシュボードが毎回「当月分なし」と警告する） */
  (function () {
    var m = new Date().getMonth() + 1;
    var nextM = (m === 12) ? 1 : m + 1;
    Object.keys(QUESTIONS).forEach(function (g) {
      QUESTIONS[g].forEach(function (q, i) {
        q.month = (i < 2) ? m : (i === 2 ? nextM : null);
      });
    });
  })();

  var NAMES = [
    ['ゆうと','小4'], ['さくら','小4'], ['はるき','小5'], ['あおい','小5'], ['りく','小6'],
    ['ひなた','小6'], ['そら','中1'], ['めい','中1'], ['かいと','中2'], ['ゆづき','中2'],
    ['たける','中3'], ['のあ','中3'], ['ことね','小3まで'], ['りょう','小3まで'], ['みお','小5'],
    ['そうすけ','中1'], ['あかね','小6'], ['ゆうき','中2'], ['はな','小4'], ['れん','中3'],
    // 同じ名前で2つ登録されてしまった例（管理画面の「まとめる」機能を見せるため）
    ['そら','小6'],
  ];

  function pad(n) { return ('0' + n).slice(-2); }
  function todayStart() { var d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
  function dayStart(offset) { var d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+offset); return d.getTime(); }
  function fmtDate(ms) { if(!ms) return '—'; var d=new Date(ms); return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`; }
  function fmtDateTime(ms) { if(!ms) return '—'; var d=new Date(ms); return `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function nameKey(s) { return String(s||'').replace(/\s+/g,'').toLowerCase(); }

  function initialState() {
    var students = NAMES.map(function (n, i) {
      return { id: 'S' + pad(i + 1), name: n[0], grade: n[1], note: '',
               registered: dayStart(-120 + i * 3) };
    });

    // 過去60日ぶんの回答記録。1日に何人かが来て、1人1問だけ答える
    var rand = (function () { var s = 20260826;
      return function () { s = (s*1103515245+12345)%2147483648; return s/2147483648; }; })();
    var records = [];
    for (var d = -60; d <= -1; d++) {
      students.forEach(function (s) {
        if (s.grade === '卒業生') return;
        if (rand() > 0.22) return;
        var qs = QUESTIONS[s.grade] || [];
        if (!qs.length) return;
        var q = qs[Math.floor(rand() * qs.length)];
        var ok = rand() < 0.68;
        var t = dayStart(d) + (10 + Math.floor(rand() * 8)) * 3600000 + Math.floor(rand() * 3600000);
        records.push([new Date(t).toISOString(), s.id, s.name, s.grade, q.id, q.text,
                      ok, ok ? q.answer : q.wrongs[0], q.answer, ST_DONE]);
      });
    }
    records.sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });
    return { students: students, records: records };
  }

  var store = Demo.store('quizkikaku', initialState);
  var S = store.data;
  function commit() { store.commit(); }

  function recTime(r) { return new Date(r[0]).getTime(); }
  function findStudent(id) {
    return S.students.filter(function (s) { return String(s.id) === String(id); })[0] || null;
  }
  function publicStudent(s) {
    return { id: String(s.id), name: String(s.name), grade: String(s.grade), note: String(s.note || '') };
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** 4つの選択肢を作る。足りなければ他の問題の正解から埋める（本物と同じ考え方） */
  function buildChoices(q, all) {
    var choices = [];
    var push = function (v) {
      var s = String(v == null ? '' : v).trim();
      if (!s || choices.indexOf(s) >= 0) return;
      choices.push(s);
    };
    push(q.answer);
    (q.wrongs || []).forEach(push);
    for (var i = 0; i < all.length && choices.length < 4; i++) {
      if (all[i].id !== q.id) push(all[i].answer);
    }
    return { textShown: q.text, choices: shuffle(choices.slice(0, 4)) };
  }

  /** まだ出していない問題を優先し、次に「前にまちがえた問題」を出す */
  function pickQuestion(grade, answered, wrongIds) {
    var all = QUESTIONS[grade] || [];
    if (!all.length) return { status: 'no_questions' };
    var fresh = all.filter(function (q) { return !answered[grade + '|' + q.id]; });
    if (fresh.length) return { status: 'ok', mode: 'new', question: fresh[Math.floor(Math.random()*fresh.length)], all: all };
    var wrong = all.filter(function (q) { return wrongIds[q.id]; });
    if (wrong.length) return { status: 'ok', mode: 'retry', question: wrong[Math.floor(Math.random()*wrong.length)], all: all };
    return { status: 'ok', mode: 'again', question: all[Math.floor(Math.random()*all.length)], all: all };
  }

  var SERVER = {

    /* ---------- レジ横のタブレット（QRをかざしたとき） ---------- */
    processScan: function (studentId) {
      var stu = findStudent(studentId);
      if (!stu) return { success:false, status:'error', message:'この QR は登録されていません。お店の人をよんでね。' };
      if (stu.grade === '卒業生') return { success:false, status:'error', message:'卒業生はクイズの対象外です。' };
      if (PLAYABLE.indexOf(stu.grade) < 0) {
        return { success:false, status:'error', message:'学年が正しく登録されていません（' + stu.grade + '）。お店の人をよんでね。' };
      }

      var t0 = todayStart();
      var answered = {}, wrongIds = {}, correctCount = 0, today = null;
      for (var i = S.records.length - 1; i >= 0; i--) {
        var r = S.records[i];
        if (String(r[1]) !== String(stu.id)) continue;
        var ts = recTime(r);
        if (!today && ts >= t0) today = { row: i + 2, ms: ts, state: r[9], qid: r[4], grade: r[3] };
        answered[r[3] + '|' + r[4]] = true;
        if (r[6] === true) correctCount++;
        else if (r[3] === stu.grade) wrongIds[r[4]] = true;
      }

      if (today) {
        // 「出題中」のまま2分以上たっている＝画面を閉じた等。同じ問題を出し直す
        if (today.state === ST_OPEN && (Date.now() - today.ms) > 120000) {
          var all0 = QUESTIONS[today.grade] || [];
          var q0 = all0.filter(function (q) { return q.id === today.qid; })[0];
          if (q0) {
            var b0 = buildChoices(q0, all0);
            return { success:true, row:today.row, student:publicStudent(stu), correctCount:correctCount,
                     mode:'resume', seconds:QUIZ_SECONDS,
                     question:{ id:q0.id, text:b0.textShown, choices:b0.choices } };
          }
        }
        return { success:false, status:'already_played',
                 message:'今日のクイズは もう終わっているよ！\nまた明日、挑戦してね！' };
      }

      var picked = pickQuestion(stu.grade, answered, wrongIds);
      if (picked.status === 'no_questions') {
        return { success:false, status:'error',
                 message:'いま「' + stu.grade + '」の問題が用意されていません。\nお店の人をよんでね。' };
      }
      var built = buildChoices(picked.question, picked.all);

      // 「出題中」として先に1行書く＝ここで今日ぶんの権利を使う（引き直しを防ぐ）
      S.records.push([new Date().toISOString(), stu.id, stu.name, stu.grade,
                      picked.question.id, built.textShown, '', '', picked.question.answer, ST_OPEN]);
      commit();

      return { success:true, row:S.records.length + 1, student:publicStudent(stu),
               correctCount:correctCount, mode:picked.mode, seconds:QUIZ_SECONDS,
               question:{ id:picked.question.id, text:built.textShown, choices:built.choices } };
    },

    recordAnswer: function (row, studentId, choice) {
      var i = parseInt(row, 10) - 2;
      var cur = S.records[i];
      if (!cur) return { success:false, message:'記録の場所が見つかりません。' };
      if (String(cur[1]) !== String(studentId)) return { success:false, message:'記録がずれています。お店の人をよんでね。' };

      var correctAnswer = cur[8];
      var hint = ((QUESTIONS[cur[3]] || []).filter(function (q) { return q.id === cur[4]; })[0] || {}).hint || '';

      // 二重送信は最初の回答を正とする
      if (cur[9] !== ST_OPEN) {
        return { success:true, duplicated:true, isCorrect:cur[6] === true,
                 yourAnswer:cur[7], correctAnswer:correctAnswer, hint:hint };
      }

      var isTimeUp = String(choice) === '__TIMEUP__';
      var picked = isTimeUp ? '（時間切れ）' : String(choice);
      var isCorrect = !isTimeUp && picked === correctAnswer;
      cur[6] = isCorrect; cur[7] = picked; cur[9] = isTimeUp ? ST_TIMEUP : ST_DONE;
      commit();

      return { success:true, duplicated:false, isCorrect:isCorrect, yourAnswer:picked,
               correctAnswer:correctAnswer, hint:hint };
    },

    /* ---------- 名簿 ---------- */
    searchStudents: function (query, includeGraduated, withIssues) {
      var q = String(query || '').trim();
      var nameCount = {}, recCount = {}, sameKeyGrade = {};
      if (withIssues) {
        S.records.forEach(function (r) { var id = String(r[1]); recCount[id] = (recCount[id]||0)+1; });
        S.students.forEach(function (s) {
          var k = nameKey(s.name) + '|' + s.grade;
          sameKeyGrade[k] = (sameKeyGrade[k]||0)+1;
        });
      }
      var out = [];
      S.students.forEach(function (s) {
        if (!s.name) return;
        if (!includeGraduated && s.grade === '卒業生') return;
        nameCount[s.name] = (nameCount[s.name]||0)+1;
        if (q === '' || s.name.indexOf(q) >= 0) {
          var item = { id:s.id, name:s.name, grade:s.grade, note:s.note };
          if (withIssues) {
            item.records = recCount[s.id] || 0;
            var issues = [];
            if (sameKeyGrade[nameKey(s.name)+'|'+s.grade] > 1) issues.push('同じ子が2つある');
            if (item.records === 0) issues.push('1回も遊んでいない');
            if (GRADE_ORDER.indexOf(s.grade) < 0) issues.push('学年がおかしい');
            item.issues = issues;
          }
          out.push(item);
        }
      });
      out.forEach(function (r) {
        r.sameName = (nameCount[r.name]||0) > 1;
        if (withIssues && r.sameName && !r.note && r.issues.indexOf('同じ子が2つある') < 0) {
          r.issues.push('同名なのに目じるしが無い');
        }
      });
      out.sort(function (a, b) {
        var ia = GRADE_ORDER.indexOf(a.grade); if (ia < 0) ia = 999;
        var ib = GRADE_ORDER.indexOf(b.grade); if (ib < 0) ib = 999;
        if (ia !== ib) return ia - ib;
        return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
      });
      return out;
    },

    registerNewStudent: function (name, grade, note, force) {
      name = String(name||'').trim(); grade = String(grade||'').trim();
      if (!name) return { success:false, error:'名前を入力してください。' };
      if (GRADE_ORDER.indexOf(grade) < 0) return { success:false, error:'学年を選んでください。' };
      var same = S.students.filter(function (s) { return nameKey(s.name) === nameKey(name); });
      if (same.length && !force) {
        return { success:false, needConfirm:true,
                 error:'同じ名前の子がすでに登録されています（' + same.map(function(s){return s.grade;}).join('・') + '）。'
                     + '別の子ならそのまま登録、同じ子なら「まとめる」を使ってください。' };
      }
      var id = 'S' + pad(S.students.length + 1);
      S.students.push({ id:id, name:name, grade:grade, note:String(note||''), registered:Date.now() });
      commit();
      return { success:true, student:{ id:id, name:name, grade:grade, note:String(note||'') } };
    },

    updateStudent: function (id, newName, newGrade, newNote) {
      var s = findStudent(id);
      if (!s) return { success:false, error:'その子が見つかりません。' };
      if (!String(newName||'').trim()) return { success:false, error:'名前を入力してください。' };
      s.name = String(newName).trim();
      s.grade = String(newGrade||'').trim();
      s.note = String(newNote||'');
      // 記録に残っている名前も直す（一覧で古い名前が出ないように）
      S.records.forEach(function (r) { if (String(r[1]) === String(id)) r[2] = s.name; });
      commit();
      return { success:true };
    },

    deleteStudent: function (id) {
      var i = S.students.map(function (s) { return String(s.id); }).indexOf(String(id));
      if (i < 0) return { success:false, error:'その子が見つかりません。' };
      S.students.splice(i, 1);
      commit();
      // 回答記録は消さない（正解数などの集計を変えない、という運用上の約束）
      return { success:true };
    },

    getMergeCandidates: function () {
      var groups = {};
      S.students.forEach(function (s) { (groups[nameKey(s.name)] = groups[nameKey(s.name)] || []).push(s); });

      var stat = {};
      S.records.forEach(function (r) {
        var id = String(r[1]), ts = recTime(r);
        var st = stat[id] || (stat[id] = { plays:0, correct:0, first:0, last:0, grades:{}, recent:[] });
        st.plays++;
        if (r[6] === true) st.correct++;
        if (ts) { if (!st.first || ts < st.first) st.first = ts; if (ts > st.last) st.last = ts; }
        if (r[3]) st.grades[r[3]] = true;
        st.recent.push({ ts:ts, grade:r[3], question:r[5], correct:r[6] === true, state:r[9] });
      });

      var t0 = todayStart(), out = [];
      Object.keys(groups).forEach(function (k) {
        var members = groups[k];
        if (members.length < 2) return;
        members.sort(function (a, b) {
          var ia = GRADE_ORDER.indexOf(a.grade); if (ia<0) ia=999;
          var ib = GRADE_ORDER.indexOf(b.grade); if (ib<0) ib=999;
          return ia - ib;
        });
        out.push({
          key: k, name: members[0].name,
          accounts: members.map(function (s) {
            var st = stat[s.id] || { plays:0, correct:0, first:0, last:0, grades:{}, recent:[] };
            st.recent.sort(function (a,b) { return b.ts - a.ts; });
            return {
              id:s.id, name:s.name, grade:s.grade, note:s.note,
              registered: fmtDate(s.registered),
              plays: st.plays, correct: st.correct,
              firstPlay: fmtDate(st.first), lastPlay: fmtDate(st.last),
              daysSinceLast: st.last ? Math.floor((t0 - st.last)/86400000) : -1,
              gradesPlayed: Object.keys(st.grades),
              recent: st.recent.slice(0,5).map(function (r) {
                return { when: fmtDateTime(r.ts), grade: r.grade, question: r.question,
                         result: r.state === ST_OPEN ? '未完了' : (r.correct ? '正解' : '不正解') };
              })
            };
          })
        });
      });
      out.sort(function (a,b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
      return out;
    },

    /** 同じ子の2つのアカウントを1つにまとめる。回答記録は1件も消さず、付け替えるだけ */
    mergeStudents: function (keepId, dropIds) {
      keepId = String(keepId||'').trim();
      var drops = (dropIds||[]).map(String).filter(function (x) { return x && x !== keepId; });
      if (!keepId) return { success:false, error:'残す方が選ばれていません。' };
      if (!drops.length) return { success:false, error:'まとめる相手が選ばれていません。' };
      var keep = findStudent(keepId);
      if (!keep) return { success:false, error:'残す方が見つかりません。' };

      var moved = 0;
      S.records.forEach(function (r) {
        if (drops.indexOf(String(r[1])) >= 0) { r[1] = keepId; r[2] = keep.name; moved++; }
      });
      S.students = S.students.filter(function (s) { return drops.indexOf(String(s.id)) < 0; });
      commit();
      return { success:true, moved:moved, deleted:drops.length };
    },

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
          isCorrect: r[6] === true,
          yourAnswer: r[7] || '—', correctAnswer: r[8] || '—',
        });
      }
      return out;
    },

    resetTodayForStudent: function (studentId) {
      var t0 = todayStart(), before = S.records.length;
      S.records = S.records.filter(function (r) {
        return !(String(r[1]) === String(studentId) && recTime(r) >= t0);
      });
      commit();
      return { success:true, deleted: before - S.records.length };
    },

    /* ---------- お店の人が見るダッシュボード ---------- */
    getDashboardData: function (period) {
      var t0 = todayStart();
      var now = new Date();
      var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      var from = (period === 'all') ? 0 : monthStart;

      var stats = {}, rawDist = {};
      S.students.forEach(function (s) {
        stats[s.id] = { name:s.name, grade:s.grade, correctCount:0, playCount:0, days:{}, lastMs:0 };
        rawDist[s.grade] = (rawDist[s.grade]||0)+1;
      });

      var totalCorrect=0, totalWrong=0, totalPending=0;
      var todayPlays=0, todayCorrect=0, todayPending=0, todayPlayers={};
      var byGrade={}, byQuestion={}, byDay={}, deletedPlays=0, deletedCorrect=0;

      S.records.forEach(function (r) {
        var id = String(r[1]), ms = recTime(r);
        var pending = r[9] === ST_OPEN, ok = r[6] === true, g = r[3];

        if (ms >= t0) { todayPlays++; todayPlayers[id]=true; if(pending) todayPending++; if(ok) todayCorrect++; }
        if (ms < from) return;

        if (pending) totalPending++; else if (ok) totalCorrect++; else totalWrong++;

        if (!pending) {
          if (!byGrade[g]) byGrade[g] = { correct:0, total:0 };
          byGrade[g].total++; if (ok) byGrade[g].correct++;
          var qk = g + ' ' + r[4];
          if (!byQuestion[qk]) byQuestion[qk] = { grade:g, id:r[4], text:r[5], correct:0, total:0 };
          byQuestion[qk].total++; if (ok) byQuestion[qk].correct++;
        }
        var dk = Math.floor((ms - t0) / 86400000);
        byDay[dk] = (byDay[dk]||0)+1;

        if (stats[id]) {
          stats[id].playCount++;
          if (ok) stats[id].correctCount++;
          stats[id].days[Math.floor(ms/86400000)] = true;
          if (ms > stats[id].lastMs) stats[id].lastMs = ms;
        } else { deletedPlays++; if (ok) deletedCorrect++; }
      });

      var recent = S.records.slice(-12).map(function (r) {
        return { time: fmtDateTime(recTime(r)), name:r[2], grade:r[3],
                 state: r[9] || ST_DONE, isCorrect: r[6] === true };
      }).reverse();

      var list = Object.keys(stats).map(function (k) { return stats[k]; });
      var ranking = list.filter(function (s) { return s.correctCount > 0; })
        .sort(function (a,b) { return b.correctCount - a.correctCount; }).slice(0,10);
      var active = list.filter(function (s) { return s.playCount > 0; });
      var repeatRate = active.length
        ? Math.round(active.filter(function(s){return Object.keys(s.days).length>=2;}).length / active.length * 100) : 0;

      var gradeAcc = [];
      GRADE_ORDER.forEach(function (g) {
        var b = byGrade[g];
        if (b && b.total) gradeAcc.push({ grade:g, total:b.total, correct:b.correct,
                                          rate: Math.round(b.correct/b.total*100) });
      });

      var hard = Object.keys(byQuestion).map(function (k) { return byQuestion[k]; })
        .filter(function (q) { return q.total >= 3; })
        .map(function (q) { q.rate = Math.round(q.correct/q.total*100); return q; })
        .sort(function (a,b) { return a.rate - b.rate || b.total - a.total; }).slice(0,10);

      var WD = ['日','月','火','水','木','金','土'];
      var trend = [], trendMax = 1;
      for (var d = -13; d <= 0; d++) {
        var c = byDay[d] || 0;
        if (c > trendMax) trendMax = c;
        var dd = new Date(dayStart(d));
        trend.push({ label: (dd.getMonth()+1)+'/'+dd.getDate(), weekday: WD[dd.getDay()], count: c });
      }

      var away = list.filter(function (s) { return s.playCount >= 5 && s.lastMs && s.lastMs < dayStart(-13); })
        .map(function (s) { return { name:s.name, grade:s.grade, playCount:s.playCount,
                                     days: Math.floor((t0 - s.lastMs)/86400000) }; })
        .sort(function (a,b) { return a.days - b.days; }).slice(0,12);

      var dist = [];
      GRADE_ORDER.forEach(function (g) { if (rawDist[g]) dist.push({ grade:g, count:rawDist[g] }); });

      var m = now.getMonth() + 1, nextM = (m === 12) ? 1 : m + 1;
      var stock = PLAYABLE.map(function (g) {
        var all = QUESTIONS[g] || [];
        return { grade:g, total:all.length, students:rawDist[g]||0,
                 thisMonth: all.filter(function(q){return q.month===m;}).length,
                 nextMonth: all.filter(function(q){return q.month===nextM;}).length,
                 evergreen: all.filter(function(q){return q.month===null;}).length };
      });

      return {
        period: (period === 'all') ? 'all' : 'month',
        totalCorrect:totalCorrect, totalWrong:totalWrong, totalPending:totalPending,
        accuracy: (totalCorrect+totalWrong) ? Math.round(totalCorrect/(totalCorrect+totalWrong)*100) : 0,
        todayPlays:todayPlays, todayCorrect:todayCorrect, todayPending:todayPending,
        todayUniquePlayersCount: Object.keys(todayPlayers).length,
        ranking:ranking, gradeDistribution:dist, repeatRate:repeatRate,
        recentHistory:recent, stock:stock, gradeAccuracy:gradeAcc, hardQuestions:hard,
        trend:trend, trendMax:trendMax, away:away,
        deletedPlays:deletedPlays, deletedCorrect:deletedCorrect,
        currentMonth:m, nextMonth:nextM, studentCount:S.students.length,
      };
    },
  };

  /* google.script.run の偽物（本物と同じ書き方で呼べる） */
  function makeRunner() {
    var onOk = null, onFail = null;
    var runner = {
      withSuccessHandler: function (fn) { onOk = fn; return runner; },
      withFailureHandler: function (fn) { onFail = fn; return runner; },
    };
    Object.keys(SERVER).forEach(function (name) {
      runner[name] = function () {
        var args = [].slice.call(arguments);
        Demo.later(function () {
          var res;
          try { res = SERVER[name].apply(null, args); }
          catch (e) { if (onFail) onFail(e); return; }
          if (onOk) onOk(res);
        });
      };
    });
    return runner;
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', { get: makeRunner });
})();

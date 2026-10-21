// app.js ── 診断の本体（質問 → 好みの点数 → ドリンクと照らし合わせ → 3 位まで）
//   コーヒーおすすめ診断（2026-10-01）の型をそのまま使い、軸と質問を ジューススタンド ことり 向けに作り直したもの（2026-10-09）。
//   質問と配点はここで固定（店主は触らない）。店主が入れるのは data.js（本番はスプレッドシート）のドリンクだけ。
(function () {
  'use strict';

  var AXES = ['sweet', 'acid', 'veg', 'thick'];
  // 計算（お客さんとの距離・3 位の「味が離れたもの」）に使う軸。酸味は 10-09 夜にお店の要望で質問ごと外した
  //   （「酸っぱいメニューが少ないので酸味の質問は省いてほしい」）＝ここに入れない。品の acid は説明文（describe）にだけ使う。
  var CALC_AXES = ['sweet', 'veg', 'thick'];

  // ── 質問（i＝絵／s＝ひとことの補足／v＝好みの点数をこの値にする／d＝足す量／set＝条件）
  //   味の 4 問はメニューの分け方（果物 ↔ 野菜、ジュース ↔ スムージー）と同じ言葉でまっすぐ聞く。
  //   unsure＝「わかんない」：その軸の重みを下げ（その軸ではドリンクを選り分けない）、#タグも出さず、「わかんない」の数に入れる。
  //   both＝飲み口の「どっちも好き」：重みを下げて #タグを出さないところは同じ。「わかんない」の数には入れない（好みがある人なので）。
  //   2026-10-09 作り替え：コーヒー診断と重ならないよう、くだけた言い方（「いつ飲むか」「冒険度」は聞かない）。
  //   2026-10-09 夜（制作者決定）：6 問。温度を先頭に（2 択）・「お店で飲む？持ち帰る？」は外した
  //     （店内だけの品が結果に出たら、カードに「お店で飲むときだけ」の印を付ける）。
  var QUESTIONS = [
    { q: '冷たいの？あったかいの？', hint: '', opts: [
      { i: '🧊', t: 'つめたいの・ふつうの', s: 'ジュース／スムージー', set: { temp: 'cold' } },
      { i: '♨️', t: 'あったかいの', s: 'ホット／スープ', set: { temp: 'hot' } } ] },
    // つめたい側＝提供中で、ホット扱いでもスープでもない品ぜんぶ（ジュースかスムージーかは「飲み口」の答えで決まる）。
    // あったかい側＝ホット扱い（スープ含む）だけ。候補が 1 品以下なら残りの質問を飛ばして結果へ（quickResult）。
    { q: '甘いの、どのくらい好き？', hint: '', opts: [
      { i: '🍯', t: 'あまいの大好き！', v: { sweet: 5 } },
      { i: '🙂', t: 'ほどほどがいい', v: { sweet: 3.6 } },
      { i: '🌿', t: '甘さひかえめ派', v: { sweet: 2 } },
      { i: '🤔', t: 'わかんない', v: { sweet: 3.6 }, unsure: 'sweet' } ] },
    // 2026-10-09 夜（制作者決定・お店の要望）：③「すっぱいのは？」を「好きな果物は？」に差し替え。
    //   選んだ果物が品の材料（items）に入っていれば +FRUIT_BONUS（FRUIT_WORDS で部分一致）。「わかんない」の数には入れない。
    //   2026-10-10（お店の返事「れんこんの品にオレンジは入ってない」→ 親の設計）：選んだ果物が入っている提供中の品が 3 品以上あれば、
    //     その中だけから 1〜3 位を選ぶ（fruitPool）。その果物だけの品（材料 1 つ）には +PURE_BONUS も足す。3 品未満なら全品から・加点だけ。
    //   「おまかせ」は絞らない＝果物が 2 種類以上入っている品に +MIX_BONUS（10-09 夜のまま）。
    { q: '好きな果物は？', hint: '入ってるとうれしいのをえらんでね🍹', opts: [
      { i: '🍎', t: 'りんご', set: { fruit: 'apple' } },
      { i: '🍍', t: 'パイン', set: { fruit: 'pine' } },
      { i: '🍊', t: 'オレンジ', set: { fruit: 'orange' } },
      { i: '🍌', t: 'バナナ', set: { fruit: 'banana' } },
      { i: '🧺', t: 'おまかせ', s: 'どれでも', set: { fruit: 'any' } } ] },
    { q: '野菜の味は？', hint: '人参・小松菜・ビーツなど', opts: [
      { i: '🍓', t: 'フルーツだけがいい', v: { veg: 1 } },
      { i: '🥕', t: '飲みやすければOK', v: { veg: 2.6 } },
      { i: '🥬', t: '野菜たっぷりがうれしい', v: { veg: 4.5 } },
      { i: '🤔', t: 'わかんない', v: { veg: 2.2 }, unsure: 'veg' } ] },
    { q: '飲み口はどっち派？', hint: '', opts: [
      { i: '💧', t: 'さらっとゴクゴク', s: 'ジュース', v: { thick: 1.3 } },
      { i: '🥤', t: 'とろ〜り濃厚', s: 'スムージー', v: { thick: 4.6 } },
      { i: '😋', t: 'どっちも好き', v: { thick: 3 }, both: 'thick' } ] },
    { q: '今日のテーマは？', hint: 'いちばん近いのをひとつ', opts: [
      { i: '💪', t: '元気チャージ', set: { goal: 'energy' } },
      { i: '✨', t: 'きれいになりたい', set: { goal: 'beauty' } },
      { i: '🩸', t: '鉄分・めぐり', set: { goal: 'iron' } },
      { i: '🌿', t: 'すっきりしたい', set: { goal: 'detox' } },
      { i: '🍽️', t: 'おなかペコペコ', set: { goal: 'fill' } },
      { i: '😋', t: 'おいしければOK', set: { goal: 'taste' } } ] }
  ];

  var GOAL_JA = { energy: '元気をチャージ', beauty: 'きれいを応援', iron: '鉄分・めぐり', detox: 'すっきりデトックス', fill: 'おなかも満たす' };

  var ITEM_ICON = { 'キャベツ': '🥬', '人参': '🥕', 'りんご': '🍎', 'レモン': '🍋', '小松菜': '🥬', 'セロリ': '🌿', 'パイン': '🍍',
    'オレンジ': '🍊', '蓮根': '🪷', '生姜': '🫚', 'ビーツ': '🔴', 'ごぼう': '🌱', 'バナナ': '🍌', 'いちご': '🍓', 'チョコ': '🍫',
    'とうもろこし': '🌽', '野菜': '🥕', '旬の果物': '🧺', 'みかん': '🍊', 'マンゴー': '🥭' };

  // ── ドリンク
  //   本番（config.js に API がある）＝GAS の ?do=drinks（お店の入力画面で保存した最新）。
  //     取れなかった時は、この端末で前に取れたもの → data.js（公開した時点のメニュー）の順で使う。
  //   試作（API が空）＝店主が試作の入力画面で直したもの（この端末の中だけ）→ data.js。
  var LIVE = null, livePending = false, liveWaiters = [], LIVE_KEY = 'drinkdemo.live-drinks-v1';
  function fetchLive() {
    if (!window.API) return;
    livePending = true;
    var done = false;
    function fin() {
      if (done) return; done = true; livePending = false;
      var w = liveWaiters; liveWaiters = []; w.forEach(function (f) { f(); });
    }
    fetch(window.API + '?do=drinks', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok && Array.isArray(j.drinks) && j.drinks.length) {
          LIVE = j.drinks;
          try { localStorage.setItem(LIVE_KEY, JSON.stringify(j.drinks)); } catch (e) {}
        }
      })
      .catch(function () {})
      .then(fin);
    setTimeout(fin, 6000);   // GAS が遅い・落ちている時に結果を待たせすぎない
  }
  function loadDrinks() {
    if (window.API) {
      if (LIVE) return LIVE;
      try {
        var c = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null');
        if (Array.isArray(c) && c.length) return c;
      } catch (e) {}
      return window.DEFAULT_DRINKS;
    }
    try {
      var s = localStorage.getItem('drinkdemo.drinks-v1');
      if (s) { var a = JSON.parse(s); if (Array.isArray(a) && a.length) return a; }
    } catch (e) {}
    return window.DEFAULT_DRINKS;
  }

  // ── 期間限定（2026-10-09 v1.2 制作者決定）
  //   lstart・lend（YYYY-MM-DD）のどちらかに日付があれば「期間限定」。期間外（開始日前・終了日後）は診断に出さない。
  //   定期実行は使わず、読むたびに今日（日本時間）で判定する。終了日はその日の 23:59 まで・開始日が空＝すぐ・終了日が空＝ずっと。
  //   ⚠ 同じ式が admin.html（inPeriod）と コード.js（期間内_）にある＝直すときは 3 か所とも。端末の時計がずれていると判定もずれる。
  function todayJST(d) {
    d = d || new Date();
    try {
      var p = {};
      new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
      if (p.year && p.month && p.day) return p.year + '-' + p.month + '-' + p.day;
    } catch (e) {}
    return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);   // Intl が使えない端末＝UTC＋9 時間
  }
  function isLimited(b) { return !!(b && (b.lstart || b.lend)); }
  function inPeriod(b, today) {
    var s = String((b && b.lstart) || ''), e = String((b && b.lend) || '');
    return (!s || s <= today) && (!e || today <= e);
  }
  function md(ymd) { var m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(ymd || '')); return m ? (+m[1]) + '/' + (+m[2]) : ''; }

  // ── 果物の照合（③「好きな果物は？」）。材料の文字に部分一致すれば「入っている」。
  var FRUIT_WORDS = { apple: ['りんご', 'アップル', '林檎', 'リンゴ'], pine: ['パイン', 'パイナップル'], orange: ['オレンジ', 'みかん'], banana: ['バナナ'] };
  function hasFruit(b, f) {
    var words = FRUIT_WORDS[f]; if (!words || !b) return false;
    var it = b.items, list = Array.isArray(it) ? it : (it ? String(it).split(/[、,，]/) : []);
    return list.some(function (x) { x = String(x || ''); return words.some(function (w) { return x.indexOf(w) >= 0; }); });
  }
  // 品に入っている果物の種類の数（③の 4 つ＝りんご・パイン・オレンジ・バナナで数える。レモン・いちご等は数えない）
  function fruitCount(b) { return Object.keys(FRUIT_WORDS).filter(function (f) { return hasFruit(b, f); }).length; }
  // 材料の数（同点のときの並び＝少ない方＝選んだ果物が主役の方を先に）
  function itemCount(b) {
    var it = b && b.items; return Array.isArray(it) ? it.length : (it ? String(it).split(/[、,，]/).filter(Boolean).length : 0);
  }

  // ── 答え → 好みの点数・重み・条件
  //   重み＝甘さ 1、野菜 1.3（いちばん好みが割れる）、とろみ 1.2（ジュースとスムージーの別）。酸味は 0（10-09 夜に計算から外した）。
  //   「わかんない」の軸と、飲み口の「どっちも好き」は 0.25（vague に印＝その軸の #タグを出さない）。
  function buildProfile(answers) {
    var p = { sweet: 3.6, acid: 2.8, veg: 2.2, thick: 3,
              w: { sweet: 1, acid: 0, veg: 1.3, thick: 1.2 },
              unsure: 0, vague: { acid: true }, goal: null, fruit: null, level: 1, temp: null, today: todayJST() };
    answers.forEach(function (ai, qi) {
      var o = QUESTIONS[qi].opts[ai]; if (!o) return;
      if (o.v) Object.keys(o.v).forEach(function (k) { p[k] = o.v[k]; });
      if (o.d) Object.keys(o.d).forEach(function (k) { p[k] += o.d[k]; });
      if (o.set) Object.keys(o.set).forEach(function (k) { p[k] = o.set[k]; });
      if (o.unsure) { p.unsure++; p.w[o.unsure] = 0.25; p.vague[o.unsure] = true; }
      if (o.both) { p.w[o.both] = 0.25; p.vague[o.both] = true; }   // 「どっちも好き」は「わかんない」の数に入れない
    });
    p.level = p.unsure >= 2 ? 0 : 1;            // 「わかんない」が 2 つ（甘さ・野菜とも）＝ジュースに慣れていない人（果物の「おまかせ」は数えない）
    AXES.forEach(function (k) { p[k] = Math.max(1, Math.min(5, p[k])); });
    return p;
  }

  // ドリンクどうしの味の距離（3 位の選び方に使う）
  function dist(a, b) {
    var s = 0; CALC_AXES.forEach(function (k) { s += Math.pow(a[k] - b[k], 2); }); return Math.sqrt(s);
  }

  // お客さんとドリンクの距離：重みつき・0.5 段までのずれは数えない（点数は整数なので、半段の差は誤差）
  function matchDist(p, b) {
    var s = 0;
    CALC_AXES.forEach(function (k) { var e = Math.max(0, Math.abs(p[k] - b[k]) - 0.5); s += p.w[k] * e * e; });
    return Math.sqrt(s);
  }

  // 系統（2 位を「タイプ違い」にするため）＝メニューの欄（野菜＆果物／果物 100%／スムージー／ホット）
  function family(b) { return b.cat || (b.veg >= 3 ? 'veg' : b.thick >= 4 ? 'smoothie' : 'fruit'); }

  // 相性（％）＝ 100 − 距離×K ＋ 期待すること・好きな果物・飲みやすさの加点。K と G は全組み合わせで決めた（_検証/全通り.mjs）
  //   FRUIT_BONUS＝好きな果物が材料に入っている品への加点（テーマの G と同じ大きさ・10-09 夜 制作者決定）
  //   PURE_BONUS＝好きな果物「だけ」の品（材料が 1 つ＝オレンジ 100%・パイン 100%・アップル 100%・バナナ／パイン スムージー）への上乗せ
  //     （FRUIT_BONUS と別に足す。10-10 お店の返事「オレンジを選んだら 1 位はオレンジ」に合わせた。20／22／24 を全通りで試し、
  //     答え合わせ表の③〈つめたい・ほどほど・オレンジ・飲みやすければOK・さらっと・きれい〉が
  //     1 位 オレンジ 100%・2 位 にんじんの品・3 位 ビーツの品 になる最小の値）
  //   MIX_BONUS＝果物「おまかせ」の人へ、果物が 2 種類以上入っている品の加点（混ざりを楽しめる人向け・10-09 夜 親の判断。
  //     +4／+3／+2 を全通りで試し、1 位の最大シェア ≤20% とオレンジ 100%・オレンジアップルの 1 位 ≥1.5% を両方満たす最大の値）
  var K = 9, G = 8, FAR = 3, FRUIT_BONUS = 8, MIX_BONUS = 4, PURE_BONUS = 20;
  function score(p, b) {
    var s = 100 - matchDist(p, b) * K;
    if (p.goal && p.goal !== 'taste' && (b.goals || []).indexOf(p.goal) >= 0) s += G;
    if (p.fruit && p.fruit !== 'any' && hasFruit(b, p.fruit)) {
      s += FRUIT_BONUS;
      if (itemCount(b) === 1) s += PURE_BONUS;   // その果物だけの品
    }
    if (p.fruit === 'any' && fruitCount(b) >= 2) s += MIX_BONUS;
    if (p.goal === 'taste') s += (b.easy - 3) * 3;
    else if (p.level === 0) s += (b.easy - 3) * 2;
    return s;
  }

  // 出せるドリンク（提供中・温度）。あったかい＝ホット扱い（スープ含む）だけ／それ以外＝ホットでもスープでもない品ぜんぶ。
  //   種類（cat）では絞らない＝ジュースかスムージーかは「飲み口」の答えで決まる（10-09 夜に旧「つめたい＝スムージーだけ」をやめた）。
  function servable(p, b) {
    if (b.on === false) return false;
    if (!inPeriod(b, p.today || todayJST())) return false;   // 期間外の限定（開始日前・終了日後）
    if (p.temp === 'hot') return !!(b.hot || b.soup);
    return !b.hot && !b.soup;
  }

  // あったかいを選び、候補が 1 品以下＝残りの質問を飛ばして結果へ（答えていない味で順位を付けない）
  function quickResult(ans, drinks) {
    if (!ans || !ans.length) return false;
    var p = buildProfile(ans.slice(0, 1));
    return p.temp === 'hot' && drinks.filter(function (b) { return servable(p, b); }).length <= 1;
  }

  // 好きな果物で絞った候補（10-10）＝選んだ果物が入っている提供中の品。3 品以上ある時だけ返す（3 品未満・おまかせ・未回答は null＝絞らない）
  var FRUIT_POOL_MIN = 3;
  function fruitPool(p, drinks) {
    if (!p.fruit || p.fruit === 'any') return null;
    var list = drinks.filter(function (b) { return servable(p, b) && hasFruit(b, p.fruit); });
    return list.length >= FRUIT_POOL_MIN ? list : null;
  }

  //   1〜3 位は fruitPool があればその中だけから、無ければ提供中の全品から選ぶ（10-10）。
  function recommend(p, drinks) {
    // 同点のとき＝材料の種類が少ない方を先に（オレンジを選んだらオレンジ 100% がオレンジアップルより先。10-09 夜）
    var cand = fruitPool(p, drinks) || drinks.filter(function (b) { return servable(p, b); });
    var pool = cand.map(function (b) { return { b: b, s: score(p, b) }; })
      .sort(function (x, y) { var d = y.s - x.s; return Math.abs(d) > 1e-9 ? d : itemCount(x.b) - itemCount(y.b); });
    if (!pool.length) return [];

    var out = [{ b: pool[0].b, s: pool[0].s }];
    var rest = pool.slice(1);

    // 2 位＝点差 8 以内なら系統違い（タイプ違い）を優先（それより離れるなら素直に 2 番目に近いもの）
    var f1 = family(pool[0].b), i2 = -1;
    for (var i = 0; i < rest.length; i++) {
      if (family(rest[i].b) !== f1 && rest[i].s >= pool[0].s - 8) { i2 = i; break; }
    }
    if (i2 < 0) i2 = 0;
    if (rest[i2]) {
      out.push({ b: rest[i2].b, s: rest[i2].s });
      rest.splice(i2, 1);
    }

    // 3 位＝「1 位とも 2 位とも味が離れたもの」に少し加点（距離×FAR）。1 位から 15 点以上離れたものは選ばない
    //   （旧「冒険度」の質問の名残。冒険度は聞かずに 1 で固定していた＝加点 3 をそのまま定数にした。10-09）
    if (rest.length) {
      var best = null;
      var ok = rest.filter(function (r) { return r.s >= pool[0].s - 15; });
      (ok.length ? ok : rest.slice(0, 1)).forEach(function (r) {
        var far = Math.min.apply(null, out.map(function (o) { return dist(r.b, o.b); }));
        var v = r.s + FAR * far;
        if (!best || v > best.v) best = { r: r, v: v };
      });
      out.push({ b: best.r.b, s: best.r.s });
    }
    return out;
  }

  // 飲み口が合わない時のひとこと（10-10）＝果物で絞った結果、「さらっとゴクゴク」なのに 3 杯とも とろみ 4 以上、
  //   または「とろ〜り濃厚」なのに 3 杯とも とろみ 2 以下になった時だけ、1 位のカードの上に 1 行出す。
  //   絞った候補にもう片方の飲み口が 1 つも無い＝「〜だけなので」／ある（点数で負けた）＝「〜からえらんだら、〜がぴったりだったよ」。
  var FRUIT_JA = { apple: { i: '🍎', t: 'りんご' }, pine: { i: '🍍', t: 'パイン' }, orange: { i: '🍊', t: 'オレンジ' }, banana: { i: '🍌', t: 'バナナ' } };
  function thickNote(p, recs, drinks) {
    var fp = fruitPool(p, drinks), f = FRUIT_JA[p.fruit];
    if (!fp || !f || !recs || !recs.length || p.vague.thick) return '';
    var wantLight = p.thick <= 1.5, wantThick = p.thick >= 4.5;
    var allThick = recs.every(function (r) { return r.b.thick >= 4; }), allLight = recs.every(function (r) { return r.b.thick <= 2; });
    if (!((wantLight && allThick) || (wantThick && allLight))) return '';
    var side = recs.every(function (r) { return r.b.cat === 'smoothie'; }) ? 'スムージー' : 'ジュース';
    var only = fp.every(function (b) { return wantLight ? b.thick >= 4 : b.thick <= 2; });
    return only
      ? f.i + ' ' + f.t + 'が入っているのは' + side + 'だけなので、' + side + 'からえらんだよ'
      : f.i + ' ' + f.t + 'が入っているのからえらんだら、' + side + 'がぴったりだったよ';
  }

  // ── タイプ名（性格診断らしさの部分。点数には影響しない）
  var BALANCE = { k: 'balance', icon: '🍹', color: '#d9465f', name: 'なんでもバランス派',
    desc: 'どれかに偏らない、ちょうどよい一杯が好きなタイプ。メニューのどれとも仲良くなれます。' };
  var CITRUS_V = 4.2, SWEET_FRUIT_UP = 0.3;   // タイプの分布は _検証/全通り.mjs で見て決めた（どれも 8〜40%）
  function typeOf(p) {
    var c = [
      { k: 'veg', v: p.veg + 0.4, icon: '🥬', color: '#2f7a4f', name: 'ベジ健康派',
        desc: '野菜のうまみも楽しめるタイプ。搾りたてのコールドプレスで、体の中から整えましょう。' },
      { k: 'smooth', v: p.thick, icon: '🍌', color: '#c27c0e', name: 'とろとろスムージー派',
        desc: '飲みごたえのある一杯が好きなタイプ。小腹がすいたときにもぴったりです。' },
      // 酸味の質問をやめた（10-09 夜）ので、柑橘派は好きな果物（オレンジ・パイン）で決める。りんご・バナナはあまあま派を少し押し上げる
      { k: 'citrus', v: (p.fruit === 'orange' || p.fruit === 'pine') ? CITRUS_V : 0, icon: '🍋', color: '#b88a00', name: 'さっぱり柑橘派',
        desc: 'キュッとした酸味でリフレッシュしたいタイプ。朝の一杯や運動のあとに。' },
      { k: 'sweet', v: p.sweet - 0.3 + ((p.fruit === 'apple' || p.fruit === 'banana') ? SWEET_FRUIT_UP : 0), icon: '🍓', color: '#d9465f', name: 'あまあまフルーツ派',
        desc: '果物の甘さがいちばんのごちそう、というタイプ。搾りたての果物 100% をどうぞ。' }
    ].sort(function (a, b) { return b.v - a.v; });
    return c[0].v < 4 ? BALANCE : c[0];
  }

  // ── 理由の文
  var HIGH = { sweet: '果物の甘さたっぷり', acid: 'キュッとした酸味', veg: '野菜のうまみしっかり', thick: 'とろっと飲みごたえ' };
  var LOW = { sweet: '甘さはひかえめ', acid: '酸味はおだやか', veg: '', thick: 'さらっと軽い口当たり' };
  // 好みのタグ（お客さんの答えから）。酸味は聞かなくなった（10-09 夜）ので出さない
  var LIKE_HIGH = { sweet: '甘めが好き', veg: '野菜たっぷり', thick: 'とろっと派' };
  var LIKE_LOW = { sweet: '甘さひかえめ', veg: '野菜は少なめ', thick: 'さらっと派' };

  function describe(b) {
    var parts = [];
    if (b.cat === 'fruit') parts.push('果物だけを搾った 100%');
    AXES.forEach(function (k) {
      if (b[k] >= 4 && HIGH[k]) parts.push(HIGH[k]);
      else if (b[k] <= 2 && LOW[k]) parts.push(LOW[k]);
    });
    if (b.veg === 3 && b.cat !== 'fruit') parts.push('野菜と果物のバランスがよい');
    if (!parts.length) parts.push('どの味もほどよく、まとまりのある味わい');
    return parts.slice(0, 3).join('・') + '。';
  }

  function chips(p, b) {
    var c = [];
    if (p.goal && (b.goals || []).indexOf(p.goal) >= 0 && GOAL_JA[p.goal]) c.push(GOAL_JA[p.goal]);
    AXES.forEach(function (k) {
      if (p.vague[k]) return;                  // 「わかんない」「どっちも好き」で答えた軸は好みのタグを出さない
      if (p[k] >= 3.7 && b[k] >= 4 && LIKE_HIGH[k]) c.push(LIKE_HIGH[k]);
      if (p[k] <= 2.3 && b[k] <= 2 && LIKE_LOW[k]) c.push(LIKE_LOW[k]);
    });
    if ((p.level === 0 || p.goal === 'taste') && b.easy >= 4) c.push('はじめてでも飲みやすい');
    if (p.temp === 'hot' && b.hot) c.push('温まる');
    return c;
  }

  // ── 画面
  var app = document.getElementById('app');
  var answers = [];
  var KEY = 'drinkdemo.answers-v5';   // 開き直しても結果が消えないように（この端末のタブの中だけ）。10-09 夜に③を果物に差し替えたので v4・10-10 に果物で絞る規則にしたので v5

  function saveAnswers() { try { sessionStorage.setItem(KEY, JSON.stringify(answers)); } catch (e) {} }
  function clearAnswers() { try { sessionStorage.removeItem(KEY); } catch (e) {} }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }

  // 名前は空白のところでだけ折り返す
  function nameHtml(s) {
    return String(s).split(/\s+/).map(function (w) { return '<span class="nw">' + esc(w) + '</span>'; }).join(' ');
  }

  function dots(n) {
    var r = Math.round(n), h = '';
    for (var i = 1; i <= 5; i++) h += '<i class="' + (i <= r ? 'on' : '') + '"></i>';
    return '<span class="dots" role="img" aria-label="5段階の' + r + '">' + h + '</span>';
  }

  // 結果の「飲みやすさ★」（3 段階）＝飲みやすさ（easy 1〜5）から計算する（2026-10-09 制作者決定・stars の項目は読まない）。
  //   メニューの★を持つ 5 品（野菜＆果物）で easy 5→★3・3→★2・2→★1 だった＝そのまま再現する対応。4→★2・1→★1。
  function easyStars(easy) {
    var e = Number(easy);
    return e >= 5 ? 3 : e >= 3 ? 2 : e >= 1 ? 1 : 0;
  }

  function stars(n) {
    var h = '';
    for (var i = 1; i <= 3; i++) h += i <= n ? '★' : '☆';
    return '<span class="stars" aria-label="3段階の' + n + '">' + h + '</span>';
  }

  function subLine(b) {
    var c = (window.CATS || {})[b.cat] || '', parts = [];
    if (c) parts.push(c);
    if (b.size) parts.push(b.size + 'ml');
    return parts.join(' ');
  }

  // ── 画面の作り（2026-10-09 作り替え）：アメリカンダイナーの「注文チケット」と「レシート」。太いポップ体・黒縁のステッカー。
  //   ⚠ ほかのお店の診断（コーヒー版など）と見た目・言い回しを重ねない（導入手順と運用.md「作り分け」）。
  //   結果は 1 杯を大きく（YOUR No.1）、あと 2 杯は小さく。相性は％でなく「ぴったり度」の果物の数で見せる。
  function fit(s) { return s >= 95 ? 5 : s >= 88 ? 4 : s >= 80 ? 3 : s >= 70 ? 2 : 1; }
  function fitIcons(s) {
    var n = fit(s), h = '';
    for (var i = 1; i <= 5; i++) h += '<i class="' + (i <= n ? 'on' : '') + '">🍊</i>';
    return '<span class="fit" role="img" aria-label="ぴったり度 5 段階の ' + n + '">' + h + '</span>';
  }
  function tags(list) { return list.map(function (c) { return '<span>#' + esc(c.replace(/[・ ]/g, '')) + '</span>'; }).join(''); }

  // 好みメーター（フルーツ ↔ 野菜、さらっと ↔ とろっと）にあなたと No.1 を置く
  function meter(p, b) {
    function pc(v) { return Math.round((v - 1) / 4 * 100); }
    function bar(l, r, you, it) {
      return '<div class="mbar"><span class="ml">' + l + '</span><div class="track">' +
        '<b class="you" style="left:' + you + '%">★</b><b class="it" style="left:' + it + '%">' + (b.no || '1') + '</b></div>' +
        '<span class="mr">' + r + '</span></div>';
    }
    return '<div class="meter"><p class="mt">好みメーター <small>★あなた　<b>' + (b.no || '1') + '</b>No.1 のドリンク</small></p>' +
      bar('フルーツ', '野菜', pc(p.veg), pc(b.veg)) + bar('さらっと', 'とろっと', pc(p.thick), pc(b.thick)) + '</div>';
  }

  function showStart() {
    answers = []; clearAnswers(); document.body.classList.remove('asking');
    app.innerHTML =
      '<section class="start pop">' +
        '<div class="checker" aria-hidden="true"></div>' +
        '<p class="logo">' + esc(window.SHOP || 'JUICE') + '</p>' +
        '<h1>今日のジュース、<br>えらんで<br>あげる！</h1>' +
        '<div class="glass big" aria-hidden="true">' + GLASS_SVG + '</div>' +
        '<p class="lead"><b>タップ6回・30秒</b>で<br>あなたにぴったりの1杯がわかるよ</p>' +
        '<button class="go" id="go">スタート！</button>' +
        '<p class="meta">コールドプレスもスムージーも、<br>ぜんぶメニューから選ぶよ</p>' +
      '</section>';
    document.getElementById('go').onclick = function () { showQ(0); };
    window.scrollTo(0, 0);
  }

  // 選択肢の文字は「・」の後ろでだけ折り返す（「つめたいの・ふつうの」が「ふつ／うの」で切れないように）
  function tileText(t) { return esc(t).replace(/[^・]+・?/g, function (w) { return '<span class="nw">' + w + '</span>'; }); }

  function showQ(i) {
    var q = QUESTIONS[i], busy = false, lv = Math.round(i / QUESTIONS.length * 100);
    document.body.classList.add('asking');
    var h = '<section class="q pop">' +
      '<div class="qtop"><button class="back" id="back" aria-label="もどる">←</button>' +
      '<div class="mini-glass" aria-hidden="true"><i style="height:' + lv + '%"></i></div>' +
      '<span class="count">' + (i + 1) + '<small>/' + QUESTIONS.length + '</small></span></div>' +
      '<div class="bubble"><h2>' + esc(q.q) + '</h2>' + (q.hint ? '<p class="hint">' + esc(q.hint) + '</p>' : '') + '</div>' +
      '<div class="tiles' + (q.opts.length % 2 ? ' odd' : '') + '">';
    q.opts.forEach(function (o, j) {
      h += '<button class="tile' + (answers[i] === j ? ' sel' : '') + '" data-j="' + j + '">' +
        '<span class="ic" aria-hidden="true">' + o.i + '</span><span class="tt">' + tileText(o.t) + '</span>' +
        (o.s ? '<small>' + esc(o.s) + '</small>' : '') + '</button>';
    });
    h += '</div></section>';
    app.innerHTML = h;
    Array.prototype.forEach.call(app.querySelectorAll('.tile'), function (btn) {
      btn.onclick = function () {
        if (busy) return; busy = true;           // 二度押しで質問が飛ばないように
        answers[i] = +btn.getAttribute('data-j'); answers.length = i + 1; saveAnswers();
        Array.prototype.forEach.call(app.querySelectorAll('.tile'), function (b) { b.classList.remove('sel'); });
        btn.classList.add('sel');
        setTimeout(function () { next(i); }, 200);
      };
    });
    document.getElementById('back').onclick = function () { i > 0 ? showQ(i - 1) : showStart(); };
    window.scrollTo(0, 0);
  }

  // 次へ。あったかいを選んで候補が 1 品以下なら、残りの質問を飛ばして結果へ
  //   （メニューの取り寄せ中は結果の画面で待つ＝候補が 2 品以上だったら、そこから 2 問目に戻る）
  function next(i) {
    if (i === 0 && buildProfile(answers).temp === 'hot' && (livePending || quickResult(answers, loadDrinks()))) { showThinking(); return; }
    i + 1 < QUESTIONS.length ? showQ(i + 1) : showThinking();
  }

  // 店内だけの品（data.js・GAS の「店内だけ」）＝持ち帰りできないので、カードに小さな印
  function eatinMark(b) { return b.eatin ? '<em class="eatin">お店で飲むときだけ</em>' : ''; }
  // 期間限定の印（見た目は「お店で飲むときだけ」と同じチップ）
  function limitedMark(b) { return isLimited(b) ? '<em class="eatin">期間限定</em>' : ''; }

  // 結果の下の「🎉 いまだけ」＝いま期間内で提供中の限定を全部（3 杯に入っていても出す・無ければ出さない）
  function nowOnly(drinks, today) {
    var list = drinks.filter(function (b) { return b.on !== false && isLimited(b) && inPeriod(b, today); });
    if (!list.length) return '';
    return '<p class="box">' + list.map(function (b) {
      return '🎉 いまだけ：' + esc(b.name) + (b.lend ? '<span class="nw">（〜' + md(b.lend) + 'まで）</span>' : '') +
        (b.price ? ' ¥' + Number(b.price).toLocaleString() : '');
    }).join('<br>') + '</p>';
  }

  function showThinking() {
    app.innerHTML = '<section class="thinking pop"><div class="glass fill" aria-hidden="true">' + GLASS_SVG +
      '</div><p>シボリ中…</p></section>';
    setTimeout(showResult, 1200);
  }

  function showResult() {
    if (livePending) {   // メニューの取り寄せがまだ＝待ってから出す（開き直した直後など）
      app.innerHTML = '<section class="thinking pop"><div class="glass fill" aria-hidden="true">' + GLASS_SVG +
        '</div><p>シボリ中…</p></section>';
      liveWaiters.push(showResult);
      return;
    }
    if (!answers.length) { showStart(); return; }
    var drinks = loadDrinks();
    var quick = quickResult(answers, drinks);   // あったかい・候補 1 品以下＝温度だけ聞いて結果
    if (!quick && answers.length < QUESTIONS.length) { showQ(answers.length); return; }   // 開き直したら候補が増えていた等
    document.body.classList.remove('asking');
    var p = buildProfile(answers);
    var pool = drinks.filter(function (b) { return servable(p, b); });
    var recs = quick ? pool.slice(0, 1).map(function (b) { return { b: b, s: null }; }) : recommend(p, drinks);
    var t = quick ? null : typeOf(p);           // 即結果は味を聞いていない＝タイプ名・ぴったり度・#タグ・メーターは出さない
    var h = '<section class="result">';

    if (quick) {
      h += recs.length
        ? '<p class="box">♨️ あったかいのは、いまはこの1杯だよ！</p>'
        : '<p class="box">♨️ あったかいのは、いまはお休みだよ。<br>つめたいの・ふつうのなら、ぜんぶそろってるよ！</p>';
    } else {
      h += '<div class="sticker pop" style="--tc:' + t.color + '"><small>あなたは</small><b>' + t.icon + ' ' + esc(t.name) + '！</b></div>' +
        '<p class="tdesc pop">' + esc(t.desc) + '</p>';
      if (!recs.length) {
        h += '<p class="box">いまの条件に合うドリンクがなかったよ。スタッフに聞いてね！</p>';
      }
      if (recs.length && recs[0].s < 80) {      // 🍊 2 以下と同じ線
        h += '<p class="box">ぴったり！の1杯はいまのメニューになかったので、近いのを選んだよ。スタッフに「この結果だった」と言ってくれたら、好みに合わせて相談にのります。</p>';
      }
      if (p.temp === 'hot') {
        h += '<p class="box">あったかいメニューは、いまは ' + pool.map(function (x) { return esc(x.name); }).join('・') + ' だよ。</p>';
      }
      var tn = thickNote(p, recs, drinks);
      if (tn) h += '<p class="box" id="thicknote">' + esc(tn) + '</p>';
    }
    if (recs[0]) {
      var b = recs[0].b, why = quick ? [] : chips(p, b);
      h += '<p class="your pop">YOUR No.1</p>' +
        '<article class="ticket pop">' +
          '<div class="thead"><span class="num">' + (b.no || '★') + '</span><div><h3>' + nameHtml(b.name) + '</h3>' +
          (b.en ? '<p class="en">' + esc(b.en) + '</p>' : '') + '</div></div>' +
          '<p class="sub">' + esc(subLine(b)) + (b.price ? '<b>¥' + Number(b.price).toLocaleString() + '</b>' : '') +
            eatinMark(b) + limitedMark(b) + '</p>' +
          (quick ? '' : '<p class="fitrow">ぴったり度 ' + fitIcons(recs[0].s) + '</p>') +
          '<div class="items">' + (b.items || []).map(function (it) {
            return '<span><i aria-hidden="true">' + (ITEM_ICON[it] || '・') + '</i>' + esc(it) + '</span>'; }).join('') + '</div>' +
          '<p class="desc">' + esc(describe(b)) + '</p>' +
          (why.length ? '<p class="tags">' + tags(why) + '</p>' : '') +
          (b.effect ? '<p class="effect"><b>メニューより</b>' + esc(b.effect) + (easyStars(b.easy) ? '　飲みやすさ ' + stars(easyStars(b.easy)) : '') + '</p>' : '') +
          (b.note ? '<p class="note2">' + esc(b.note) + '</p>' : '') +
        '</article>' + (quick ? '' : meter(p, b));
    }
    if (!quick && recs.length > 1) {
      h += '<p class="also pop">こっちもアリ！</p>';
      recs.slice(1).forEach(function (r) {
        var b = r.b;
        h += '<article class="mini-card pop">' +
          '<span class="num">' + (b.no || '★') + '</span>' +
          '<div class="mc"><h4>' + nameHtml(b.name) + '</h4>' +
          '<p class="sub">' + esc(subLine(b)) + (b.price ? '<b>¥' + Number(b.price).toLocaleString() + '</b>' : '') + eatinMark(b) + limitedMark(b) + '</p>' +
          '<p class="fitrow">' + fitIcons(r.s) + '</p>' +
          '<p class="tags">' + tags(chips(p, b).slice(0, 2)) + '</p></div>' +
        '</article>';
      });
    }

    h += nowOnly(drinks, p.today);
    h += '<div class="bye pop"><p class="big">迷ったらスタッフに聞いてね！</p>' +
      '<p>注文を受けてから1杯ずつ搾るので、ちょっとだけ待っててね。<br>搾りたてだから、早めに飲むのがおいしいよ。</p></div>' +
      '<div class="actions">' +
      (quick && !recs.length ? '<button class="go ghost" id="cold">🧊 つめたいのでえらぶ</button>' : '') +
      '<button class="go ghost" id="again">もう1回やる</button>' +
      (navigator.share ? '<button class="go ghost" id="share">友だちに送る</button>' : '') + '</div>' +
      '</section>';
    app.innerHTML = h;
    document.getElementById('again').onclick = showStart;
    var cold = document.getElementById('cold');
    if (cold) cold.onclick = function () { answers = [0]; saveAnswers(); showQ(1); };
    var sh = document.getElementById('share');
    if (sh) sh.onclick = function () {
      // 即結果・候補なしでも止まらないように（タイプ名・品名が無ければ、その部分を言わない）
      var text = quick
        ? (recs[0] ? '今日はあったかい「' + recs[0].b.name + '」にしたよ！' : '今日のジュース、えらんでもらったよ！')
        : (t ? 'わたしは「' + t.name + '」だった！' : '') + (recs[0] ? 'No.1 は ' + recs[0].b.name + '。' : '');
      navigator.share({ title: 'ジュース診断', text: text || '今日のジュース、えらんでもらったよ！',
        url: location.href.split('#')[0] }).catch(function () {});
    };
    window.scrollTo(0, 0);
  }

  // 「これください！」とスタッフに見せるレシートは 2026-10-09 に外した（制作者指示）。

  var GLASS_SVG = '<svg viewBox="0 0 64 64" width="76" height="76">' +
    '<path d="M40 4l-6 20" stroke="#222" stroke-width="3" stroke-linecap="round" class="straw"/>' +
    '<clipPath id="gc"><path d="M16.6 20h30.8l-3.9 37.4a2 2 0 0 1-2 1.6H22.5a2 2 0 0 1-2-1.6z"/></clipPath>' +
    '<g clip-path="url(#gc)"><rect class="juice" x="10" y="30" width="44" height="34" fill="#f39a2b"/></g>' +
    '<path d="M14 18h36l-4 40a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4z" fill="none" stroke="#222" stroke-width="3" stroke-linejoin="round"/>' +
    '<circle cx="50" cy="18" r="9" fill="#f6c23e" stroke="#222" stroke-width="2.5"/>' +
    '<path d="M50 9v18M41 18h18" stroke="#222" stroke-width="1.4" opacity=".5"/>' +
    '<circle cx="26" cy="46" r="2" fill="#fff" opacity=".8"/><circle cx="34" cy="52" r="1.5" fill="#fff" opacity=".8"/></svg>';

  // テスト用に外へ出す（画面には使わない）
  window.__drinkdemo = { QUESTIONS: QUESTIONS, buildProfile: buildProfile, recommend: recommend, typeOf: typeOf, score: score,
    servable: servable, quickResult: quickResult, chips: chips, hasFruit: hasFruit, fruitPool: fruitPool, thickNote: thickNote, todayJST: todayJST, isLimited: isLimited, inPeriod: inPeriod, nowOnly: nowOnly };

  fetchLive();
  if (window.API) {   // 本番は「DEMO」とスタッフ用ページへのリンクを出さない（お店用の URL はお店だけが持つ）
    var foot = document.getElementById('foot');
    if (foot) foot.textContent = (window.SHOP || '') + '｜ドリンクおすすめ診断';
  }

  // 開き直したとき：全部答え終わっていれば結果、途中なら続きから。
  //   「あったかい」だけ答えてあれば結果の画面へ（メニューが届いてから即結果か 2 問目かを決める＝showResult）
  var saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (Array.isArray(saved) && saved.length) {
    answers = saved;
    if (saved.length >= QUESTIONS.length || (saved.length === 1 && buildProfile(saved).temp === 'hot')) showResult();
    else showQ(saved.length);
  } else {
    showStart();
  }
})();

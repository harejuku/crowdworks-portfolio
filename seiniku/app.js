// みどり商店 精肉ご注文ページ（Cloudflare Pages 版）── app.js
//   元は 画面.html.txt の <script>（GAS の HtmlService 版）。2026-09-19 に site/ へ分けました。
//   GAS 版との違いは3か所だけ：①BOOT を ?do=products で取る ②送信を fetch POST（text/plain）にする
//   ③?privacy=1 をページ側で判定する。画面の組み立て・言葉づかい・入力の検査は GAS 版と同じです。
//   ⚠ 画面.html.txt（/exec 直開きの旧い客用画面）とここは別物です。直すときは両方を見ること。
(function () {
  'use strict';
  // API＝GAS のウェブアプリ URL（config.js の window.API。build.mjs が _検証/接続先.txt から書き出します）
  var API  = String(window.API || '').trim();
  var BOOT = null;   // ?do=products の応答（GAS 版の buildBootstrap_() と同じ形）。boot() で入ります

  // 量り売りの品はグラム数、セット・個数の品は個数が入ります。
  // どちらなのかは商品の kind で決まるので、ここでは数だけを持ちます
  var cart  = {};                 // { 商品名: グラム数 または 個数 }
  var stage = 'pick';             // pick / form / confirm / done
  var sending = false;

  var SET = 'セット';             // p.kind がこれならセット・個数売り（コード.gs の SELL_SET と同じ文字）
  var isSet = function (p) { return p.kind === SET; };
  // その品の「2パック」「300g」にあたる言い方。画面のどこでも同じ言葉になるよう1か所にまとめます
  function amountText(p, n) {
    return isSet(p) ? (n + p.unitLabel) : (n + 'g');
  }

  var $ = function (id) { return document.getElementById(id); };
  var yen = function (n) { return '¥' + Number(n || 0).toLocaleString('ja-JP'); };
  var WD  = ['日', '月', '火', '水', '木', '金', '土'];

  function fmtDate(s) {
    var p = s.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return Number(p[1]) + '月' + Number(p[2]) + '日（' + WD[d.getDay()] + '）';
  }
  // ---------- 初期表示 ----------
  function init() {
    $('shopName').textContent = BOOT.shop.name;
    $('fShop').textContent    = BOOT.shop.name;
    $('fAddr').textContent    = BOOT.shop.addr;
    setTel($('fTelLink'), BOOT.shop.tel);
    setTel($('closedTel'), BOOT.shop.tel);
    setTel($('dTel'), BOOT.shop.tel);

    // 規約は受付OFFのときも読めなければいけないので、注文画面の組み立てより先に用意します
    setupPolicy();

    initOrderScreens();

    // ?privacy=1 で開かれたときは、最初から規約を表示します（GAS 版は doGet が判定していました。
    // Pages 版は静的ファイルなので、ここで location.search を見ます）
    if (/(^|[?&])privacy=1(&|$)/.test(location.search)) openPolicy();
  }

  function initOrderScreens() {
    if (!BOOT.accepting) {
      $('screenPick').classList.add('hidden');
      $('closedMsg').textContent = BOOT.closedMessage;
      $('closed').classList.remove('hidden');
      return;
    }
    if (BOOT.notice) {
      $('notice').textContent = BOOT.notice;
      $('notice').classList.remove('hidden');
    }

    // 量り売りの品が1つも無いお店（セット・パックだけ）では、
    // 「表示金額は概算です」の案内そのものを出しません。金額が確定するのに不安にさせるためです
    var 量り売りあり = BOOT.products.some(function (p) { return !isSet(p); });
    var セットあり   = BOOT.products.some(isSet);
    $('lead').textContent = 量り売りあり
      ? (セットあり
          ? 'ご希望のお肉のグラム数、セットの個数をお選びください。ご注文後、スタッフよりお電話にて内容を確認させていただきます。'
          : 'ご希望のお肉とグラム数をお選びください。ご注文後、スタッフよりお電話にて内容を確認させていただきます。')
      : 'ご希望の商品と個数をお選びください。ご注文後、スタッフよりお電話にて内容を確認させていただきます。';
    if (量り売りあり) {
      var w = $('weighNote');
      var wb = document.createElement('b');
      wb.textContent = セットあり ? 'グラム数でご注文の品は、表示金額が概算です' : '表示金額は概算です';
      w.appendChild(wb);
      w.appendChild(document.createTextNode(
        '量り売りのため、実際にお切りした重量でお会計が確定します。表示より多少前後する場合がございます。' +
        (セットあり ? 'セットなど個数でご注文の品は、表示の金額のままです。' : '')));
      w.classList.remove('hidden');
    }

    renderProducts();
    buildForm();

    $('goBtn').addEventListener('click', onGo);
    $('backToPick').addEventListener('click', function () { show('pick'); });
    $('backToForm').addEventListener('click', function () { show('form'); });
    $('fDate').addEventListener('change', checkDate);

    show('pick');
  }

  // ---------- 規約（ご注文について／プライバシーポリシー） ----------
  // 画面の切り替え（show）とは独立させています。受付OFFのときも、注文の途中でも、
  // いま見ている画面を壊さずに開いて戻れるようにするためです。
  var POLICY_HIDES = ['closed', 'screenPick', 'screenForm', 'screenConfirm', 'screenDone', 'bar'];
  var policyReturn = null;   // 規約を開く前の表示状態。閉じるときにそのまま戻します

  function setupPolicy() {
    var i, els;
    els = document.querySelectorAll('.polShop');
    for (i = 0; i < els.length; i++) els[i].textContent = BOOT.shop.name;
    els = document.querySelectorAll('.polAddr');
    for (i = 0; i < els.length; i++) els[i].textContent = BOOT.shop.addr;
    els = document.querySelectorAll('.polTel');
    for (i = 0; i < els.length; i++) setTel(els[i], BOOT.shop.tel);

    $('policyBack').addEventListener('click', closePolicy);

    // footer のリンクと、確認画面の中のリンク（class="policyOpen"）の両方から開けます
    els = document.querySelectorAll('#policyLink, .policyOpen');
    for (i = 0; i < els.length; i++) {
      els[i].addEventListener('click', function (e) { e.preventDefault(); openPolicy(); });
    }
  }

  function openPolicy() {
    if (policyReturn) return;
    policyReturn = POLICY_HIDES.map(function (id) {
      return { id: id, hidden: $(id).classList.contains('hidden') };
    });
    POLICY_HIDES.forEach(function (id) { $(id).classList.add('hidden'); });
    $('screenPolicy').classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function closePolicy() {
    if (!policyReturn) return;
    $('screenPolicy').classList.add('hidden');
    policyReturn.forEach(function (s) { $(s.id).classList.toggle('hidden', s.hidden); });
    policyReturn = null;
    window.scrollTo(0, 0);
  }

  function setTel(el, tel) {
    if (!tel) { el.classList.add('hidden'); return; }
    el.href = 'tel:' + tel.replace(/[^\d]/g, '');
    el.textContent = '☎ ' + tel + ' に電話する';
  }

  // ---------- 商品一覧 ----------
  function renderProducts() {
    var box = $('products');
    if (!BOOT.products.length) { $('noProducts').classList.remove('hidden'); return; }

    BOOT.products.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'card';

      if (p.image) {
        var img = document.createElement('img');
        img.className = 'thumb';
        img.src = p.image;
        img.alt = p.name;
        img.loading = 'lazy';
        img.onerror = function () { img.remove(); };   // 画像が出せなくても崩れないように
        card.appendChild(img);
      }

      var body = document.createElement('div');
      body.className = 'body';

      var h3 = document.createElement('h3');
      h3.textContent = p.name;                         // textContent で入れる（HTMLとして解釈させない）
      body.appendChild(h3);

      var price = document.createElement('p');
      price.className = 'price';
      var b = document.createElement('b');
      b.textContent = yen(isSet(p) ? p.setPrice : p.unitPrice);
      price.appendChild(b);
      price.appendChild(document.createTextNode(isSet(p)
        ? ' / 1' + p.unitLabel + '（税込・この金額で確定します）'
        : ' / 100g（税込）'));
      body.appendChild(price);

      if (p.desc) {
        var d = document.createElement('p');
        d.className = 'desc';
        d.textContent = p.desc;
        body.appendChild(d);
      }

      body.appendChild(buildPicker(p));
      card.appendChild(body);
      box.appendChild(card);
    });
  }

  /**
   * 商品1つぶんの「−／数／＋」。量り売りならグラム数、セット・個数なら個数を選びます。
   * 違うのは【1つぶんの単位・最小・上限・値段の出し方】だけなので、そこだけを先に決めて共通で作ります。
   */
  function buildPicker(p) {
    var 単位  = isSet(p) ? p.unitLabel : 'g';
    var 刻み  = isSet(p) ? 1 : p.stepGrams;
    var 最小  = isSet(p) ? 1 : p.minGrams;
    // 上限も刻みに合わせて【切り下げ】ます。切り上げると、画面では選べるのに
    // サーバーが「上限を超えています」で断る数になります（例：上限5000g・刻み300g）
    var 上限  = isSet(p) ? Math.max(1, BOOT.maxSets || 20)
                         : Math.floor((BOOT.maxGrams || 0) / 刻み) * 刻み;
    var 値段  = function (n) { return isSet(p) ? p.setPrice * n : Math.round(p.unitPrice * n / 100); };

    var wrap = document.createElement('div');
    wrap.className = 'picker';

    var minus = document.createElement('button');
    minus.className = 'step'; minus.type = 'button'; minus.textContent = '−';
    minus.setAttribute('aria-label', p.name + ' を減らす');

    var input = document.createElement('input');
    input.className = 'gram'; input.type = 'number'; input.inputMode = 'numeric';
    input.min = 0; input.step = 刻み; input.value = 0;
    input.setAttribute('aria-label', p.name + ' の' + (isSet(p) ? '個数' : 'グラム数'));

    var plus = document.createElement('button');
    plus.className = 'step'; plus.type = 'button'; plus.textContent = '＋';
    plus.setAttribute('aria-label', p.name + ' を増やす');

    var unit = document.createElement('span');
    unit.className = 'unit'; unit.textContent = 単位;

    var sub = document.createElement('span');
    sub.className = 'sub zero'; sub.textContent = '—';

    function apply(n) {
      if (!(n > 0)) {
        n = 0;
      } else {
        n = Math.round(n / 刻み) * 刻み;
        if (n > 上限) n = 上限;
        if (n < 最小) n = 最小;
      }

      input.value = n;
      if (n > 0) {
        cart[p.id] = n;
        sub.textContent = yen(値段(n));
        sub.className = 'sub';
      } else {
        delete cart[p.id];
        sub.textContent = '—';
        sub.className = 'sub zero';
      }
      minus.disabled = (n <= 0);
      updateBar();
    }

    minus.addEventListener('click', function () {
      var n = Number(input.value) || 0;
      apply(n <= 最小 ? 0 : n - 刻み);
    });
    plus.addEventListener('click', function () {
      var n = Number(input.value) || 0;
      apply(n <= 0 ? 最小 : n + 刻み);
    });
    input.addEventListener('change', function () { apply(Number(input.value) || 0); });

    minus.disabled = true;
    [minus, input, unit, plus, sub].forEach(function (el) { wrap.appendChild(el); });
    return wrap;
  }

  function cartLines() {
    return BOOT.products.filter(function (p) { return cart[p.id] > 0; }).map(function (p) {
      var n = cart[p.id];
      if (isSet(p)) {
        return { id: p.id, name: p.name, set: true, qty: n,
                 label: p.name + '　' + amountText(p, n), amount: p.setPrice * n };
      }
      return { id: p.id, name: p.name, set: false, grams: n,
               label: p.name + '　' + amountText(p, n), amount: Math.round(p.unitPrice * n / 100) };
    });
  }
  function cartTotal() {
    return cartLines().reduce(function (s, l) { return s + l.amount; }, 0);
  }
  /** 量り売りの品が1つでも入っていれば概算。セットだけなら金額は確定します */
  function cartEstimated() {
    return cartLines().some(function (l) { return !l.set; });
  }
  function totalLabel() { return cartEstimated() ? '概算合計' : '合計'; }

  // ---------- 入力フォーム ----------
  function buildForm() {
    // 受け取れる日だけを並べます。定休日・締切前後の判定はサーバー側で済んでいるので、
    // ここは受け取った配列をそのまま出すだけです（画面とサーバーで判定がズレないように）。
    var d = $('fDate');
    var days = BOOT.pickup.days || [];
    days.forEach(function (v, i) {
      var o = document.createElement('option');
      o.value = v; o.textContent = fmtDate(v);
      if (i === 0) o.selected = true;
      d.appendChild(o);
    });
    if (!days.length) {
      d.disabled = true;
      $('noDate').classList.remove('hidden');
    }

    var msg = BOOT.deadline + 'までのご注文は翌日以降、' +
              BOOT.deadline + '以降のご注文は翌々日以降のお受け取りになります。';
    if (BOOT.closedDays.length) {
      msg += ' 定休日（' + BOOT.closedDays.map(function (n) { return WD[n]; }).join('・') + '曜日）は一覧に出ません。';
    }
    $('dateHint').textContent = msg;

    var sel = $('fSlot');
    BOOT.timeSlots.forEach(function (s, i) {
      var o = document.createElement('option');
      o.value = s; o.textContent = s;
      if (i === 0) o.selected = true;
      sel.appendChild(o);
    });
    if (!BOOT.timeSlots.length) {
      var o = document.createElement('option');
      o.value = ''; o.textContent = '指定なし';
      sel.appendChild(o);
    }
  }

  // 一覧に出していない日は選びようがありませんが、念のため最後にもう一度だけ確かめます
  // （画面を開いたまま日をまたいだ場合など。サーバー側でも同じ判定をしています）
  function checkDate() {
    var v = $('fDate').value;
    if (!v) return true;
    if ((BOOT.pickup.days || []).indexOf(v) < 0) {
      showErr('formErr', 'お受け取り希望日をお選び直しください。画面を再読み込みすると最新の日程が出ます。');
      return false;
    }
    hideErr('formErr');
    return true;
  }

  // ---------- 画面の出し分け ----------
  function show(next) {
    stage = next;
    $('screenPick').classList.toggle('hidden',    next !== 'pick');
    $('screenForm').classList.toggle('hidden',    next !== 'form');
    $('screenConfirm').classList.toggle('hidden', next !== 'confirm');
    $('screenDone').classList.toggle('hidden',    next !== 'done');
    $('bar').classList.toggle('hidden',           next === 'done');
    hideErr('formErr'); hideErr('confirmErr');
    updateBar();
    window.scrollTo(0, 0);
  }

  function updateBar() {
    var total = cartTotal();
    $('barTotal').textContent = yen(total);
    var btn = $('goBtn');

    $('barLabel').textContent = totalLabel();

    if (stage === 'pick') {
      btn.textContent = 'ご注文へ進む';
      btn.disabled = (total === 0);
    } else if (stage === 'form') {
      btn.textContent = '確認画面へ';
      btn.disabled = false;
    } else if (stage === 'confirm') {
      btn.textContent = sending ? '送信中…' : 'この内容で注文する';
      btn.disabled = sending;
    }
  }

  function onGo() {
    if (stage === 'pick')    { show('form'); return; }
    if (stage === 'form')    { if (validateForm()) { renderConfirm(); show('confirm'); } return; }
    if (stage === 'confirm') { send(); }
  }

  function validateForm() {
    var name = $('fName').value.trim();
    var tel  = $('fTel').value.replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/[^\d]/g, '');

    if (!name)                        { return showErr('formErr', 'お名前をご入力ください。'), false; }
    if (!/^0\d{9,10}$/.test(tel))     { return showErr('formErr', '電話番号をご確認ください（ハイフンなしの10桁または11桁）。'), false; }
    if (!$('fDate').value)            { return showErr('formErr', 'お受け取り希望日をお選びください。'), false; }
    if (!checkDate())                 { return false; }
    if (!cartLines().length)          { return showErr('formErr', 'ご注文の商品をお選びください。'), false; }
    hideErr('formErr');
    return true;
  }

  function renderConfirm() {
    var box = $('cItems');
    box.textContent = '';
    cartLines().forEach(function (l) {
      var row = document.createElement('div');
      row.className = 'row';
      var left = document.createElement('span');
      left.textContent = l.label;
      var right = document.createElement('span');
      right.textContent = yen(l.amount);
      row.appendChild(left); row.appendChild(right);
      box.appendChild(row);
    });
    $('cTotal').textContent      = yen(cartTotal());
    $('cTotalLabel').textContent = totalLabel();
    $('cTotalNote').textContent  = cartEstimated()
      ? 'グラム数でご注文の品は、実重量でお会計が確定します。お支払いは店頭でお願いいたします。'
      : 'この金額でお受けいたします。お支払いは店頭でお願いいたします。';
    $('cName').textContent  = $('fName').value.trim() + ' 様';
    $('cTel').textContent   = $('fTel').value.trim();
    $('cWhen').textContent  = fmtDate($('fDate').value) + '　' + ($('fSlot').value || '指定なし');
    $('cNote').textContent  = $('fNote').value.trim() || '（なし）';
  }

  // ---------- 送信 ----------
  function send() {
    if (sending) return;
    sending = true;
    updateBar();
    hideErr('confirmErr');

    var payload = {
      name : $('fName').value.trim(),
      tel  : $('fTel').value.trim(),
      date : $('fDate').value,
      slot : $('fSlot').value,
      note : $('fNote').value.trim(),
      hp   : $('fHp').value,
      items: cartLines().map(function (l) {
        return l.set ? { id: l.id, qty: l.qty } : { id: l.id, grams: l.grams };
      })
    };

    // ⚠ Content-Type を application/json にすると、プリフライト（OPTIONS）が飛んで GAS は必ず失敗します。
    //   text/plain で送り、GAS の doPost が JSON.parse(e.postData.contents) します。
    //   /exec は 302 で script.googleusercontent.com へ飛ぶので redirect:'follow'（既定）のままにします。
    payload['do'] = 'order';
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        sending = false;
        if (!res || !res.ok) {
          showErr('confirmErr', (res && res.message) || '送信できませんでした。時間をおいてお試しください。');
          updateBar();
          return;
        }
        $('dNo').textContent   = res.orderNo;
        $('dWhen').textContent = fmtDate(res.date) + '　' + (res.slot || '時間指定なし');
        show('done');
      })
      .catch(function (err) {
        sending = false;
        showErr('confirmErr', '通信に失敗しました。電波の良い場所でもう一度お試しいただくか、お電話にてご注文ください。');
        updateBar();
        console.error(err);
      });
  }

  function showErr(id, msg) {
    var el = $(id);
    el.textContent = msg;
    el.classList.remove('hidden');
    el.scrollIntoView({ block: 'center' });
  }
  function hideErr(id) { $(id).classList.add('hidden'); }

  // ---------- 起動：GAS の ?do=products を読んでから init() ----------
  //   GAS 版は doGet が HTML に埋め込んでいました。Pages 版は静的ページなので、開いたあとに取りに行きます。
  //   GET は素の fetch で読めます（/exec の応答には Google 側が Access-Control-Allow-Origin: * を付けるため）。
  //   ⚠ 承認前の GAS は JSON ではなく 403 の HTML を返し、console に CORS のエラーが出ますが、それは承認の話で
  //     コードの話ではありません（別の案件の落とし穴 ⑥）。
  function boot() {
    $('loading').classList.remove('hidden');
    $('loadErr').classList.add('hidden');
    $('retryWrap').classList.add('hidden');
    if (!API) { loadFailed('API が設定されていません（config.js）。'); return; }
    fetch(API + '?do=products', { redirect: 'follow' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok || !d.shop) throw new Error((d && d.message) || '応答が読めません');
        BOOT = d;
        $('loading').classList.add('hidden');
        document.title = BOOT.shop.name + ' ご注文';
        init();
      })
      .catch(function (err) {
        console.error(err);
        loadFailed('');
      });
  }
  function loadFailed(detail) {
    $('loading').classList.add('hidden');
    var el = $('loadErr');
    el.textContent = 'ただいま商品の情報を読み込めませんでした。時間をおいて開き直すか、お電話にてご注文ください。' + (detail ? '（' + detail + '）' : '');
    el.classList.remove('hidden');
    $('retryWrap').classList.remove('hidden');
  }
  $('retry').addEventListener('click', boot);

  boot();
})();

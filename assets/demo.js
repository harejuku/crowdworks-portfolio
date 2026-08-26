/* ------------------------------------------------------------------
   体験版の共通部品。各デモの画面（本番コードの複製）は、この2行を足すだけで
   「体験版の帯」「しくみの説明」「サンドボックス保存」が付く。

     <link rel="stylesheet" href="../assets/demo.css">
     <script src="../assets/demo.js"></script>

   保存先を sessionStorage にしているのは、体験版で触った結果を
   ①他の見学者に見せない ②タブを閉じたら消す、の2つを満たすため。
   本番のデータベースには一切つながっていないので、ここで何をしても
   実在の店舗・生徒の記録は変わらない。
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var NS = 'ssdemo:';

  /* ---------- サンドボックス保存 ----------
     sessionStorage はプライベートウィンドウや設定によっては
     読み書きそのものが例外を投げる。落ちると画面が真っ白になるので、
     使えないときは「タブ内の変数だけで動く」に静かに落とす。 */
  var mem = {};
  var canStore = (function () {
    try {
      var k = NS + 'probe';
      sessionStorage.setItem(k, '1');
      sessionStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();

  function load(key, fallback) {
    var raw;
    if (canStore) {
      try { raw = sessionStorage.getItem(NS + key); } catch (e) { raw = null; }
    } else {
      raw = Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
    }
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function save(key, value) {
    var raw = JSON.stringify(value);
    if (canStore) {
      try { sessionStorage.setItem(NS + key, raw); return; } catch (e) { /* 容量超過などは黙って諦める */ }
    }
    mem[key] = raw;
  }

  function clearAll() {
    mem = {};
    if (!canStore) return;
    try {
      var doomed = [];
      for (var i = 0; i < sessionStorage.length; i++) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf(NS) === 0) doomed.push(k);
      }
      doomed.forEach(function (k) { sessionStorage.removeItem(k); });
    } catch (e) { /* 消せなくても操作は続けられる */ }
  }

  /**
   * 触った結果を持ち回すための入れ物。
   *   var store = Demo.store('tanigawa', function () { return 初期データ(); });
   *   store.data.orders.push(...); store.commit();
   * commit() を呼んだときだけ保存する（毎回書くと重い）。
   */
  function store(key, factory) {
    var initial = load(key, null);
    var data = initial == null ? factory() : initial;
    return {
      data: data,
      commit: function () { save(key, data); },
      reset: function () { data = factory(); save(key, data); return data; }
    };
  }

  /* ---------- 体験版の帯 ---------- */
  function init(opts) {
    opts = opts || {};
    var home = opts.home || '../';
    var note = opts.note || 'これは<b>体験版</b>です。画面の氏名・金額・商品はすべて架空で、実在の記録ではありません。';

    var bar = document.createElement('div');
    bar.className = 'ss-bar';
    bar.innerHTML =
      '<div class="ss-bar-in">' +
        '<a class="ss-home" href="' + home + '">◀ 体験版いちらん</a>' +
        '<span class="ss-note">' + note + '</span>' +
        '<span class="ss-spacer"></span>' +
        (opts.about ? '<button type="button" class="ss-about">しくみ</button>' : '') +
        '<button type="button" class="ss-reset">最初から</button>' +
      '</div>';

    // 帯は本文より前に置く。position:fixed にすると、中身側が持っている
    // ヘッダーや固定バーと重なって隠れるため、あえて流れの中に入れて sticky にする。
    document.body.insertBefore(bar, document.body.firstChild);

    bar.querySelector('.ss-reset').addEventListener('click', function () {
      clearAll();
      location.reload();
    });

    if (opts.about) {
      var sheet = buildSheet(opts.about);
      document.body.appendChild(sheet);
      bar.querySelector('.ss-about').addEventListener('click', function () { sheet.hidden = false; });
    }
  }

  function buildSheet(about) {
    var el = document.createElement('div');
    el.className = 'ss-sheet';
    el.hidden = true;

    var items = (about.points || []).map(function (p) {
      return '<dt>' + p.t + '</dt><dd>' + p.d + '</dd>';
    }).join('');

    el.innerHTML =
      '<div class="ss-sheet-in" role="dialog" aria-modal="true">' +
        '<h2>' + about.title + '</h2>' +
        '<p class="ss-sub">' + (about.sub || '') + '</p>' +
        '<dl>' + items + '</dl>' +
        '<button type="button" class="ss-close">とじる</button>' +
      '</div>';

    el.addEventListener('click', function (e) {
      // 背景（黒いところ）を押したときだけ閉じる。中身の文章を選択しただけで
      // 閉じてしまわないよう、クリック先が枠そのものかを見る。
      if (e.target === el || e.target.classList.contains('ss-close')) el.hidden = true;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') el.hidden = true;
    });
    return el;
  }

  /* ---------- 本番にしか無い動きを押されたとき ----------
     押しても無反応のボタンを黙って置くと、機能が無いのか手を抜いたのか
     区別がつかない。「本番では何が起きるか」をその場に出す。 */
  var toastTimer = null;
  function toast(msg, label) {
    var old = document.querySelector('.ss-toast');
    if (old) old.remove();
    if (toastTimer) clearTimeout(toastTimer);

    var el = document.createElement('div');
    el.className = 'ss-toast';
    el.innerHTML = '<b>' + (label || '本番ではこうなります') + '</b>' + msg;
    document.body.appendChild(el);
    toastTimer = setTimeout(function () { el.remove(); }, 5200);
  }

  /* 通信しているように見せるための待ち時間。
     即座に返すと「押した気がしない」ので、本物と同じくらいの間を置く。 */
  function later(fn, ms) { setTimeout(fn, ms == null ? 260 : ms); }

  global.Demo = {
    init: init, store: store, toast: toast, later: later,
    clearAll: clearAll
  };
})(window);

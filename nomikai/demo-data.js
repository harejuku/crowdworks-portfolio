/* ------------------------------------------------------------------
   飲み会精算の体験版に、最初から見本の飲み会を入れておく。

   この道具はサーバーを持たず、入力をブラウザの localStorage に持つ作り。
   本物と同じ保存先（nomikai.v1）へ、開く前に見本を1件だけ書いておく。
   すでに何か入っている人のぶんは上書きしない。

   人名・店名・金額はすべて架空。
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  var KEY = 'nomikai.v1';

  function today() {
    var d = new Date();
    var p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function sample() {
    return {
      meta: { name: '9月の歓迎会', date: today(), organizer: '田村', roundUnit: 100 },
      participants: [
        // kind:'split' ＝ わり勘（係数の比で割る）／ kind:'fixed' ＝ 定額（会費）
        { name: '田村', kind: 'split', coef: 1.3, fixed: '' },
        { name: '西口', kind: 'split', coef: 1.3, fixed: '' },
        { name: '小林', kind: 'split', coef: 1,   fixed: '' },
        { name: '藤井', kind: 'split', coef: 1,   fixed: '' },
        { name: '中原', kind: 'split', coef: 0.7, fixed: '' },
        { name: '大槻', kind: 'split', coef: 0.7, fixed: '' },
        // 学生アルバイトは会費3,000円の定額。残りをわり勘の6人で割る
        { name: '柏木', kind: 'fixed', coef: 1,   fixed: 3000 },
      ],
      expenses: [
        { item: '1次会（居酒屋）', amount: 42800, target: '', memo: '7名' },
        { item: '2次会（バー）',   amount: 15600, target: '田村、西口、小林、中原', memo: '4名だけ' },
        { item: 'ケーキ',          amount: 3200,  target: '', memo: '差し入れ' },
      ],
      payments: [
        { itemNo: 1, who: '田村', amount: 42800, to: '', memo: 'カードで支払い' },
        { itemNo: 2, who: '小林', amount: 15600, to: '', memo: '' },
        { itemNo: 3, who: '西口', amount: 3200,  to: '', memo: '' },
      ],
    };
  }

  try {
    var raw = localStorage.getItem(KEY);
    var has = false;
    if (raw) {
      var b = JSON.parse(raw);
      has = !!(b && b.events && b.current && b.events[b.current]);
    }
    if (!has) {
      var id = 'demo-sample';
      var book = { events: {}, current: id };
      book.events[id] = { id: id, state: sample(), updatedAt: Date.now() };
      localStorage.setItem(KEY, JSON.stringify(book));
    }
  } catch (e) {
    // 保存が使えないブラウザでは、空の状態から始まる（画面は壊れない）
  }

  // 帯の「最初から」で、この見本まで戻せるようにする
  window.__demoResetNomikai = function () {
    try { localStorage.removeItem(KEY); } catch (e) { /* 消せなくても再読込で作り直す */ }
  };
})();

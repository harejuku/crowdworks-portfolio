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
      meta: { name: '9月の歓迎会', date: today(), organizer: 'かんじ', roundUnit: 100 },
      // 名字を使わず、ひらがなの呼び名だけにしてある。
      // 実在の誰かを指していないことが、読んだ瞬間に分かるようにするため
      participants: [
        // kind:'split' ＝ わり勘（係数の比で割る）／ kind:'fixed' ＝ 定額（会費）
        { name: 'かんじ',   kind: 'split', coef: 1.3, fixed: '' },
        { name: 'せんぱい', kind: 'split', coef: 1.3, fixed: '' },
        { name: 'あおい',   kind: 'split', coef: 1,   fixed: '' },
        { name: 'けいた',   kind: 'split', coef: 1,   fixed: '' },
        { name: 'なつき',   kind: 'split', coef: 0.7, fixed: '' },
        { name: 'みなみ',   kind: 'split', coef: 0.7, fixed: '' },
        // 学生アルバイトは会費3,000円の定額。残りをわり勘の6人で割る
        { name: 'がくせい', kind: 'fixed', coef: 1,   fixed: 3000 },
      ],
      expenses: [
        { item: '1次会（居酒屋）', amount: 42800, target: '', memo: '7名' },
        { item: '2次会（バー）',   amount: 15600, target: 'かんじ、せんぱい、あおい、なつき', memo: '4名だけ' },
        { item: 'ケーキ',          amount: 3200,  target: '', memo: '差し入れ' },
      ],
      payments: [
        { itemNo: 1, who: 'かんじ',   amount: 42800, to: '', memo: 'カードで支払い' },
        { itemNo: 2, who: 'あおい',   amount: 15600, to: '', memo: '' },
        { itemNo: 3, who: 'せんぱい', amount: 3200,  to: '', memo: '' },
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

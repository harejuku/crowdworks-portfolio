/* ------------------------------------------------------------------
   飲み会精算の体験版に、最初から見本の飲み会を入れておく。

   この道具はサーバーを持たず、入力をブラウザの localStorage に持つ作り。
   画面のコードは保存先を 'nomikai.v1' だと思って読み書きしている。

   🚨 2026-09-04：体験版を開いたら、実在の飲み会の参加者名と金額が出た。
   原因は、この体験版と、実際の精算に使った画面が **同じ保存先を見ていた** こと。
   localStorage はページごとではなく「サイト（オリジン）ごと」に1つなので、
   同じサイトの別のページで実際の精算をすると、その中身がここに出てくる。
   訪問者のブラウザには何も入っていないので見本が出るが、
   一度でも実際の精算に使った本人のブラウザでは、実名がそのまま画面に並ぶ。

   直し方：**体験版の保存領域を、実際の利用と分ける。**
   下で localStorage の getItem/setItem/removeItem を薄く包み、
   'nomikai.v1' への読み書きを 'nomikai.demo.v1' へ付け替えている。
   画面のコードは本物のキーを触っているつもりのまま動く（1行も直していない）。
   これで、体験版のURLでは誰のブラウザでも架空の見本しか出ず、
   実際の精算データ（nomikai.v1）には触れないまま残る。

   人名・店名・金額はすべて架空。
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  var KEY = 'nomikai.v1';       // 画面のコードが使っているキー（本物）
  var DEMO_KEY = 'nomikai.demo.v1';  // 体験版だけが使うキー

  /* 体験版の保存領域を分ける。
     Storage.prototype を包むので、画面のコードが先に握った
     window.localStorage の参照ごしでも、ちゃんとこちらを通る。
     付け替えるのは localStorage の 'nomikai.v1' だけ。
     体験版の帯が使う sessionStorage や、ほかのキーには一切さわらない。 */
  try {
    var S = window.Storage && window.Storage.prototype;
    var LS = window.localStorage;
    if (S && LS && !S.__nomikaiDemoWrapped) {
      ['getItem', 'setItem', 'removeItem'].forEach(function (name) {
        var orig = S[name];
        S[name] = function (k) {
          var args = Array.prototype.slice.call(arguments);
          if (this === LS && k === KEY) args[0] = DEMO_KEY;
          return orig.apply(this, args);
        };
      });
      S.__nomikaiDemoWrapped = true;
    }
  } catch (e) {
    // 包めないブラウザでは、見本が出ないだけ（画面は壊れない）。
    // その場合でも下の読み書きは KEY のまま＝従来どおりの動きになる
  }

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

  /* 見本を置くのは体験版のキーだけ。ここは付け替えに頼らず直に DEMO_KEY を触る
     （万一 包めなかった時に、実際の精算データ側へ見本を書き込まないため）。
     すでに体験版で何か作っている人のぶんは上書きしない。 */
  try {
    var raw = localStorage.getItem(DEMO_KEY);
    var has = false;
    if (raw) {
      var b = JSON.parse(raw);
      has = !!(b && b.events && b.current && b.events[b.current]);
    }
    if (!has) {
      var id = 'demo-sample';
      var book = { events: {}, current: id };
      book.events[id] = { id: id, state: sample(), updatedAt: Date.now() };
      localStorage.setItem(DEMO_KEY, JSON.stringify(book));
    }
  } catch (e) {
    // 保存が使えないブラウザでは、空の状態から始まる（画面は壊れない）
  }

  // 帯の「最初から」で、この見本まで戻せるようにする（消すのも体験版のキーだけ）
  window.__demoResetNomikai = function () {
    try { localStorage.removeItem(DEMO_KEY); } catch (e) { /* 消せなくても再読込で作り直す */ }
  };
})();

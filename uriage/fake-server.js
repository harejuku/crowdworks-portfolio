/* ------------------------------------------------------------------
   小売店 売上管理の「偽サーバー」。

   画面は、実際に納品したスマホ入力フォームのHTMLをそのまま置いている。
   本物は google.script.run の api(名前, 引数) でサーバーを呼び、
   Googleスプレッドシートの「明細」シートに1行ずつ足していく。
   ここでは、その api だけを偽物に差し替えている。

   お店・事業・金額はすべて架空。保存先はこのタブの中だけ。
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  var 年度開始月 = 7;   // 7月〜翌年6月で1年度（本物は「設定」シートから読む）

  var 事業リスト = ['店頭販売', 'キッチンカー', 'ネット通販', 'その他'];
  var 科目リスト = [
    { 名:'売上',     種別:'収入' },
    { 名:'雑収入',   種別:'収入' },
    { 名:'仕入',     種別:'支出' },
    { 名:'家賃',     種別:'支出' },
    { 名:'光熱費',   種別:'支出' },
    { 名:'通信費',   種別:'支出' },
    { 名:'消耗品費',種別:'支出' },
    { 名:'車両費',   種別:'支出' },
    { 名:'雑費',     種別:'支出' }
  ];

  function pad(n) { return ('0' + n).slice(-2); }
  function 日付文字(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /* 架空の明細。今日を起点に3か月ぶんを作るので、いつ開いても「今月」が埋まっている。
     売上は曜日で波を付ける（土日が高い）。数字が均一だと作り物に見えるため。 */
  function seed() {
    var 記録 = [];
    var id = 1;
    var 今 = new Date();
    var 起点 = new Date(今.getFullYear(), 今.getMonth() - 2, 1);

    var 乱数 = (function () {   // 開くたびに数字が変わらないよう、種を固定した擬似乱数
      var s = 20260826;
      return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    })();

    for (var d = new Date(起点); d <= 今; d.setDate(d.getDate() + 1)) {
      var 曜 = d.getDay();
      var 日 = 日付文字(d);

      // 家賃・光熱費・通信費は定休日かどうかに関係なく落ちるので、休みの判定より先に入れる
      if (d.getDate() === 25) {
        記録.push({ 記録ID:String(id++), 日付:日, 事業:'店頭販売', 科目:'家賃',
                    収入:0, 支出:120000, 取引先:'みどり不動産', 備考:'', 入力元:'パソコン' });
        記録.push({ 記録ID:String(id++), 日付:日, 事業:'キッチンカー', 科目:'車両費',
                    収入:0, 支出: Math.round((18000 + 乱数() * 9000) / 100) * 100,
                    取引先:'', 備考:'燃料・駐車', 入力元:'スマホ' });
      }
      if (d.getDate() === 10) {
        記録.push({ 記録ID:String(id++), 日付:日, 事業:'その他', 科目:'光熱費',
                    収入:0, 支出: Math.round((21000 + 乱数() * 8000) / 100) * 100,
                    取引先:'', 備考:'', 入力元:'パソコン' });
        記録.push({ 記録ID:String(id++), 日付:日, 事業:'その他', 科目:'通信費',
                    収入:0, 支出:6600, 取引先:'', 備考:'', 入力元:'パソコン' });
      }

      if (曜 === 2) continue;   // 火曜定休

      var 倍 = (曜 === 0 || 曜 === 6) ? 1.7 : 1.0;
      記録.push({ 記録ID:String(id++), 日付:日, 事業:'店頭販売', 科目:'売上',
                  収入: Math.round((28000 + 乱数() * 22000) * 倍 / 100) * 100, 支出:0,
                  取引先:'', 備考:'', 入力元:'スマホ' });

      if (曜 === 3 || 曜 === 5 || 曜 === 6) {
        記録.push({ 記録ID:String(id++), 日付:日, 事業:'キッチンカー', 科目:'売上',
                    収入: Math.round((32000 + 乱数() * 30000) / 100) * 100, 支出:0,
                    取引先:'', 備考: 曜 === 6 ? '駅前マルシェ' : '', 入力元:'スマホ' });
      }
      if (曜 === 1 || 曜 === 4) {
        記録.push({ 記録ID:String(id++), 日付:日, 事業:'ネット通販', 科目:'売上',
                    収入: Math.round((9000 + 乱数() * 14000) / 100) * 100, 支出:0,
                    取引先:'', 備考:'', 入力元:'スマホ' });
      }
      if (曜 === 1 || 曜 === 4) {
        記録.push({ 記録ID:String(id++), 日付:日, 事業:'店頭販売', 科目:'仕入',
                    収入:0, 支出: Math.round((14000 + 乱数() * 12000) / 100) * 100,
                    取引先:'さくら青果', 備考:'', 入力元:'スマホ' });
      }
    }
    return { 記録: 記録, 次ID: id };
  }

  var store = Demo.store('uriage', seed);
  var S = store.data;

  function 年度(d) {
    var y = d.getFullYear();
    return (d.getMonth() + 1 >= 年度開始月) ? y : y - 1;
  }
  function 年度内順(d) {
    return ((d.getMonth() + 1) - 年度開始月 + 12) % 12;
  }
  function 日付に変換(s) {
    var m = String(s || '').replace(/\//g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function 直近() {
    return S.記録.slice(-30).reverse().slice(0, 5).map(function (r) {
      return { 記録ID:r.記録ID, 日付:r.日付, 事業:r.事業, 科目:r.科目,
               収入:r.収入, 支出:r.支出, 備考:r.備考, 入力元:r.入力元 };
    });
  }

  function よく使う() {
    var 数 = {};
    S.記録.slice(-300).forEach(function (r) {
      if (!r.事業 || !r.科目) return;
      (数[r.事業] = 数[r.事業] || {})[r.科目] = (数[r.事業][r.科目] || 0) + 1;
    });
    var 順 = {};
    Object.keys(数).forEach(function (b) {
      順[b] = Object.keys(数[b]).sort(function (x, y) { return 数[b][y] - 数[b][x]; });
    });
    return 順;
  }

  var API = {
    初期データ: function () {
      return {
        事業: 事業リスト,
        科目: 科目リスト,
        よく使う: よく使う(),
        今日: 日付文字(new Date()),
        直近: 直近()
      };
    },

    登録: function (引数) {
      var d = 日付に変換(引数.日付);
      if (!d) throw new Error('日付が正しくありません');

      var 事業 = String(引数.事業 || '').trim();
      if (事業リスト.indexOf(事業) < 0) throw new Error('事業「' + 事業 + '」は選べません');

      var 科目 = String(引数.科目 || '').trim();
      if (!科目リスト.filter(function (o) { return o.名 === 科目; }).length) {
        throw new Error('勘定科目「' + 科目 + '」は選べません');
      }

      var 金額 = Number(String(引数.金額).replace(/[^\d.-]/g, ''));
      if (!(金額 > 0)) throw new Error('金額を入力してください');

      var 種別 = (引数.種別 === '収入') ? '収入' : '支出';
      var id = String(S.次ID++);

      S.記録.push({
        記録ID: id, 日付: 日付文字(d), 事業: 事業, 科目: 科目,
        収入: 種別 === '収入' ? 金額 : 0,
        支出: 種別 === '支出' ? 金額 : 0,
        取引先: String(引数.取引先 || '').trim(),
        備考: String(引数.備考 || '').trim(),
        // レシート写真は、本物ならGoogleドライブに保存してURLをシートに書く。
        // 体験版では受け取ったことだけ記録して、画像は捨てている
        レシート: (引数.画像 && 引数.画像.base64) ? '（写真あり）' : '',
        入力元: 'スマホ'
      });
      store.commit();
      return { 記録ID: id, 直近: 直近() };
    },

    取消: function (引数) {
      var 探す = String(引数.記録ID || '').trim();
      if (!探す) throw new Error('取り消す記録が指定されていません');
      var i = S.記録.map(function (r) { return r.記録ID; }).lastIndexOf(探す);
      if (i < 0) throw new Error('記録が見つかりません（すでに取り消されている可能性があります）');
      S.記録.splice(i, 1);
      store.commit();
      return { 直近: 直近() };
    },

    サマリ: function () {
      var 今 = new Date();
      var 今年 = 今.getFullYear(), 今月 = 今.getMonth() + 1;
      var 今年度 = 年度(今), 今順 = 年度内順(今);

      var 表 = {};
      事業リスト.forEach(function (b) { 表[b] = { 当月収入:0, 当月支出:0, 累計収入:0, 累計支出:0 }; });

      S.記録.forEach(function (r) {
        var d = 日付に変換(r.日付);
        if (!d || !表[r.事業]) return;
        if (年度(d) !== 今年度) return;
        if (年度内順(d) <= 今順) { 表[r.事業].累計収入 += r.収入; 表[r.事業].累計支出 += r.支出; }
        if (d.getFullYear() === 今年 && d.getMonth() + 1 === 今月) {
          表[r.事業].当月収入 += r.収入; 表[r.事業].当月支出 += r.支出;
        }
      });

      return {
        見出し: 今年 + '年' + 今月 + '月',
        年度: 今年度,
        事業: 事業リスト.map(function (b) {
          return { 名:b, 当月収入:表[b].当月収入, 当月支出:表[b].当月支出,
                   当月収支:表[b].当月収入 - 表[b].当月支出,
                   累計収支:表[b].累計収入 - 表[b].累計支出 };
        }),
        更新: (今.getMonth() + 1) + '/' + 今.getDate() + ' ' + pad(今.getHours()) + ':' + pad(今.getMinutes())
      };
    }
  };

  function api(名前, 引数) {
    try {
      var fn = API[名前];
      if (!fn) return { ok: false, error: '不明な操作です: ' + 名前 };
      return { ok: true, data: fn(引数 || {}) };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }

  /* google.script.run の偽物（本物と同じ書き方で呼べる） */
  function makeRunner() {
    var onOk = null, onFail = null;
    var runner = {
      withSuccessHandler: function (fn) { onOk = fn; return runner; },
      withFailureHandler: function (fn) { onFail = fn; return runner; },
      api: function (名前, 引数) {
        Demo.later(function () {
          var res;
          try { res = api(名前, 引数); }
          catch (e) { if (onFail) onFail(e); return; }
          if (onOk) onOk(res);
        });
      }
    };
    return runner;
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', { get: makeRunner });
})();

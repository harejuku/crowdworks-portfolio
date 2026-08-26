/* ------------------------------------------------------------------
   精肉店 注文サイトの「偽サーバー」。

   お客さん画面・店主の管理画面は、実際に納品したものと同じHTMLをそのまま置いている。
   本物は google.script.run でサーバー（Google Apps Script）を呼び、
   スプレッドシートに書き込む。この体験版では、その google.script.run だけを
   ここで作った偽物に差し替えている。だから画面側のコードは1行も変えていない。

   保存先はブラウザの sessionStorage（このタブの中だけ）。
   実在の店舗のスプレッドシートには一切つながっていない。

   商品・注文・店名はすべて架空。
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  var SET = 'セット';
  var WEIGHT = '量り売り';

  /* ---------- 架空の商品写真 ----------
     写真は用意できないので、品名の一文字を透かしにした札を描いている。
     いかにも「画像が無い」灰色の枠を出すより、商品棚らしく見える。 */
  function photo(kanji, c1, c2) {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/>' +
        '</linearGradient></defs>' +
        '<rect width="480" height="300" fill="url(#g)"/>' +
        '<text x="240" y="196" font-size="180" text-anchor="middle" fill="#ffffff" fill-opacity="0.30" ' +
          'font-family="Hiragino Mincho ProN, Yu Mincho, serif">' + kanji + '</text>' +
        '<text x="464" y="286" font-size="15" text-anchor="end" fill="#ffffff" fill-opacity="0.65" ' +
          'font-family="Hiragino Sans, sans-serif">体験版の見本</text>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function initialState() {
    return {
      config: {
        店名: 'みどり精肉店',
        電話番号: '06-0000-0000',
        住所: 'みどり市さくら町1-2-3',
        受付: 'ON',
        お知らせ: '9月のご案内：毎週金曜日は「コロッケの日」。手作りコロッケが1パック100円引きです。',
        停止中メッセージ: 'ただいま、ご注文の受付を停止しております。お手数ですがお電話にてご相談ください。',
        通知先メール: 'midori-seiniku@example.com',
        受取時間帯: '10:00〜13:00, 15:00〜18:00',
        定休日: '水',
        締切時刻: '18:00',
        受取可能日_最短: 1,
        受取可能日_最長: 14,
        '1回の上限グラム': 5000,
        '1回の上限セット数': 20
      },
      products: [
        { row:2, order:1, name:'国産牛 ロース（すき焼き用）', kind:WEIGHT, unitPrice:780, setPrice:0,
          unitLabel:SET, desc:'きめが細かく、脂の甘みがあります。すき焼き・しゃぶしゃぶに。',
          image:photo('牛','#8f2f28','#c26a4a'), onSale:true, minGrams:200, stepGrams:100 },
        { row:3, order:2, name:'黒毛和牛 切り落とし', kind:WEIGHT, unitPrice:580, setPrice:0,
          unitLabel:SET, desc:'部位はその日のおすすめから。炒め物・煮込みに使いやすい厚みです。',
          image:photo('和','#7a2b38','#b8555c'), onSale:true, minGrams:100, stepGrams:100 },
        { row:4, order:3, name:'国産豚 バラ肉', kind:WEIGHT, unitPrice:268, setPrice:0,
          unitLabel:SET, desc:'厚さのご希望があれば備考欄にどうぞ。',
          image:photo('豚','#a8574d','#d99a86'), onSale:true, minGrams:100, stepGrams:100 },
        { row:5, order:4, name:'若鶏 もも肉', kind:WEIGHT, unitPrice:158, setPrice:0,
          unitLabel:SET, desc:'朝仕入れの国産若鶏です。',
          image:photo('鶏','#8a7333','#c9b06a'), onSale:true, minGrams:200, stepGrams:100 },
        { row:6, order:5, name:'自家製 味付けカルビ', kind:WEIGHT, unitPrice:498, setPrice:0,
          unitLabel:SET, desc:'醤油だれに一晩漬け込んでいます。焼くだけで食べられます。',
          image:photo('焼','#6f3b22','#b0713f'), onSale:true, minGrams:200, stepGrams:100 },
        { row:7, order:6, name:'手作りコロッケ（5個入）', kind:SET, unitPrice:0, setPrice:450,
          unitLabel:'パック', desc:'その日に揚げたものをお包みします。じゃがいもは近隣の農家さんのもの。',
          image:photo('惣','#8a6d1f','#d3b45e'), onSale:true, minGrams:100, stepGrams:100 },
        { row:8, order:7, name:'バーベキューセット（3〜4人前）', kind:SET, unitPrice:0, setPrice:3800,
          unitLabel:SET, desc:'牛カルビ・豚バラ・鶏もも・味付けホルモンの詰め合わせ（計約1kg）。',
          image:photo('宴','#2f5d46','#77a98d'), onSale:true, minGrams:100, stepGrams:100 },
        { row:9, order:8, name:'国産牛 ヒレ（ステーキ用）', kind:WEIGHT, unitPrice:1480, setPrice:0,
          unitLabel:SET, desc:'入荷がある日だけお出ししています。',
          image:photo('牛','#5c2b2b','#96574f'), onSale:false, minGrams:100, stepGrams:100 }
      ],
      orders: seedOrders(),
      seq: {}   // 注文番号の連番。'20260826' -> 3 のように日付ごとに持つ
    };
  }

  /* 架空の注文。日付は「今日」から作るので、いつ開いても自然に見える */
  function seedOrders() {
    var t = new Date();
    var d = function (n) {
      var x = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n);
      return fmtDate(x);
    };
    var at = function (dayOffset, h, m) {
      var x = new Date(t.getFullYear(), t.getMonth(), t.getDate() + dayOffset, h, m);
      return fmtDate(x) + ' ' + pad(x.getHours()) + ':' + pad(x.getMinutes());
    };
    var no = function (dayOffset, n) {
      var x = new Date(t.getFullYear(), t.getMonth(), t.getDate() + dayOffset);
      return 'T-' + fmtDate(x).replace(/-/g, '') + '-' + ('00' + n).slice(-3);
    };

    return [
      { row:2, orderNo:no(-2,1), at:at(-2,9,12), name:'佐藤 美咲', tel:'09000000001',
        date:d(0), slot:'10:00〜11:00',
        detail:'国産豚 バラ肉 400g（100gあたり¥268／概算¥1,072）\n若鶏 もも肉 600g（100gあたり¥158／概算¥948）',
        amount:2020, note:'豚バラは厚めに切ってください', status:'完了', estimated:true },
      { row:3, orderNo:no(-1,1), at:at(-1,11,40), name:'田中 健一', tel:'09000000002',
        date:d(0), slot:'17:00〜18:00',
        detail:'バーベキューセット（3〜4人前） 1セット（1セットあたり¥3,800／¥3,800）',
        amount:3800, note:'', status:'確認済', estimated:false },
      { row:4, orderNo:no(-1,2), at:at(-1,16,5), name:'鈴木 亜衣', tel:'09000000003',
        date:d(1), slot:'11:00〜12:00',
        detail:'黒毛和牛 切り落とし 300g（100gあたり¥580／概算¥1,740）\n手作りコロッケ（5個入） 2パック（1パックあたり¥450／¥900）',
        amount:2640, note:'', status:'確認済', estimated:true },
      { row:5, orderNo:no(0,1), at:at(0,8,55), name:'高橋 涼太', tel:'09000000004',
        date:d(1), slot:'15:00〜16:00',
        detail:'国産牛 ロース（すき焼き用） 600g（100gあたり¥780／概算¥4,680）',
        amount:4680, note:'すき焼き用に薄めでお願いします', status:'未対応', estimated:true },
      { row:6, orderNo:no(0,2), at:at(0,10,20), name:'渡辺 千夏', tel:'09000000005',
        date:d(2), slot:'10:00〜11:00',
        detail:'自家製 味付けカルビ 500g（100gあたり¥498／概算¥2,490）\n手作りコロッケ（5個入） 1パック（1パックあたり¥450／¥450）',
        amount:2940, note:'', status:'未対応', estimated:true },
      { row:7, orderNo:no(0,3), at:at(0,12,2), name:'伊藤 大輔', tel:'09000000006',
        date:d(3), slot:'17:00〜18:00',
        detail:'若鶏 もも肉 1000g（100gあたり¥158／概算¥1,580）',
        amount:1580, note:'', status:'キャンセル', estimated:true }
    ];
  }

  /* ------------------------------------------------------------------
     ここから下は、本物のサーバー（コード.gs）と同じ計算をJavaScriptで書き直したもの。
     金額・受取可能日・グラム数の刻みの判定は、本物と同じ規則で動く。
     ------------------------------------------------------------------ */

  var store = Demo.store('seiniku', initialState);
  var S = store.data;

  function pad(n) { return ('0' + n).slice(-2); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function yen(n) { return '¥' + Number(n || 0).toLocaleString('ja-JP'); }
  function toInt(v, def) { var n = parseInt(String(v).replace(/[^\d-]/g, ''), 10); return isNaN(n) ? def : n; }
  function isSet(p) { return p.kind === SET; }

  var WEEK = { '日':0, '月':1, '火':2, '水':3, '木':4, '金':5, '土':6 };
  function closedDays() {
    return String(S.config['定休日'] || '').split(/[,、\s]+/).filter(Boolean)
      .map(function (w) { return WEEK[w.charAt(0)]; })
      .filter(function (n) { return n != null; });
  }

  function pickupSlots() {
    var out = [];
    String(S.config['受取時間帯'] || '').split(/[,、]/).forEach(function (raw) {
      var m = String(raw).match(/(\d{1,2})\s*[:：]\s*(\d{2})\s*[〜~ー\-–—]\s*(\d{1,2})\s*[:：]\s*(\d{2})/);
      if (!m) { if (String(raw).trim()) out.push(String(raw).trim()); return; }
      var from = Number(m[1]) * 60 + Number(m[2]);
      var to   = Number(m[3]) * 60 + Number(m[4]);
      if (!(to > from)) { out.push(String(raw).trim()); return; }
      for (var s = from; s < to; s += 60) {
        var e = Math.min(s + 60, to);
        out.push(pad(Math.floor(s / 60)) + ':' + pad(s % 60) + '〜' + pad(Math.floor(e / 60)) + ':' + pad(e % 60));
      }
    });
    var seen = {}, uniq = [];
    out.forEach(function (s) { if (!seen[s]) { seen[s] = 1; uniq.push(s); } });
    return uniq;
  }

  function pastDeadline(now) {
    var m = String(S.config['締切時刻'] || '18:00').match(/(\d{1,2}):(\d{2})/);
    if (!m) return false;
    return now.getHours() * 60 + now.getMinutes() >= Number(m[1]) * 60 + Number(m[2]);
  }

  function pickupRange() {
    var minDays = toInt(S.config['受取可能日_最短'], 1);
    var maxDays = toInt(S.config['受取可能日_最長'], 14);
    var closed  = closedDays();
    var now = new Date();

    var base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (pastDeadline(now)) base.setDate(base.getDate() + 1);

    var min = new Date(base); min.setDate(min.getDate() + minDays);
    var max = new Date(base); max.setDate(max.getDate() + maxDays);

    var days = [];
    for (var d = new Date(min); d <= max; d.setDate(d.getDate() + 1)) {
      if (closed.indexOf(d.getDay()) >= 0) continue;
      days.push(fmtDate(d));
    }
    return { min: fmtDate(min), max: fmtDate(max), days: days };
  }

  function accepting() { return String(S.config['受付'] || 'ON').toUpperCase() !== 'OFF'; }

  /* お客さん画面が受け取る形（本物の buildBootstrap_ と同じ） */
  function bootstrapForShop() {
    return {
      shop: { name: S.config['店名'], tel: S.config['電話番号'], addr: S.config['住所'] },
      openPolicy: false,
      accepting: accepting(),
      closedMessage: S.config['停止中メッセージ'],
      notice: S.config['お知らせ'],
      products: shopProducts(),
      timeSlots: pickupSlots(),
      maxGrams: toInt(S.config['1回の上限グラム'], 5000),
      maxSets: Math.max(1, toInt(S.config['1回の上限セット数'], 20)),
      closedDays: closedDays(),
      deadline: S.config['締切時刻'],
      pickup: pickupRange()
    };
  }

  function shopProducts() {
    return S.products.filter(function (p) {
      if (!p.onSale) return false;
      return isSet(p) ? p.setPrice > 0 : p.unitPrice > 0;
    }).sort(function (a, b) { return a.order - b.order; })
      .map(function (p) {
        var common = { id: p.name, name: p.name, kind: p.kind, desc: p.desc,
                       image: p.image, onSale: true, order: p.order };
        if (isSet(p)) { common.setPrice = p.setPrice; common.unitLabel = p.unitLabel; return common; }
        var step = Math.max(10, p.stepGrams);
        common.unitPrice = p.unitPrice;
        common.stepGrams = step;
        common.minGrams  = Math.ceil(Math.max(step, p.minGrams) / step) * step;
        return common;
      });
  }

  /* 管理画面が受け取る形（本物の adminData_ と同じ） */
  function adminData() {
    var now = new Date();
    var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return {
      token: 'demo-token',
      shopName: S.config['店名'],
      today: fmtDate(now),
      tomorrow: fmtDate(tomorrow),
      orders: S.orders.slice().reverse(),
      products: S.products.slice().sort(function (a, b) { return a.order - b.order; })
        .map(function (p) {
          var o = {};
          for (var k in p) o[k] = p[k];
          o.imageUrl = p.image;
          return o;
        }),
      settings: {
        受付: accepting() ? 'ON' : 'OFF',
        お知らせ: S.config['お知らせ'],
        通知先メール: S.config['通知先メール']
      },
      timeSlots: pickupSlots(),
      statuses: ['未対応', '確認済', '完了', 'キャンセル']
    };
  }

  function ok(data)   { return { ok: true, data: data }; }
  function ng(msg)    { return { ok: false, message: msg }; }
  function commit()   { store.commit(); }
  function nextRow()  {
    var max = 1;
    S.products.forEach(function (p) { if (p.row > max) max = p.row; });
    S.orders.forEach(function (o) { if (o.row > max) max = o.row; });
    return max + 1;
  }

  function newOrderNo() {
    var key = fmtDate(new Date()).replace(/-/g, '');
    S.seq[key] = (S.seq[key] || 0) + 1;
    // 見本の注文と番号がぶつからないよう、すでに使われている番号は飛ばす
    var used = {};
    S.orders.forEach(function (o) { used[o.orderNo] = 1; });
    var no;
    do {
      no = 'T-' + key + '-' + ('00' + S.seq[key]).slice(-3);
      if (used[no]) S.seq[key]++;
    } while (used[no]);
    return no;
  }

  function lineText(it) {
    if (it.kind === SET) {
      return it.name + ' ' + it.qty + it.unitLabel +
             '（1' + it.unitLabel + 'あたり' + yen(it.setPrice) + '／' + yen(it.amount) + '）';
    }
    return it.name + ' ' + it.grams + 'g（100gあたり' + yen(it.unitPrice) + '／概算' + yen(it.amount) + '）';
  }

  /* 商品と数量から金額を出す。画面から来た金額は使わない（本物と同じ考え方） */
  function priceItems(rawItems, opts) {
    opts = opts || {};
    var catalog = {};
    shopProducts().forEach(function (p) { catalog[p.id] = p; });

    var maxGrams = toInt(S.config['1回の上限グラム'], 5000);
    var maxSets  = Math.max(1, toInt(S.config['1回の上限セット数'], 20));
    var items = [], total = 0;

    for (var i = 0; i < rawItems.length; i++) {
      var it = rawItems[i] || {};
      var p  = catalog[String(it.id || '').trim()];
      if (!p) return { error: '商品の情報が変わったようです。画面を再読み込みして、もう一度お試しください。' };

      if (p.kind === SET) {
        var qty = toInt(it.qty, 0);
        if (qty < 1 || qty > maxSets) {
          return { error: '「' + p.name + '」の数をご確認ください（1〜' + maxSets + p.unitLabel + '）。' };
        }
        var amt = p.setPrice * qty;
        total += amt;
        items.push({ kind: SET, name: p.name, qty: qty, setPrice: p.setPrice,
                     unitLabel: p.unitLabel, amount: amt });
        continue;
      }

      var grams = toInt(it.grams, 0);
      // 店主が手で入れる注文は、刻みの縛りをかけない（本物も同じ扱い）
      var badStep = opts.loose ? (grams <= 0) : (grams < p.minGrams || grams % p.stepGrams !== 0);
      if (badStep || grams > maxGrams) {
        return { error: '「' + p.name + '」のグラム数をご確認ください。' };
      }
      var a = Math.round(p.unitPrice * grams / 100);
      total += a;
      items.push({ kind: WEIGHT, name: p.name, grams: grams, unitPrice: p.unitPrice, amount: a });
    }
    return { items: items, total: total };
  }

  function normalizeTel(v) {
    return String(v || '').replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
                          .replace(/[^\d]/g, '');
  }

  /* ---------- お客さん画面から呼ばれる ---------- */
  function submitOrder(payload) {
    if (!accepting()) return ng(S.config['停止中メッセージ']);
    if (payload && String(payload.hp || '').trim() !== '') {
      return ng('送信できませんでした。お手数ですがお電話にてご注文ください。');
    }

    var name = String((payload && payload.name) || '').trim();
    if (!name)            return ng('お名前をご入力ください。');
    if (name.length > 50) return ng('お名前が長すぎます。');

    var tel = normalizeTel(payload && payload.tel);
    if (!/^0\d{9,10}$/.test(tel)) {
      return ng('電話番号をご確認ください（ハイフンなしの10桁または11桁）。');
    }

    var dateText = String((payload && payload.date) || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return ng('お受け取り希望日をお選びください。');
    if (pickupRange().days.indexOf(dateText) < 0) {
      return ng('お受け取り希望日がお選びいただけない日です。画面を再読み込みして、選び直してください。');
    }

    var slots = pickupSlots();
    var slot  = String((payload && payload.slot) || '').trim();
    if (slots.length && slots.indexOf(slot) < 0) return ng('お受け取り時間帯をお選びください。');

    var raw = (payload && payload.items) || [];
    if (!raw.length)      return ng('ご注文の商品をお選びください。');
    if (raw.length > 20)  return ng('ご注文の品数が多すぎます。お電話にてご相談ください。');

    var priced = priceItems(raw);
    if (priced.error) return ng(priced.error);

    var estimated = priced.items.some(function (it) { return it.kind !== SET; });
    var now = new Date();
    var orderNo = newOrderNo();

    S.orders.push({
      row: nextRow(), orderNo: orderNo,
      at: fmtDate(now) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()),
      name: name, tel: tel, date: dateText, slot: slot,
      detail: priced.items.map(lineText).join('\n'),
      amount: priced.total, note: String((payload && payload.note) || '').trim().slice(0, 500),
      status: '未対応', estimated: estimated
    });
    commit();

    return { ok: true, orderNo: orderNo, total: priced.total, estimated: estimated,
             date: dateText, slot: slot, tel: S.config['電話番号'] };
  }

  /* ---------- 管理画面から呼ばれる ---------- */
  function findProduct(row, name) {
    for (var i = 0; i < S.products.length; i++) {
      if (S.products[i].row === row) return S.products[i];
    }
    for (var j = 0; j < S.products.length; j++) {
      if (S.products[j].name === name) return S.products[j];
    }
    return null;
  }

  var admin = {
    adminReload: function () { return ok(adminData()); },

    adminSetOrderStatus: function (row, orderNo, next) {
      var o = S.orders.filter(function (x) { return x.orderNo === orderNo; })[0];
      if (!o) return ng('その注文が見つかりませんでした。画面を最新にしてください。');
      o.status = next;
      commit();
      return ok(adminData());
    },

    adminAddOrder: function (body) {
      var name = String((body && body.name) || '').trim();
      if (!name) return ng('お名前を入れてください。');

      var priced = priceItems((body && body.items) || [], { loose: true });
      if (priced.error) return ng(priced.error);
      if (!priced.items.length) return ng('商品を1つ以上入れてください。');

      var now = new Date();
      var orderNo = newOrderNo();
      var estimated = priced.items.some(function (it) { return it.kind !== SET; });

      S.orders.push({
        row: nextRow(), orderNo: orderNo,
        at: fmtDate(now) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()),
        name: name, tel: normalizeTel(body && body.tel),
        date: String((body && body.date) || '').trim(),
        slot: String((body && body.slot) || '').trim(),
        detail: priced.items.map(lineText).join('\n'),
        amount: priced.total, note: String((body && body.note) || '').trim(),
        status: '確認済', estimated: estimated
      });
      commit();
      var d = adminData();
      d.orderNo = orderNo;
      return ok(d);
    },

    adminToggleProduct: function (row, name, onSale) {
      var p = findProduct(row, name);
      if (!p) return ng('その商品が見つかりませんでした。');
      p.onSale = !!onSale;
      commit();
      return ok(adminData());
    },

    adminSaveProduct: function (body) {
      var p = findProduct(body.row, body.originalName);
      if (!p) return ng('その商品が見つかりませんでした。画面を最新にしてください。');

      var newName = String(body.name || '').trim();
      if (!newName) return ng('商品名を入れてください。');
      var dup = S.products.filter(function (x) { return x !== p && x.name === newName; })[0];
      if (dup) return ng('同じ名前の商品がすでにあります。');

      p.name = newName;
      p.desc = String(body.desc || '').trim();
      p.kind = (body.kind === SET) ? SET : WEIGHT;

      if (p.kind === SET) {
        var sp = toInt(body.setPrice, 0);
        if (!(sp > 0)) return ng('1つあたりの値段を数字で入れてください。');
        p.setPrice = sp;
        p.unitLabel = String(body.unitLabel || '').trim() || 'セット';
      } else {
        var up = toInt(body.unitPrice, 0);
        if (!(up > 0)) return ng('100gあたりの値段を数字で入れてください。');
        p.unitPrice = up;
        p.minGrams  = Math.max(10, toInt(body.minGrams, 100));
        p.stepGrams = Math.max(10, toInt(body.stepGrams, 100));
      }
      commit();
      return ok(adminData());
    },

    adminDeleteProduct: function (body) {
      var i = S.products.map(function (p) { return p.row; }).indexOf(body.row);
      if (i < 0) return ng('その商品が見つかりませんでした。');
      S.products.splice(i, 1);
      commit();
      return ok(adminData());
    },

    adminAddProduct: function (body) {
      var name = String(body.name || '').trim();
      if (!name) return ng('商品名を入れてください。');
      if (S.products.filter(function (p) { return p.name === name; }).length) {
        return ng('同じ名前の商品がすでにあります。');
      }
      var maxOrder = 0;
      S.products.forEach(function (p) { if (p.order < 9000 && p.order > maxOrder) maxOrder = p.order; });

      var p = { row: nextRow(), order: maxOrder + 1, name: name, kind: (body.kind === SET) ? SET : WEIGHT,
                unitPrice: 0, setPrice: 0, unitLabel: 'セット', desc: String(body.desc || '').trim(),
                image: '', onSale: true, minGrams: 100, stepGrams: 100 };

      if (p.kind === SET) {
        p.setPrice = toInt(body.setPrice, 0);
        if (!(p.setPrice > 0)) return ng('1つあたりの値段を数字で入れてください。');
        p.unitLabel = String(body.unitLabel || '').trim() || 'セット';
      } else {
        p.unitPrice = toInt(body.unitPrice, 0);
        if (!(p.unitPrice > 0)) return ng('100gあたりの値段を数字で入れてください。');
        p.minGrams  = Math.max(10, toInt(body.minGrams, 100));
        p.stepGrams = Math.max(10, toInt(body.stepGrams, 100));
      }
      S.products.push(p);
      commit();
      var d = adminData();
      d.name = p.name;
      return ok(d);
    },

    adminUploadProductImage: function (body) {
      var p = findProduct(body.row, body.name);
      if (!p) return ng('その商品が見つかりませんでした。');
      // 本物はGoogleドライブの「商品写真」フォルダに保存し、そのURLをシートに書く。
      // 体験版では画像そのものをこのタブの中に持つだけ（外へは一切送っていない）。
      p.image = String(body.dataUrl || '');
      commit();
      return ok(adminData());
    },

    adminClearProductImage: function (body) {
      var p = findProduct(body.row, body.name);
      if (!p) return ng('その商品が見つかりませんでした。');
      p.image = '';
      commit();
      return ok(adminData());
    },

    adminSetProductImageUrl: function (body) {
      var p = findProduct(body.row, body.name);
      if (!p) return ng('その商品が見つかりませんでした。');
      var url = String(body.url || '').trim();
      if (url && !/^https:\/\//.test(url)) return ng('https:// で始まるURLを入れてください。');
      p.image = url;
      commit();
      return ok(adminData());
    },

    adminSaveSettings: function (patch) {
      for (var k in patch) {
        if (k === '受付') S.config['受付'] = (String(patch[k]).toUpperCase() === 'OFF') ? 'OFF' : 'ON';
        else S.config[k] = patch[k];
      }
      commit();
      return ok(adminData());
    }
  };

  /* ------------------------------------------------------------------
     google.script.run の偽物。
     本物と同じ書き方（withSuccessHandler(...).withFailureHandler(...).関数名(引数)）で
     呼べるようにしてあるので、画面側のコードは本番のまま動く。
     ------------------------------------------------------------------ */
  var SERVER = { submitOrder: submitOrder };
  Object.keys(admin).forEach(function (k) {
    // 管理画面は第1引数に合言葉（TOKEN）を付けて呼ぶので、そこだけ外して渡す
    SERVER[k] = function () {
      var args = [].slice.call(arguments, 1);
      return admin[k].apply(null, args);
    };
  });

  function makeRunner() {
    var onOk = null, onFail = null;
    var runner = {
      withSuccessHandler: function (fn) { onOk = fn; return runner; },
      withFailureHandler: function (fn) { onFail = fn; return runner; }
    };
    Object.keys(SERVER).forEach(function (name) {
      runner[name] = function () {
        var args = [].slice.call(arguments);
        // 本物は通信するので一瞬待つ。即座に返すと押した実感が無く、
        // 「保存中…」の表示も一度も見えないまま終わってしまう
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

  // テンプレートの <?!= bootstrap ?> に差し込まれる値
  window.DEMO_BOOTSTRAP = (window.DEMO_PAGE === 'admin') ? adminData() : bootstrapForShop();
})();

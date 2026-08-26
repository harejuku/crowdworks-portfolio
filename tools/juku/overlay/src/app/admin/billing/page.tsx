/* ------------------------------------------------------------------
   ⚠️ これは体験版だけの画面（build-juku.mjs が置いています）。本番のコードではない。

   本番の /admin/billing は「サーバー側で組み立てる画面」で、
   サーバーが Google スプレッドシートを読んでから HTML を返している。
   体験版はサーバーの無い静的なページなので、そのままでは書き出せない。
   そこでこの1枚だけ、**同じ見た目・同じ計算のまま、ブラウザの中で組み立てる形**に
   書き直してある。ここまでの体験版は「画面のコードを1行も直さない」で通してきたが、
   この画面だけは例外（本番のコードには触れていない）。

   本番と違うのは次の3つだけ：
     ①サーバー側のログイン確認（isAdminSession）が無い
       … 体験版は最初からログイン済みで始まるため。画面の SchoolGuard は本番と同じものが動く
     ②月の移動が Link（?month=…）ではなく画面の中の状態
       … 静的なページには「?month=」でサーバーに聞き直す先が無いため。見た目は同じ
     ③データの取得が useEffect の中
       … 出どころは本番と同じ getBillingData()／getSystemSettings()（src/utils/supabase/billing.ts）。
         シートを読む1関数（getSheets）だけを架空のシートに差し替えている

   **金額の計算は本番とまったく同じ関数**（src/utils/billing/calc.ts）が、
   ブラウザの中でそのまま走っている。表の中身も、LINEの文面も、上の合計カードも、
   本番と同じ式で出た数字。
   ------------------------------------------------------------------ */
'use client';
import { useEffect, useState } from 'react';
import { getBillingData, getSystemSettings, MESSAGE_TEMPLATE_CATALOG, type BillingRecord } from '@/src/utils/supabase/billing';
import { computeMonthlyTotals } from '@/src/utils/billing/calc';
import SchoolGuard from '@/src/components/SchoolGuard';
import AdminNav from '@/src/components/AdminNav';

function defaultMonth() {
  const today = new Date();
  const nextM = today.getMonth() + 2;
  return `${today.getFullYear() + (nextM > 12 ? 1 : 0)}-${String(nextM > 12 ? nextM - 12 : nextM).padStart(2, '0')}`;
}

export default function BillingDashboard() {
  const [targetMonth, setTargetMonth] = useState(defaultMonth);
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getBillingData(targetMonth), getSystemSettings()]).then(([r, s]) => {
      if (!alive) return;
      setRecords(r);
      setSettings(s);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [targetMonth]);

  // テンプレート設定の読込状況（シートの文面が使われているか、コード内の初期文面か）
  const catalogKeys = new Set(MESSAGE_TEMPLATE_CATALOG.map(i => i.key));
  const isFromSheet = (key: string) =>
    (settings[key] !== undefined && settings[key] !== '') ||
    (key === '紹介適用案内' && !!settings['特例_紹介適用案内']);
  const unusedKeys = Object.keys(settings).filter(k => !catalogKeys.has(k) && k !== '特例_紹介適用案内');

  // 集計は純粋関数（src/utils/billing/calc.ts）。本番・GASと同じ式が走る。
  const {
    subsidyTotal,
    bankTotal: bankTransferTotal,
    bankNet: bankTransferNet,
    cashTotal,
    wireTotal: wireTransferTotal,
    grandTotal,
    netTotal,
  } = computeMonthlyTotals(records);

  const [yearStr, monthStr] = targetMonth.split('-');
  const currentY = parseInt(yearStr);
  const currentM = parseInt(monthStr);
  const prevMonth = currentM === 1 ? `${currentY - 1}-12` : `${currentY}-${String(currentM - 1).padStart(2, '0')}`;
  const nextMonth = currentM === 12 ? `${currentY + 1}-01` : `${currentY}-${String(currentM + 1).padStart(2, '0')}`;

  return (
    <SchoolGuard>
    <div className="p-8 max-w-7xl mx-auto font-sans">
      <AdminNav />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">請求管理ダッシュボード</h1>

        <div className="flex gap-4 items-center bg-white p-2 rounded-lg shadow-sm border border-gray-200">
          <button onClick={() => setTargetMonth(prevMonth)} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded font-bold text-gray-600 text-sm">←先月</button>
          <span className="font-black text-lg text-teal-700">{targetMonth}</span>
          <button onClick={() => setTargetMonth(nextMonth)} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded font-bold text-gray-600 text-sm">次月→</button>
        </div>
      </div>

      {/* LINE文面テンプレートの設定状況（設定マスタとコードの突合結果を見える化） */}
      <details className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm">
        <summary className="cursor-pointer p-4 font-bold text-gray-700 text-sm select-none">📝 LINE文面テンプレートの設定状況（設定マスタで編集できます）</summary>
        <div className="px-4 pb-4">
          <p className="text-xs text-gray-500 font-bold mb-3">
            スプレッドシート「設定マスタ」のA列に下記の設定名、B列に文面を入れると自動生成テキストに反映されます。
            設定名の前後の空白や全角の｛｝は自動で吸収されます。プレースホルダーは送信時に実際の値へ置き換わります。
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-gray-100 text-gray-600">
                  <th className="p-2 text-left font-bold">設定名</th>
                  <th className="p-2 text-left font-bold">用途</th>
                  <th className="p-2 text-left font-bold">使えるプレースホルダー</th>
                  <th className="p-2 font-bold w-28">現在の文面</th>
                </tr>
              </thead>
              <tbody>
                {MESSAGE_TEMPLATE_CATALOG.map(item => (
                  <tr key={item.key} className="border-t border-gray-100">
                    <td className="p-2 font-bold text-gray-800 whitespace-nowrap">{item.key}</td>
                    <td className="p-2 text-gray-600">{item.label}</td>
                    <td className="p-2 text-gray-500">{item.placeholders.length > 0 ? item.placeholders.map(p => `{{${p}}}`).join(' ') : '—'}</td>
                    <td className="p-2 text-center">
                      {isFromSheet(item.key)
                        ? <span className="text-green-700 font-bold bg-green-50 px-2 py-0.5 rounded whitespace-nowrap">✅ シートの文面</span>
                        : <span className="text-gray-400 font-bold bg-gray-50 px-2 py-0.5 rounded whitespace-nowrap">初期文面を使用</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {unusedKeys.length > 0 && (
            <p className="text-[11px] text-yellow-800 bg-yellow-50 border border-yellow-200 rounded p-2.5 mt-3 font-bold leading-relaxed">
              ℹ️ 設定マスタにある次の設定名は、システムからは参照されていません：{unusedKeys.join('、')}
              <br/>（メモ用途であれば問題ありません。文面を変えたつもりが反映されない場合は、上の表の設定名と一致しているか確認してください）
            </p>
          )}
        </div>
      </details>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-pink-400">
          <h2 className="text-xs font-bold text-gray-500 mb-1">助成カード合計</h2>
          <p className="text-xl font-black text-gray-800">¥{subsidyTotal.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-400">
          <h2 className="text-xs font-bold text-gray-500 mb-1">口座引き落とし合計</h2>
          <p className="text-xl font-black text-gray-800">¥{bankTransferTotal.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-teal-500">
          <h2 className="text-xs font-bold text-gray-500 mb-1">口座引き落とし入金額</h2>
          <p className="text-xl font-black text-gray-800">¥{bankTransferNet.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-green-500">
          <h2 className="text-xs font-bold text-gray-500 mb-1">現金合計</h2>
          <p className="text-xl font-black text-gray-800">¥{cashTotal.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-purple-500">
          <h2 className="text-xs font-bold text-gray-500 mb-1">振込合計</h2>
          <p className="text-xl font-black text-gray-800">¥{wireTransferTotal.toLocaleString()}</p>
        </div>

        <div className="col-span-2 md:col-span-2 bg-gray-800 p-4 rounded-xl shadow-md border-l-4 border-gold text-white">
          <h2 className="text-xs font-bold text-gray-300 mb-1">全額合計(額面)</h2>
          <p className="text-3xl font-black text-white">¥{grandTotal.toLocaleString()}</p>
        </div>
        <div className="col-span-2 md:col-span-3 bg-teal-800 p-4 rounded-xl shadow-md border-l-4 border-teal-300 text-white">
          <h2 className="text-xs font-bold text-teal-200 mb-1">手残り(手数料差引後)合計</h2>
          <p className="text-3xl font-black text-white">¥{netTotal.toLocaleString()}</p>
        </div>
      </div>

      <div className="overflow-x-auto bg-white shadow-md rounded-lg">
        <table className="min-w-full text-sm text-left text-gray-600">
          <thead className="bg-gray-100 text-gray-700 uppercase font-semibold">
            <tr>
              <th className="px-6 py-4">ステータス</th>
              <th className="px-6 py-4">生徒名</th>
              <th className="px-6 py-4">支払方法</th>
              <th className="px-6 py-4">請求額(自動計算)</th>
              <th className="px-6 py-4">自動生成テキスト(LINE用)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500 font-bold">読み込み中…</td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500 font-bold">
                  {targetMonth}の請求データがスプレッドシートに見つかりません。
                </td>
              </tr>
            ) : (
              records.map((record) => (
                <tr key={record.invoiceId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${record.status === '未確定' ? 'bg-gray-100 text-gray-600' : (record.status === 'ご請求中' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')}`}>
                      {record.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {record.studentName}<br/>
                    <span className="text-xs text-gray-400">({record.grade})</span>
                  </td>
                  <td className="px-6 py-4">{record.paymentMethod}</td>
                  <td className="px-6 py-4 font-bold text-lg text-gray-900">
                    ¥{record.finalPrice.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-pre-wrap text-xs bg-gray-50 border border-gray-100 rounded my-2 mx-4 max-w-md">
                    {record.generatedMessage}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
    </SchoolGuard>
  );
}

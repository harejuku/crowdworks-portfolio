/* ------------------------------------------------------------------
   ⚠️ これは体験版だけの画面（build-juku.mjs が置いています）。本番のコードではない。

   本番の /admin/booking/week（授業枠の「週の表」・2026-10 に追加）は、
   サーバーが生徒アカウントの固定枠を集めて表にする画面で、静的なページには書き出せない。
   予約管理の画面に「🗓 週の表」の入口があるので、押しても行き止まり（404）に
   ならないよう、何の画面かだけを書いたこの1枚を置いている。
   ------------------------------------------------------------------ */
'use client';
import Link from 'next/link';
import SchoolGuard from '@/src/components/SchoolGuard';
import AdminHeader from '@/src/components/admin/AdminHeader';
import { buttonClass } from '@/src/components/admin/styles';

export default function WeekTableDemoPage() {
  return (
    <SchoolGuard>
      <div className="min-h-screen bg-gray-50 p-4 md:p-6 font-sans text-gray-900">
        <AdminHeader className="mb-6" />
        <div className="max-w-xl mx-auto bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-4">
          <h1 className="text-xl font-black m-0">🗓 週の表</h1>
          <p className="text-sm leading-relaxed text-gray-700 m-0">
            月〜金の 15〜22 時のマスに、毎週の固定枠で来る生徒の呼び名を並べて、A4 横で印刷できる表です。
            本番では、生徒アカウントの固定枠と受付設定（定員）からサーバーで組み立てています。
          </p>
          <p className="text-sm leading-relaxed text-gray-500 m-0">
            体験版はサーバーの無いページなので、この表は出せません。固定枠と予約は「予約一覧」で見られます。
          </p>
          <div>
            <Link href="/admin/booking" className={buttonClass()}>予約管理へ戻る</Link>
          </div>
        </div>
      </div>
    </SchoolGuard>
  );
}

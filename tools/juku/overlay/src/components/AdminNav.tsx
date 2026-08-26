// src/components/AdminNav.tsx
// 管理系ページ共通のナビゲーションバー
//
// ⚠️ これは体験版だけの差し替え（build-juku.mjs が上書きする）。本番のコードではない。
//    本番との違いは下の ITEMS だけで、押しても404になる行き先を外してある：
//      ・✍️ 手書き教材（/admin/materials）… 実物のスキャン画像に依存するので架空データで見せる意味が薄い
//      ・🎫 助成照合（/admin/subsidy）    … 外部サービスとの突合が要る
//      ・🦁 Super（/super-admin）         … 塾の運営者向けの内部画面。見学者に出す意味がない
//    この3つを体験版でも見せたくなったら、まず本番側をクライアント側で組み立てる形に
//    直す必要がある（ここでリンクだけ戻しても404のまま）。
//    💰 請求管理は 2026-08-26 に体験版へ戻した。実体は overlay/src/app/admin/billing/page.tsx
//    （本番のサーバー画面の代わりに置いた、体験版だけの1枚）。
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS: { href: string; label: string; exact?: boolean }[] = [
  { href: '/admin', label: '📚 教材管理', exact: true },
  { href: '/admin/booking', label: '📅 予約管理' },
  { href: '/admin/analytics', label: '👥 生徒' },
  { href: '/admin/billing', label: '💰 請求管理' },
  { href: '/teacher', label: '🖨️ プリント発行' },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="no-print bg-white rounded-2xl border border-gray-200 shadow-sm mb-4 overflow-x-auto">
      <div className="flex gap-1 p-1.5 min-w-max">
        {ITEMS.map(item => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                active
                  ? 'bg-teal text-white shadow-sm pointer-events-none'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-teal-700'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

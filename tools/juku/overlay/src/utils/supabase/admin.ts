// 体験版だけの差し替え。
// 本番のこれは「サーバー専用の鍵（service role）で Supabase につなぐ」もので、
// ブラウザからは絶対に使えない（鍵を渡してしまうため）。体験版はサーバーが無く、
// データもブラウザの中にしか無いので、偽Supabaseをそのまま返す。
//
// これが要るのは請求画面。本番の請求は「世帯（households）」を見て、ごきょうだいの
// 予約URL・請求URLを1本にまとめている。ここを空にすると、体験版だけ
// 「ごきょうだいの案内が2回出る」という本番には無い見え方になってしまう。
import { createDemoClient } from './client';

export function createAdminClient(): any {
  return createDemoClient();
}

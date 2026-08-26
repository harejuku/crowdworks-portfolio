// 体験版だけの差し替え。
// 本番はここで Supabase（本物のデータベース）につなぐが、体験版はブラウザの中の
// 偽データベースを返す。画面側のコードは `createClient()` を呼ぶだけなので、
// この1ファイルを入れ替えるだけで全画面が体験版になる。
import { createDemoClient } from './demo';

export function createClient(): any {
  return createDemoClient();
}

// service role 版（admin.ts）からも同じ偽Supabaseを使う
export { createDemoClient } from './demo';

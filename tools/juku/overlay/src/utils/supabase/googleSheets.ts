// 体験版だけの差し替え。
// 本番はここでサービスアカウントを使って Google スプレッドシートにつなぐが、
// 体験版はブラウザの中の架空のシート（demo/sheets.ts）を返す。
// 読み取り側（billing.ts）は googleapis を呼んでいるつもりのまま動く。
import { getDemoSheets } from './demo/sheets';

export async function getSheets(): Promise<any> {
  return getDemoSheets();
}

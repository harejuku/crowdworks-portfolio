/* ------------------------------------------------------------------
   体験版の「偽 Supabase」。createClient() がこれを返す。

   ・データの読み書き … engine.ts（PostgREST と同じ書き方を受け取る）
   ・データベース関数 … rpc.ts
   ・ログイン        … 下の auth（体験版は最初からログイン済みで始める）
   ・ファイル置き場   … storage（画像は使っていないので、押した事実だけ返す）

   保存先はブラウザの sessionStorage。タブを閉じれば消えるし、
   他の見学者には見えない。本番のデータベースには一切つながっていない。
   ------------------------------------------------------------------ */
import { makeFrom, type DemoStore, type Tables } from './engine';
import { buildSeed, SCHOOL, SCHOOL_NAME, ME } from './seed';
import { makeRpc } from './rpc';
import { installFetchShim } from './net';

const KEY = 'ssdemo:juku';

function load(): Tables | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

let memory: Tables | null = null;

function makeStore(): DemoStore {
  const initial = load() || buildSeed();
  const store: DemoStore = {
    tables: initial,
    commit() {
      memory = store.tables;
      try { sessionStorage.setItem(KEY, JSON.stringify(store.tables)); } catch (e) { /* 容量超過は諦める */ }
    },
  };
  memory = store.tables;
  return store;
}

let store: DemoStore | null = null;
function theStore(): DemoStore {
  if (!store) store = makeStore();
  return store;
}

/* ---------- ログイン ----------
   本物は塾IDとパスワードで Supabase にログインし、その鍵（JWT）に塾IDが入る。
   データベース側の関数はその塾IDだけを見て、他塾の行に触れないようにしている。
   体験版はブラウザの中だけなので、最初からログイン済みの状態で始める。 */
const DEMO_USER = {
  id: 'demo-user',
  email: `${SCHOOL}@example.com`,
  app_metadata: { school_id: SCHOOL },
  user_metadata: { school_id: SCHOOL },
};
const DEMO_SESSION = { access_token: 'demo', token_type: 'bearer', user: DEMO_USER };

function makeAuth() {
  let signedIn = true;
  const listeners: any[] = [];
  return {
    async getSession() { return { data: { session: signedIn ? DEMO_SESSION : null }, error: null }; },
    async getUser() { return { data: { user: signedIn ? DEMO_USER : null }, error: null }; },
    async signInWithPassword() {
      // 体験版はどの塾ID・パスワードでも通す（入口の形だけ見せるため）
      signedIn = true;
      listeners.forEach((fn) => fn('SIGNED_IN', DEMO_SESSION));
      return { data: { session: DEMO_SESSION, user: DEMO_USER }, error: null };
    },
    async signUp() { return { data: { session: DEMO_SESSION, user: DEMO_USER }, error: null }; },
    async updateUser() { return { data: { user: DEMO_USER }, error: null }; },
    async signOut() {
      signedIn = false;
      listeners.forEach((fn) => fn('SIGNED_OUT', null));
      return { error: null };
    },
    onAuthStateChange(fn: any) {
      listeners.push(fn);
      return { data: { subscription: { unsubscribe() {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      } } } };
    },
  };
}

function makeStorage() {
  return {
    from() {
      return {
        async list() { return { data: [], error: null }; },
        async upload() {
          return { data: null, error: { message: '体験版ではファイルの保存はできません（本番はSupabase Storageに入ります）' } };
        },
        async remove() { return { data: null, error: null }; },
        getPublicUrl(path: string) { return { data: { publicUrl: path } }; },
      };
    },
  };
}

let client: any = null;

/* 管理画面は「どの塾でログインしたか」をブラウザに覚えさせている（本物はログイン時に書く）。
   体験版は最初からログイン済みで始めるので、ここで同じものを入れておく。 */
function markSignedIn() {
  if (typeof window === 'undefined') return;
  try {
    if (!localStorage.getItem('admin_school_id')) {
      localStorage.setItem('admin_school_id', SCHOOL);
      localStorage.setItem('admin_school_name', SCHOOL_NAME);
    }
    if (!localStorage.getItem('demo_school_id')) {
      localStorage.setItem('demo_school_id', SCHOOL);
    }
    if (!localStorage.getItem('paper_checker')) {
      localStorage.setItem('paper_checker', '山下');
    }
  } catch (e) { /* 使えない設定のブラウザでは、画面から塾IDを入れてもらう */ }
}

export function createDemoClient() {
  if (client) return client;
  markSignedIn();
  const s = theStore();
  // 画面の一部が呼ぶ /api/… を、サーバー無しでも同じ答えが返るように横取りする
  installFetchShim(s, SCHOOL);
  client = {
    from: makeFrom(s),
    rpc: makeRpc(s, { school: SCHOOL }),
    auth: makeAuth(),
    storage: makeStorage(),
    schema() { return client; },   // Accept-Profile 相当。体験版では表を分けていない
    // 体験版であることを画面の外側（ラッパー）から知るための出口
    __demo: { school: SCHOOL, schoolName: SCHOOL_NAME, me: ME, tables: () => memory },
  };
  // 外側のラッパー（体験版の帯や画面切り替え）から中の状態を見るための出口
  if (typeof window !== 'undefined') (window as any).__demoClient = client;
  return client;
}

export function resetDemoData() {
  try { sessionStorage.removeItem(KEY); } catch (e) { /* 消せなくても再読込で戻る */ }
  store = null;
  client = null;
}

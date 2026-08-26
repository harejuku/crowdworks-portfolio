/* ------------------------------------------------------------------
   体験版のための「偽データベース」。

   本物は Supabase（PostgreSQL）に PostgREST 経由で問い合わせている。
   ここでは、その問い合わせの書き方（.from('表').select('*').eq(...) …）を
   そのまま受け取れる小さなエンジンをブラウザの中に作り、
   同じ形の答えを返している。だから画面側のコードは1行も変えていない。

   実装しているのは、この塾システムが実際に使っている演算子だけ：
     eq / neq / in / gt / gte / lt / lte / like / ilike / is / or / overlaps / contains
     order / limit / range / single / maybeSingle
     insert / update / upsert / delete / select({count})

   保存先はブラウザの sessionStorage（このタブの中だけ）。
   本番のデータベースには一切つながっていない。
   ------------------------------------------------------------------ */

export type Row = Record<string, any>;
export type Tables = Record<string, Row[]>;

/** upsert の突き合わせに使う列。本物のユニーク制約と同じ組み合わせにしてある */
const CONFLICT_KEYS: Record<string, string[]> = {
  schools: ['school_id'],
  student_directory: ['school_id', 'student_id'],
  student_progress: ['school_id', 'student_id', 'course_menu_id'],
  student_goals: ['school_id', 'student_id'],
  student_weekly_records: ['school_id', 'student_id', 'start_date'],
  student_word_mastery: ['school_id', 'student_id', 'course_menu_id', 'question_id'],
  student_mistakes: ['school_id', 'student_id', 'question_id'],
  booking_settings: ['school_id'],
  privacy_approvals: ['school_id', 'student_id'],
  lesson_prep_checks: ['booking_id'],
  paper_checks: ['school_id', 'student_id', 'course_menu_id'],
  course_group_items: ['group_id', 'course_id'],
};

type Filter = { kind: string; col: string; val: any };

function norm(v: any): any {
  if (v instanceof Date) return v.toISOString();
  return v;
}

/** PostgREST の比較。null と undefined を同じ「無い」として扱う */
function cmp(a: any, b: any): number {
  a = norm(a); b = norm(b);
  if (a == null && b == null) return 0;
  if (a == null) return 1;      // null は最後（nullsFirst は使っていない）
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function likeToRegExp(pattern: string, insensitive: boolean): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp('^' + escaped + '$', insensitive ? 'i' : '');
}

function asArray(v: any): any[] {
  return Array.isArray(v) ? v : (v == null ? [] : [v]);
}

function match(row: Row, f: Filter): boolean {
  const v = row[f.col];
  switch (f.kind) {
    case 'eq':   return norm(v) === norm(f.val) || String(norm(v)) === String(norm(f.val));
    case 'neq':  return !(norm(v) === norm(f.val) || String(norm(v)) === String(norm(f.val)));
    case 'in':   return asArray(f.val).some((x) => String(norm(v)) === String(norm(x)));
    case 'gt':   return cmp(v, f.val) > 0;
    case 'gte':  return cmp(v, f.val) >= 0;
    case 'lt':   return cmp(v, f.val) < 0;
    case 'lte':  return cmp(v, f.val) <= 0;
    case 'is':   return f.val === null ? v == null : v === f.val;
    case 'like': return typeof v === 'string' && likeToRegExp(f.val, false).test(v);
    case 'ilike':return typeof v === 'string' && likeToRegExp(f.val, true).test(v);
    // 配列同士。overlaps＝1つでも共通、contains＝相手を全部含む
    case 'overlaps': return asArray(v).some((x) => asArray(f.val).indexOf(x) >= 0);
    case 'contains': return asArray(f.val).every((x) => asArray(v).indexOf(x) >= 0);
    case 'or':   return orMatch(row, f.val);
    default:     return true;
  }
}

/** `question_text.ilike.%犬%,answer_text.ilike.%犬%` の形をそのまま解く */
function orMatch(row: Row, expr: string): boolean {
  return String(expr).split(',').some((part) => {
    const i1 = part.indexOf('.');
    const i2 = part.indexOf('.', i1 + 1);
    if (i1 < 0 || i2 < 0) return false;
    const col = part.slice(0, i1);
    const op = part.slice(i1 + 1, i2);
    const val = part.slice(i2 + 1);
    return match(row, { kind: op, col, val });
  });
}

export interface DemoStore {
  tables: Tables;
  commit(): void;
}

let uuidSeq = 0;
export function newId(): string {
  // 見た目だけ uuid に寄せる（本物の id は uuid。画面が id をキーに使うので形は合わせる）
  uuidSeq++;
  const h = (n: number, len: number) => n.toString(16).padStart(len, '0').slice(-len);
  return `demo${h(uuidSeq, 4)}-0000-4000-8000-${h(Date.now() % 0xffffffffffff, 12)}`;
}

class Query implements PromiseLike<any> {
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private limitN: number | null = null;
  private rangeVal: [number, number] | null = null;
  private mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: any = null;
  private upsertOpts: any = null;
  private wantSingle: 'single' | 'maybe' | null = null;
  private wantCount: string | null = null;
  private headOnly = false;
  private returnRows = false;

  constructor(private store: DemoStore, private table: string) {}

  private rows(): Row[] {
    if (!this.store.tables[this.table]) this.store.tables[this.table] = [];
    return this.store.tables[this.table];
  }

  select(_cols?: string, opts?: any) {
    // 列の指定は無視して行ごと返す。余分な列があっても画面側は困らないため。
    if (this.mode === 'select') {
      if (opts && opts.count) this.wantCount = opts.count;
      if (opts && opts.head) this.headOnly = true;
    } else {
      this.returnRows = true;   // insert/update/delete のあとに .select() を付けた形
    }
    return this;
  }

  insert(payload: any) { this.mode = 'insert'; this.payload = payload; return this; }
  update(payload: any) { this.mode = 'update'; this.payload = payload; return this; }
  delete() { this.mode = 'delete'; return this; }
  upsert(payload: any, opts?: any) { this.mode = 'upsert'; this.payload = payload; this.upsertOpts = opts; return this; }

  eq(col: string, val: any)  { this.filters.push({ kind: 'eq', col, val }); return this; }
  neq(col: string, val: any) { this.filters.push({ kind: 'neq', col, val }); return this; }
  in(col: string, val: any)  { this.filters.push({ kind: 'in', col, val }); return this; }
  gt(col: string, val: any)  { this.filters.push({ kind: 'gt', col, val }); return this; }
  gte(col: string, val: any) { this.filters.push({ kind: 'gte', col, val }); return this; }
  lt(col: string, val: any)  { this.filters.push({ kind: 'lt', col, val }); return this; }
  lte(col: string, val: any) { this.filters.push({ kind: 'lte', col, val }); return this; }
  is(col: string, val: any)  { this.filters.push({ kind: 'is', col, val }); return this; }
  like(col: string, val: any)  { this.filters.push({ kind: 'like', col, val }); return this; }
  ilike(col: string, val: any) { this.filters.push({ kind: 'ilike', col, val }); return this; }
  overlaps(col: string, val: any) { this.filters.push({ kind: 'overlaps', col, val }); return this; }
  contains(col: string, val: any) { this.filters.push({ kind: 'contains', col, val }); return this; }
  or(expr: string) { this.filters.push({ kind: 'or', col: '', val: expr }); return this; }
  not(col: string, op: string, val: any) { this.filters.push({ kind: 'not:' + op, col, val }); return this; }
  filter(col: string, op: string, val: any) { this.filters.push({ kind: op, col, val }); return this; }

  order(col: string, opts?: any) {
    this.orders.push({ col, asc: !opts || opts.ascending !== false });
    return this;
  }
  limit(n: number) { this.limitN = n; return this; }
  range(from: number, to: number) { this.rangeVal = [from, to]; return this; }
  single() { this.wantSingle = 'single'; return this; }
  maybeSingle() { this.wantSingle = 'maybe'; return this; }

  private hits(): Row[] {
    return this.rows().filter((r) => this.filters.every((f) => {
      if (f.kind.indexOf('not:') === 0) return !match(r, { ...f, kind: f.kind.slice(4) });
      return match(r, f);
    }));
  }

  private run(): { data: any; error: any; count?: number } {
    try {
      if (this.mode === 'insert' || this.mode === 'upsert') {
        const incoming = asArray(this.payload).map((r) => ({ ...r }));
        const keys = (this.upsertOpts && this.upsertOpts.onConflict)
          ? String(this.upsertOpts.onConflict).split(',').map((s) => s.trim())
          : CONFLICT_KEYS[this.table] || [];
        const out: Row[] = [];

        for (const r of incoming) {
          if (r.id == null && this.table !== 'course_menus') r.id = newId();
          if (r.created_at == null) r.created_at = new Date().toISOString();

          let existing: Row | undefined;
          if (this.mode === 'upsert' && keys.length) {
            existing = this.rows().find((x) => keys.every((k) => String(x[k]) === String(r[k])));
          }
          if (existing) { Object.assign(existing, r); out.push(existing); }
          else { this.rows().push(r); out.push(r); }
        }
        this.store.commit();
        return { data: this.returnRows ? (Array.isArray(this.payload) ? out : out[0]) : null, error: null };
      }

      if (this.mode === 'update') {
        const hit = this.hits();
        hit.forEach((r) => Object.assign(r, this.payload));
        this.store.commit();
        return { data: this.returnRows ? hit : null, error: null };
      }

      if (this.mode === 'delete') {
        const doomed = new Set(this.hits());
        const kept = this.rows().filter((r) => !doomed.has(r));
        this.store.tables[this.table] = kept;
        this.store.commit();
        return { data: this.returnRows ? Array.from(doomed) : null, error: null };
      }

      // select
      let rows = this.hits();
      const total = rows.length;

      for (let i = this.orders.length - 1; i >= 0; i--) {
        const o = this.orders[i];
        rows = rows.slice().sort((a, b) => (o.asc ? 1 : -1) * cmp(a[o.col], b[o.col]));
      }
      if (this.rangeVal) rows = rows.slice(this.rangeVal[0], this.rangeVal[1] + 1);
      if (this.limitN != null) rows = rows.slice(0, this.limitN);

      if (this.wantSingle) {
        if (rows.length === 0) {
          if (this.wantSingle === 'maybe') return { data: null, error: null };
          return { data: null, error: { message: 'Results contain 0 rows', code: 'PGRST116' } };
        }
        return { data: { ...rows[0] }, error: null };
      }

      const data = this.headOnly ? null : rows.map((r) => ({ ...r }));
      return this.wantCount ? { data, error: null, count: total } : { data, error: null };
    } catch (e: any) {
      return { data: null, error: { message: String(e && e.message ? e.message : e) } };
    }
  }

  // await されたときに初めて実行する（本物のクエリビルダーと同じ振る舞い）
  then(onOk?: any, onErr?: any) {
    // 通信しているように見せるための待ち。0だと「読み込み中」が一度も見えない
    return new Promise((resolve) => setTimeout(() => resolve(this.run()), 45)).then(onOk, onErr);
  }
}

export function makeFrom(store: DemoStore) {
  return (table: string) => new Query(store, table);
}

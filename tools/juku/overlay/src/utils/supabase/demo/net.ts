/* ------------------------------------------------------------------
   画面の一部は、データベースを直接見るのではなく自分のサーバー（/api/…）を呼んでいる。
   静的なページとして書き出した体験版にはサーバーが無いので、
   ブラウザの fetch を横取りして、同じ答えを返す。

   ・/api/clear-list       … コースをクリアした生徒の一覧（本番はサーバーの鍵で塾内横断に読む）
   ・/api/booking/generate … 固定枠から1か月ぶんの予約を作る（体験版でも実際に作る）
   ・/api/booking/notify   … 予約が入ったことの通知（体験版では飛ばさない）
   ・/api/booking/calendar-sync … Googleカレンダーへの反映（体験版ではつながない）
   ------------------------------------------------------------------ */
import type { DemoStore } from './engine';

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

function pad(n: number) { return ('0' + n).slice(-2); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function datesOfMonth(year: number, month: number): string[] {
  const out: string[] = [];
  const last = new Date(year, month, 0).getDate();
  for (let i = 1; i <= last; i++) out.push(`${year}-${pad(month)}-${pad(i)}`);
  return out;
}
function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function installFetchShim(store: DemoStore, school: string) {
  if (typeof window === 'undefined') return;
  const original = window.fetch.bind(window);
  if ((window as any).__demoFetchInstalled) return;
  (window as any).__demoFetchInstalled = true;

  window.fetch = async function (input: any, init?: any): Promise<Response> {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const path = String(url).split('?')[0];

    /* --- クリア者一覧 --- */
    if (path.endsWith('/api/clear-list')) {
      const q = new URLSearchParams(String(url).split('?')[1] || '');
      const courseId = Number(q.get('course_id'));
      const list = (store.tables['student_progress'] || [])
        .filter((r) => r.school_id === school && Number(r.course_menu_id) === courseId && r.is_cleared)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .slice(0, 100)
        .map((r) => ({ student_name: r.student_id, cleared_at: r.created_at }));
      return json({ list });
    }

    /* --- 固定枠から1か月ぶんの予約を作る --- */
    if (path.endsWith('/api/booking/generate')) {
      let body: any = {};
      try { body = JSON.parse(init && init.body ? init.body : '{}'); } catch (e) { /* 既定値で進む */ }
      const year = Number(body.year), month = Number(body.month);
      const result: any = {
        school_id: school, target: `${year}-${pad(month)}`,
        inserted: 0, skipped_existing: 0, skipped_closed: 0, skipped_special: 0,
        holidays_registered: 0, calendar: { skipped: true, created: 0, remaining: 0 },
      };

      const settings = (store.tables['booking_settings'] || [])
        .filter((s) => s.school_id === school)[0];
      if (!settings) { result.error = '予約受付設定が見つかりません'; return json({ ok: false, results: [result] }); }

      const weekly = settings.weekly_hours || {};
      const special = settings.special_days || {};
      const closures = (store.tables['booking_closures'] || []).filter((c) => c.school_id === school);
      const accounts = (store.tables['booking_accounts'] || [])
        .filter((a) => a.school_id === school && a.is_active);
      const bookings = store.tables['bookings'] || (store.tables['bookings'] = []);

      const taken = new Set(bookings
        .filter((b) => b.school_id === school && b.status === 'booked')
        .map((b) => `${b.account_id}_${b.date}_${b.time}`));

      const today = ymd(new Date());
      let n = bookings.length;

      datesOfMonth(year, month).forEach((date) => {
        accounts.forEach((acc) => {
          const slots = Array.isArray(acc.fixed_slots) ? acc.fixed_slots : [];
          slots.forEach((slot: any) => {
            const hours = weekly[String(slot.weekday)] || [];
            if (hours.indexOf(slot.time) < 0) return;      // 受付時間外の固定枠は作らない
            if (weekdayOf(date) !== slot.weekday) return;
            if (date < today) return;                       // 過去日は作らない
            // 特別開校日（ふだん休みの日を開けた日）に固定枠は作らない。
            // 来たい生徒が自分で取るか、塾が手で入れる決まりにしてある
            if (special[date]) { result.skipped_special++; return; }
            const closed = closures.some((c) => c.date === date && (c.time == null || c.time === slot.time));
            if (closed) { result.skipped_closed++; return; }

            const key = `${acc.id}_${date}_${slot.time}`;
            if (taken.has(key)) { result.skipped_existing++; return; }
            taken.add(key);
            bookings.push({
              id: `gen${n++}`, school_id: school, account_id: acc.id, date, time: slot.time,
              status: 'booked', source: 'fixed', created_at: new Date().toISOString(), cancelled_at: null,
            });
            result.inserted++;
          });
        });
      });

      store.commit();
      return json({ ok: true, results: [result] });
    }

    /* --- 予約が入ったことの通知 --- */
    if (path.endsWith('/api/booking/notify')) {
      return json({ ok: true, skipped: 'demo' });
    }

    /* --- Googleカレンダーへの反映 --- */
    if (path.endsWith('/api/booking/calendar-sync')) {
      return json({
        error: '体験版ではGoogleカレンダーにつないでいません。'
             + '本番では、この画面の予約とカレンダーの予定を突き合わせて、'
             + '足りない予定を追加し、取り消された予定を削除します。',
      }, 400);
    }

    return original(input, init);
  } as any;
}

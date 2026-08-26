/* ------------------------------------------------------------------
   データベース側の関数（RPC）を、同じ答えを返すように JavaScript で書き直したもの。

   本物はこれらを PostgreSQL の関数として持っていて、
   「どの塾の生徒か」をログイン情報から導いて自分の行だけを触る、という守りを
   データベースの側でかけている（画面のコードを直しても抜けられない作り）。
   体験版はブラウザの中だけで動くので守りの意味は無いが、
   **返す値の形と計算のしかたは本物と同じ**にしてある。
   ------------------------------------------------------------------ */
import type { DemoStore, Row } from './engine';
import { SCHOOL } from './seed';

const day = 24 * 60 * 60 * 1000;

function rows(store: DemoStore, t: string): Row[] {
  if (!store.tables[t]) store.tables[t] = [];
  return store.tables[t];
}
function today() { return new Date(); }
function isoDate(d: Date) {
  const p = (n: number) => ('0' + n).slice(-2);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function nextId(list: Row[]): number {
  return list.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
}

export function makeRpc(store: DemoStore, session: { school: string }) {
  const T = (t: string) => rows(store, t);
  const mine = (t: string, studentId: string) =>
    T(t).filter((r) => r.school_id === session.school && r.student_id === studentId);

  const fns: Record<string, (a: any) => any> = {

    /* ---------- 入口 ---------- */
    is_admin: () => true,
    session_school_id: () => session.school,

    student_read_login: (a) => {
      const name = String(a.p_name || '').replace(/\s+/g, '');
      const dir = T('student_directory').filter((r) => r.school_id === session.school);
      if (dir.some((r) => r.student_id === name)) return [{ status: 'ok', student_id: name }];
      // 別名タグ（alias_◯◯）でも引ける。2人に同じ別名が付いていたら決められないので弾く
      const alias = 'alias_' + name;
      const hit = dir.filter((r) => (r.tags || []).indexOf(alias) >= 0);
      if (hit.length > 1) return [{ status: 'alias_ambiguous', student_id: null }];
      if (hit.length === 1) return [{ status: 'ok', student_id: hit[0].student_id }];
      return [{ status: 'not_found', student_id: null }];
    },

    /* ---------- 持ち点・ログインボーナス ---------- */
    student_read_points: (a) => {
      const r = mine('student_directory', a.p_student_id)[0];
      return r ? { points: r.points || 0, granted: false } : null;
    },

    student_write_login_bonus: (a) => {
      const r = mine('student_directory', a.p_student_id)[0];
      if (!r) return null;
      const last = r.last_login_bonus_at ? new Date(r.last_login_bonus_at) : null;
      const same = last && isoDate(last) === isoDate(today());
      if (same) return { points: r.points || 0, granted: false };
      r.points = (r.points || 0) + 1;
      r.last_login_bonus_at = new Date().toISOString();
      store.commit();
      return { points: r.points, granted: true };
    },

    /* ---------- 進み具合 ---------- */
    student_read_progress: (a) =>
      mine('student_progress', a.p_student_id)
        .filter((r) => r.is_cleared === true)
        .map((r) => ({
          course_menu_id: r.course_menu_id, created_at: r.created_at,
          clear_time: r.clear_time, miss_count: r.miss_count,
          clears_since_unlock: r.clears_since_unlock,
        })),

    /**
     * 1回ぶんの結果を書く。習得モードは「出題語を全部おぼえたか」を
     * ここで突き合わせてクリア判定する（画面からの申告は信用しない）。
     */
    student_write_progress: (a) => {
      const sid = a.p_student_id;
      const cid = Number(a.p_course_menu_id);
      const list = T('student_progress');
      const prog = list.filter((r) => r.school_id === session.school && r.student_id === sid
                                   && Number(r.course_menu_id) === cid)[0];

      if (!a.p_win) {
        // 失敗した回は連続クリア数を0に戻すだけ。未クリアのコースに行は作らない
        if (prog) { prog.clears_since_unlock = 0; store.commit(); }
        return { clears_since_unlock: 0, cleared: false };
      }

      let allOk = true;
      if (a.p_is_mastery) {
        const course = T('course_menus').filter((c) => c.school_id === session.school && c.id === cid)[0];
        const fixed: string[] = (course && course.fixed_question_ids) || [];
        const mastered = T('student_word_mastery').filter(
          (w) => w.school_id === session.school && w.student_id === sid
              && Number(w.course_menu_id) === cid && w.is_mastered);
        if (fixed.length > 0) {
          const set = new Set(mastered.map((w) => String(w.question_id)));
          allOk = fixed.every((id) => set.has(String(id)));
        } else {
          allOk = mastered.length >= (a.p_played_count || 0);
        }
      }

      // 一度クリアしたら解放は維持する（あとで1語が未習得に戻っても再ロックしない）
      const cleared = allOk || !!(prog && prog.is_cleared);

      // ベストタイム・ベストミスは悪化しても既存を残す（同着も既存を優先）
      let bestTime = a.p_final_time, bestMiss = a.p_final_miss;
      if (prog && prog.clear_time != null && Number(prog.clear_time) <= Number(a.p_final_time)) {
        bestTime = prog.clear_time;
        bestMiss = prog.miss_count != null ? prog.miss_count : a.p_final_miss;
      }
      const clears = ((prog && prog.clears_since_unlock) || 0) + 1;

      if (prog) {
        Object.assign(prog, { is_cleared: cleared, clear_time: bestTime,
                              miss_count: bestMiss, clears_since_unlock: clears });
      } else {
        list.push({ id: nextId(list), school_id: session.school, student_id: sid,
                    course_menu_id: cid, is_cleared: cleared, clear_time: bestTime,
                    miss_count: bestMiss, clears_since_unlock: clears,
                    created_at: new Date().toISOString() });
      }
      store.commit();
      return { clears_since_unlock: clears, cleared };
    },

    student_write_mastery_cleared: (a) => {
      const list = T('student_progress');
      const cid = Number(a.p_course_menu_id);
      const prog = list.filter((r) => r.school_id === session.school
                                   && r.student_id === a.p_student_id
                                   && Number(r.course_menu_id) === cid)[0];
      if (prog) { prog.is_cleared = true; }
      else {
        list.push({ id: nextId(list), school_id: session.school, student_id: a.p_student_id,
                    course_menu_id: cid, is_cleared: true, clear_time: null, miss_count: null,
                    clears_since_unlock: 1, created_at: new Date().toISOString() });
      }
      store.commit();
      return 'ok';
    },

    /* ---------- 順位表 ---------- */
    student_write_ranking: (a) => {
      if (a.p_mode_id === 'weakness') return 'skipped';   // 弱点特訓は順位表に載せない
      const list = T('rankings');
      const same = list.filter((r) => r.school_id === session.school
                                   && r.mode_id === a.p_mode_id
                                   && r.student_name === a.p_student_id);
      const best = same.reduce((m, r) => Math.min(m, Number(r.clear_time)), Infinity);
      if (same.length && Number(a.p_clear_time) >= best) return 'kept';   // 自己ベスト未更新

      // 自分の行だけを消してから入れ直す（塾ぜんぶを消せないようにするのが本物の要点）
      store.tables['rankings'] = list.filter((r) => !(r.school_id === session.school
                                                   && r.mode_id === a.p_mode_id
                                                   && r.student_name === a.p_student_id));
      store.tables['rankings'].push({
        id: nextId(list), school_id: session.school, mode_id: a.p_mode_id,
        student_name: a.p_student_id, clear_time: a.p_clear_time,
        miss_count: a.p_miss_count, created_at: new Date().toISOString(),
      });
      store.commit();
      return 'ok';
    },

    /* ---------- まちがえた記録 ---------- */
    student_write_mistake: (a) => {
      const list = T('student_mistakes');
      const hit = list.filter((r) => r.school_id === session.school
                                  && r.student_id === a.p_student_id
                                  && String(r.question_id) === String(a.p_question_id))[0];
      if (hit) {
        hit.mistake_count = (hit.mistake_count || 0) + 1;
        hit.last_wrong_answer = a.p_answer || '';
        hit.is_cleared = false;
        hit.created_at = new Date().toISOString();
      } else {
        list.push({ id: nextId(list), school_id: session.school, student_id: a.p_student_id,
                    question_id: a.p_question_id, mistake_count: 1, wrong_history: [],
                    last_wrong_answer: a.p_answer || '', is_cleared: false,
                    created_at: new Date().toISOString() });
      }
      store.commit();
      return 'ok';
    },

    student_write_mistake_cleared: (a) => {
      mine('student_mistakes', a.p_student_id)
        .filter((r) => String(r.question_id) === String(a.p_question_id))
        .forEach((r) => { r.is_cleared = true; });
      store.commit();
      return 'ok';
    },

    /** 復習ボックス。まちがえた扱いにはせず、出題対象にだけ入れる */
    student_write_review_box: (a) => {
      const list = T('student_mistakes');
      const hit = list.filter((r) => r.school_id === session.school
                                  && r.student_id === a.p_student_id
                                  && String(r.question_id) === String(a.p_question_id))[0];
      if (hit) { hit.is_cleared = false; hit.created_at = new Date().toISOString(); }
      else {
        list.push({ id: nextId(list), school_id: session.school, student_id: a.p_student_id,
                    question_id: a.p_question_id, mistake_count: 0, wrong_history: [],
                    last_wrong_answer: '', is_cleared: false,
                    created_at: new Date().toISOString() });
      }
      store.commit();
      return 'ok';
    },

    student_read_weakness_ids: (a) => {
      const limit = a.p_limit == null ? 500 : a.p_limit;
      const list = mine('student_mistakes', a.p_student_id)
        .filter((r) => r.is_cleared === false)
        .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))
        .slice(0, Math.max(limit, 0));
      const seen = new Set<string>();
      const out: string[] = [];
      list.forEach((r) => {
        const id = String(r.question_id);
        if (!seen.has(id)) { seen.add(id); out.push(id); }
      });
      return out;
    },

    /* ---------- 英単語の習得 ---------- */
    student_read_word_mastery: (a) => {
      const list = T('student_word_mastery').filter(
        (w) => w.school_id === session.school && w.student_id === a.p_student_id && w.is_mastered
            && (a.p_course_menu_id == null || Number(w.course_menu_id) === Number(a.p_course_menu_id)));
      const byCourse: Record<string, string[]> = {};
      list.forEach((w) => {
        const k = String(w.course_menu_id);
        (byCourse[k] = byCourse[k] || []).push(String(w.question_id));
      });
      return Object.keys(byCourse).map((k) => ({
        course_menu_id: Number(k),
        question_ids: byCourse[k].slice().sort(),
      }));
    },

    /**
     * 速答が続いた語を「習得」にする。
     * しきい値（何秒以内・何回連続）はコース側の設定から画面が渡してくる。
     */
    student_write_word_mastery: (a) => {
      const list = T('student_word_mastery');
      const hit = list.filter((w) => w.school_id === session.school
                                  && w.student_id === a.p_student_id
                                  && Number(w.course_menu_id) === Number(a.p_course_menu_id)
                                  && String(w.question_id) === String(a.p_question_id))[0];
      const streakNeeded = Math.max(1, Number(a.p_threshold) || 2);
      if (hit) {
        hit.fast_streak = a.p_is_fast ? (hit.fast_streak || 0) + 1 : 0;
        hit.last_time_ms = a.p_elapsed_ms;
        hit.updated_at = new Date().toISOString();
        if (hit.fast_streak >= streakNeeded) hit.is_mastered = true;
      } else {
        const streak = a.p_is_fast ? 1 : 0;
        list.push({ school_id: session.school, student_id: a.p_student_id,
                    course_menu_id: Number(a.p_course_menu_id), question_id: String(a.p_question_id),
                    is_mastered: streak >= streakNeeded, fast_streak: streak,
                    last_time_ms: a.p_elapsed_ms, updated_at: new Date().toISOString() });
      }
      store.commit();
      return 'ok';
    },

    /* ---------- 目標 ---------- */
    student_read_goals: (a) => {
      const g = mine('student_goals', a.p_student_id)[0];
      const w = mine('student_weekly_records', a.p_student_id)
        .filter((r) => r.start_date === a.p_date_key)[0];
      return {
        long: (g && g.long_term_goal) || '',
        weekly: (w && w.goal_text) || '',
        result: (w && w.result_text) || '',
      };
    },

    student_write_goals: (a) => {
      const goals = T('student_goals');
      const g = goals.filter((r) => r.school_id === session.school && r.student_id === a.p_student_id)[0];
      if (g) g.long_term_goal = a.p_long;
      else goals.push({ id: nextId(goals), school_id: session.school, student_id: a.p_student_id,
                        long_term_goal: a.p_long, updated_at: new Date().toISOString() });

      const wk = T('student_weekly_records');
      const w = wk.filter((r) => r.school_id === session.school && r.student_id === a.p_student_id
                              && r.start_date === a.p_target_week)[0];
      if (w) { w.goal_text = a.p_weekly; w.result_text = a.p_result; w.updated_at = new Date().toISOString(); }
      else wk.push({ id: nextId(wk), school_id: session.school, student_id: a.p_student_id,
                     start_date: a.p_target_week, goal_text: a.p_weekly, result_text: a.p_result,
                     updated_at: new Date().toISOString() });
      store.commit();
      return 'ok';
    },

    student_write_exam_result: (a) => {
      if (!mine('student_directory', a.p_student_id).length) return 'not_found';
      const list = T('exam_results');
      list.push({ id: nextId(list), school_id: session.school, student_id: a.p_student_id,
                  subject_mode: a.p_subject_mode, clear_time: a.p_clear_time,
                  miss_count: a.p_miss_count, is_cleared: a.p_is_cleared,
                  created_at: new Date().toISOString(), wrong_details: a.p_wrong_details || [] });
      store.commit();
      return 'ok';
    },

    /* ---------- 管理者が見る集計 ---------- */
    admin_read_student_activity: (a) => {
      const ex = T('exam_results').filter((r) => r.school_id === a.p_school_id
                                              && r.student_id === a.p_student_id);
      const now = Date.now();
      const within = (n: number) => ex.filter((r) => now - new Date(r.created_at).getTime() <= n * day);
      const in30 = within(30);
      const days = new Set(in30.map((r) => String(r.created_at).slice(0, 10)));
      const last = ex.slice().sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))[0];

      const byCourse: Record<string, { attempts: number; last_at: string }> = {};
      ex.forEach((r) => {
        const m = String(r.subject_mode).match(/^dyn_(\d+)/);
        if (!m) return;
        const k = m[1];
        if (!byCourse[k]) byCourse[k] = { attempts: 0, last_at: r.created_at };
        byCourse[k].attempts++;
        if (String(r.created_at) > String(byCourse[k].last_at)) byCourse[k].last_at = r.created_at;
      });

      return {
        total_plays: ex.length,
        plays7: within(7).length,
        plays30: in30.length,
        cleared30: in30.filter((r) => r.is_cleared).length,
        days30: days.size,
        last_at: last ? last.created_at : null,
        last_subject_mode: last ? last.subject_mode : null,
        last_cleared: last ? !!last.is_cleared : false,
        courses: Object.keys(byCourse)
          .map((k) => ({ course_id: Number(k), attempts: byCourse[k].attempts, last_at: byCourse[k].last_at }))
          .sort((x, y) => y.attempts - x.attempts || x.course_id - y.course_id),
      };
    },

    /** まちがえた問題についているタグを数える。塾ぜんぶ／生徒1人を切り替えられる */
    admin_read_mistake_tag_counts: (a) => {
      const ms = T('student_mistakes').filter((m) => m.school_id === a.p_school_id
                                    && (a.p_student_id == null || m.student_id === a.p_student_id));
      const qids = new Set(ms.map((m) => String(m.question_id)));
      const counts: Record<string, number> = {};
      T('questions').forEach((q) => {
        if (q.is_deleted) return;
        if (q.school_id !== a.p_school_id && q.school_id !== 'common') return;
        if (!qids.has(String(q.id))) return;
        (q.tags || []).forEach((t: string) => {
          if (t.slice(0, 9) === 'ans_limit' || t.slice(0, 6) === 'style_') return;
          counts[t] = (counts[t] || 0) + 1;
        });
      });
      return Object.keys(counts)
        .map((t) => ({ tag: t, cnt: counts[t] }))
        .sort((x, y) => y.cnt - x.cnt || x.tag.localeCompare(y.tag));
    },

    /** コースごと・生徒ごとの習得語数。出題語に入っている語だけ数える */
    admin_read_mastery_summary: (a) => {
      const out: Record<string, number> = {};
      T('student_word_mastery').forEach((w) => {
        if (w.school_id !== a.p_school_id || !w.is_mastered) return;
        const cm = T('course_menus').filter((c) => c.school_id === w.school_id
                                                && Number(c.id) === Number(w.course_menu_id))[0];
        const fixed: string[] = (cm && cm.fixed_question_ids) || [];
        if (fixed.length > 0 && fixed.map(String).indexOf(String(w.question_id)) < 0) return;
        const k = `${w.course_menu_id} ${w.student_id}`;
        out[k] = (out[k] || 0) + 1;
      });
      return Object.keys(out).map((k) => {
        const [cid, sid] = k.split(' ');
        return { course_menu_id: Number(cid), student_id: sid, mastered: out[k] };
      }).sort((x, y) => x.course_menu_id - y.course_menu_id || y.mastered - x.mastered);
    },

    /** クラス共通の弱点。何人が引っかかっているかの順に並べる */
    admin_read_group_mistakes: (a) => {
      const ids: string[] = a.p_student_ids || [];
      const agg: Record<string, { students: Set<string>; total: number }> = {};
      T('student_mistakes').forEach((m) => {
        if (m.school_id !== a.p_school_id) return;
        if (ids.indexOf(m.student_id) < 0) return;
        if (m.is_cleared !== false) return;
        const k = String(m.question_id);
        if (!agg[k]) agg[k] = { students: new Set(), total: 0 };
        agg[k].students.add(m.student_id);
        agg[k].total += (m.mistake_count || 0) === 0 ? 1 : m.mistake_count;
      });
      return Object.keys(agg).map((qid) => {
        const q = T('questions').filter((x) => String(x.id) === qid)[0];
        if (!q || q.is_deleted) return null;
        return {
          question_id: qid, question_text: q.question_text, answer_text: q.answer_text,
          tags: q.tags || [], student_count: agg[qid].students.size, total_mistakes: agg[qid].total,
        };
      }).filter(Boolean)
        .sort((x: any, y: any) => y.student_count - x.student_count || y.total_mistakes - x.total_mistakes);
    },

    /* 保護者向けの画面は体験版に入れていないので、空で返す */
    get_household: () => null,
    get_household_students: () => [],
  };

  return function rpc(name: string, args?: any) {
    return new Promise((resolve) => setTimeout(() => {
      const fn = fns[name];
      if (!fn) {
        console.warn('[体験版] 未実装のRPC:', name);
        resolve({ data: null, error: { message: 'function not found: ' + name } });
        return;
      }
      try { resolve({ data: fn(args || {}), error: null }); }
      catch (e: any) { resolve({ data: null, error: { message: String(e && e.message ? e.message : e) } }); }
    }, 45));
  };
}

export { SCHOOL };

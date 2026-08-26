/* ------------------------------------------------------------------
   架空の塾「そら塾」を丸ごと作る。

   ここで作るのは表の中身だけで、画面のコードは本番のまま。
   生徒名・コース・成績・予約はすべて架空で、実在の塾のデータは含まない。

   数字は「開くたびに変わらない」ように、種を固定した擬似乱数で作っている
   （毎回ちがう数字が出ると、説明しながら見せるときに困るため）。
   ------------------------------------------------------------------ */
import { ALL, EDO, CHIRI, KAGAKU, SUUGAKU, KOKUGO, EITANGO, type Q } from './questions';
import type { Tables, Row } from './engine';
// 世帯（ごきょうだい）は請求と地続きなので、請求側の架空データと同じ場所で持つ
import { HOUSEHOLDS } from './sheets';

export const SCHOOL = 'demo';
export const SCHOOL_NAME = 'そら塾';
/** 体験版で最初に入る生徒。管理画面の「見る側」もこの子を初期表示にする */
export const ME = 'たいち';

function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
const rand = rng(20260826);

function pad(n: number) { return ('0' + n).slice(-2); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function iso(n: number, h = 18, m = 30) {
  const d = daysAgo(n); d.setHours(h, m, 0, 0); return d.toISOString();
}
/** その週の月曜（student_weekly_records のキー） */
function mondayKey(offsetWeeks = 0) {
  const d = new Date();
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff - offsetWeeks * 7);
  return ymd(d);
}

const STUDENTS: { name: string; grade: string; points: number }[] = [
  { name: 'たいち',   grade: '中2', points: 42 },
  { name: 'ゆい',     grade: '中2', points: 55 },
  { name: 'そうた',   grade: '中1', points: 18 },
  { name: 'みなと',   grade: '中3', points: 63 },
  { name: 'あかり',   grade: '中3', points: 37 },
  { name: 'はると',   grade: '中1', points: 12 },
  { name: 'のぞみ',   grade: '中2', points: 29 },
  { name: 'けんと',   grade: '中2', points: 8  },
];

/** 問題1件ぶんの行を作る。id は決め打ちで作り、コースの出題順に使う */
function qRow(q: Q, i: number): Row {
  const [text, ans, tags] = q;
  const subject = tags[0].replace('教科_', '');
  const subjectId: Record<string, string> = {
    国語: 'jp', 数学: 'math', 理科: 'sci', 社会: 'soc', 英語: 'eng',
  };
  return {
    id: `q${pad(Math.floor(i / 100))}${pad(i % 100)}-0000-4000-8000-000000000000`,
    school_id: SCHOOL,
    subject_id: subjectId[subject] || 'other',
    type: 'sel',
    question_text: text,
    question_speech_text: null,
    cloze_text: null,
    answer_text: ans,
    answer_speech_text: null,
    wrong_options: [],
    tags,
    slide_note: null,
    image_url: null,
    is_active: true,
    difficulty_level: 1,
    // 取込順＝出題順。1件ずつずらして入れる（本物も取込時に連番で入る）
    created_at: new Date(Date.UTC(2026, 3, 1, 0, 0, i)).toISOString(),
    is_deleted: false,
    table_data: null,
    group_label: null,
  };
}

export function buildSeed(): Tables {
  const questions = ALL.map(qRow);
  const idOf = (list: Q[]) => list.map((q) => questions[ALL.indexOf(q)].id);

  const edoIds = idOf(EDO);
  const eigoIds = idOf(EITANGO);
  const kagakuIds = idOf(KAGAKU);

  /* ---------- コース ----------
     「江戸時代」は4段構成（①順4択→②順並替→③乱4択→④乱並替）。
     出題する問題を id で固定してあるので、あとから問題を足しても中身が変わらない。 */
  const stage = (id: number, n: string, mode: string, oc: string, order: string, sort: number) => ({
    id,
    school_id: SCHOOL,
    title: `江戸時代 ${n}`,
    category: 'standard',
    target_tags: ['教科_社会', '中2', '江戸時代'],
    deprecated_target_student_id: null,
    youtube_url: null,
    filter_keyword: null,
    excluded_question_ids: [],
    question_limit: 12,
    clear_time_limit: mode === 'sorting' ? 240 : 120,
    max_miss_count: 3,
    challenge_limit_per_day: null,
    clear_deadline: null,
    prerequisite_course_ids: [],
    quiz_settings: {
      mode, option_count: oc, order_mode: order,
      source_tags: ['教科_社会', '中2', '江戸時代'],
      ranking_display: 'time',
    },
    is_active: true,
    created_at: new Date(Date.UTC(2026, 4, 1, 0, 0, sort)).toISOString(),
    target_student_ids: [],
    fixed_question_ids: edoIds,
    is_deleted: false,
    lock_after_clears: 0,
  });

  const course_menus: Row[] = [
    stage(101, '① 順番どおり・4択', 'selection', '4', 'sequential', 1),
    stage(102, '② 順番どおり・並べかえ', 'sorting', '+2', 'sequential', 2),
    stage(103, '③ バラバラ・4択', 'selection', '4', 'random', 3),
    stage(104, '④ バラバラ・並べかえ', 'sorting', '+4', 'random', 4),

    {
      id: 111, school_id: SCHOOL, title: '英単語 Stage1（習得モード）',
      category: 'standard', target_tags: ['教科_英語', 'Stage1'],
      deprecated_target_student_id: null, youtube_url: null, filter_keyword: null,
      excluded_question_ids: [], question_limit: 10, clear_time_limit: 180, max_miss_count: 5,
      challenge_limit_per_day: null, clear_deadline: null, prerequisite_course_ids: [],
      quiz_settings: {
        mode: 'selection', option_count: '4', mastery_mode: true, answer_tts: true,
        distractor_mode: 'dynamic', source_tags: ['教科_英語', 'Stage1'], ranking_display: 'clear_list',
      },
      is_active: true, created_at: new Date(Date.UTC(2026, 4, 2)).toISOString(),
      target_student_ids: [], fixed_question_ids: eigoIds, is_deleted: false, lock_after_clears: 0,
    },
    {
      id: 112, school_id: SCHOOL, title: '英単語 Stage1（スペル並べかえ）',
      category: 'standard', target_tags: ['教科_英語', 'Stage1'],
      deprecated_target_student_id: null, youtube_url: null, filter_keyword: null,
      excluded_question_ids: [], question_limit: 10, clear_time_limit: 300, max_miss_count: 5,
      challenge_limit_per_day: null, clear_deadline: null, prerequisite_course_ids: [111],
      quiz_settings: {
        mode: 'sorting', option_count: '+4', mastery_mode: true, answer_tts: true,
        distractor_mode: 'mix', source_tags: ['教科_英語', 'Stage1'], ranking_display: 'clear_list',
      },
      is_active: true, created_at: new Date(Date.UTC(2026, 4, 3)).toISOString(),
      target_student_ids: [], fixed_question_ids: eigoIds, is_deleted: false, lock_after_clears: 0,
    },

    // 宿題（配信先を指定したコース。指定した生徒の画面にだけ出る）
    {
      id: 121, school_id: SCHOOL, title: '【今週の宿題】理科 物質のすがた',
      category: 'homework', target_tags: ['教科_理科', '中1', '物質のすがた'],
      deprecated_target_student_id: null, youtube_url: null, filter_keyword: null,
      excluded_question_ids: [], question_limit: 10, clear_time_limit: 150, max_miss_count: 3,
      challenge_limit_per_day: null,
      clear_deadline: (() => { const d = new Date(); d.setDate(d.getDate() + 4); d.setHours(21, 0, 0, 0); return d.toISOString(); })(),
      prerequisite_course_ids: [],
      quiz_settings: { mode: 'selection', option_count: '4', source_tags: ['教科_理科', '中1', '物質のすがた'], ranking_display: 'clear_list' },
      is_active: true, created_at: new Date(Date.UTC(2026, 4, 4)).toISOString(),
      target_student_ids: ['たいち', 'そうた', 'はると'], fixed_question_ids: kagakuIds,
      is_deleted: false, lock_after_clears: 0,
    },
    // BOSS（制限時間もミス上限も厳しい腕試し）
    {
      id: 131, school_id: SCHOOL, title: '👑 中2 社会 総合BOSS',
      category: 'boss', target_tags: ['教科_社会', '中2'],
      deprecated_target_student_id: null, youtube_url: null, filter_keyword: null,
      excluded_question_ids: [], question_limit: 10, clear_time_limit: 90, max_miss_count: 1,
      challenge_limit_per_day: 3, clear_deadline: null, prerequisite_course_ids: [],
      quiz_settings: { mode: 'selection', option_count: '4', source_tags: ['教科_社会', '中2'], ranking_display: 'time' },
      is_active: true, created_at: new Date(Date.UTC(2026, 4, 5)).toISOString(),
      target_student_ids: [], fixed_question_ids: edoIds, is_deleted: false, lock_after_clears: 0,
    },
    // ふだん練習（いつでも挑戦できるコース）
    {
      id: 141, school_id: SCHOOL, title: '中1 地理 世界の姿',
      category: 'standard', target_tags: ['教科_社会', '中1', '世界の姿'],
      deprecated_target_student_id: null, youtube_url: null, filter_keyword: null,
      excluded_question_ids: [], question_limit: 10, clear_time_limit: 120, max_miss_count: 3,
      challenge_limit_per_day: null, clear_deadline: null, prerequisite_course_ids: [],
      quiz_settings: { mode: 'selection', option_count: '4', source_tags: ['教科_社会', '中1', '世界の姿'], ranking_display: 'time' },
      is_active: true, created_at: new Date(Date.UTC(2026, 4, 6)).toISOString(),
      target_student_ids: [], fixed_question_ids: idOf(CHIRI), is_deleted: false, lock_after_clears: 0,
    },
    {
      id: 142, school_id: SCHOOL, title: '中1 数学 正負の数・文字式',
      category: 'standard', target_tags: ['教科_数学', '中1'],
      deprecated_target_student_id: null, youtube_url: null, filter_keyword: null,
      excluded_question_ids: [], question_limit: 10, clear_time_limit: 150, max_miss_count: 3,
      challenge_limit_per_day: null, clear_deadline: null, prerequisite_course_ids: [],
      quiz_settings: { mode: 'selection', option_count: '4', source_tags: ['教科_数学', '中1'], ranking_display: 'time' },
      is_active: true, created_at: new Date(Date.UTC(2026, 4, 7)).toISOString(),
      target_student_ids: [], fixed_question_ids: idOf(SUUGAKU), is_deleted: false, lock_after_clears: 0,
    },
    {
      id: 143, school_id: SCHOOL, title: '国語 漢字・語句・古典',
      category: 'standard', target_tags: ['教科_国語', '中2'],
      deprecated_target_student_id: null, youtube_url: null, filter_keyword: null,
      excluded_question_ids: [], question_limit: 10, clear_time_limit: 150, max_miss_count: 3,
      challenge_limit_per_day: null, clear_deadline: null, prerequisite_course_ids: [],
      quiz_settings: { mode: 'selection', option_count: '4', source_tags: ['教科_国語', '中2'], ranking_display: 'time' },
      is_active: true, created_at: new Date(Date.UTC(2026, 4, 8)).toISOString(),
      target_student_ids: [], fixed_question_ids: idOf(KOKUGO), is_deleted: false, lock_after_clears: 0,
    },
    // 4段構成に入れた12問を、単体でも練習できるコース。
    // グループに入れたコースは自習エリアに並ばないので、中2の棚が空にならないよう別に置く
    {
      id: 144, school_id: SCHOOL, title: '中2 社会 江戸時代 一問一答',
      category: 'standard', target_tags: ['教科_社会', '中2'],
      deprecated_target_student_id: null, youtube_url: null, filter_keyword: null,
      excluded_question_ids: [], question_limit: 12, clear_time_limit: 150, max_miss_count: 3,
      challenge_limit_per_day: null, clear_deadline: null, prerequisite_course_ids: [],
      quiz_settings: { mode: 'selection', option_count: '4', source_tags: ['教科_社会', '中2'], ranking_display: 'time' },
      is_active: true, created_at: new Date(Date.UTC(2026, 4, 9)).toISOString(),
      target_student_ids: [], fixed_question_ids: edoIds, is_deleted: false, lock_after_clears: 0,
    },
  ];

  const course_groups: Row[] = [{
    id: 1, school_id: SCHOOL, title: '江戸時代を4段でしあげる',
    description: '同じ12問を、やさしい形からむずかしい形へ4回まわします。①をクリアすると②が開きます。',
    icon: '🏯', progression: 'linear', target_student_ids: [],
    is_active: true, is_deleted: false, sort_order: 1,
    created_at: new Date(Date.UTC(2026, 4, 1)).toISOString(),
  }, {
    id: 2, school_id: SCHOOL, title: '英単語 Stage1',
    description: '4択で意味を覚えてから、スペルを自分で組み立てます。速く正解できた語から「習得」になります。',
    icon: '🅰️', progression: 'linear', target_student_ids: [],
    is_active: true, is_deleted: false, sort_order: 2,
    created_at: new Date(Date.UTC(2026, 4, 2)).toISOString(),
  }];

  const course_group_items: Row[] = [
    { id: 1, group_id: 1, course_id: 101, position: 1, section: null },
    { id: 2, group_id: 1, course_id: 102, position: 2, section: null },
    { id: 3, group_id: 1, course_id: 103, position: 3, section: null },
    { id: 4, group_id: 1, course_id: 104, position: 4, section: null },
    { id: 5, group_id: 2, course_id: 111, position: 1, section: null },
    { id: 6, group_id: 2, course_id: 112, position: 2, section: null },
  ];

  /* ---------- 単元タグ（管理画面の絞り込みと、生徒画面の単元ツリーに使う） ---------- */
  const master_tags: Row[] = [];
  const addTag = (category: string, label: string, val: string, sort: number) =>
    master_tags.push({
      id: `t${master_tags.length}`, school_id: SCHOOL, category, label, val,
      sort_order: sort, created_at: new Date(Date.UTC(2026, 3, 1)).toISOString(),
    });
  addTag('unit_major', '地理', '地理', 1);
  addTag('unit_medium', '世界の姿', '世界の姿', 1);
  addTag('unit_major', '歴史', '歴史', 2);
  addTag('unit_medium', '江戸時代', '江戸時代', 2);
  addTag('unit_major', '化学', '化学', 3);
  addTag('unit_medium', '物質のすがた', '物質のすがた', 3);
  addTag('unit_major', '数と式', '数と式', 4);
  addTag('unit_medium', '正負の数', '正負の数', 4);
  addTag('unit_medium', '文字式', '文字式', 4);
  addTag('unit_major', '言葉のきまり', '言葉のきまり', 5);
  addTag('unit_medium', '漢字', '漢字', 5);
  addTag('unit_medium', '語句', '語句', 5);
  addTag('unit_medium', '古典', '古典', 5);
  addTag('unit_major', '英単語', '英単語', 6);
  addTag('unit_medium', 'Stage1', 'Stage1', 6);

  /* ---------- 生徒ごとの学習履歴 ----------
     4段構成が「①はみんな終わった／②で止まっている子がいる」という形になるよう、
     進み具合に差をつけている。分析画面で意味のある絵が出るのはここが効いている。 */
  const student_directory: Row[] = STUDENTS.map((s, i) => ({
    id: `sd${i}`, school_id: SCHOOL, student_id: s.name, grade: s.grade,
    points: s.points, last_login_bonus_at: iso(1, 17, 5),
    created_at: new Date(Date.UTC(2026, 2, 10)).toISOString(), tags: [s.grade],
  }));

  const student_progress: Row[] = [];
  const rankings: Row[] = [];
  const exam_results: Row[] = [];
  const student_mistakes: Row[] = [];
  const student_word_mastery: Row[] = [];

  let pid = 1, rid = 1, eid = 1, mid = 1;

  // 誰がどこまで進んだか（course_id ごとに、そこまで到達した生徒）
  const reached: Record<number, string[]> = {
    101: ['たいち', 'ゆい', 'みなと', 'あかり', 'のぞみ', 'けんと'],
    102: ['たいち', 'ゆい', 'みなと', 'あかり', 'のぞみ'],
    103: ['ゆい', 'みなと', 'あかり'],
    104: ['ゆい', 'みなと'],
    111: ['たいち', 'ゆい', 'みなと', 'あかり', 'のぞみ', 'そうた'],
    112: ['ゆい', 'みなと'],
    121: ['そうた', 'はると'],
    131: ['ゆい', 'みなと'],
    141: ['そうた', 'はると', 'たいち'],
    142: ['そうた', 'はると', 'のぞみ'],
    143: ['あかり', 'ゆい', 'けんと'],
    144: ['たいち', 'のぞみ', 'けんと'],
  };

  Object.keys(reached).forEach((k) => {
    const cid = Number(k);
    const course = course_menus.filter((c) => c.id === cid)[0];
    reached[cid].forEach((name, n) => {
      const base = (course.clear_time_limit || 120) * 0.45;
      const time = Math.round((base + rand() * base * 0.8) * 100) / 100;
      const miss = Math.floor(rand() * 3);
      const days = 1 + Math.floor(rand() * 20);

      student_progress.push({
        id: pid++, school_id: SCHOOL, student_id: name, course_menu_id: cid,
        is_cleared: true, clear_time: time, miss_count: miss,
        created_at: iso(days), clears_since_unlock: 1 + Math.floor(rand() * 4),
      });
      rankings.push({
        id: rid++, school_id: SCHOOL, mode_id: `dyn_${cid}`, student_name: name,
        clear_time: time, miss_count: miss, created_at: iso(days),
      });
      exam_results.push({
        id: eid++, school_id: SCHOOL, student_id: name, subject_mode: `dyn_${cid}`,
        clear_time: time, miss_count: miss, is_cleared: true,
        created_at: iso(days), wrong_details: [],
      });
      // 同じコースを何度か回した記録（分析画面の「直近7日」に厚みを出す）
      if (n % 2 === 0) {
        exam_results.push({
          id: eid++, school_id: SCHOOL, student_id: name, subject_mode: `dyn_${cid}`,
          clear_time: Math.round((time * 1.3) * 100) / 100, miss_count: miss + 1,
          is_cleared: false, created_at: iso(days + 2), wrong_details: [],
        });
      }
    });
  });

  /* まちがえた記録。特定の問題に集中させて、分析画面で「塾全体の弱点」が立つようにする */
  const HARD = [
    edoIds[8],  // 寛政の改革
    edoIds[10], // 前野良沢
    kagakuIds[1], // 昇華
    kagakuIds[9], // 質量保存の法則
    idOf(SUUGAKU)[2], // −3の2乗
    idOf(KOKUGO)[1],  // 憂鬱
  ];
  STUDENTS.forEach((s, i) => {
    HARD.forEach((qid, j) => {
      if ((i + j) % 3 === 0) return;   // 全員が全部まちがえていると嘘くさい
      student_mistakes.push({
        id: mid++, school_id: SCHOOL, student_id: s.name, question_id: qid,
        mistake_count: 1 + Math.floor(rand() * 3), wrong_history: [],
        last_wrong_answer: '', created_at: iso(1 + Math.floor(rand() * 14)),
        is_cleared: (i + j) % 5 === 0,
      });
    });
  });

  /* 英単語の習得状況。たいちは20語中12語まで習得済み＝「あと8語」が画面に出る */
  const masteredCount: Record<string, number> = {
    たいち: 12, ゆい: 20, みなと: 18, あかり: 9, のぞみ: 6, そうた: 3,
  };
  Object.keys(masteredCount).forEach((name) => {
    for (let i = 0; i < masteredCount[name]; i++) {
      student_word_mastery.push({
        school_id: SCHOOL, student_id: name, course_menu_id: 111,
        question_id: eigoIds[i], is_mastered: true,
        fast_streak: 2, last_time_ms: 1200 + Math.floor(rand() * 1200),
        updated_at: iso(1 + Math.floor(rand() * 10)),
      });
    }
  });

  /* ---------- 目標（分析画面の週次記録） ---------- */
  const student_goals: Row[] = STUDENTS.slice(0, 5).map((s, i) => ({
    id: i + 1, school_id: SCHOOL, student_id: s.name,
    long_term_goal: [
      '2学期の期末で社会80点',
      '英検3級に合格する',
      '数学の計算ミスを1回以内にする',
      '志望校（市立高校）に合格する',
      '毎日15分は塾のアプリをひらく',
    ][i],
    updated_at: iso(10),
  }));

  const student_weekly_records: Row[] = STUDENTS.slice(0, 5).flatMap((s, i) => [
    {
      id: i * 2 + 1, school_id: SCHOOL, student_id: s.name, start_date: mondayKey(0),
      goal_text: ['江戸時代の②までクリアする', '英単語を全部習得する', '正負の数を10問ノーミス',
                  '過去問を2年分', '宿題を締切前に出す'][i],
      result_text: '', updated_at: iso(1),
    },
    {
      id: i * 2 + 2, school_id: SCHOOL, student_id: s.name, start_date: mondayKey(1),
      goal_text: ['①をクリアする', '英単語15語', '文字式を復習', '漢字を毎日10個', 'アプリを3日開く'][i],
      result_text: ['②の途中まで進んだ', '18語まで習得', '半分できた', '毎日できた', '2日だけだった'][i],
      updated_at: iso(8),
    },
  ]);

  /* ---------- 予約 ---------- */
  const booking_accounts: Row[] = STUDENTS.map((s, i) => ({
    id: `ba${i}`, school_id: SCHOOL, student_name: s.name,
    token: `demo-token-${i}`,
    fixed_slots: i < 5 ? [{ weekday: [1, 2, 4, 5, 3][i], time: ['17:00', '18:00', '19:00', '17:00', '20:00'][i] }] : [],
    is_active: true, memo: '', created_at: iso(60),
  }));

  const bookings: Row[] = [];
  for (let d = -6; d <= 13; d++) {
    const day = new Date(); day.setDate(day.getDate() + d);
    const wd = day.getDay();
    if (wd === 0 || wd === 6) continue;   // 土日は開けていない設定
    STUDENTS.forEach((s, i) => {
      if (rand() > 0.42) return;
      const times = ['16:00', '17:00', '18:00', '19:00', '20:00'];
      const t = times[Math.floor(rand() * times.length)];
      bookings.push({
        id: `bk${bookings.length}`, school_id: SCHOOL, account_id: `ba${i}`,
        date: ymd(day), time: t,
        status: (d < 0 && rand() < 0.12) ? 'cancelled' : 'booked',
        source: i < 5 ? 'fixed' : 'self',
        created_at: iso(Math.max(0, 20 - d)), cancelled_at: null,
      });
    });
  }

  const booking_settings: Row[] = [{
    id: 'bs1', school_id: SCHOOL,
    weekly_hours: {
      '1': ['16:00', '17:00', '18:00', '19:00', '20:00', '21:00'],
      '2': ['16:00', '17:00', '18:00', '19:00', '20:00', '21:00'],
      '3': ['16:00', '17:00', '18:00', '19:00', '20:00', '21:00'],
      '4': ['16:00', '17:00', '18:00', '19:00', '20:00', '21:00'],
      '5': ['15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'],
    },
    slot_capacity: 4, deadline_hours: 12,
    created_at: iso(90), slot_capacities: {}, special_days: {},
  }];

  const booking_closures: Row[] = [{
    id: 'bc1', school_id: SCHOOL,
    date: (() => { const d = new Date(); d.setDate(d.getDate() + 5); return ymd(d); })(),
    time: null, reason: '教室点検のためお休み', created_at: iso(3),
  }];

  /* ---------- 紙のプリントの確認レーン ---------- */
  const paper_checks: Row[] = [
    { id: 1, school_id: SCHOOL, student_id: 'たいち', print_kind: 'normal', course_menu_id: 101,
      course_title: '江戸時代 ① 順番どおり・4択', question_ids: edoIds.slice(0, 8), pass_coverage: 80,
      print_mode: 'question', status: 'issued', wrong_question_ids: [], checker: '', memo: '',
      issued_at: iso(0, 17, 10), checked_at: null, is_deleted: false },
    { id: 2, school_id: SCHOOL, student_id: 'そうた', print_kind: 'weakness', course_menu_id: null,
      course_title: '弱点プリント（理科）', question_ids: kagakuIds.slice(0, 6), pass_coverage: 80,
      print_mode: 'question', status: 'issued', wrong_question_ids: [], checker: '', memo: '',
      issued_at: iso(0, 17, 40), checked_at: null, is_deleted: false },
    { id: 3, school_id: SCHOOL, student_id: 'ゆい', print_kind: 'normal', course_menu_id: 143,
      course_title: '国語 漢字・語句・古典', question_ids: idOf(KOKUGO), pass_coverage: 80,
      print_mode: 'question', status: 'passed', wrong_question_ids: [], checker: '山下',
      memo: '', issued_at: iso(1, 18, 0), checked_at: iso(1, 18, 35), is_deleted: false },
    { id: 4, school_id: SCHOOL, student_id: 'けんと', print_kind: 'normal', course_menu_id: 142,
      course_title: '中1 数学 正負の数・文字式', question_ids: idOf(SUUGAKU), pass_coverage: 80,
      print_mode: 'question', status: 'failed', wrong_question_ids: [idOf(SUUGAKU)[2], idOf(SUUGAKU)[9]],
      checker: '山下', memo: '符号のミスが続いている', issued_at: iso(2, 17, 20),
      checked_at: iso(2, 18, 5), is_deleted: false },
  ];

  const privacy_approvals: Row[] = [
    { id: 1, school_id: SCHOOL, status: 'approved', requested_at: iso(40), approved_at: iso(39) },
  ];

  return {
    schools: [{ id: 'sc1', school_id: SCHOOL, name: SCHOOL_NAME, password: '1234',
                max_students: 30, created_at: iso(200) }],
    student_directory,
    questions,
    master_tags,
    course_menus,
    course_groups,
    course_group_items,
    student_progress,
    rankings,
    exam_results,
    student_mistakes,
    student_word_mastery,
    student_goals,
    student_weekly_records,
    bookings,
    booking_accounts,
    booking_settings,
    booking_closures,
    paper_checks,
    privacy_approvals,
    lesson_prep_checks: [],
    unit_topics: [],
    unit_materials: [],
    quiz_assets: [],
    // ごきょうだいの予約URL・請求URLを1本にまとめるための世帯（請求画面が読む）
    households: HOUSEHOLDS.map((h, i) => ({
      id: `hh${i + 1}`, school_id: SCHOOL, token: h.token,
      members: h.members, is_active: true, created_at: iso(120),
    })),
    setsugekka_menus: [],
    setsugekka_assets: [],
    setsugekka_owners: [],
  };
}

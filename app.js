/* Frontline — логика приложения */
'use strict';

/* ---------- состояние ---------- */
const KEY = 'frontline_v1';
const DEFAULT = {
  profile: {
    name: '', age: 19, height: 192, weight: 115, startWeight: 115, goalWeight: 92, midGoal: 105,
    standReach: 248, jumpReach: 315, goalReach: 340, startDate: '2026-11-19', sleepGoal: '23:30', commute: 70,
  },
  weights: [{ d: '2026-11-19', v: 115 }],
  reach: [{ d: '2026-11-19', v: 315 }],
  measures: [],
  water: {}, food: {}, done: {}, sets: {}, pain: {}, habits: {}, sleep: {}, finished: {},
  zepp: [], classOff: {}, classAdd: {},
  remind: { on: false, water: true, sleep: true, train: true },
  fired: {},
};
let S = load();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return deepMerge(structuredClone(DEFAULT), JSON.parse(raw));
  } catch (e) { /* пустое хранилище */ }
  return structuredClone(DEFAULT);
}
function deepMerge(a, b) {
  for (const k in b) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], b[k]);
    else a[k] = b[k];
  }
  return a;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Не удалось сохранить'); } }

/* ---------- утилиты ---------- */
const $ = (s, el = document) => el.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => iso(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const DOW_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const fmtDate = s => { const d = parse(s); return `${d.getDate()} ${MON[d.getMonth()]}`; };
const fmtShort = s => { const d = parse(s); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`; };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = m => { m = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round = (v, s = 1) => Math.round(v / s) * s;
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- расчёты ---------- */
const curWeight = () => S.weights.length ? S.weights[S.weights.length - 1].v : S.profile.weight;
const weekNo = (d = today()) => Math.max(0, Math.floor(daysBetween(S.profile.startDate, d) / 7));
const phase = (d = today()) => PHASES.find(p => weekNo(d) >= p.from && weekNo(d) < p.to) || PHASES[0];
const dayPlan = d => WEEK_TEMPLATE[parse(d).getDay()];
const isTrainDay = d => ['gymA', 'gymB', 'volley', 'home'].includes(dayPlan(d).main);

function classesOn(d) {
  if (S.classOff[d]) return null;
  return S.classAdd[d] || CLASSES[d] || null;
}

function targets(d = today()) {
  const p = S.profile, w = curWeight();
  const bmr = 10 * w + 6.25 * p.height - 5 * p.age + 5;
  const train = isTrainDay(d);
  const kcal = round(bmr * (train ? 1.55 : 1.35) * (train ? 0.78 : 0.8), 50);
  const prot = round(2 * p.goalWeight, 5);
  const fat = round(0.8 * p.goalWeight, 5);
  const carb = Math.max(100, round((kcal - prot * 4 - fat * 9) / 4, 5));
  const waterGl = Math.min(16, Math.round(30 * w / 250) + (train ? 2 : 0));
  return { kcal, prot, fat, carb, waterGl, train };
}

function eaten(d = today()) {
  return (S.food[d] || []).reduce((a, f) => ({ kcal: a.kcal + f.kcal, p: a.p + f.p, f: a.f + f.f, c: a.c + f.c }), { kcal: 0, p: 0, f: 0, c: 0 });
}

/* сон: во сколько вставать завтра и когда лечь */
function sleepPlan(d = today()) {
  const tomorrow = addDays(d, 1);
  const cls = classesOn(tomorrow);
  const goal = toMin(S.profile.sleepGoal);
  let wake, reason;
  if (cls) { wake = toMin(cls[0]) - S.profile.commute; reason = `завтра пара в ${cls[0]}`; }
  else { wake = goal + 8 * 60 - 1440; reason = 'завтра пар нет'; }
  let bed = wake - 8 * 60;               // 8 часов сна
  bed = ((bed % 1440) + 1440) % 1440;
  // не позже идеального отбоя (сравниваем «ночное» время: 00:30 считается позже 23:30)
  const night = m => (m < 12 * 60 ? m + 1440 : m);
  if (night(bed) > night(goal)) bed = goal;
  // плавный сдвиг: если вчера лёг сильно позже, двигаемся на 30 мин раньше вчерашнего
  const last = S.sleep[addDays(d, -1)];
  let note = '';
  if (last && last.bed) {
    let lb = toMin(last.bed); if (lb < 12 * 60) lb += 1440;
    let b = bed < 12 * 60 ? bed + 1440 : bed;
    if (lb - b > 60) { bed = (lb - 30) % 1440; note = 'Сдвигаем постепенно: на 30 мин раньше, чем вчера.'; }
  }
  return { bed: fromMin(bed), wake: fromMin(wake), reason, note };
}

/* собрать тренировку с учётом фазы и боли в колене */
function buildWorkout(key, d) {
  const w = WORKOUTS[key];
  const ph = phase(d).n;
  const pain = S.pain[d] ?? 0;
  const blocks = [];
  w.blocks.forEach((b, bi) => {
    if (b.phase && b.phase > ph) return;
    const items = [];
    b.items.forEach(([id, sets, reps, rest], ii) => {
      let ex = id, swapped = false;
      const e = EX[id];
      if ((e.knee === 'jump' && pain > 2) || (e.knee === 'load' && pain >= 3)) { ex = e.alt || 'wall_sit'; swapped = true; }
      items.push({ uid: `${key}:${bi}:${ii}`, id: ex, from: swapped ? id : null, sets, reps, rest });
    });
    if (items.length) blocks.push({ t: b.t, items });
  });
  return { ...w, key, blocks };
}

/* ---------- шит (нижняя панель) ---------- */
function openSheet(html, mount) {
  $('#sheetBody').innerHTML = html;
  $('#sheet').classList.add('open'); $('#sheetBack').classList.add('open');
  $('#sheet').scrollTop = 0;
  if (mount) mount($('#sheetBody'));
}
function closeSheet() { $('#sheet').classList.remove('open'); $('#sheetBack').classList.remove('open'); }
$('#sheetBack').onclick = closeSheet;

/* ---------- графики ---------- */
function lineChart(points, { goal, unit = '' } = {}) {
  if (points.length < 2) return `<div class="empty">Добавь ещё одно значение — появится график</div>`;
  const W = 320, H = 160, P = 26;
  const vals = points.map(p => p.v).concat(goal != null ? [goal] : []);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 2) { max += 1; min -= 1; }
  const x = i => P + (i * (W - P * 2)) / (points.length - 1);
  const y = v => H - P - ((v - min) * (H - P * 2)) / (max - min);
  const line = points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ');
  const area = `${x(0)},${H - P} ${line} ${x(points.length - 1)},${H - P}`;
  const g = goal != null ? `<line x1="${P}" x2="${W - P}" y1="${y(goal)}" y2="${y(goal)}" stroke="#34d399" stroke-dasharray="4 4" stroke-width="1"/><text x="${W - P}" y="${y(goal) - 4}" text-anchor="end">цель ${goal}${unit}</text>` : '';
  const dots = points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="3" fill="#d946ef"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a855f7" stop-opacity=".35"/><stop offset="1" stop-color="#a855f7" stop-opacity="0"/></linearGradient>
    <linearGradient id="gl" x1="0" x2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#d946ef"/></linearGradient></defs>
    <polygon points="${area}" fill="url(#ga)"/>${g}
    <polyline points="${line}" fill="none" stroke="url(#gl)" stroke-width="2.5" stroke-linejoin="round"/>${dots}
    <text x="${P}" y="${H - 8}">${fmtShort(points[0].d)}</text><text x="${W - P}" y="${H - 8}" text-anchor="end">${fmtShort(points[points.length - 1].d)}</text>
    <text x="4" y="${y(max) + 4}">${round(max, .1)}</text><text x="4" y="${y(min) + 4}">${round(min, .1)}</text>
  </svg>`;
}
function ring(val, max, label, sub) {
  const r = 40, c = 2 * Math.PI * r, pct = Math.min(1, max ? val / max : 0);
  const over = val > max * 1.05;
  return `<div class="ring"><svg width="92" height="92"><circle cx="46" cy="46" r="${r}" stroke="rgba(255,255,255,.07)" stroke-width="8" fill="none"/>
    <circle cx="46" cy="46" r="${r}" stroke="${over ? '#f87171' : 'url(#gl2)'}" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="${c * pct} ${c}"/>
    <defs><linearGradient id="gl2"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#d946ef"/></linearGradient></defs></svg>
    <div class="lbl">${label}<span>${sub}</span></div></div>`;
}
const bar = (v, max) => `<div class="bar"><i style="width:${Math.min(100, max ? (v / max) * 100 : 0)}%"></i></div>`;

/* ---------- экраны ---------- */
let TAB = 'today';
let selDay = today();
let foodSeg = 'diary';

const VIEWS = {
  today() {
    const d = today(), p = S.profile, plan = dayPlan(d), w = WORKOUTS[plan.main];
    const t = targets(d), e = eaten(d), cls = classesOn(d), sp = sleepPlan(d), ph = phase(d);
    const water = S.water[d] || 0;
    const h = S.habits[d] || {};
    const tip = TIPS[(daysBetween('2026-01-01', d)) % TIPS.length];
    const hour = new Date().getHours();
    const hi = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
    const conflict = cls && plan.main === 'volley' && toMin(cls[1]) > toMin('18:15');
    const done = S.finished[d];
    const lost = round(p.startWeight - curWeight(), .1);
    return `
      <div class="hello"><div class="muted small">${DOW_FULL[parse(d).getDay()]}, ${fmtDate(d)} · неделя ${weekNo(d) + 1} · ${ph.name}</div>
        <h1>${hi}${p.name ? ', ' + esc(p.name) : ''}</h1></div>

      <div class="card hero tap" data-act="openWorkout" data-key="${plan.main}" data-date="${d}">
        <div class="row between"><span class="pill">${w.place} · ${plan.time}</span>${done ? '<span class="pill ok">✓ Выполнено</span>' : `<span class="muted tiny">${w.dur}</span>`}</div>
        <h3 style="margin-top:10px;font-size:20px">${w.title}</h3>
        <div class="muted small">${w.note}</div>
        ${plan.extra ? `<hr class="s"><div class="row tap" data-act="openWorkout" data-key="${plan.extra}" data-date="${d}"><span class="dot c-teal"></span><b class="small">+ ${WORKOUTS[plan.extra].title}</b><span class="spacer"></span><span class="muted tiny">${WORKOUTS[plan.extra].dur}</span></div>` : ''}
        ${conflict ? `<hr class="s"><div class="pill warn">⚠ Пары до ${cls[1]} — на волейбол опоздаешь</div>` : ''}
      </div>

      <div class="grid2">
        <div class="card"><div class="muted tiny">Пары сегодня</div><div style="font-weight:700;margin-top:4px">${cls ? `${cls[0]}–${cls[1]}` : 'Нет пар'}</div>${cls && cls[2] ? `<div class="pill warn" style="margin-top:6px">${esc(cls[2])}</div>` : ''}</div>
        <div class="card tap" data-act="sleepLog"><div class="muted tiny">Отбой сегодня</div><div style="font-weight:700;margin-top:4px" class="grad-text">${sp.bed}</div><div class="muted tiny">подъём ${sp.wake} · ${sp.reason}</div></div>
      </div>
      ${sp.note ? `<div class="muted tiny" style="margin:-4px 4px 12px">${sp.note}</div>` : ''}

      <div class="card tap" data-act="goFood">
        <div class="row">${ring(e.kcal, t.kcal, Math.round(e.kcal), `из ${t.kcal}`)}
          <div style="flex:1">
            <div class="row between small"><span>Белки</span><span class="muted">${Math.round(e.p)} / ${t.prot} г</span></div>${bar(e.p, t.prot)}
            <div class="row between small" style="margin-top:8px"><span>Жиры</span><span class="muted">${Math.round(e.f)} / ${t.fat} г</span></div>${bar(e.f, t.fat)}
            <div class="row between small" style="margin-top:8px"><span>Углеводы</span><span class="muted">${Math.round(e.c)} / ${t.carb} г</span></div>${bar(e.c, t.carb)}
          </div></div>
      </div>

      <div class="card">
        <div class="row between"><h3>Вода</h3><span class="muted small">${(water * 0.25).toFixed(2).replace(/\.?0+$/, '')} / ${t.waterGl * 0.25} л</span></div>
        <div class="water">${Array.from({ length: 16 }, (_, i) => `<button class="${i < water ? 'on' : ''} ${i >= t.waterGl ? 'extra' : ''}" data-act="water" data-n="${i + 1}" aria-label="стакан ${i + 1}"></button>`).join('')}</div>
        <div class="muted tiny" style="margin-top:8px">1 стакан = 250 мл. Нажми на стакан, чтобы отметить.</div>
      </div>

      <div class="card">
        <h3>Привычки дня</h3>
        <ul class="list">
          ${habitRow('soda', 'Без газировки', h.soda)}
          ${habitRow('energy', 'Без энергетиков', h.energy)}
          ${habitRow('sweet', 'Сладкое в норме (≤1 порция)', h.sweet)}
          ${habitRow('night', 'Не ел за 2 ч до сна', h.night)}
        </ul>
        <div class="muted tiny" style="margin-top:6px">Серия без газировки: <b class="grad-text">${streak('soda')} дн.</b> · без энергетиков: <b class="grad-text">${streak('energy')} дн.</b></div>
      </div>

      <div class="grid2">
        <div class="card tap" data-act="addWeight"><div class="muted tiny">Вес</div><div class="big">${curWeight()}<span class="small muted"> кг</span></div><div class="tiny ${lost > 0 ? 'grad-text' : 'muted'}">${lost > 0 ? `−${lost} кг со старта` : 'нажми, чтобы взвеситься'}</div></div>
        <div class="card tap" data-act="addReach"><div class="muted tiny">Досягаемость</div><div class="big">${lastReach()}<span class="small muted"> см</span></div><div class="tiny muted">прыжок ${lastReach() - p.standReach} см · цель ${p.goalReach}</div></div>
      </div>

      <div class="card"><div class="muted tiny">Совет тренера</div><div style="margin-top:4px">${tip}</div></div>
    `;
  },

  train() {
    const ph = phase(selDay);
    const start = addDays(today(), -((parse(today()).getDay() + 6) % 7)); // понедельник
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const plan = dayPlan(selDay);
    const keys = [plan.main].concat(plan.extra ? [plan.extra] : []);
    return `
      <div class="card hero">
        <div class="row between"><span class="pill">Фаза ${ph.n} · ${ph.name}</span><span class="muted tiny">неделя ${weekNo(selDay) + 1}</span></div>
        <div class="small" style="margin-top:8px">${ph.desc}</div>
      </div>
      <div class="week">${days.map(d => {
        const k = dayPlan(d).main;
        return `<button class="${d === selDay ? 'sel' : ''} ${d === today() ? 'today' : ''}" data-act="selDay" data-d="${d}"><small>${DOW[parse(d).getDay()]}</small><b>${parse(d).getDate()}</b><span class="dot c-${WORKOUTS[k].color}"></span></button>`;
      }).join('')}</div>
      <div class="section-title">${DOW_FULL[parse(selDay).getDay()]}, ${fmtDate(selDay)}${classesOn(selDay) ? ` · пары ${classesOn(selDay)[0]}–${classesOn(selDay)[1]}` : ''}</div>
      ${keys.map(k => {
        const w = WORKOUTS[k];
        const n = buildWorkout(k, selDay).blocks.reduce((a, b) => a + b.items.length, 0);
        const doneN = Object.keys(S.done[selDay] || {}).filter(u => u.startsWith(k + ':')).length;
        return `<div class="card tap" data-act="openWorkout" data-key="${k}" data-date="${selDay}">
          <div class="row"><span class="dot c-${w.color}"></span><b>${w.title}</b><span class="spacer"></span>${S.finished[selDay] === k ? '<span class="pill ok">✓</span>' : ''}</div>
          <div class="muted small" style="margin-top:6px">${w.place} · ${w.dur} · ${n} упражн.${doneN ? ` · сделано ${doneN}` : ''}</div>
          ${bar(doneN, n)}</div>`;
      }).join('')}
      <div class="section-title">Неделя целиком</div>
      <div class="card"><ul class="list">${[1, 2, 3, 4, 5, 6, 0].map(i => {
        const pl = WEEK_TEMPLATE[i], w = WORKOUTS[pl.main];
        return `<li class="row"><span class="dot c-${w.color}"></span><b style="width:28px">${DOW[i]}</b><span class="small">${w.title}${pl.extra ? ' + утро: колени' : ''}</span><span class="spacer"></span><span class="muted tiny">${pl.time}</span></li>`;
      }).join('')}</ul></div>
      <button class="btn block" data-act="library">📖 Все упражнения с техникой</button>
    `;
  },

  food() {
    const d = today(), t = targets(d), e = eaten(d);
    const seg = ['diary', 'Дневник', 'menu', 'Меню', 'rules', 'Можно/нет', 'shop', 'Покупки'];
    let body = '';
    if (foodSeg === 'diary') {
      const list = S.food[d] || [];
      body = `
        <div class="card hero">
          <div class="row">${ring(e.kcal, t.kcal, Math.round(e.kcal), `из ${t.kcal}`)}
            <div style="flex:1"><div class="small"><b>${t.train ? 'Тренировочный день' : 'День отдыха'}</b></div>
            <div class="muted tiny">Осталось: <b class="grad-text">${Math.max(0, t.kcal - Math.round(e.kcal))} ккал</b></div>
            <div class="muted tiny" style="margin-top:6px">Б ${Math.round(e.p)}/${t.prot} · Ж ${Math.round(e.f)}/${t.fat} · У ${Math.round(e.c)}/${t.carb}</div>
            <div class="muted tiny" style="margin-top:6px">Дефицит ≈ 20% — минус 0.7–1 кг в неделю</div></div></div>
        </div>
        <button class="btn primary block" data-act="addFood">+ Добавить еду</button>
        <div class="section-title">Сегодня съедено</div>
        <div class="card">${list.length ? `<ul class="list">${list.map((f, i) => `<li class="row"><div style="flex:1"><div class="small"><b>${esc(f.name)}</b></div><div class="muted tiny">${f.g} г · Б${Math.round(f.p)} Ж${Math.round(f.f)} У${Math.round(f.c)}</div></div><b>${Math.round(f.kcal)}</b><button class="btn sm" data-act="delFood" data-i="${i}">✕</button></li>`).join('')}</ul>` : '<div class="empty">Пока пусто. Записывай всё, даже перекусы — так виден реальный результат.</div>'}</div>`;
    } else if (foodSeg === 'menu') {
      body = MENUS.map(m => `<div class="card"><div class="row between"><h3>${m.t}</h3><span class="pill">${m.kcal}</span></div>
        <ul class="list">${m.meals.map(([a, b]) => `<li><div class="muted tiny">${a}</div><div class="small">${b}</div></li>`).join('')}</ul></div>`).join('') +
        `<div class="card hero"><h3>Твой творог — версия на сушку</h3><div class="small">Творог 2–5% 250 г + греческий йогурт 100 г вместо «Чудо» + клубника/земляника 100 г + полбанана + сахзам. ≈ 400 ккал, 50 г белка. Вкус почти тот же, калорий в 1.5 раза меньше.</div></div>
        <div class="card"><h3>Как говорить с мамой</h3><div class="small muted">Попроси: меньше масла при жарке, гарнир отдельно от мяса (чтобы ты сам клал порцию), больше запечённого. Борщ — отлично, но без большой ложки сметаны и с одним куском хлеба.</div></div>`;
    } else if (foodSeg === 'rules') {
      const blk = (title, cls, arr) => `<div class="card"><div class="row"><span class="pill ${cls}">${title}</span></div><ul class="list">${arr.map(x => `<li class="small">${x}</li>`).join('')}</ul></div>`;
      body = blk('Можно', 'ok', FOOD_RULES.yes) + blk('Ограничить', 'warn', FOOD_RULES.limit) + blk('Лучше нет', 'bad', FOOD_RULES.no);
    } else {
      body = `<div class="card"><h3>Список на неделю</h3><ul class="list">${SHOPPING.map((x, i) => `<li class="row"><input type="checkbox" data-act="shop" data-i="${i}" ${S.shop && S.shop[i] ? 'checked' : ''}><span class="small">${x}</span></li>`).join('')}</ul>
        <button class="btn sm" data-act="shopReset" style="margin-top:8px">Сбросить отметки</button></div>`;
    }
    return `<div class="seg">${seg.reduce((a, v, i) => i % 2 ? a : a + `<button class="${foodSeg === v ? 'on' : ''}" data-act="foodSeg" data-s="${v}">${seg[i + 1]}</button>`, '')}</div>${body}`;
  },

  progress() {
    const p = S.profile, cw = curWeight();
    const lost = round(p.startWeight - cw, .1), total = p.startWeight - p.goalWeight;
    const weeksLeft = Math.ceil((cw - p.goalWeight) / 0.8);
    const r = lastReach();
    const lastM = S.measures[S.measures.length - 1];
    const firstM = S.measures[0];
    const strength = Object.entries(S.sets).filter(([, a]) => a.length).map(([id, a]) => {
      const best = a.reduce((m, s) => (s.w > m.w ? s : m), a[0]);
      return `<tr><td class="small">${EX[id] ? EX[id].n : id}</td><td class="r small">${a[a.length - 1].w} кг × ${a[a.length - 1].r}</td><td class="r small grad-text">${best.w} кг</td></tr>`;
    });
    const trained = Object.keys(S.finished).length;
    return `
      <div class="card hero">
        <div class="row between"><h3>Вес</h3><button class="btn sm" data-act="addWeight">+ Взвеситься</button></div>
        <div class="row" style="margin:8px 0"><div class="big">${cw}</div><span class="muted">кг → цель ${p.goalWeight} кг</span></div>
        ${bar(Math.max(0, lost), total)}
        <div class="row between tiny muted" style="margin-top:6px"><span>сброшено ${Math.max(0, lost)} из ${total} кг</span><span>${weeksLeft > 0 ? `≈ ${weeksLeft} нед. до цели` : 'цель достигнута!'}</span></div>
        ${lineChart(S.weights.slice(-30), { goal: p.goalWeight, unit: ' кг' })}
        <div class="muted tiny">Взвешивайся утром, натощак, после туалета. 1–2 раза в неделю, не каждый день.</div>
      </div>

      <div class="card">
        <div class="row between"><h3>Прыжок</h3><button class="btn sm" data-act="addReach">+ Замер</button></div>
        <div class="grid2" style="margin-top:8px">
          <div><div class="muted tiny">Досягаемость</div><div class="big">${r}</div></div>
          <div><div class="muted tiny">Высота прыжка</div><div class="big grad-text">${r - p.standReach}</div><div class="muted tiny">см (стоя ${p.standReach})</div></div>
        </div>
        <div class="row wrap" style="margin:10px 0">${[320, 325, 330, 335, 340].map(g => `<span class="pill ${r >= g ? 'ok' : ''}">${r >= g ? '✓ ' : ''}${(g / 100).toFixed(2)}</span>`).join('')}</div>
        ${lineChart(S.reach.slice(-30), { goal: p.goalReach, unit: '' })}
        <div class="muted tiny">Замеряй раз в 2 недели: после разминки, 3 попытки с разбега, записывай лучшую.</div>
      </div>

      <div class="card">
        <div class="row between"><h3>Замеры тела</h3><button class="btn sm" data-act="addMeasure">+ Замер</button></div>
        ${lastM ? `<table class="t" style="margin-top:8px"><tr><th>см</th><th class="r">сейчас</th><th class="r">старт</th><th class="r">Δ</th></tr>
          ${[['waist', 'Талия'], ['chest', 'Грудь'], ['hip', 'Бёдра'], ['arm', 'Бицепс']].map(([k, n]) => lastM[k] ? `<tr><td>${n}</td><td class="r">${lastM[k]}</td><td class="r muted">${firstM[k] || '—'}</td><td class="r ${lastM[k] - firstM[k] < 0 ? 'grad-text' : ''}">${firstM[k] ? round(lastM[k] - firstM[k], .1) : ''}</td></tr>` : '').join('')}</table>
          ${S.measures.length > 1 ? lineChart(S.measures.filter(m => m.waist).map(m => ({ d: m.d, v: m.waist })), {}) : ''}` : '<div class="empty">Талия — главный показатель ухода жира. Замерь сегодня, на уровне пупка.</div>'}
      </div>

      <div class="card">
        <h3>Рабочие веса</h3>
        ${strength.length ? `<table class="t"><tr><th>Упражнение</th><th class="r">последний</th><th class="r">рекорд</th></tr>${strength.join('')}</table>` : '<div class="empty">Записывай веса в тренировке — тут появится прогресс силы.</div>'}
      </div>

      <div class="grid2">
        <div class="card"><div class="muted tiny">Тренировок</div><div class="big">${trained}</div></div>
        <div class="card"><div class="muted tiny">Без газировки</div><div class="big">${streak('soda')}<span class="small muted"> дн.</span></div></div>
      </div>

      <div class="card">
        <div class="row between"><h3>С часов (Zepp)</h3><button class="btn sm" data-act="zeppAdd">+ Добавить</button></div>
        ${S.zepp.length ? `<table class="t"><tr><th>Дата</th><th>Тип</th><th class="r">мин</th><th class="r">пульс</th><th class="r">ккал</th></tr>${S.zepp.slice(-10).reverse().map(z => `<tr><td class="small">${fmtShort(z.d)}</td><td class="small">${esc(z.type)}</td><td class="r small">${z.min || '—'}</td><td class="r small">${z.avg || '—'}${z.max ? '/' + z.max : ''}</td><td class="r small">${z.kcal || '—'}</td></tr>`).join('')}</table>` : '<div class="empty">Тренировки с часов появятся тут.</div>'}
      </div>
    `;
  },

  more() {
    const p = S.profile;
    const upcoming = Object.keys({ ...CLASSES, ...S.classAdd }).filter(d => d >= today()).sort().slice(0, 14);
    return `
      <div class="card hero tap" data-act="profile">
        <div class="row"><span class="logo-mark" style="width:44px;height:44px;border-radius:14px"></span>
        <div><h3>${p.name ? esc(p.name) : 'Мой профиль'}</h3><div class="muted small">${p.age} лет · ${p.height} см · ${curWeight()} кг · центральный блокирующий</div></div></div>
        <div class="muted tiny" style="margin-top:8px">Нажми, чтобы изменить данные и цели</div>
      </div>

      <div class="section-title">Напоминания</div>
      <div class="card">
        <div class="row between"><div><b>Уведомления</b><div class="muted tiny">Пока приложение открыто или свёрнуто</div></div><input type="checkbox" data-act="remindOn" ${S.remind.on ? 'checked' : ''}></div>
        <hr class="s">
        ${[['train', 'Тренировки (за час)'], ['water', 'Вода (каждые 2 часа)'], ['sleep', 'Сон (за 30 мин до отбоя)']].map(([k, n]) => `<div class="row between" style="margin:8px 0"><span class="small">${n}</span><input type="checkbox" data-act="remindKey" data-k="${k}" ${S.remind[k] ? 'checked' : ''}></div>`).join('')}
        <hr class="s">
        <div class="small"><b>Надёжные напоминания через календарь</b></div>
        <div class="muted tiny" style="margin:4px 0 10px">Браузер не может будить телефон, когда приложение закрыто. Поэтому скачай файл и импортируй в Google Календарь — он будет напоминать всегда.</div>
        <button class="btn block" data-act="ics">📅 Скачать напоминания (.ics)</button>
      </div>

      <div class="section-title">Расписание пар</div>
      <div class="card">
        <div class="muted tiny">Группа ПГСб-25С3, без военки и физры. Нажми, чтобы отключить день (если пары отменили).</div>
        <ul class="list">${upcoming.map(d => { const c = S.classAdd[d] || CLASSES[d]; return `<li class="row tap" data-act="toggleClass" data-d="${d}" style="${S.classOff[d] ? 'opacity:.4;text-decoration:line-through' : ''}"><b style="width:76px" class="small">${DOW[parse(d).getDay()]} ${fmtShort(d)}</b><span class="small">${c[0]}–${c[1]}</span><span class="spacer"></span><span class="muted tiny">${c[2] ? esc(c[2]) : ''}</span></li>`; }).join('')}</ul>
        <button class="btn sm" data-act="addClass" style="margin-top:8px">+ Добавить / изменить день</button>
      </div>

      <div class="section-title">Часы Zepp</div>
      <div class="card">
        <div class="muted tiny" style="margin-bottom:10px">Экспортируй тренировку в Zepp (файл .tcx / .gpx / .csv) и загрузи сюда — подтянутся время, пульс и калории. Или впиши вручную за 10 секунд.</div>
        <div class="btn-row"><label class="btn sm">📂 Импорт файла<input type="file" accept=".tcx,.gpx,.csv,.xml,.txt" data-act="zeppFile" hidden></label><button class="btn sm" data-act="zeppAdd">✍ Вручную</button></div>
      </div>

      <div class="section-title">Данные</div>
      <div class="card">
        <div class="muted tiny" style="margin-bottom:10px">Всё хранится только на этом устройстве. Делай бэкап раз в неделю — отправь файл себе в Telegram «Избранное».</div>
        <div class="btn-row"><button class="btn sm primary" data-act="backup">⬆ Сделать бэкап</button><label class="btn sm">⬇ Восстановить<input type="file" accept=".json" data-act="restore" hidden></label></div>
        <hr class="s"><button class="btn sm" data-act="reset" style="color:var(--bad)">Сбросить всё</button>
      </div>
      <div class="muted tiny" style="text-align:center;margin:16px 0">Frontline v1.1 · всегда на передней линии<br>Фото упражнений: free-exercise-db (общественное достояние)</div>
    `;
  },
};

function habitRow(k, name, v) {
  return `<li class="row tap" data-act="habit" data-k="${k}"><span class="pill ${v === true ? 'ok' : v === false ? 'bad' : ''}" style="width:30px;justify-content:center">${v === true ? '✓' : v === false ? '✕' : '·'}</span><span class="small">${name}</span></li>`;
}
function streak(k) {
  let n = 0, d = today();
  if ((S.habits[d] || {})[k] !== true) d = addDays(d, -1);
  while ((S.habits[d] || {})[k] === true) { n++; d = addDays(d, -1); }
  return n;
}
const lastReach = () => S.reach.length ? S.reach[S.reach.length - 1].v : S.profile.jumpReach;

/* ---------- рендер ---------- */
const TITLES = { today: 'Frontline', train: 'Тренер', food: 'Питание', progress: 'Прогресс', more: 'Ещё' };
function render() {
  $('#view').innerHTML = VIEWS[TAB]();
  $('#title').textContent = TITLES[TAB];
  $('#topRight').textContent = TAB === 'today' ? `${curWeight()} кг` : '';
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === TAB));
}
document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => { TAB = b.dataset.tab; if (TAB === 'train') selDay = today(); render(); window.scrollTo(0, 0); });

/* ---------- тренировка ---------- */
function openWorkout(key, d) {
  const w = buildWorkout(key, d);
  const legs = ['gymA', 'gymB', 'home', 'volley'].includes(key);
  const pain = S.pain[d];
  const done = S.done[d] || {};
  let n = 0;
  const html = `
    <div class="row"><span class="dot c-${w.color}"></span><span class="muted small">${DOW_FULL[parse(d).getDay()]}, ${fmtDate(d)} · ${w.dur}</span></div>
    <h2 style="margin-top:6px">${w.title}</h2>
    <div class="muted small">${w.note}</div>
    ${legs ? `<div class="card" style="margin-top:14px"><div class="small"><b>Как колено сегодня?</b> <span class="muted">0 — не болит, 10 — сильно</span></div>
      <div class="pain" style="margin-top:8px">${[0, 2, 4, 6, 8, 10].map(v => `<button class="${pain === v ? 'on' : ''}" data-pain="${v}">${v}</button>`).join('')}</div>
      <div class="tiny muted" style="margin-top:8px">${pain == null ? 'Отметь — тренер подстроит упражнения.' : pain <= 2 ? '✓ Всё по плану.' : pain < 6 ? '⚠ Нагрузку на колено заменили на щадящие упражнения.' : '⛔ Сегодня только верх и корпус. Если боль держится больше недели — к ортопеду.'}</div></div>` : ''}
    ${w.blocks.map(b => `<div class="section-title">${b.t}</div><div class="card"><ul class="list">${b.items.map(it => {
      n++;
      const e = EX[it.id];
      if (pain >= 6 && e.g === 'Ноги' ) return '';
      return `<li class="ex ${done[it.uid] ? 'done' : ''}" data-ex="${it.uid}|${it.id}|${it.sets}|${esc(it.reps)}|${it.rest || ''}">
        <span class="num">${done[it.uid] ? '✓' : n}</span>
        <div style="flex:1"><div class="ex-name">${e.n}</div><div class="ex-meta">${it.sets > 1 ? it.sets + ' × ' : ''}${it.reps}${it.rest ? ` · отдых ${it.rest} с` : ''}</div>
        ${it.from ? `<div class="swap">↺ замена для «${EX[it.from].n}» из-за колена</div>` : ''}</div></li>`;
    }).join('')}</ul></div>`).join('')}
    <button class="btn primary block" data-finish style="margin-top:8px">${S.finished[d] === key ? '✓ Тренировка завершена' : 'Завершить тренировку'}</button>`;
  openSheet(html, el => {
    el.querySelectorAll('[data-pain]').forEach(b => b.onclick = () => { S.pain[d] = +b.dataset.pain; save(); openWorkout(key, d); render(); });
    el.querySelectorAll('[data-ex]').forEach(li => li.onclick = () => {
      const [uid, id, sets, reps, rest] = li.dataset.ex.split('|');
      openExercise({ uid, id, sets: +sets, reps, rest }, d, () => openWorkout(key, d));
    });
    el.querySelector('[data-finish]').onclick = () => {
      S.finished[d] = key; save(); render(); closeSheet();
      toast('💜 Тренировка засчитана! Не забудь записать данные с часов.');
    };
  });
}

function openExercise(it, d, back) {
  const e = EX[it.id];
  const hist = (S.sets[it.id] || []).slice(-6).reverse();
  const isDone = (S.done[d] || {})[it.uid];
  const weighted = !['Кардио', 'Разминка', 'Заминка'].includes(e.g);
  openSheet(`
    <button class="btn sm" data-back>← Назад</button>
    <h2 style="margin-top:12px">${e.n}</h2>
    <div class="row wrap"><span class="pill">${e.g}</span>${e.knee === 'safe' ? '<span class="pill ok">бережно к коленям</span>' : e.knee === 'jump' ? '<span class="pill warn">прыжковое</span>' : '<span class="pill warn">нагрузка на колено</span>'}</div>
    <div class="card" style="margin-top:12px"><div class="muted tiny">Подходы</div><div style="font-size:20px;font-weight:800">${it.sets > 1 ? it.sets + ' × ' : ''}${esc(it.reps)}</div>${it.rest ? `<div class="muted tiny">отдых ${it.rest} с</div>` : ''}</div>
    ${PHOTOS.has(it.id) ? `<div class="photo" data-photo>
        <img src="img/${it.id}-0.jpg" alt="${esc(e.n)} — старт" loading="lazy"><img src="img/${it.id}-1.jpg" alt="${esc(e.n)} — финиш" loading="lazy" class="p2">
        <div class="photo-tabs"><span class="on">Старт</span><span>Финиш</span></div><div class="photo-hint">нажми, чтобы остановить</div></div>` : ''}
    <div class="card"><div class="muted tiny">Техника</div><div class="small" style="margin-top:4px">${e.how}</div>
      <a class="btn sm" style="margin-top:10px" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent(e.n.replace(/\s*\(.*?\)/g, '') + ' техника выполнения')}">▶ Видео техники на YouTube</a></div>
    ${weighted ? `<div class="card"><div class="small"><b>Записать подход</b></div>
      <div class="row" style="margin-top:8px"><input type="number" inputmode="decimal" placeholder="вес, кг" id="sw" value="${hist[0] ? hist[0].w : ''}"><input type="number" inputmode="numeric" placeholder="повторы" id="sr"><button class="btn primary" data-addset>+</button></div>
      ${hist.length ? `<table class="t" style="margin-top:8px">${hist.map(h => `<tr><td class="muted small">${fmtShort(h.d)}</td><td class="r small">${h.w} кг × ${h.r}</td></tr>`).join('')}</table>` : '<div class="muted tiny" style="margin-top:6px">Если вес собственный — пиши 0.</div>'}</div>` : ''}
    ${it.rest ? `<button class="btn block" data-timer>⏱ Таймер отдыха ${it.rest} с</button>` : ''}
    <button class="btn ${isDone ? '' : 'primary'} block" data-done style="margin-top:8px">${isDone ? 'Отметка снята? Нажми ещё раз' : '✓ Упражнение сделано'}</button>
  `, el => {
    el.querySelector('[data-back]').onclick = () => { clearInterval(openExercise._p); back(); };
    // фото: чередуем «старт» и «финиш», как короткая анимация движения
    const ph = el.querySelector('[data-photo]');
    clearInterval(openExercise._p);
    if (ph) {
      let f = 0, run = true;
      const show = () => { ph.classList.toggle('alt', f === 1); ph.querySelectorAll('.photo-tabs span').forEach((s, i) => s.classList.toggle('on', i === f)); };
      openExercise._p = setInterval(() => { if (run && document.body.contains(ph)) { f = 1 - f; show(); } }, 1300);
      ph.onclick = ev => {
        const tab = ev.target.closest('.photo-tabs span');
        if (tab) { run = false; f = [...tab.parentNode.children].indexOf(tab); }
        else { run = !run; }
        ph.querySelector('.photo-hint').textContent = run ? 'нажми, чтобы остановить' : 'нажми, чтобы запустить';
        show();
      };
    }
    const add = el.querySelector('[data-addset]');
    if (add) add.onclick = () => {
      const w = parseFloat($('#sw').value), r = parseInt($('#sr').value, 10);
      if (isNaN(w) || isNaN(r)) return toast('Впиши вес и повторы');
      (S.sets[it.id] = S.sets[it.id] || []).push({ d, w, r }); save();
      toast(`Записано: ${w} кг × ${r}`); openExercise(it, d, back);
    };
    const tm = el.querySelector('[data-timer]');
    if (tm) tm.onclick = () => {
      let left = +it.rest; clearInterval(openExercise._t);
      tm.textContent = `⏱ ${left} с`;
      openExercise._t = setInterval(() => {
        left--; tm.textContent = left > 0 ? `⏱ ${left} с` : '🔥 Погнали!';
        if (left <= 0) { clearInterval(openExercise._t); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); }
      }, 1000);
    };
    el.querySelector('[data-done]').onclick = () => {
      S.done[d] = S.done[d] || {};
      if (S.done[d][it.uid]) delete S.done[d][it.uid]; else S.done[d][it.uid] = 1;
      save(); render(); back();
    };
  });
}

function openLibrary() {
  const groups = {};
  Object.entries(EX).forEach(([id, e]) => (groups[e.g] = groups[e.g] || []).push([id, e]));
  openSheet(`<h2>Упражнения</h2><div class="muted small">Нажми на любое — откроется техника.</div>` +
    Object.entries(groups).map(([g, arr]) => `<div class="section-title">${g}</div><div class="card"><ul class="list">${arr.map(([id, e]) => `<li class="ex" data-lib="${id}">${PHOTOS.has(id) ? `<img class="thumb" src="img/${id}-0.jpg" alt="" loading="lazy">` : '<span class="thumb"></span>'}<div style="flex:1"><div class="ex-name">${e.n}</div></div>${e.knee === 'safe' ? '' : '<span class="pill warn">колено</span>'}</li>`).join('')}</ul></div>`).join(''),
  el => el.querySelectorAll('[data-lib]').forEach(li => li.onclick = () => openExercise({ uid: 'lib', id: li.dataset.lib, sets: 1, reps: '—' }, today(), openLibrary)));
}

/* ---------- формы ---------- */
function form(title, fields, onSave, extra = '') {
  openSheet(`<h2>${title}</h2>${extra}<form id="f" style="margin-top:12px">${fields.map(f => `<label class="f"><span>${f.l}</span>
    <input name="${f.n}" type="${f.t || 'number'}" ${f.t ? '' : 'step="any" inputmode="decimal"'} value="${f.v ?? ''}" placeholder="${f.ph || ''}"></label>`).join('')}
    <button class="btn primary block" type="submit">Сохранить</button></form>`, el => {
    el.querySelector('#f').onsubmit = ev => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(ev.target));
      if (onSave(data) !== false) { save(); closeSheet(); render(); }
    };
  });
}
const num = v => (v === '' || v == null ? null : parseFloat(String(v).replace(',', '.')));

function addWeight() {
  form('Взвешивание', [{ n: 'd', l: 'Дата', t: 'date', v: today() }, { n: 'v', l: 'Вес, кг', v: '', ph: String(curWeight()) }], x => {
    const v = num(x.v); if (!v) return toast('Впиши вес'), false;
    S.weights = S.weights.filter(w => w.d !== x.d).concat({ d: x.d, v }).sort((a, b) => a.d.localeCompare(b.d));
    toast(v < curWeight() + 0.01 ? 'Записано 💪' : 'Записано');
  }, '<div class="muted small">Утром, натощак. Колебания ±1 кг за день — это вода, не паникуй.</div>');
}
function addReach() {
  form('Досягаемость в прыжке', [{ n: 'd', l: 'Дата', t: 'date', v: today() }, { n: 'v', l: 'Досягаемость, см (например 315)', ph: String(lastReach()) }], x => {
    const v = num(x.v); if (!v) return toast('Впиши высоту'), false;
    S.reach = S.reach.filter(w => w.d !== x.d).concat({ d: x.d, v }).sort((a, b) => a.d.localeCompare(b.d));
    toast(`Прыжок: ${v - S.profile.standReach} см`);
  }, '<div class="muted small">Лучшая из 3 попыток с разбега, после разминки.</div>');
}
function addMeasure() {
  const l = S.measures[S.measures.length - 1] || {};
  form('Замеры, см', [{ n: 'd', l: 'Дата', t: 'date', v: today() }, { n: 'waist', l: 'Талия (на уровне пупка)', ph: l.waist }, { n: 'chest', l: 'Грудь', ph: l.chest }, { n: 'hip', l: 'Бёдра (самое широкое место)', ph: l.hip }, { n: 'arm', l: 'Бицепс (напряжённый)', ph: l.arm }], x => {
    const m = { d: x.d }; ['waist', 'chest', 'hip', 'arm'].forEach(k => { const v = num(x[k]); if (v) m[k] = v; });
    S.measures = S.measures.filter(w => w.d !== x.d).concat(m).sort((a, b) => a.d.localeCompare(b.d));
  });
}
function sleepLog() {
  const y = addDays(today(), -1), s = S.sleep[y] || {}, sp = sleepPlan();
  form('Сон', [{ n: 'bed', l: 'Вчера лёг в', t: 'time', v: s.bed || '' }, { n: 'wake', l: 'Сегодня встал в', t: 'time', v: s.wake || '' }], x => {
    S.sleep[y] = { bed: x.bed, wake: x.wake };
    if (x.bed && x.wake) { let h = (toMin(x.wake) - toMin(x.bed) + 1440) % 1440; toast(`Сон: ${Math.floor(h / 60)} ч ${h % 60} мин`); }
  }, `<div class="card hero" style="margin-top:10px"><div class="small">Сегодня: отбой <b class="grad-text">${sp.bed}</b>, подъём <b>${sp.wake}</b> — ${sp.reason}.</div><div class="muted tiny" style="margin-top:4px">Цель — 8 часов. Записывай, во сколько реально лёг: если поздно, тренер сдвинет отбой постепенно.</div></div>`);
}
function editProfile() {
  const p = S.profile;
  form('Профиль и цели', [
    { n: 'name', l: 'Имя', t: 'text', v: p.name }, { n: 'age', l: 'Возраст', v: p.age }, { n: 'height', l: 'Рост, см', v: p.height },
    { n: 'startWeight', l: 'Стартовый вес, кг', v: p.startWeight }, { n: 'goalWeight', l: 'Целевой вес, кг', v: p.goalWeight },
    { n: 'standReach', l: 'Досягаемость стоя, см', v: p.standReach }, { n: 'goalReach', l: 'Цель по досягаемости, см', v: p.goalReach },
    { n: 'sleepGoal', l: 'Идеальный отбой', t: 'time', v: p.sleepGoal }, { n: 'commute', l: 'Сборы + дорога до вуза, мин', v: p.commute },
    { n: 'startDate', l: 'Дата старта программы', t: 'date', v: p.startDate },
  ], x => {
    for (const k in x) p[k] = ['name', 'sleepGoal', 'startDate'].includes(k) ? x[k] : (num(x[k]) ?? p[k]);
    toast('Сохранено');
  });
}
function addClass() {
  form('День пар', [{ n: 'd', l: 'Дата', t: 'date', v: today() }, { n: 'a', l: 'Начало первой пары', t: 'time', v: '08:20' }, { n: 'b', l: 'Конец последней', t: 'time', v: '13:10' }, { n: 'n', l: 'Заметка (необязательно)', t: 'text' }], x => {
    if (!x.d) return false;
    S.classAdd[x.d] = [x.a, x.b].concat(x.n ? [x.n] : []); delete S.classOff[x.d];
  }, '<div class="muted small">Если расписание поменялось — добавь или исправь день здесь.</div>');
}
function zeppAdd(pref = {}) {
  form('Тренировка с часов', [
    { n: 'd', l: 'Дата', t: 'date', v: pref.d || today() }, { n: 'type', l: 'Тип', t: 'text', v: pref.type || (dayPlan(today()).main === 'volley' ? 'Волейбол' : 'Зал') },
    { n: 'min', l: 'Длительность, мин', v: pref.min }, { n: 'avg', l: 'Средний пульс', v: pref.avg }, { n: 'max', l: 'Макс. пульс', v: pref.max }, { n: 'kcal', l: 'Калории', v: pref.kcal },
  ], x => {
    S.zepp.push({ d: x.d, type: x.type || 'Тренировка', min: num(x.min), avg: num(x.avg), max: num(x.max), kcal: num(x.kcal) });
    S.zepp.sort((a, b) => a.d.localeCompare(b.d)); toast('Добавлено');
  });
}

function addFood() {
  openSheet(`<h2>Добавить еду</h2>
    <input id="q" placeholder="Поиск: курица, борщ, шаурма…" autocomplete="off" style="margin-top:8px">
    <div class="food-res" id="res"></div>
    <div id="pick"></div>
    <hr class="s"><button class="btn sm" id="custom">+ Своё блюдо (ккал вручную)</button>`, el => {
    const res = el.querySelector('#res'), q = el.querySelector('#q');
    const show = () => {
      const s = q.value.trim().toLowerCase();
      res.innerHTML = FOODS.map((f, i) => [f, i]).filter(([f]) => !s || f[0].toLowerCase().includes(s)).slice(0, 40)
        .map(([f, i]) => `<div data-i="${i}"><span class="small">${f[0]}</span><span class="muted tiny" style="white-space:nowrap">${f[1]} ккал/100</span></div>`).join('') || '<div class="muted small">Не нашёл — добавь как своё блюдо</div>';
      res.querySelectorAll('[data-i]').forEach(r => r.onclick = () => pick(+r.dataset.i));
    };
    const pick = i => {
      const f = FOODS[i];
      el.querySelector('#pick').innerHTML = `<div class="card hero"><b class="small">${f[0]}</b>
        <div class="row" style="margin-top:8px"><input id="g" type="number" inputmode="numeric" value="${f[5]}"><span class="muted small">г/мл</span></div>
        <div class="muted tiny" id="calc" style="margin:8px 0"></div><button class="btn primary block" id="ok">Добавить</button></div>`;
      const g = el.querySelector('#g'), calc = () => { const k = (+g.value || 0) / 100; el.querySelector('#calc').textContent = `${Math.round(f[1] * k)} ккал · Б ${round(f[2] * k, .1)} · Ж ${round(f[3] * k, .1)} · У ${round(f[4] * k, .1)}`; };
      g.oninput = calc; calc(); g.focus(); g.select();
      el.querySelector('#ok').onclick = () => {
        const k = (+g.value || 0) / 100; if (!k) return;
        pushFood({ name: f[0], g: +g.value, kcal: f[1] * k, p: f[2] * k, f: f[3] * k, c: f[4] * k });
      };
    };
    q.oninput = show; show();
    el.querySelector('#custom').onclick = () => form('Своё блюдо', [{ n: 'name', l: 'Название', t: 'text' }, { n: 'g', l: 'Вес, г', v: 100 }, { n: 'kcal', l: 'Калории всего' }, { n: 'p', l: 'Белки, г' }, { n: 'f', l: 'Жиры, г' }, { n: 'c', l: 'Углеводы, г' }], x => {
      if (!num(x.kcal)) return toast('Впиши калории'), false;
      pushFood({ name: x.name || 'Блюдо', g: num(x.g) || 0, kcal: num(x.kcal), p: num(x.p) || 0, f: num(x.f) || 0, c: num(x.c) || 0 }, true);
    });
  });
}
function pushFood(item, viaForm) {
  const d = today(); (S.food[d] = S.food[d] || []).push(item);
  if (/газировка обычная/i.test(item.name)) { S.habits[d] = { ...(S.habits[d] || {}), soda: false }; }
  if (/энергетик/i.test(item.name)) { S.habits[d] = { ...(S.habits[d] || {}), energy: false }; }
  save(); if (!viaForm) { closeSheet(); render(); }
  const left = targets(d).kcal - eaten(d).kcal;
  toast(left >= 0 ? `Добавлено · осталось ${Math.round(left)} ккал` : `Перебор на ${Math.round(-left)} ккал`);
}

/* ---------- календарь .ics ---------- */
function makeICS() {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Frontline//RU', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Frontline'];
  const start = parse(today()); const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  let uid = 0;
  const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const ev = (dateIso, time, durMin, title, desc, rrule, alarmMin) => {
    const dt = dateIso.replace(/-/g, '') + 'T' + time.replace(':', '') + '00';
    const end = new Date(parse(dateIso).getTime() + (toMin(time) + durMin) * 60000);
    const de = iso(end).replace(/-/g, '') + 'T' + pad(end.getHours()) + pad(end.getMinutes()) + '00';
    lines.push('BEGIN:VEVENT', `UID:frontline-${++uid}-${stamp}@local`, `DTSTAMP:${stamp}`, `DTSTART:${dt}`, `DTEND:${de}`, `SUMMARY:${title}`, `DESCRIPTION:${desc}`);
    if (rrule) lines.push(`RRULE:${rrule}`);
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, `TRIGGER:-PT${alarmMin}M`, 'END:VALARM', 'END:VEVENT');
  };
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const dow = d.getDay(), pl = WEEK_TEMPLATE[dow], w = WORKOUTS[pl.main];
    const dur = pl.main === 'volley' ? 120 : pl.main === 'rest' ? 60 : 90;
    ev(iso(d), pl.time, dur, `💜 ${w.title}`, w.note.replace(/[,;]/g, ' '), `FREQ=WEEKLY;BYDAY=${BY[dow]}`, 60);
    if (pl.extra) ev(iso(d), '08:00', 15, `🦵 ${WORKOUTS[pl.extra].title}`, '15 минут: колени и плечи', `FREQ=WEEKLY;BYDAY=${BY[dow]}`, 0);
  }
  if (S.remind.water) ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00'].forEach(t => ev(today(), t, 5, '💧 Выпей стакан воды', 'Frontline: вода', 'FREQ=DAILY', 0));
  if (S.remind.sleep) ev(today(), S.profile.sleepGoal, 15, '🌙 Пора спать', 'Убери телефон. Цель — 8 часов сна', 'FREQ=DAILY', 30);
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  download(blob, 'frontline-napominaniya.ics');
  openSheet(`<h2>Как добавить в календарь</h2><ol class="small" style="padding-left:18px;line-height:1.7">
    <li>Файл <b>frontline-napominaniya.ics</b> скачан.</li>
    <li>На компьютере открой <b>calendar.google.com</b> → шестерёнка → <b>Настройки</b> → <b>Импорт и экспорт</b>.</li>
    <li>Выбери файл и нажми <b>Импорт</b>.</li>
    <li>Через минуту напоминания появятся в Google Календаре на телефоне — он будет присылать уведомления даже когда Frontline закрыт.</li></ol>
    <div class="muted tiny">Изменил расписание или время отбоя? Удали старые события и импортируй новый файл.</div>`);
}

/* ---------- бэкап ---------- */
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
async function backup() {
  const name = `frontline-backup-${today()}.json`;
  const file = new File([JSON.stringify(S)], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Frontline бэкап', text: `Бэкап Frontline ${fmtDate(today())}` });
      return toast('Отправь в Telegram → Избранное');
    }
  } catch (e) { if (e.name === 'AbortError') return; }
  download(file, name); toast('Файл скачан — перешли его себе в Telegram');
}
function restore(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data.profile) throw new Error();
      if (!confirm('Заменить текущие данные данными из бэкапа?')) return;
      S = deepMerge(structuredClone(DEFAULT), data); save(); render(); toast('Восстановлено ✓');
    } catch (e) { toast('Это не файл бэкапа Frontline'); }
  };
  r.readAsText(file);
}

/* ---------- импорт Zepp ---------- */
function importZepp(file) {
  const r = new FileReader();
  r.onload = () => {
    const txt = r.result, out = { type: 'Тренировка' };
    try {
      if (/<TrainingCenterDatabase/i.test(txt) || /<gpx/i.test(txt)) {
        const doc = new DOMParser().parseFromString(txt, 'application/xml');
        const all = tag => Array.from(doc.getElementsByTagName('*')).filter(n => n.localName === tag);
        const hr = all('HeartRateBpm').map(n => +n.textContent.trim()).concat(all('hr').map(n => +n.textContent)).filter(v => v > 30);
        const times = all('Time').concat(all('time')).map(n => new Date(n.textContent)).filter(t => !isNaN(t));
        const tot = all('TotalTimeSeconds').reduce((a, n) => a + +n.textContent, 0);
        const cal = all('Calories').reduce((a, n) => a + +n.textContent, 0);
        const sport = all('Activity')[0]; if (sport && sport.getAttribute('Sport')) out.type = sport.getAttribute('Sport');
        if (times.length) out.d = iso(times[0]);
        out.min = Math.round((tot || (times.length > 1 ? (times[times.length - 1] - times[0]) / 1000 : 0)) / 60) || null;
        if (hr.length) { out.avg = Math.round(hr.reduce((a, b) => a + b, 0) / hr.length); out.max = Math.max(...hr); }
        if (cal) out.kcal = Math.round(cal);
      } else {
        const rows = txt.trim().split(/\r?\n/).map(l => l.split(/[;,\t]/));
        const head = rows[0].map(h => h.toLowerCase()); const last = rows[rows.length - 1];
        const col = re => head.findIndex(h => re.test(h));
        const get = re => { const i = col(re); return i >= 0 ? last[i] : null; };
        out.min = num(get(/durat|длит|time|время/)); out.avg = num(get(/avg|средн/)); out.max = num(get(/max|макс/)); out.kcal = num(get(/cal|ккал|калор/));
        const dt = get(/date|дата|start/); if (dt && !isNaN(new Date(dt))) out.d = iso(new Date(dt));
        if (out.min > 600) out.min = Math.round(out.min / 60);
      }
      toast('Проверь данные и сохрани'); zeppAdd(out);
    } catch (e) { toast('Не смог прочитать файл — введи вручную'); zeppAdd(); }
  };
  r.readAsText(file);
}

/* ---------- обработчики ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act, d = today();
  switch (a) {
    case 'openWorkout': e.stopPropagation(); openWorkout(t.dataset.key, t.dataset.date); break;
    case 'water': { const n = +t.dataset.n; S.water[d] = (S.water[d] || 0) === n ? n - 1 : n; save(); render(); if (S.water[d] === targets().waterGl) toast('💧 Норма воды выполнена!'); break; }
    case 'habit': { const h = S.habits[d] = S.habits[d] || {}; const k = t.dataset.k; h[k] = h[k] === true ? false : h[k] === false ? undefined : true; save(); render(); break; }
    case 'goFood': TAB = 'food'; foodSeg = 'diary'; render(); break;
    case 'addWeight': addWeight(); break;
    case 'addReach': addReach(); break;
    case 'addMeasure': addMeasure(); break;
    case 'sleepLog': sleepLog(); break;
    case 'selDay': selDay = t.dataset.d; render(); break;
    case 'library': openLibrary(); break;
    case 'foodSeg': foodSeg = t.dataset.s; render(); break;
    case 'addFood': addFood(); break;
    case 'delFood': S.food[d].splice(+t.dataset.i, 1); save(); render(); break;
    case 'shop': S.shop = S.shop || {}; S.shop[t.dataset.i] = t.checked; save(); break;
    case 'shopReset': S.shop = {}; save(); render(); break;
    case 'profile': editProfile(); break;
    case 'toggleClass': S.classOff[t.dataset.d] ? delete S.classOff[t.dataset.d] : (S.classOff[t.dataset.d] = 1); save(); render(); break;
    case 'addClass': addClass(); break;
    case 'zeppAdd': zeppAdd(); break;
    case 'ics': makeICS(); break;
    case 'backup': backup(); break;
    case 'remindOn': toggleRemind(t.checked); break;
    case 'remindKey': S.remind[t.dataset.k] = t.checked; save(); break;
    case 'reset': if (confirm('Удалить все данные? Это нельзя отменить. Сначала сделай бэкап.')) { localStorage.removeItem(KEY); S = structuredClone(DEFAULT); render(); } break;
  }
});
document.addEventListener('change', e => {
  const a = e.target.dataset.act, f = e.target.files && e.target.files[0];
  if (!f) return;
  if (a === 'restore') restore(f);
  if (a === 'zeppFile') importZepp(f);
  e.target.value = '';
});

/* ---------- уведомления ---------- */
async function toggleRemind(on) {
  if (on) {
    if (!('Notification' in window)) { toast('Браузер не поддерживает уведомления'); return render(); }
    const p = await Notification.requestPermission();
    if (p !== 'granted') { toast('Разреши уведомления в настройках браузера'); S.remind.on = false; save(); return render(); }
  }
  S.remind.on = on; save(); render();
  if (on) notify('Frontline', 'Напоминания включены 💜');
}
async function notify(title, body) {
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [150, 80, 150] });
    else new Notification(title, { body });
  } catch (e) { /* ignore */ }
}
function tick() {
  if (!S.remind.on || Notification.permission !== 'granted') return;
  const d = today(), now = new Date(), m = now.getHours() * 60 + now.getMinutes();
  const fired = S.fired[d] = S.fired[d] || {};
  const once = (k, title, body) => { if (!fired[k]) { fired[k] = 1; save(); notify(title, body); } };
  const pl = dayPlan(d);
  if (S.remind.train && !S.finished[d] && m >= toMin(pl.time) - 60 && m < toMin(pl.time)) once('train', `Через час: ${WORKOUTS[pl.main].title}`, 'Собери форму, воду и полотенце 💪');
  if (S.remind.water && m >= 9 * 60 && m <= 21 * 60) {
    const slot = Math.floor(m / 120), expected = Math.round(((m - 540) / 720) * targets(d).waterGl);
    if ((S.water[d] || 0) < expected - 1) once('w' + slot, '💧 Время воды', `Выпито ${S.water[d] || 0} из ${targets(d).waterGl} стаканов`);
  }
  if (S.remind.sleep) { const b = toMin(sleepPlan(d).bed); const bm = b < 12 * 60 ? b + 1440 : b; const mm = m < 12 * 60 ? m + 1440 : m; if (mm >= bm - 30 && mm < bm) once('sleep', '🌙 Через 30 минут отбой', sleepPlan(d).reason); }
}
setInterval(tick, 60000);

/* ---------- старт ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
render(); tick();

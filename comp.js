/* Подбор программ по компетенциям (страница для HR и руководителей).
   Механика ранжирования — из Лин.ИИ dpo-catalog rules:
   1) покрытие выбранных компетенций (убыв.), 2) часы (возр.), 3) алфавит.
   Всё считается на клиенте, данные никуда не отправляются (§0 ТЗ). */
'use strict';

const pick = { role: null, comps: new Set() };

const compById = Object.fromEntries(COMPETENCIES.map((c) => [c.id, c]));
const progComps = (p) => COMP_TAGS[p.id] || [];

function progHours(p) {
  if (typeof p.hours === 'number') return p.hours;
  const m = /(\d+)/.exec(p.duration || '');
  return m ? +m[1] : 999;
}

function typeBadge(p) {
  if (p.type === 'simulator') return '<span class="badge b-sim">Тренажёр</span>';
  if (p.type === 'online') return '<span class="badge b-online">Онлайн-курс</span>';
  return '<span class="badge b-type">Повышение квалификации</span>';
}

function metaLine(p) {
  if (p.type === 'simulator') return `${esc(p.duration || 'длительность уточняется')}`;
  if (p.type === 'online') return `${esc(p.format)} · ${esc(p.duration)}`;
  return `${esc(p.format)} · ${p.hours} ак. ч`;
}

function priceLine(p) {
  if (p.free) return '<span style="color:var(--green-700)">Бесплатно</span>';
  return esc(p.price || 'Цена по запросу');
}

/* ── Рендер подборки ── */
function renderPick() {
  const sel = pick.comps;
  const host = $('#pickResults');
  const cnt = $('#pickCount');

  if (!sel.size) {
    host.innerHTML = '<div class="ph">Выберите роль слева или отметьте компетенции — здесь появится подборка программ.</div>';
    cnt.innerHTML = '';
    return;
  }

  const scored = ALL_PROGRAMS
    .map((p) => {
      const comps = progComps(p);
      const hits = comps.filter((c) => sel.has(c));
      return { p, comps, hits, score: hits.length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || progHours(a.p) - progHours(b.p) || a.p.title.localeCompare(b.p.title, 'ru'));

  cnt.innerHTML = `Подобрано программ: <b>${scored.length}</b> · компетенций выбрано: <b>${sel.size}</b>`;

  if (!scored.length) {
    host.innerHTML = `<div class="ph"><b>Готовой программы под этот набор нет.</b><br>Разработаем курс под задачи предприятия — <a href="#" onclick="openContacts('подбор: нет готовой программы');return false;">свяжитесь с нами</a>.</div>`;
    return;
  }

  host.innerHTML = scored.map(({ p, comps, hits }) => {
    const mcls = p.type === 'simulator' ? 'm-sim' : p.type === 'online' ? 'm-online' : '';
    const compChips = comps.map((c) =>
      `<span class="cc ${hits.includes(c) ? 'hit' : ''}">${esc(compById[c].short)}</span>`).join('');
    const simNote = p.type === 'simulator'
      ? `<div style="font-size:.8rem;color:#5b3fd6;font-weight:600;margin-top:.4rem">Измеряет компетенции телеметрией — подходит для оценки «до/после»</div>` : '';
    return `<article class="match-card ${mcls}">
      <div class="mc-top">
        <div>
          <div class="badges" style="margin-bottom:.4rem">${typeBadge(p)}${p.popular ? '<span class="badge b-popular">Популярно</span>' : ''}${p.free ? '<span class="badge b-free">Бесплатно</span>' : ''}</div>
          <h4>${esc(p.title)}</h4>
          <div class="mc-meta">${metaLine(p)}</div>
        </div>
        <div class="cover"><b>${hits.length}/${sel.size}</b>покрытие</div>
      </div>
      <div class="mc-comps">${compChips}</div>
      ${simNote}
      <div class="mc-foot">
        <span class="price">${priceLine(p)}</span>
        <span>
          <a class="btn btn-ghost btn-sm" href="index.html#catalog" style="margin-right:.4rem">В каталоге</a>
          <button class="btn btn-primary btn-sm" onclick='openContacts(${JSON.stringify(p.title)}, {name:${JSON.stringify(p.resp || '')}, email:${JSON.stringify(p.email || '')}})'>Связаться с нами</button>
        </span>
      </div>
    </article>`;
  }).join('');
}

/* ── Панель выбора ── */
function buildPicker() {
  $('#roleList').innerHTML = ROLES.map((r) =>
    `<button class="role-btn" data-role="${r.id}" aria-pressed="false">${esc(r.label)}</button>`).join('');
  $('#compChecks').innerHTML = COMPETENCIES.map((c) =>
    `<label class="check"><input type="checkbox" value="${c.id}"> ${esc(c.label)}</label>`).join('');

  $$('#roleList .role-btn').forEach((b) => b.addEventListener('click', () => {
    const role = ROLES.find((r) => r.id === b.dataset.role);
    const on = b.getAttribute('aria-pressed') === 'true';
    $$('#roleList .role-btn').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    pick.comps.clear();
    if (!on) {
      b.setAttribute('aria-pressed', 'true');
      role.comps.forEach((c) => pick.comps.add(c));
    }
    $$('#compChecks input').forEach((i) => (i.checked = pick.comps.has(i.value)));
    renderPick();
  }));

  $('#compChecks').addEventListener('change', (e) => {
    if (e.target.checked) pick.comps.add(e.target.value); else pick.comps.delete(e.target.value);
    $$('#roleList .role-btn').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    renderPick();
  });

  $('#pickReset').addEventListener('click', () => {
    pick.comps.clear();
    $$('#compChecks input').forEach((i) => (i.checked = false));
    $$('#roleList .role-btn').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    renderPick();
  });
}

/* ── Матрица компетенции × программы ── */
function buildMatrix() {
  const head = `<tr><th>Программа</th>${COMPETENCIES.map((c) => `<th>${esc(c.short)}</th>`).join('')}</tr>`;
  const groups = [
    ['Курсы повышения квалификации', COURSES],
    ['Онлайн-курсы', ONLINE],
    ['Симуляторы и тренажёры', SIMULATORS],
  ];
  const rows = groups.map(([title, list]) =>
    `<tr class="type-row"><th colspan="${COMPETENCIES.length + 1}">${title}</th></tr>` +
    list.map((p) => {
      const comps = progComps(p);
      const hrs = p.type === 'course' ? `${p.hours} ак. ч` : (p.duration || '');
      return `<tr><th>${esc(p.title)}<small>${esc(hrs)}</small></th>${
        COMPETENCIES.map((c) => `<td>${comps.includes(c.id) ? '<span class="dot-on"></span>' : ''}</td>`).join('')}</tr>`;
    }).join('')
  ).join('');
  $('#matrixWrap').innerHTML = `<table class="matrix"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

document.addEventListener('DOMContentLoaded', () => {
  buildPicker();
  buildMatrix();
  renderPick();
});

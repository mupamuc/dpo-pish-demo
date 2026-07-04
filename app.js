/* Логика каталога ДПО. §0 ТЗ: сайт не собирает данные — кнопки только показывают контакты. */
'use strict';

const state = {
  tab: 'course',          // course | president | simulator | online
  audience: 'private',    // private | company
  search: '',
  dirs: new Set(),
  formats: new Set(),
  durations: new Set(),
  freeOnly: false,
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── Счётчик кликов «Связаться с нами» (§9 — без личных данных) ── */
function trackContact(label) {
  try {
    const key = 'dpo_contact_clicks';
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    data[label] = (data[label] || 0) + 1;
    localStorage.setItem(key, JSON.stringify(data));
    console.info('[аналитика] Связаться с нами →', label, '· всего:', data[label]);
  } catch (e) { /* приватный режим — молча пропускаем */ }
}

/* ── Контактная модалка ── */
function openContacts(label, resp) {
  trackContact(label || 'общий');
  const c = CONTACTS.center;
  const IC = {
    person: '<svg class="li" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.9-3.4 3.7-5.2 7-5.2s6.1 1.8 7 5.2"/></svg>',
    mail: '<svg class="li" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
    phone: '<svg class="li" viewBox="0 0 24 24"><path d="M6 3h3l2 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z"/></svg>',
  };
  const rows = [];
  if (resp && resp.email) rows.push({ ic: IC.person, l: 'Ответственный за программу', v: `${esc(resp.name)} · <a href="mailto:${esc(resp.email)}?subject=${encodeURIComponent('Вопрос по программе ДПО: ' + (label || ''))}">${esc(resp.email)}</a>` });
  rows.push({ ic: IC.mail, l: c.name, v: `<a href="mailto:${esc(c.email)}?subject=${encodeURIComponent('Вопрос по программам ДПО')}">${esc(c.email)}</a>` });
  rows.push({ ic: IC.phone, l: 'Телефон', v: `<a href="tel:${c.phone.replace(/[^+\d]/g, '')}">${esc(c.phone)}</a>` });
  $('#modalBody').innerHTML = `
    <button class="m-close" aria-label="Закрыть" onclick="closeContacts()">×</button>
    <h3>Связаться с нами</h3>
    <p class="sub">Заявок на сайте нет — напишите или позвоните, ответим сами.</p>
    ${rows.map((r) => `<div class="m-row"><div class="ic">${r.ic}</div><div><div class="l">${r.l}</div><div class="v">${r.v}</div></div></div>`).join('')}
    <div class="m-reply">${esc(CONTACTS.replyTime)}</div>`;
  $('#modalBack').classList.add('open');
}
function closeContacts() { $('#modalBack').classList.remove('open'); }

/* ── Фильтрация ── */
function matches(p) {
  if (state.search) {
    const q = state.search.toLowerCase();
    if (!(p.title.toLowerCase().includes(q) || (p.dirs || []).some((d) => d.toLowerCase().includes(q)))) return false;
  }
  if (state.dirs.size && !(p.dirs || []).some((d) => state.dirs.has(d))) return false;
  if (state.freeOnly && !p.free) return false;
  if (state.formats.size) {
    const f = (p.format || '').toLowerCase();
    let ok = false;
    if (state.formats.has('Очно') && /очно(?!-заочн)/.test(f)) ok = true;
    if (state.formats.has('Дистанционно') && /дистанц|онлайн/.test(f)) ok = true;
    if (state.formats.has('Очно-заочно') && /очно-заочн/.test(f)) ok = true;
    if (!ok) return false;
  }
  if (state.durations.size) {
    const b = durationBucket(p.hours);
    if (!b || !state.durations.has(b)) return false;
  }
  return true;
}

function currentList() {
  let list;
  if (state.tab === 'course') list = COURSES;
  else if (state.tab === 'online') list = ONLINE;
  else if (state.tab === 'simulator') list = SIMULATORS;
  else return [];
  list = list.filter(matches);
  // порядок: сначала «Кому» — для компаний двигаем корпоративные вверх; популярные всегда выше
  list = [...list].sort((a, b) => {
    const pa = a.popular ? 1 : 0, pb = b.popular ? 1 : 0;
    if (pa !== pb) return pb - pa;
    if (state.audience === 'company') {
      const ca = /от|груп|запрос/i.test(a.priceCompany || '') ? 1 : 0;
      const cb = /от|груп|запрос/i.test(b.priceCompany || '') ? 1 : 0;
      if (ca !== cb) return cb - ca;
    }
    return 0;
  });
  return list;
}

/* ── Рендер карточек ── */
function cardHTML(p) {
  const badges = [];
  if (p.type === 'course') badges.push('<span class="badge b-type">Повышение квалификации</span>');
  if (p.type === 'online') badges.push('<span class="badge b-online">Онлайн-курс</span>');
  if (p.type === 'simulator') badges.push('<span class="badge b-sim">Тренажёр</span>');
  if (p.popular) badges.push('<span class="badge b-popular">Популярно</span>');
  if (p.free) badges.push('<span class="badge b-free">Бесплатно</span>');
  if (p.inDevelopment) badges.push('<span class="badge b-paid">В разработке</span>');
  if (p.awards && p.awards.length) badges.push(`<span class="badge b-award">🏆 ${p.awards.length > 1 ? p.awards.length + ' награды' : 'награда'}</span>`);

  let metaLine, footLeft, footBtn;

  if (p.type === 'simulator') {
    metaLine = `${esc(p.dirs[0])} · ${esc(p.duration || 'уточняется')}`;
    footLeft = `<div class="price">${esc(p.price)}</div>`;
    footBtn = `<button class="btn btn-ghost btn-sm" onclick='openById("${p.id}")'>Подробнее</button>`;
    return `<article class="card t-simulator">
      <div class="body">
        <div class="badges">${badges.join('')}</div>
        <h3>${esc(p.title)}</h3>
        <div class="meta">${metaLine}</div>
        ${p.usedAt ? `<div class="trust">Используется на ${esc(p.usedAt)} предприятиях</div>` : ''}
        <div class="foot">${footLeft}${footBtn}</div>
      </div></article>`;
  }

  // course / online
  const fmt = p.type === 'online'
    ? `${esc(p.format)} · ${esc(p.duration)}`
    : `${esc(p.format)} · ${p.hours} ак. ч`;
  const priceHTML = p.free
    ? `<div class="price free">Бесплатно</div>`
    : `<div class="price">${esc(state.audience === 'company' && p.priceCompany ? p.priceCompany : p.price)}<small>${state.audience === 'company' ? 'для компании' : 'частному лицу'}</small></div>`;
  const startNote = p.type === 'online' && p.instantStart ? `<div class="trust">⚡ Быстрый старт без ожидания группы</div>` : '';

  return `<article class="card ${p.type === 'online' ? 't-online' : ''}">
    <div class="body">
      <div class="badges">${badges.join('')}</div>
      <h3>${esc(p.title)}</h3>
      <div class="meta">${fmt}</div>
      ${startNote}
      <div class="foot">${priceHTML}
        <button class="btn btn-ghost btn-sm" onclick='openById("${p.id}")'>Подробнее</button></div>
    </div></article>`;
}

function renderCatalog() {
  // president tab → own template (hide grid + banner)
  const isPres = state.tab === 'president';
  $('#presidentBlock').style.display = isPres ? '' : 'none';
  $('#catalogGrid').style.display = isPres ? 'none' : '';
  $('#customBanner').style.display = isPres ? 'none' : '';
  if (isPres) return;

  // текст баннера зависит от типа продукта: на вкладке симуляторов продаём разработку под заказ
  const cbTitle = $('#customBanner .cb-t');
  const cbText = $('#customBanner p');
  const cbBtn = $('#customBanner button');
  if (cbTitle && cbText && cbBtn) {
    if (state.tab === 'simulator') {
      cbTitle.textContent = 'Не нашли готовый тренажёр под вашу отрасль?';
      cbText.textContent = 'Разрабатываем симуляторы под конкретный производственный процесс — сценарий на ваших данных, телеметрия и отчёт по компетенциям.';
      cbBtn.setAttribute('onclick', "openContacts('баннер: разработка симулятора под заказ')");
    } else {
      cbTitle.textContent = 'Не нашли подходящую программу?';
      cbText.textContent = 'Разработаем индивидуальный курс или корпоративную программу под задачи вашего предприятия.';
      cbBtn.setAttribute('onclick', "openContacts('баннер: разработка под заказчика')");
    }
  }

  // filters relevance: only courses use format/duration groups
  $('#formatDurationGroups').style.display = state.tab === 'course' ? '' : 'none';
  $('#freeOnlyGroup').style.display = state.tab === 'online' ? '' : 'none';

  const list = currentList();
  $('#resultCount').innerHTML = `Найдено программ: <b>${list.length}</b>`;
  const cards = $('#cards');
  if (!list.length && state.tab !== 'president') {
    cards.innerHTML = `<div class="empty"><b>Ничего не нашлось</b>Попробуйте снять часть фильтров или изменить запрос. Можем разработать программу под вашу задачу — <a href="#" onclick="openContacts('баннер: под заказчика');return false;">связаться с нами</a>.</div>`;
  } else {
    cards.innerHTML = list.map(cardHTML).join('');
  }
}

/* ── Детальная страница программы ── */
function findById(id) { return ALL_PROGRAMS.find((p) => p.id === id); }

function openById(id) {
  const p = findById(id);
  if (!p) return;
  renderDetail(p);
  document.body.classList.add('view-detail');
  window.scrollTo({ top: $('#catalog').offsetTop - 60, behavior: 'smooth' });
}
function closeDetail() {
  document.body.classList.remove('view-detail');
  window.scrollTo({ top: $('#catalog').offsetTop - 60, behavior: 'smooth' });
}

function factsHTML(p) {
  const f = [];
  f.push(['Формат', esc(p.format)]);
  if (p.type === 'online') { f.push(['Срок', esc(p.duration)]); }
  else if (p.type === 'simulator') { f.push(['Длительность', esc(p.duration || 'уточняется')]); }
  else { f.push(['Срок', p.hours + ' ак. ч']); }
  if (p.doc) f.push(['Документ', esc(p.doc)]);
  const statusVal = p.type === 'online' && p.instantStart
    ? '<span class="status-go">Доступ сразу</span>'
    : (p.status ? (/идёт/i.test(p.status) ? `<span class="status-go">${esc(p.status)}</span>` : esc(p.status)) : (p.usedAt ? esc(p.usedAt) + ' предприятий' : '—'));
  f.push([p.type === 'simulator' ? 'Внедрений' : 'Статус потока', statusVal]);
  return `<div class="facts">${f.map(([l, v]) => `<div class="f"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}</div>`;
}

function priceSidebarHTML(p) {
  if (p.type === 'simulator') {
    return `<div class="price-block">
        <div class="l">Стоимость</div><div class="p">${esc(p.price)}</div>
        <div class="note">Стоимость зависит от формата и числа участников.</div>
        ${p.demo ? `<button class="btn btn-ghost btn-block" style="margin-bottom:.6rem" onclick="alert('Демо-доступ — по запросу через контакты.')">▶ Демо</button>` : ''}
        <button class="btn btn-green btn-block" onclick='openById_contact("${p.id}")'>Связаться с нами</button>
      </div>`;
  }
  if (p.free) {
    return `<div class="price-block">
        <div class="l">Стоимость</div><div class="p" style="color:var(--green-700)">Бесплатно</div>
        <div class="note">Онлайн-курс, доступ сразу.</div>
        <button class="btn btn-green btn-block" onclick='openById_contact("${p.id}")'>Связаться с нами</button>
      </div>`;
  }
  // paid course/online — two prices per §6/§7
  let html = `<div class="price-block">
      <div class="l">Частному лицу</div><div class="p">${esc(p.price)}</div>
      ${p.orgPay ? `<div class="note">Можно оплатить от организации</div>` : ''}
      <button class="btn btn-green btn-block" onclick='openById_contact("${p.id}")'>Связаться с нами</button>
    </div>`;
  if (p.priceCompany) {
    html += `<div class="price-block">
      <div class="l">Компании (группа от 8 чел.)</div><div class="p">${esc(p.priceCompany)}</div>
      <button class="btn btn-ghost btn-block" onclick='openById_contact("${p.id}")'>Связаться (для компаний)</button>
    </div>`;
  }
  return html;
}
function openById_contact(id) { const p = findById(id); openContacts(p ? p.title : '', p ? { name: p.resp, email: p.email } : null); }

function similarHTML(p) {
  const sim = ALL_PROGRAMS.filter((x) => x.id !== p.id && (x.dirs || []).some((d) => (p.dirs || []).includes(d))).slice(0, 3);
  if (!sim.length) return '';
  return `<p style="color:var(--muted);font-size:.85rem;margin:1.4rem 0 .3rem">Похожие программы</p>
    <div class="similar">${sim.map((s) => `<a class="s" href="#" onclick='openById("${s.id}");return false;'>${esc(s.title)}</a>`).join('')}</div>`;
}

function renderDetail(p) {
  const badges = [];
  if (p.level) badges.push(`<span class="badge b-type">${esc(p.level)}${p.level.includes('уровень') ? '' : ' уровень'}</span>`);
  if (p.type === 'simulator') badges.unshift('<span class="badge b-sim">Тренажёр</span>');
  if (p.type === 'online') badges.unshift('<span class="badge b-online">Онлайн-курс</span>');
  if (p.free) badges.push('<span class="badge b-free">Бесплатно</span>');
  if (p.popular) badges.push('<span class="badge b-popular">Популярно</span>');

  const backDir = (p.dirs && p.dirs[0]) || 'Каталог';

  // tabs content
  const learn = (p.learn || []).map((l) => `<li><span class="ck">✓</span>${esc(l)}</li>`).join('');
  const mods = (p.modules || []);
  const modsHTML = mods.length
    ? `<ul class="mod-list">${mods.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><p class="mod-note">Полная программа курса предоставляется по запросу.</p>`
    : `<p class="mod-note">Подробная программа курса предоставляется по запросу.</p>`;

  // awards (simulator)
  let awardsHTML = '';
  if (p.awards && p.awards.length) {
    awardsHTML = `<div style="margin:1rem 0"><b style="color:var(--navy)">Награды</b><ul class="learn-list" style="margin-top:.4rem">${p.awards.map((a) => `<li><span class="ck">🏆</span>${esc(a)}</li>`).join('')}</ul></div>`;
  }

  const galleryHTML = p.type === 'simulator'
    ? `<div class="gallery">${[1, 2, 3].map((i) => `<div class="shot">скриншот ${i}</div>`).join('')}</div>`
    : '';

  const descTab = p.type === 'simulator'
    ? `${galleryHTML}<h4 style="margin-bottom:.4rem">О тренажёре</h4><p style="color:var(--ink-2)">${esc(p.theme)}</p><h4 style="margin:1rem 0 .4rem">Для кого</h4><p style="color:var(--ink-2)">${esc(p.forWho)}</p>${awardsHTML}`
    : `<h4 style="margin-bottom:.6rem">Чему вы научитесь</h4><ul class="learn-list">${learn}</ul>${awardsHTML}`;

  // disclosure
  let disclosure = '';
  if (p.basis || p.authors) {
    disclosure = `<details class="disclosure"><summary>▸ Подробнее о программе</summary><div class="dc-body">
      ${p.basis ? `<h4>Основание программы</h4><p>${esc(p.basis)}</p>` : ''}
      ${p.authors ? `<h4>Авторы</h4><p>${esc(p.authors)}</p>` : ''}
    </div></details>`;
  }

  // contacts
  const respRow = (p.resp && p.email) ? `<div class="row">Ответственный: <b>${esc(p.resp)}</b> · <a href="mailto:${esc(p.email)}">${esc(p.email)}</a></div>` : '';
  const contact = `<div class="contact-card"><h4>Контакты</h4>
    ${respRow}
    <div class="row">${esc(CONTACTS.center.name)} · <a href="mailto:${esc(CONTACTS.center.email)}">${esc(CONTACTS.center.email)}</a></div>
    <div class="reply">${esc(CONTACTS.replyTime)}</div></div>`;

  const hasProgramTab = p.type !== 'simulator';

  $('#detail').innerHTML = `
    <div class="breadcrumb"><button onclick="closeDetail()">← ${esc(backDir)}</button></div>
    <div class="detail-head">
      <div class="badges">${badges.join('')}</div>
      <h1>${esc(p.title)}</h1>
      <div class="forwho">${esc(p.forWho)}</div>
      ${p.passed ? `<div class="trust">Курс уже прошли ${esc(p.passed)} специалистов</div>` : ''}
    </div>
    <div class="detail-grid">
      <div>
        <div class="dtabs">
          <button class="dtab" data-dt="desc" aria-selected="true">Описание</button>
          ${hasProgramTab ? `<button class="dtab" data-dt="prog" aria-selected="false">Программа</button>` : ''}
        </div>
        <div data-dtp="desc">${descTab}</div>
        ${hasProgramTab ? `<div data-dtp="prog" hidden>${modsHTML}</div>` : ''}
        ${disclosure}
      </div>
      <aside>
        ${factsHTML(p)}
        ${p.practice ? `<div class="practice-flag">🔧 Включает практику на тренажёре</div>` : ''}
        ${priceSidebarHTML(p)}
        ${similarHTML(p)}
        ${contact}
      </aside>
    </div>`;

  // wire detail tabs
  $$('.dtab', $('#detail')).forEach((t) => t.addEventListener('click', () => {
    $$('.dtab', $('#detail')).forEach((x) => x.setAttribute('aria-selected', x === t));
    $$('[data-dtp]', $('#detail')).forEach((panel) => { panel.hidden = panel.getAttribute('data-dtp') !== t.dataset.dt; });
  }));
}

/* ── President block ── */
function renderPresident() {
  const P = PRESIDENT;
  const linked = P.linkedCourses.map((id) => findById(id)).filter(Boolean);
  $('#presidentBlock').innerHTML = `
    <div class="pres-card">
      <div class="pres-head">
        <span class="eyebrow">Флагманская программа</span>
        <h2>${esc(P.title)}</h2>
      </div>
      <div class="pres-facts">
        <div class="f"><div class="l">Срок</div><div class="v">${esc(P.facts.hours)}</div></div>
        <div class="f"><div class="l">Набор</div><div class="v">${esc(P.facts.intake)}</div></div>
        <div class="f"><div class="l">Город</div><div class="v">${esc(P.facts.city)}</div></div>
        <div class="f"><div class="l">Документ</div><div class="v">${esc(P.facts.doc)}</div></div>
      </div>
      <div class="pres-deadline">📅 ${esc(P.deadline)} <span class="sp">· ${esc(P.studyPeriod)}</span></div>
      <div class="pres-benefits">
        ${P.benefits.map((b) => `<div class="pres-benefit"><div class="bt">✓ ${esc(b.title)}</div><p>${esc(b.text)}</p></div>`).join('')}
      </div>
      <div class="pres-body">
        <div class="dtabs">
          <button class="dtab" data-pt="desc" aria-selected="true">Описание</button>
          <button class="dtab" data-pt="types" aria-selected="false">Программа и типы</button>
        </div>
        <div data-ptp="desc">
          <p style="color:var(--ink-2)">${esc(P.forWho)}</p>
          ${linked.length ? `<p style="color:var(--muted);font-size:.85rem;margin:1rem 0 .3rem">Дисциплины программы есть и в общем каталоге:</p>
            <div class="similar">${linked.map((c) => `<a class="s" href="#" onclick='state.tab="${c.type}";syncTabs();renderCatalog();openById("${c.id}");return false;'>${esc(c.title)}</a>`).join('')}</div>` : ''}
        </div>
        <div data-ptp="types" hidden>
          ${P.types.map((t) => `<div class="pres-benefit" style="margin-bottom:.7rem"><div class="bt">${esc(t.name)}</div><p><b>${esc(t.audience)}.</b> ${esc(t.share)}</p></div>`).join('')}
        </div>
      </div>
      <div class="pres-actions">
        <a class="btn btn-ghost" href="#faq">Условия участия</a>
        <button class="btn btn-primary" onclick="openContacts('Президентская программа')">Узнать об участии</button>
      </div>
      <div style="padding:0 2rem 1.6rem"><div class="contact-card" style="margin:0"><h4>Контакты</h4>
        <div class="row">${esc(P.manager.name)}</div>
        <div class="row">${esc(CONTACTS.center.name)} · <a href="mailto:${esc(CONTACTS.center.email)}">${esc(CONTACTS.center.email)}</a></div>
        <div class="reply">${esc(CONTACTS.replyTime)}</div></div></div>
    </div>`;
  $$('.dtab', $('#presidentBlock')).forEach((t) => t.addEventListener('click', () => {
    $$('.dtab', $('#presidentBlock')).forEach((x) => x.setAttribute('aria-selected', x === t));
    $$('[data-ptp]', $('#presidentBlock')).forEach((panel) => { panel.hidden = panel.getAttribute('data-ptp') !== t.dataset.pt; });
  }));
}

/* ── Sidebar filter build ── */
function buildFilters() {
  const dirWrap = $('#dirGroups');
  dirWrap.innerHTML = DIRECTION_GROUPS.map((g, i) => `
    <details class="dir-group" ${i === 0 ? 'open' : ''}>
      <summary>${esc(g.group)}<span class="chev">›</span></summary>
      ${g.items.map((d) => `<label class="check"><input type="checkbox" value="${esc(d)}" data-kind="dir">${esc(d)}</label>`).join('')}
    </details>`).join('');
  dirWrap.addEventListener('change', (e) => {
    const v = e.target.value;
    if (e.target.checked) state.dirs.add(v); else state.dirs.delete(v);
    renderCatalog();
  });
}

function syncTabs() {
  $$('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === state.tab));
  document.body.classList.remove('view-detail');
}

/* ── Оценка через симуляторы (радар, гейты, диагност) ── */
function radarSVG(size, axes, series) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 34, N = axes.length;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / N;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  let g = '';
  [0.33, 0.66, 1].forEach((k) => {
    g += `<polygon points="${axes.map((_, i) => pt(i, R * k).join(',')).join(' ')}" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1"/>`;
  });
  axes.forEach((_, i) => { const [x, y] = pt(i, R); g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(255,255,255,.14)" stroke-width="1"/>`; });
  const labels = axes.map((a, i) => {
    const [x, y] = pt(i, R + 19);
    return `<text x="${x}" y="${y}" fill="rgba(255,255,255,.68)" font-size="10.5" font-weight="600" text-anchor="middle" dominant-baseline="middle">${esc(a)}</text>`;
  }).join('');
  const polys = series.map((s) =>
    `<polygon points="${s.values.map((v, i) => pt(i, (R * v) / 100).join(',')).join(' ')}"
      fill="${s.fill}" stroke="${s.stroke}" stroke-width="2" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round"/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Профиль компетенций">${g}${polys}${labels}</svg>`;
}

function renderAssessment() {
  const host = $('#assessKpis');
  if (!host) return;
  const A = ASSESSMENT;
  host.innerHTML = [
    [A.cohort.participants, 'участников пилота'],
    [A.cohort.decisions.toLocaleString('ru-RU'), 'решений записано'],
    [A.cohort.hoursSim + ' ч', 'в симуляторе'],
    [A.cohort.finalists, 'дошли до финала'],
  ].map(([n, l]) => `<div class="assess-kpi"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');

  $('#radarWrap').innerHTML = radarSVG(250, A.axes, [
    { values: A.avgProfile, fill: 'rgba(255,255,255,.10)', stroke: 'rgba(255,255,255,.45)', dash: '5 4' },
    { values: A.exampleStrong, fill: 'rgba(63,204,113,.18)', stroke: '#3FCC71' },
  ]);

  $('#gatesList').innerHTML = A.gates.map((gt) =>
    `<div class="gate-row"><svg class="li" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>
      <span class="gname">${esc(gt.label)}</span><span class="ghint">${esc(gt.hint)}</span></div>`).join('');

  const total = A.statuses.reduce((s, x) => s + x.n, 0);
  $('#statusBar').innerHTML = A.statuses.map((s) =>
    `<div class="seg-${s.cls}" style="width:${(100 * s.n / total).toFixed(1)}%" title="${esc(s.label)}: ${s.n}"></div>`).join('');
  const dotColor = { ok: '#3FCC71', mid: '#f2b036', low: 'rgba(255,255,255,.28)' };
  $('#statusLegend').innerHTML = A.statuses.map((s) =>
    `<span><span class="dot" style="background:${dotColor[s.cls]}"></span><b>${esc(s.label)}</b> — ${s.n} (${esc(s.rule)})</span>`).join('');

  $('#lossList').innerHTML = A.losses.map((l) => `
    <div class="loss-row">
      <div class="lr-top"><span>${esc(l.label)}</span><span class="v">${l.value}%</span></div>
      <div class="loss-track"><div class="fill" style="width:${l.value}%"></div><div class="norm-mark" style="left:${l.norm}%"></div></div>
      <div class="loss-note">${esc(l.type)} · норма ≤ ${l.norm}%</div>
    </div>`).join('');
}

/* ── Кейсы (фильтр по отраслям) ── */
let caseSector = 'all';
function renderCases() {
  const host = $('#caseCards');
  if (!host) return;
  const sectors = [...new Set(CASES.map((c) => c.sector))];
  $('#caseFilters').innerHTML =
    `<button class="chip" data-sector="all" aria-pressed="${caseSector === 'all'}">Все отрасли (${CASES.length})</button>` +
    sectors.map((s) => `<button class="chip" data-sector="${esc(s)}" aria-pressed="${caseSector === s}">${esc(s)} (${CASES.filter((c) => c.sector === s).length})</button>`).join('');
  $$('#caseFilters .chip').forEach((b) => b.addEventListener('click', () => { caseSector = b.dataset.sector; renderCases(); }));

  const list = CASES.filter((c) => caseSector === 'all' || c.sector === caseSector);
  host.innerHTML = list.map((c) => `
    <article class="case-card">
      <div class="cc-top">
        <span class="badge b-sector">${esc(c.sector)}</span>
        <span class="badge b-loss">${esc(c.loss)}</span>
        ${c.ready ? '' : '<span class="badge b-tpl">в разработке</span>'}
      </div>
      <h3>${esc(c.title)}</h3>
      <div class="cc-tools">${c.tools.map(esc).join(' · ')}</div>
      ${c.target ? `<div class="cc-target"><small>Целевой эффект</small>${esc(c.target)}</div>` : ''}
    </article>`).join('');
}

/* ── График «команда vs ИИ-оптимум» ── */
function renderTrajectory() {
  const host = $('#trajChart');
  if (!host) return;
  const W = 460, H = 210, P = { l: 44, r: 12, t: 12, b: 24 };
  const wk = TRAJECTORY.weeks;
  const xs = wk.map((w) => w[0]);
  const maxY = Math.max(...wk.map((w) => Math.max(w[1], w[2])));
  const x = (v) => P.l + ((v - xs[0]) / (xs[xs.length - 1] - xs[0])) * (W - P.l - P.r);
  const y = (v) => H - P.b - (v / maxY) * (H - P.t - P.b);
  const path = (idx) => wk.map((w, i) => `${i ? 'L' : 'M'}${x(w[0]).toFixed(1)},${y(w[idx]).toFixed(1)}`).join('');
  const gridY = [0.25, 0.5, 0.75, 1].map((k) => {
    const v = maxY * k, yy = y(v);
    return `<line x1="${P.l}" y1="${yy}" x2="${W - P.r}" y2="${yy}" stroke="rgba(255,255,255,.1)"/>
      <text x="${P.l - 6}" y="${yy + 3}" fill="rgba(255,255,255,.45)" font-size="9" text-anchor="end">${Math.round(v / 1000)}к</text>`;
  }).join('');
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Прибыль команды против ИИ-оптимума по неделям">
    ${gridY}
    <path d="${path(2)}" fill="none" stroke="#3FCC71" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="${path(1)}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>
    <text x="${P.l}" y="${H - 6}" fill="rgba(255,255,255,.45)" font-size="9">недели ${xs[0]}–${xs[xs.length - 1]}</text>
    <text x="${W - P.r}" y="${H - 6}" fill="rgba(255,255,255,.45)" font-size="9" text-anchor="end">— — команда · ── ИИ-оптимум</text>
  </svg>`;
  $('#trajSum').innerHTML = `Упущенная выгода команды за прохождение: <b>${TRAJECTORY.sumGain.toLocaleString('ru-RU')} у.е.</b> — её ИИ-диагност переводит в конкретные рекомендации.`;
}

/* ── Init ── */
function init() {
  // модалка и клавиши — на всех страницах
  const mb = $('#modalBack');
  if (mb) {
    mb.addEventListener('click', (e) => { if (e.target === mb) closeContacts(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeContacts(); });
  }
  renderAssessment();
  renderCases();
  renderTrajectory();
  if (!$('#cards')) return; // страница без каталога (например, подбор программ)
  // counts on tabs
  $('#tabCourse .cnt').textContent = COURSES.length;
  $('#tabSim .cnt').textContent = SIMULATORS.length;
  $('#tabOnline .cnt').textContent = ONLINE.length;

  buildFilters();
  renderPresident();

  // tabs
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    state.tab = t.dataset.tab; syncTabs(); renderCatalog();
  }));
  // audience
  $$('.aud-switch button').forEach((b) => b.addEventListener('click', () => {
    state.audience = b.dataset.aud;
    $$('.aud-switch button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    renderCatalog();
  }));
  // search
  $('#searchInput').addEventListener('input', (e) => { state.search = e.target.value.trim(); renderCatalog(); });
  // format
  $$('[data-kind="format"]').forEach((c) => c.addEventListener('change', (e) => {
    if (e.target.checked) state.formats.add(e.target.value); else state.formats.delete(e.target.value);
    renderCatalog();
  }));
  // duration chips
  $$('[data-kind="dur"]').forEach((c) => c.addEventListener('click', () => {
    const v = c.dataset.val, on = c.getAttribute('aria-pressed') === 'true';
    c.setAttribute('aria-pressed', !on);
    if (!on) state.durations.add(v); else state.durations.delete(v);
    renderCatalog();
  }));
  // free only
  $('#freeOnly').addEventListener('change', (e) => { state.freeOnly = e.target.checked; renderCatalog(); });
  // reset
  $('#filterReset').addEventListener('click', () => {
    state.search = ''; state.dirs.clear(); state.formats.clear(); state.durations.clear(); state.freeOnly = false;
    $('#searchInput').value = ''; $('#freeOnly').checked = false;
    $$('#sidebar input[type=checkbox]').forEach((c) => (c.checked = false));
    $$('[data-kind="dur"]').forEach((c) => c.setAttribute('aria-pressed', 'false'));
    renderCatalog();
  });
  // mobile filters
  $('#mobileFilterBtn').addEventListener('click', () => document.body.classList.add('filters-open'));
  $('#sidebarClose').addEventListener('click', () => document.body.classList.remove('filters-open'));
  document.addEventListener('click', (e) => {
    if (document.body.classList.contains('filters-open') && e.target === document.body) document.body.classList.remove('filters-open');
  });
  renderCatalog();
}

document.addEventListener('DOMContentLoaded', init);

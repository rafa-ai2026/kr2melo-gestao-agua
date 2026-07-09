(() => {
  'use strict';
  const KEY = 'kr2melo.hidrometro.v1';
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
  const n = value => Number(value) || 0;
  const esc = (value = '') => { const node = document.createElement('div'); node.textContent = String(value ?? ''); return node.innerHTML; };
  const fmt = value => n(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const monthLabel = month => monthFmt.format(new Date(`${month}-02T12:00:00`));
  let state = load(), blockIndex = 0, unitIndex = 0, searchText = '', keepSearchFocus = false;

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY));
      return parsed && Array.isArray(parsed.blocks) ? parsed : { selected: null, blocks: [] };
    } catch { return { selected: null, blocks: [] }; }
  }
  function save(message = '') {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      if (window.KR2Sync?.autoEnabled?.()) window.KR2Sync.queuePush(JSON.parse(JSON.stringify(state)));
      if (message) toast(message);
      return true;
    } catch {
      toast('Nao foi possivel salvar. Libere espaco no navegador.', true);
      return false;
    }
  }
  function toast(message, error = false) {
    const el = $('#toast');
    el.textContent = message;
    el.className = `toast show${error ? ' error' : ''}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.className = 'toast'; }, 2200);
  }
  function cost(m3, tariff) {
    const use = Math.max(0, n(m3)), t = { minimum: 64.6, tier1: 8.94, tier2: 13.82, ...(tariff || {}) };
    if (use <= 10) return n(t.minimum);
    if (use <= 20) return n(t.minimum) + (use - 10) * n(t.tier1);
    return n(t.minimum) + 10 * n(t.tier1) + (use - 20) * n(t.tier2);
  }
  function currentBlock() { return state.blocks.find(block => block.id === state.selected) || state.blocks[blockIndex] || state.blocks[0] || null; }
  function currentUnit() { return currentBlock()?.units?.[unitIndex] || null; }
  function isDone(unit) { return unit && (unit.mobileDone || (unit.current !== '' && unit.current !== null && unit.current !== undefined)); }
  function doneCount(block) { return block.units.filter(isDone).length; }
  function noAccessCount(block) { return block.units.filter(unit => unit.readingType === 'estimated' && isDone(unit)).length; }
  function realCount(block) { return block.units.filter(unit => unit.readingType !== 'estimated' && isDone(unit)).length; }
  function alertCount(block) {
    return block.units.filter(unit => unit.current !== '' && unit.current !== null && unit.current !== undefined && issueFor(unit, n(unit.current))).length;
  }
  function savedAtLabel(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function initIndexes() {
    const selectedIndex = state.blocks.findIndex(block => block.id === state.selected);
    blockIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const block = currentBlock();
    const next = block?.units?.findIndex(unit => !isDone(unit));
    unitIndex = next >= 0 ? next : 0;
  }
  function issueFor(unit, current) {
    const previous = n(unit.previous), diff = current - previous;
    if (current < previous) return { level: 'danger', text: 'A leitura atual esta menor que a anterior.' };
    if (diff > 30) return { level: 'danger', text: 'Consumo acima de 30 m3. Confira antes de salvar.' };
    if (diff > 20) return { level: 'warn', text: 'Consumo entre 21 e 30 m3. Confira o hidrometro.' };
    if (diff > 15) return { level: 'warn', text: 'Consumo acima de 15 m3.' };
    return null;
  }
  function nextPendingIndex(block, start) {
    for (let i = start + 1; i < block.units.length; i++) if (!isDone(block.units[i])) return i;
    for (let i = 0; i < block.units.length; i++) if (!isDone(block.units[i])) return i;
    return Math.min(start + 1, block.units.length - 1);
  }
  function filteredUnits(block) {
    const q = searchText.trim().toLowerCase();
    return [...block.units].map((item, index) => ({ item, index }))
      .filter(({ item }) => !q || String(item.number).toLowerCase().includes(q) || String(item.resident || '').toLowerCase().includes(q))
      .sort((a, b) => Number(isDone(a.item)) - Number(isDone(b.item)) || String(a.item.number).localeCompare(String(b.item.number), 'pt-BR', { numeric: true }));
  }
  function jumpPending() {
    const block = currentBlock();
    if (!block) return;
    const next = block.units.findIndex(unit => !isDone(unit));
    if (next < 0) return toast('Todas as leituras foram conferidas.');
    unitIndex = next;
    render();
  }
  function reopenReading() {
    const unit = currentUnit();
    if (!unit) return;
    unit.mobileDone = false;
    if (unit.readingType === 'estimated' && unit.current === '') {
      unit.readingType = 'real';
      unit.estimatedReason = '';
    }
    save('Leitura reaberta');
    render();
  }

  function render() {
    const app = $('#mobileApp');
    if (!state.blocks.length) {
      app.innerHTML = `<section class="card hero"><h1>Nenhum condominio disponivel</h1><p>Cadastre o condominio e as unidades no painel administrativo antes da leitura em campo.</p></section>`;
      return;
    }
    const block = currentBlock(); const unit = currentUnit();
    if (!block || !unit) {
      app.innerHTML = '<section class="card"><h2>Sem apartamentos</h2><p class="muted">Cadastre apartamentos no painel administrativo.</p></section>';
      return;
    }
    const done = doneCount(block), percent = block.units.length ? Math.round(done / block.units.length * 100) : 0;
    const pending = Math.max(0, block.units.length - done), real = realCount(block), noAccess = noAccessCount(block), alerts = alertCount(block);
    const consumption = unit.current === '' ? 0 : Math.max(0, n(unit.current) - n(unit.previous));
    const orderedUnits = filteredUnits(block);
    const savedAt = savedAtLabel(unit.mobileSavedAt);
    const noAccessReason = unit.estimatedReason || 'Sem acesso';
    const reasonOption = label => `<option ${noAccessReason === label ? 'selected' : ''}>${label}</option>`;
    app.innerHTML = `<section class="card hero"><p>Leitura in loco</p><h1>${esc(block.name)}</h1><p>${monthLabel(block.month)} - ${done}/${block.units.length} leituras</p><div class="progress"><i style="width:${percent}%"></i></div></section>
      <section class="card compact-card"><label class="muted"><b>Condominio</b></label><select id="blockPick">${state.blocks.map((item, index) => `<option value="${index}" ${item.id === block.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></section>
      <section class="card route-summary" id="routeSummary"><div><small>Pendentes</small><strong>${pending}</strong></div><div><small>Lidas</small><strong>${real}</strong></div><div><small>Sem acesso</small><strong>${noAccess}</strong></div><div><small>Alertas</small><strong>${alerts}</strong></div></section>
      <section class="card mobile-tools"><input id="aptSearch" autocomplete="off" value="${esc(searchText)}" placeholder="Buscar apto ou morador"><button class="secondary pending-button" id="jumpPending">Ir para pendente</button></section>
      <section class="card reading-card"><div class="unit-head"><div><span class="muted">Apartamento</span><div class="unit-number">${esc(unit.number)}</div></div><span class="pill ${isDone(unit) ? 'ok' : 'warn'}">${isDone(unit) ? 'Salvo' : 'Pendente'}</span></div><p class="muted resident-line">${esc(unit.resident || 'Responsavel nao informado')}</p>${savedAt ? `<p class="saved-line">Salvo em ${esc(savedAt)}</p>` : ''}<div class="read-kpis"><div><small>Anterior</small><strong>${fmt(unit.previous)}</strong></div><div><small>Consumo</small><strong>${fmt(consumption)} m3</strong></div></div><div class="reading-big"><label>Leitura atual</label><input id="currentReading" inputmode="decimal" autocomplete="off" value="${unit.current === '' ? '' : esc(unit.current)}" placeholder="Digite e aperte Enter"></div><label class="note-field">Observacao da leitura<textarea id="mobileNote" rows="2" placeholder="Ex.: visor embacado, lacre rompido">${esc(unit.note || '')}</textarea></label><div id="alertBox"></div><button class="primary save-reading" id="saveBtn">Salvar e proximo</button><div class="no-access-row"><select id="noAccessReason">${reasonOption('Sem acesso')}${reasonOption('Morador ausente')}${reasonOption('Hidrometro inacessivel')}${reasonOption('Portao fechado')}</select><button class="secondary no-access" id="noAccessBtn">Marcar</button></div>${isDone(unit) ? '<button class="secondary reopen" id="reopenBtn">Reabrir leitura</button>' : ''}<div class="row nav-row"><button class="secondary" id="prevBtn">Anterior</button><button class="secondary" id="nextBtn">Proximo</button></div></section>
      <section class="card apt-card"><h3>Pendentes primeiro</h3><div class="apt-list">${orderedUnits.length ? orderedUnits.map(({ item, index }) => `<button data-jump="${index}" class="${index === unitIndex ? 'active' : ''} ${isDone(item) ? 'done' : ''}">${esc(item.number)}</button>`).join('') : '<p class="muted empty-list">Nenhum apartamento encontrado.</p>'}</div></section>`;
    bind();
    checkAlert($('#currentReading').value);
    setTimeout(() => {
      if (keepSearchFocus) {
        const search = $('#aptSearch');
        search?.focus();
        search?.setSelectionRange(search.value.length, search.value.length);
        keepSearchFocus = false;
      } else {
        $('#currentReading')?.focus();
      }
    }, 50);
  }
  function bind() {
    const block = currentBlock();
    $('#blockPick').onchange = event => { blockIndex = n(event.target.value); state.selected = state.blocks[blockIndex].id; unitIndex = 0; save(); render(); };
    $('#aptSearch').oninput = event => { searchText = event.target.value; keepSearchFocus = true; render(); };
    $('#jumpPending').onclick = jumpPending;
    $('#currentReading').oninput = event => checkAlert(event.target.value);
    $('#currentReading').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); saveReading(); } };
    $('#mobileNote').onchange = event => { const unit = currentUnit(); if (unit) { unit.note = event.target.value; save('Observacao salva'); } };
    $('#saveBtn').onclick = saveReading;
    $('#noAccessBtn').onclick = markNoAccess;
    const reopen = $('#reopenBtn');
    if (reopen) reopen.onclick = reopenReading;
    $('#prevBtn').onclick = () => { unitIndex = Math.max(0, unitIndex - 1); render(); };
    $('#nextBtn').onclick = () => { unitIndex = Math.min(block.units.length - 1, unitIndex + 1); render(); };
    document.querySelectorAll('[data-jump]').forEach(button => { button.onclick = () => { unitIndex = n(button.dataset.jump); render(); }; });
  }
  function checkAlert(value) {
    const unit = currentUnit(), box = $('#alertBox');
    if (!unit || !box) return;
    const raw = String(value).replace(',', '.').trim();
    if (raw === '') { box.innerHTML = ''; return; }
    const current = Number(raw);
    if (!Number.isFinite(current) || current < 0) { box.innerHTML = '<p class="alert danger">Digite uma leitura valida.</p>'; return; }
    const issue = issueFor(unit, current);
    box.innerHTML = issue ? `<p class="alert ${issue.level === 'danger' ? 'danger' : ''}">${issue.text}</p>` : '<p class="alert ok">Leitura dentro da faixa.</p>';
  }
  async function saveReading() {
    const block = currentBlock(), unit = currentUnit(), input = $('#currentReading');
    const raw = String(input.value).replace(',', '.').trim();
    if (raw === '') return toast('Digite a leitura atual.', true);
    const current = Number(raw);
    if (!Number.isFinite(current) || current < 0) return toast('Digite uma leitura valida.', true);
    const issue = issueFor(unit, current);
    if (issue && !confirm(`${issue.text}\n\nDeseja manter esta leitura?`)) return;
    unit.current = current;
    unit.readingType = 'real';
    unit.estimatedReason = '';
    unit.m3 = Math.max(0, current - n(unit.previous));
    unit.value = cost(unit.m3, block.tariff);
    unit.note = $('#mobileNote')?.value || '';
    unit.mobileDone = true;
    unit.mobileSavedAt = new Date().toISOString();
    state.selected = block.id;
    if (!save(`Apto ${unit.number} salvo`)) return;
    unitIndex = nextPendingIndex(block, unitIndex);
    render();
  }
  function markNoAccess() {
    const block = currentBlock(), unit = currentUnit();
    if (!block || !unit) return;
    const reason = $('#noAccessReason')?.value || 'Sem acesso';
    unit.current = '';
    unit.readingType = 'estimated';
    unit.estimatedReason = reason;
    unit.note = $('#mobileNote')?.value || reason;
    unit.m3 = 0;
    unit.value = 0;
    unit.mobileDone = true;
    unit.mobileSavedAt = new Date().toISOString();
    state.selected = block.id;
    if (!save(`Apto ${unit.number} marcado sem acesso`)) return;
    unitIndex = nextPendingIndex(block, unitIndex);
    render();
  }

  async function bootstrapCloudMobile() {
    if (!window.KR2Sync?.connected?.() || state.blocks.length) return;
    try {
      const remote = await window.KR2Sync.pullState();
      if (remote && Array.isArray(remote.blocks) && remote.blocks.length) {
        state = remote;
        localStorage.setItem(KEY, JSON.stringify(state));
        initIndexes();
        render();
      }
    } catch {}
  }
  initIndexes(); render(); bootstrapCloudMobile();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();

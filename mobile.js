(() => {
  'use strict';
  const KEY = 'kr2melo.hidrometro.v1';
  const APP_VERSION = '5.3.17';
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
  const n = value => Number(value) || 0;
  const esc = (value = '') => { const node = document.createElement('div'); node.textContent = String(value ?? ''); return node.innerHTML; };
  const fmt = value => n(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const monthLabel = month => monthFmt.format(new Date(`${month}-02T12:00:00`));
  let state = load(), blockIndex = 0, unitIndex = 0, searchText = '', keepSearchFocus = false, mobileFilter = localStorage.getItem('kr2melo.mobileFilter.v5317') || 'pendentes';

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY));
      return parsed && Array.isArray(parsed.blocks) ? parsed : { selected: null, blocks: [] };
    } catch { return { selected: null, blocks: [] }; }
  }
  function save(message = '') {
    try {
      state.version = APP_VERSION;
      state.blocks?.forEach(sortBlockUnits);
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
  function checkVersionNotice() {
    const key = 'kr2melo.mobileVersionSeen';
    const seen = localStorage.getItem(key);
    if (seen && seen !== APP_VERSION) toast(`Mobile atualizado para v${APP_VERSION}. Atualize a página se algo parecer antigo.`);
    localStorage.setItem(key, APP_VERSION);
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration?.().then(reg => reg?.update?.()).catch(() => {});
  }
  function cost(m3, tariff) {
    const use = Math.max(0, n(m3));
    const t = { minimum: 80.84, minimumM3: 10, tier1: 8.37, tier1Limit: 20, tier2: 10.87, tier2Limit: 30, sheetMinimum: 80.84, sheetAllowance: 10, sheetExcess: 8.37, ...(tariff || {}) };
    const mode = String(t.calculationMode || t.mode || '').trim();
    if (mode === 'spreadsheet_1938') {
      const allowance = Math.max(0, n(t.sheetAllowance));
      const minimum = Math.max(0, n(t.sheetMinimum));
      const excess = Math.max(0, n(t.sheetExcess));
      if (use <= allowance) return minimum;
      return minimum + (use - allowance) * excess;
    }
    const minimumM3 = Math.max(0, n(t.minimumM3 || 10));
    const tier1Limit = Math.max(minimumM3, n(t.tier1Limit || 20));
    if (use <= minimumM3) return n(t.minimum);
    if (use <= tier1Limit) return n(t.minimum) + (use - minimumM3) * n(t.tier1);
    return n(t.minimum) + (tier1Limit - minimumM3) * n(t.tier1) + (use - tier1Limit) * n(t.tier2);
  }
  function tariffV5311(raw = {}) {
    return { minimum: 80.84, minimumM3: 10, tier1: 8.37, tier1Limit: 20, tier2: 10.87, tier2Limit: 30, sheetMinimum: 80.84, sheetAllowance: 10, sheetExcess: 8.37, ...(raw || {}) };
  }
  function tariffForMonth(block, month = block?.month) {
    const periods = Array.isArray(block?.tariffPeriods) ? block.tariffPeriods
      .filter(item => item && item.effectiveMonth && item.effectiveMonth <= month)
      .sort((a, b) => String(a.effectiveMonth).localeCompare(String(b.effectiveMonth))) : [];
    return tariffV5311(periods.pop()?.tariff || block?.tariff);
  }
  function unitHistory(block, unit) {
    if (!block || !unit || !Array.isArray(block.history)) return [];
    return block.history.map(entry => {
      const found = (entry.units || []).find(item => String(item.id) === String(unit.id) || String(item.number) === String(unit.number));
      if (!found) return null;
      return { month: entry.month, m3: n(found.m3), current: found.current, water: cost(n(found.m3), entry.tariff || tariffForMonth(block, entry.month)) };
    }).filter(Boolean).sort((a, b) => String(b.month).localeCompare(String(a.month))).slice(0, 4);
  }
  function historyMarkup(block, unit) {
    const rows = unitHistory(block, unit);
    if (!rows.length) return '<section class="card history-card"><h3>Historico rapido</h3><p class="muted">Sem meses fechados para este apartamento.</p></section>';
    return `<section class="card history-card"><h3>Historico rapido</h3><div class="mobile-history-list">${rows.map(row => `<div><small>${esc(monthLabel(row.month))}</small><strong>${fmt(row.m3)} m3</strong><span>${moneyLike(row.water)}</span></div>`).join('')}</div></section>`;
  }
  function moneyLike(value) { return n(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function downloadMobileBackup() {
    const payload = { ...state, version: state.version || APP_VERSION, exportedAt: new Date().toISOString(), source: 'mobile' };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const block = currentBlock();
    a.href = url;
    a.download = `kr2melo-bkp-mobile-${(block?.name || 'condominio').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('BKP baixado no celular.');
  }
  function backupStateFromJson(raw) {
    const parsed = JSON.parse(raw);
    const candidate = parsed?.state && Array.isArray(parsed.state.blocks) ? parsed.state : parsed;
    if (!candidate || !Array.isArray(candidate.blocks)) throw new Error('invalid-backup');
    return { ...candidate, version: candidate.version || parsed.appVersion || parsed.version || APP_VERSION };
  }
  function uploadMobileBackup() {
    $('#mobileImportInput')?.click();
  }
  async function syncMobilePush() {
    if (!window.KR2Sync?.connected?.()) return toast('Entre na sincronizacao pelo painel antes de enviar.', true);
    try {
      await window.KR2Sync.pushState(JSON.parse(JSON.stringify(state)));
      toast('Dados enviados para a nuvem.');
    } catch (error) {
      toast(error.message || 'Falha ao enviar para nuvem.', true);
    }
  }
  async function syncMobilePull() {
    if (!window.KR2Sync?.connected?.()) return toast('Entre na sincronizacao pelo painel antes de baixar.', true);
    if (state.blocks.length && !confirm('Baixar da nuvem substitui os dados atuais deste celular. Continuar?')) return;
    try {
      const remote = await window.KR2Sync.pullState();
      if (!remote || !Array.isArray(remote.blocks)) return toast('Nenhum dado encontrado na nuvem.');
      state = remote;
      state.version = APP_VERSION;
      state.blocks?.forEach(sortBlockUnits);
      state.selected = state.blocks.some(block => block.id === state.selected) ? state.selected : (state.blocks[0]?.id || null);
      localStorage.setItem(KEY, JSON.stringify(state));
      searchText = '';
      initIndexes();
      toast('Dados baixados da nuvem.');
      render();
    } catch (error) {
      toast(error.message || 'Falha ao baixar da nuvem.', true);
    }
  }
  async function importMobileBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const imported = backupStateFromJson(await file.text());
      const count = imported.blocks.reduce((sum, block) => sum + (Array.isArray(block.units) ? block.units.length : 0), 0);
      const ok = confirm(`Restaurar este BKP no celular?\n\nCondominios: ${imported.blocks.length}\nApartamentos: ${count}\n\nIsso substitui os dados atuais deste aparelho.`);
      if (!ok) return;
      state = imported;
      state.version = APP_VERSION;
      state.blocks?.forEach(sortBlockUnits);
      state.selected = state.blocks.some(block => block.id === state.selected) ? state.selected : (state.blocks[0]?.id || null);
      localStorage.setItem(KEY, JSON.stringify(state));
      if (window.KR2Sync?.autoEnabled?.()) window.KR2Sync.queuePush(JSON.parse(JSON.stringify(state)));
      searchText = '';
      initIndexes();
      toast('BKP restaurado no celular.');
      render();
    } catch {
      toast('BKP invalido. Selecione um arquivo JSON do KR2MELO.', true);
    }
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
  function hasAlert(unit) {
    return unit.current !== '' && unit.current !== null && unit.current !== undefined && Boolean(issueFor(unit, n(unit.current)));
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
    sortBlockUnits(block);
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
  function routeSortKey(unit) {
    const label = String(unit?.number || '').toUpperCase().replace(/\s+/g, '');
    const suffix = (label.match(/[A-Z]+$/) || [''])[0];
    const numeric = Number((label.match(/\d+/) || ['0'])[0]);
    if (!Number.isFinite(numeric) || numeric <= 0) return `${suffix}|999|999|${label}`;
    const stack = ((numeric - 1) % 10) + 1;
    const floor = Math.floor((numeric - stack) / 10);
    return `${suffix}|${String(stack).padStart(3, '0')}|${String(floor).padStart(3, '0')}|${label}`;
  }
  function routeCompare(a, b) {
    return routeSortKey(a).localeCompare(routeSortKey(b), 'pt-BR', { numeric: true });
  }
  function sortBlockUnits(block) {
    if (Array.isArray(block?.units)) block.units.sort(routeCompare);
    return block;
  }
  function routeOrderedIndexes(block, options = {}) {
    const q = options.search === false ? '' : searchText.trim().toLowerCase();
    return [...block.units].map((item, index) => ({ item, index }))
      .filter(({ item }) => !q || String(item.number).toLowerCase().includes(q) || String(item.resident || '').toLowerCase().includes(q))
      .filter(({ item }) => options.filter === false || mobileFilter === 'todos' || (mobileFilter === 'pendentes' && !isDone(item)) || (mobileFilter === 'lidas' && isDone(item) && item.readingType !== 'estimated') || (mobileFilter === 'sem_acesso' && item.readingType === 'estimated' && isDone(item)) || (mobileFilter === 'alertas' && hasAlert(item)))
      .sort((a, b) => Number(isDone(a.item)) - Number(isDone(b.item)) || routeCompare(a.item, b.item));
  }
  function nextPendingIndex(block, start) {
    sortBlockUnits(block);
    const ordered = routeOrderedIndexes(block, { search: false, filter: false }).filter(({ item }) => !isDone(item));
    const afterCurrent = ordered.find(({ index }) => index > start);
    if (afterCurrent) return afterCurrent.index;
    if (ordered.length) return ordered[0].index;
    return Math.min(start + 1, block.units.length - 1);
  }
  function filteredUnits(block) {
    return routeOrderedIndexes(block);
  }
  function jumpPending() {
    const block = currentBlock();
    if (!block) return;
    sortBlockUnits(block);
    const next = routeOrderedIndexes(block, { search: false, filter: false }).find(({ item }) => !isDone(item));
    if (!next) return toast('Todas as leituras foram conferidas.');
    unitIndex = next.index;
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
  function duplicateUnitNumber(block, unit, number) {
    const target = String(number || '').trim().toLowerCase();
    return block.units.some(item => item !== unit && String(item.number || '').trim().toLowerCase() === target);
  }
  function recalcUnit(block, unit) {
    if (unit.current === '' || unit.current === null || unit.current === undefined) return;
    unit.m3 = Math.max(0, n(unit.current) - n(unit.previous));
    unit.value = cost(unit.m3, tariffForMonth(block, block.month));
  }
  function recordUnitChange(unit, type, field, oldValue, newValue) {
    if (!unit || String(oldValue ?? '') === String(newValue ?? '')) return;
    unit.changeLog = Array.isArray(unit.changeLog) ? unit.changeLog : [];
    unit.changeLog.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, at: new Date().toISOString(), operator: 'Mobile', type, field, oldValue: String(oldValue ?? ''), newValue: String(newValue ?? '') });
    unit.changeLog = unit.changeLog.slice(0, 50);
  }
  function pinHash(value) {
    let hash = 2166136261;
    for (const char of String(value || '')) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return String(hash >>> 0);
  }
  function verifyAdminPin() {
    const existing = String(state.mobileAdminPinHash || '');
    if (!existing) {
      const created = prompt('Crie um PIN administrativo para editar apartamentos neste celular. Use 4 a 8 numeros.');
      if (created === null) return false;
      if (!/^\d{4,8}$/.test(created)) { toast('PIN deve ter 4 a 8 numeros.', true); return false; }
      const confirmPin = prompt('Confirme o PIN administrativo.');
      if (confirmPin !== created) { toast('PIN nao confere.', true); return false; }
      state.mobileAdminPinHash = pinHash(created);
      save('PIN administrativo criado');
      return true;
    }
    const informed = prompt('Digite o PIN administrativo para editar este apartamento.');
    if (pinHash(informed) !== existing) { toast('PIN incorreto.', true); return false; }
    return true;
  }
  function editCurrentUnit() {
    const block = currentBlock(), unit = currentUnit();
    if (!block || !unit) return;
    if (!verifyAdminPin()) return;
    const number = prompt('Apartamento / hidrometro', unit.number);
    if (number === null) return;
    const cleanNumber = number.trim();
    if (!cleanNumber) return toast('Informe o apartamento.', true);
    if (duplicateUnitNumber(block, unit, cleanNumber)) return toast('Ja existe apartamento com esse numero.', true);
    const resident = prompt('Responsavel', unit.resident || '');
    if (resident === null) return;
    const previousRaw = prompt('Leitura anterior', unit.previous ?? 0);
    if (previousRaw === null) return;
    const previous = Number(String(previousRaw).replace(',', '.').trim());
    if (!Number.isFinite(previous) || previous < 0) return toast('Leitura anterior invalida.', true);
    recordUnitChange(unit, 'Edicao mobile', 'number', unit.number, cleanNumber);
    recordUnitChange(unit, 'Edicao mobile', 'resident', unit.resident, resident.trim());
    recordUnitChange(unit, 'Edicao mobile', 'previous', unit.previous, previous);
    unit.number = cleanNumber;
    unit.resident = resident.trim();
    unit.previous = previous;
    recalcUnit(block, unit);
    sortBlockUnits(block);
    unitIndex = block.units.findIndex(item => item.id === unit.id);
    state.selected = block.id;
    if (!save(`Apto ${unit.number} atualizado`)) return;
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
      <section class="card mobile-tools"><input id="aptSearch" autocomplete="off" value="${esc(searchText)}" placeholder="Buscar apto ou morador"><select id="mobileFilter"><option value="pendentes" ${mobileFilter === 'pendentes' ? 'selected' : ''}>Somente pendentes</option><option value="todos" ${mobileFilter === 'todos' ? 'selected' : ''}>Todos</option><option value="lidas" ${mobileFilter === 'lidas' ? 'selected' : ''}>Lidas</option><option value="sem_acesso" ${mobileFilter === 'sem_acesso' ? 'selected' : ''}>Sem acesso</option><option value="alertas" ${mobileFilter === 'alertas' ? 'selected' : ''}>Alertas</option></select><button class="secondary pending-button" id="jumpPending">Ir para pendente</button><button class="secondary backup-button" id="mobileBackupBtn">Baixar BKP</button><button class="secondary backup-button" id="mobileImportBtn">Upar BKP</button><button class="secondary sync-button" id="mobileSyncPushBtn">Enviar nuvem</button><button class="secondary sync-button" id="mobileSyncPullBtn">Baixar nuvem</button></section>
      <section class="card reading-card ${hasAlert(unit) ? 'reading-card-alert' : ''}"><div class="unit-head"><div><span class="muted">Apartamento</span><div class="unit-number">${esc(unit.number)}</div></div><span class="pill ${isDone(unit) ? 'ok' : 'warn'}">${isDone(unit) ? 'Salvo' : 'Pendente'}</span></div><p class="muted resident-line">${esc(unit.resident || 'Responsavel nao informado')}</p>${savedAt ? `<p class="saved-line">Salvo em ${esc(savedAt)}</p>` : ''}<button class="secondary edit-unit" id="editUnitBtn">Editar apto</button><div class="read-kpis"><div><small>Anterior</small><strong>${fmt(unit.previous)}</strong></div><div><small>Consumo</small><strong>${fmt(consumption)} m3</strong></div></div><div class="reading-big"><label>Leitura atual</label><input id="currentReading" inputmode="decimal" autocomplete="off" value="${unit.current === '' ? '' : esc(unit.current)}" placeholder="Digite e aperte Enter"></div><label class="note-field">Observacao da leitura<textarea id="mobileNote" rows="2" placeholder="Ex.: visor embacado, lacre rompido">${esc(unit.note || '')}</textarea></label><div id="alertBox"></div><button class="primary save-reading" id="saveBtn">Salvar e proximo</button><div class="no-access-row"><select id="noAccessReason">${reasonOption('Sem acesso')}${reasonOption('Morador ausente')}${reasonOption('Hidrometro inacessivel')}${reasonOption('Portao fechado')}</select><button class="secondary no-access" id="noAccessBtn">Marcar</button></div>${isDone(unit) ? '<button class="secondary reopen" id="reopenBtn">Reabrir leitura</button>' : ''}<div class="row nav-row"><button class="secondary" id="prevBtn">Anterior</button><button class="secondary" id="nextBtn">Proximo</button></div></section>
      ${historyMarkup(block, unit)}
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
    $('#mobileFilter').onchange = event => { mobileFilter = event.target.value; localStorage.setItem('kr2melo.mobileFilter.v5317', mobileFilter); render(); };
    $('#jumpPending').onclick = jumpPending;
    $('#mobileBackupBtn').onclick = downloadMobileBackup;
    $('#mobileImportBtn').onclick = uploadMobileBackup;
    $('#mobileSyncPushBtn').onclick = syncMobilePush;
    $('#mobileSyncPullBtn').onclick = syncMobilePull;
    $('#editUnitBtn').onclick = editCurrentUnit;
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
    const oldCurrent = unit.current;
    unit.current = current;
    unit.readingType = 'real';
    unit.estimatedReason = '';
    unit.m3 = Math.max(0, current - n(unit.previous));
    unit.value = cost(unit.m3, tariffForMonth(block, block.month));
    unit.note = $('#mobileNote')?.value || '';
    unit.mobileDone = true;
    unit.mobileSavedAt = new Date().toISOString();
    state.selected = block.id;
    recordUnitChange(unit, 'Leitura mobile', 'current', oldCurrent, current);
    if (!save(`Apto ${unit.number} salvo`)) return;
    unitIndex = nextPendingIndex(block, unitIndex);
    render();
  }
  function markNoAccess() {
    const block = currentBlock(), unit = currentUnit();
    if (!block || !unit) return;
    const reason = $('#noAccessReason')?.value || 'Sem acesso';
    const oldReadingType = unit.readingType || 'real';
    unit.current = '';
    unit.readingType = 'estimated';
    unit.estimatedReason = reason;
    unit.note = $('#mobileNote')?.value || reason;
    unit.m3 = 0;
    unit.value = 0;
    unit.mobileDone = true;
    unit.mobileSavedAt = new Date().toISOString();
    state.selected = block.id;
    recordUnitChange(unit, 'Sem acesso mobile', 'readingType', oldReadingType, 'estimated');
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
  initIndexes(); render(); checkVersionNotice(); bootstrapCloudMobile();
  $('#mobileImportInput')?.addEventListener('change', importMobileBackup);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();

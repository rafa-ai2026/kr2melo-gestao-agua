(() => {
  'use strict';
  const KEY = 'kr2melo.hidrometro.v1';
  const APP_VERSION = '5.3.32';
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
  const n = value => Number(value) || 0;
  const esc = (value = '') => { const node = document.createElement('div'); node.textContent = String(value ?? ''); return node.innerHTML; };
  const fmt = value => n(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const monthLabel = month => monthFmt.format(new Date(`${month}-02T12:00:00`));
  let state = load(), blockIndex = 0, unitIndex = 0, searchText = '', keepSearchFocus = false, readingDirty = false, mobileFilter = localStorage.getItem('kr2melo.mobileFilter.v5317') || 'pendentes';

  function normalizeMobileState(raw) {
    const source = raw && typeof raw === 'object' ? JSON.parse(JSON.stringify(raw)) : {};
    source.blocks = Array.isArray(source.blocks) ? source.blocks : [];
    source.blocks.forEach(block => {
      block.units = Array.isArray(block.units) ? block.units : [];
      block.history = Array.isArray(block.history) ? block.history : [];
      block.units.forEach(unit => {
        unit.previous = n(unit.previous);
        if (unit.current !== '' && unit.current !== null && unit.current !== undefined) unit.current = n(unit.current);
        else unit.current = '';
        unit.readingType = unit.readingType === 'estimated' ? 'estimated' : 'real';
        unit.operationalStatus = ['ocupado','vazio','alugado','reforma','sem_acesso','parado','trocado','estimada'].includes(unit.operationalStatus) ? unit.operationalStatus : 'ocupado';
        unit.mobileReopened = Boolean(unit.mobileReopened);
        const hasReading = unit.current !== '';
        unit.mobileDone = unit.mobileReopened ? false : Boolean(unit.mobileDone || hasReading || unit.operationalStatus === 'sem_acesso');
        unit.mobileSavedAt = String(unit.mobileSavedAt || '');
        unit.note = String(unit.note || '');
        unit.estimatedReason = String(unit.estimatedReason || '');
        unit.changeLog = Array.isArray(unit.changeLog) ? unit.changeLog : [];
      });
      sortBlockUnits(block);
    });
    source.version = APP_VERSION;
    source.selected = source.blocks.some(block => block.id === source.selected) ? source.selected : (source.blocks[0]?.id || null);
    return source;
  }
  function load() {
    try { return normalizeMobileState(JSON.parse(localStorage.getItem(KEY))); }
    catch { return normalizeMobileState({ selected: null, blocks: [] }); }
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
      const historicM3 = Number.isFinite(Number(found.m3))
        ? Math.max(0, Number(found.m3))
        : Math.max(0, n(found.current) - n(found.previous));
      return { month: entry.month, m3: historicM3, current: found.current, water: cost(historicM3, entry.tariff || tariffForMonth(block, entry.month)) };
    }).filter(Boolean).sort((a, b) => String(b.month).localeCompare(String(a.month))).slice(0, 4);
  }
  function averageLastTwoConsumptions(block, unit) {
    const rows = unitHistory(block, unit).slice(0, 2);
    if (rows.length < 2) return null;
    return rows.reduce((sum, row) => sum + n(row.m3), 0) / 2;
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
      if (error?.code === 'KR2_SYNC_CONFLICT') {
        const overwrite = confirm('A nuvem foi alterada por outro aparelho.\n\nCancelar e baixar os dados e a opcao mais segura.\n\nDeseja SUBSTITUIR a copia da nuvem mesmo assim?');
        if (!overwrite) return toast('Envio cancelado. Baixe a nuvem para revisar as alteracoes.', true);
        try {
          await window.KR2Sync.pushState(JSON.parse(JSON.stringify(state)), { force: true });
          return toast('Nuvem substituida por confirmacao manual.');
        } catch (forcedError) {
          return toast(forcedError.message || 'Falha ao substituir a nuvem.', true);
        }
      }
      toast(error.message || 'Falha ao enviar para nuvem.', true);
    }
  }
  async function syncMobilePull() {
    if (!window.KR2Sync?.connected?.()) return toast('Entre na sincronizacao pelo painel antes de baixar.', true);
    if (state.blocks.length && !confirm('Baixar da nuvem substitui os dados atuais deste celular. Continuar?')) return;
    try {
      const remote = await window.KR2Sync.pullState();
      if (!remote || !Array.isArray(remote.blocks)) return toast('Nenhum dado encontrado na nuvem.');
      state = normalizeMobileState(remote);
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
      state = normalizeMobileState(imported);
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
  function isDone(unit) { return Boolean(unit && unit.mobileDone === true); }
  function doneCount(block) { return block.units.filter(isDone).length; }
  function noAccessCount(block) { return block.units.filter(unit => unit.operationalStatus === 'sem_acesso' && isDone(unit)).length; }
  function realCount(block) { return block.units.filter(unit => unit.current !== '' && unit.current !== null && unit.current !== undefined && unit.readingType !== 'estimated').length; }
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
      .filter(({ item }) => options.filter === false || mobileFilter === 'todos' || (mobileFilter === 'pendentes' && !isDone(item)) || (mobileFilter === 'lidas' && item.current !== '' && item.current !== null && item.current !== undefined && item.readingType !== 'estimated') || (mobileFilter === 'sem_acesso' && item.operationalStatus === 'sem_acesso' && isDone(item)) || (mobileFilter === 'alertas' && hasAlert(item)))
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
    unit.mobileReopened = true;
    recordUnitChange(unit, 'Reabertura mobile', 'mobileDone', true, false);
    save('Leitura reaberta para conferencia');
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
      <section class="card mobile-tools"><input id="aptSearch" autocomplete="off" value="${esc(searchText)}" placeholder="Buscar apto ou morador"><select id="mobileFilter"><option value="pendentes" ${mobileFilter === 'pendentes' ? 'selected' : ''}>Somente pendentes</option><option value="todos" ${mobileFilter === 'todos' ? 'selected' : ''}>Todos</option><option value="lidas" ${mobileFilter === 'lidas' ? 'selected' : ''}>Lidas</option><option value="sem_acesso" ${mobileFilter === 'sem_acesso' ? 'selected' : ''}>Sem acesso</option><option value="alertas" ${mobileFilter === 'alertas' ? 'selected' : ''}>Alertas</option></select><button class="secondary pending-button" id="jumpPending">Ir para pendente</button><details class="mobile-more-tools"><summary>Backup e nuvem</summary><div><button class="secondary backup-button" id="mobileBackupBtn">Baixar BKP</button><button class="secondary backup-button" id="mobileImportBtn">Upar BKP</button><button class="secondary sync-button" id="mobileSyncPushBtn">Enviar nuvem</button><button class="secondary sync-button" id="mobileSyncPullBtn">Baixar nuvem</button></div></details></section>
      <section class="card reading-card ${hasAlert(unit) ? 'reading-card-alert' : ''}"><div class="unit-overview"><div class="unit-data"><div class="unit-head"><div><span class="muted">Apartamento</span><div class="unit-number">${esc(unit.number)}</div></div><span class="pill ${isDone(unit) ? 'ok' : 'warn'}">${isDone(unit) ? 'Salvo' : 'Pendente'}</span></div><p class="muted resident-line">${esc(unit.resident || 'Responsavel nao informado')}</p>${savedAt ? `<p class="saved-line">Salvo em ${esc(savedAt)}</p>` : ''}</div><button class="secondary edit-unit" id="editUnitBtn" type="button">Editar apto</button></div><div class="read-kpis"><div><small>Anterior</small><strong>${fmt(unit.previous)}</strong></div><div><small>Consumo</small><strong>${fmt(consumption)} m3</strong></div></div><div class="reading-entry"><div class="reading-big"><label for="currentReading">Leitura atual</label><input id="currentReading" inputmode="decimal" autocomplete="off" value="${unit.current === '' ? '' : esc(unit.current)}" placeholder="0" aria-describedby="readingRoundHint"><small id="readingRoundHint" class="reading-hint">Arredondamento automático ao salvar</small></div><button class="primary save-reading" id="saveBtn" type="button"><span>Salvar</span><small>e próximo</small></button></div><label class="note-field">Observacao da leitura<textarea id="mobileNote" rows="2" placeholder="Ex.: visor embacado, lacre rompido">${esc(unit.note || '')}</textarea></label><div id="alertBox"></div><div class="no-access-row"><select id="noAccessReason">${reasonOption('Sem acesso')}${reasonOption('Morador ausente')}${reasonOption('Hidrometro inacessivel')}${reasonOption('Portao fechado')}</select><button class="secondary no-access" id="noAccessBtn">Marcar</button></div><button class="secondary average-reading" id="averageReadingBtn">Usar média dos 2 últimos meses</button>${isDone(unit) ? '<button class="secondary reopen" id="reopenBtn">Reabrir leitura</button>' : ''}<div class="row nav-row"><button class="secondary" id="prevBtn">Anterior</button><button class="secondary" id="nextBtn">Proximo</button></div></section>
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
    $('#currentReading').oninput = event => { readingDirty = true; checkAlert(event.target.value); };
    $('#currentReading').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); saveReading(); } };
    $('#mobileNote').onchange = event => { const unit = currentUnit(); if (unit) { unit.note = event.target.value; save('Observacao salva'); } };
    $('#saveBtn').onclick = saveReading;
    $('#noAccessBtn').onclick = markNoAccess;
    $('#averageReadingBtn').onclick = createAverageReading;
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
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric < 0) { box.innerHTML = '<p class="alert danger">Digite uma leitura valida.</p>'; return; }
    const current = Math.round(numeric);
    const issue = issueFor(unit, current);
    box.innerHTML = issue ? `<p class="alert ${issue.level === 'danger' ? 'danger' : ''}">${issue.text}</p>` : '<p class="alert ok">Leitura dentro da faixa.</p>';
  }
  async function saveReading() {
    const block = currentBlock(), unit = currentUnit(), input = $('#currentReading');
    const raw = String(input.value).replace(',', '.').trim();
    if (raw === '') return toast('Digite a leitura atual.', true);
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric < 0) return toast('Digite uma leitura valida.', true);
    const current = Math.round(numeric);
    const issue = issueFor(unit, current);
    if (issue && !confirm(`${issue.text}\n\nDeseja manter esta leitura arredondada (${fmt(current)})?`)) return;
    const oldCurrent = unit.current;
    unit.current = current;
    unit.readingType = 'real';
    if (unit.operationalStatus === 'sem_acesso' || unit.operationalStatus === 'estimada') unit.operationalStatus = 'ocupado';
    unit.estimatedReason = '';
    unit.m3 = Math.max(0, current - n(unit.previous));
    unit.value = cost(unit.m3, tariffForMonth(block, block.month));
    unit.note = $('#mobileNote')?.value || '';
    unit.mobileDone = true;
    unit.mobileReopened = false;
    unit.mobileSavedAt = new Date().toISOString();
    state.selected = block.id;
    recordUnitChange(unit, 'Leitura mobile', 'current', oldCurrent, current);
    if (!save(`Apto ${unit.number} salvo`)) return;
    readingDirty = false;
    unitIndex = nextPendingIndex(block, unitIndex);
    render();
  }
  function createAverageReading() {
    const block = currentBlock(), unit = currentUnit();
    if (!block || !unit) return;
    const average = averageLastTwoConsumptions(block, unit);
    if (average === null) return toast('Sao necessarios 2 meses no historico para calcular a media.', true);
    const estimated = Math.round(n(unit.previous) + average);
    const reason = $('#noAccessReason')?.value || 'Sem acesso';
    if (!confirm(`Usar leitura estimada no Apto ${unit.number}?\n\nConsumo medio dos 2 ultimos meses: ${fmt(average)} m3\nLeitura anterior: ${fmt(unit.previous)}\nLeitura estimada: ${fmt(estimated)}`)) return;
    const oldCurrent = unit.current;
    unit.current = estimated;
    unit.readingType = 'estimated';
    unit.operationalStatus = 'estimada';
    unit.estimatedReason = `${reason} · media dos 2 ultimos meses`;
    unit.note = $('#mobileNote')?.value || unit.estimatedReason;
    unit.m3 = Math.max(0, estimated - n(unit.previous));
    unit.value = cost(unit.m3, tariffForMonth(block, block.month));
    unit.mobileDone = true;
    unit.mobileReopened = false;
    unit.mobileSavedAt = new Date().toISOString();
    state.selected = block.id;
    recordUnitChange(unit, 'Leitura estimada mobile', 'current', oldCurrent, estimated);
    if (!save(`Apto ${unit.number} estimado pela media`)) return;
    readingDirty = false;
    unitIndex = nextPendingIndex(block, unitIndex);
    render();
  }
  function markNoAccess() {
    const block = currentBlock(), unit = currentUnit();
    if (!block || !unit) return;
    const reason = $('#noAccessReason')?.value || 'Sem acesso';
    const oldOperationalStatus = unit.operationalStatus || 'ocupado';
    unit.current = '';
    unit.readingType = 'real';
    unit.operationalStatus = 'sem_acesso';
    unit.estimatedReason = reason;
    unit.note = $('#mobileNote')?.value || reason;
    unit.m3 = 0;
    unit.value = 0;
    unit.mobileDone = true;
    unit.mobileReopened = false;
    unit.mobileSavedAt = new Date().toISOString();
    state.selected = block.id;
    recordUnitChange(unit, 'Sem acesso mobile', 'operationalStatus', oldOperationalStatus, 'sem_acesso');
    if (!save(`Apto ${unit.number} marcado sem acesso`)) return;
    readingDirty = false;
    unitIndex = nextPendingIndex(block, unitIndex);
    render();
  }

  function confirmLeaveMobile() {
    if (!readingDirty) return true;
    return confirm('Existe uma leitura digitada que ainda nao foi salva. Sair mesmo assim?');
  }
  window.addEventListener('beforeunload', event => {
    if (!readingDirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
  document.querySelector('.back-system')?.addEventListener('click', event => {
    if (!confirmLeaveMobile()) event.preventDefault();
  });


  // ===================== KR2MELO v5.3.31 — Ponte segura Leitura in loco ↔ Leituras do mês =====================
  const MOBILE_DRAFT_KEY_V5331 = `${KEY}.mobileDrafts.v5331`;
  const MOBILE_SIGNAL_KEY_V5331 = `${KEY}.readingSignal.v5331`;
  const MOBILE_JOURNAL_KEY_V5331 = `${KEY}.mobileJournal.v5331`;
  const MOBILE_READING_FIELDS_V5331 = ['current','m3','value','note','mobileDone','mobileSavedAt','mobileReopened','readingType','operationalStatus','estimatedReason','changeLog','mobileSyncStatus','mobileSyncAt','mobileSyncOperationId','mobileSyncConflict'];
  const MOBILE_IDENTITY_FIELDS_V5331 = ['number','resident','previous'];

  function readPersistedMobileStateV5331() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY));
      return parsed && Array.isArray(parsed.blocks) ? normalizeMobileState(parsed) : null;
    } catch { return null; }
  }
  function draftKeyV5331(block = currentBlock(), unit = currentUnit()) {
    return block && unit ? `${block.id}:${unit.id}` : '';
  }
  function readDraftsV5331() {
    try { const parsed = JSON.parse(localStorage.getItem(MOBILE_DRAFT_KEY_V5331)); return parsed && typeof parsed === 'object' ? parsed : {}; }
    catch { return {}; }
  }
  function writeDraftV5331(block, unit, values = {}) {
    if (!block || !unit) return;
    const drafts = readDraftsV5331();
    drafts[`${block.id}:${unit.id}`] = {
      blockId: block.id, unitId: unit.id, month: block.month,
      current: String(values.current ?? $('#currentReading')?.value ?? ''),
      note: String(values.note ?? $('#mobileNote')?.value ?? ''),
      updatedAt: new Date().toISOString()
    };
    try { localStorage.setItem(MOBILE_DRAFT_KEY_V5331, JSON.stringify(drafts)); } catch {}
  }
  function currentDraftV5331(block = currentBlock(), unit = currentUnit()) {
    if (!block || !unit) return null;
    const draft = readDraftsV5331()[`${block.id}:${unit.id}`];
    if (!draft || draft.month !== block.month) return null;
    const savedAt = Date.parse(unit.mobileSavedAt || '') || 0;
    const draftAt = Date.parse(draft.updatedAt || '') || 0;
    return draftAt > savedAt ? draft : null;
  }
  function clearDraftV5331(block = currentBlock(), unit = currentUnit()) {
    if (!block || !unit) return;
    const drafts = readDraftsV5331();
    delete drafts[`${block.id}:${unit.id}`];
    try { localStorage.setItem(MOBILE_DRAFT_KEY_V5331, JSON.stringify(drafts)); } catch {}
  }
  function applyPersistedBaseV5331(changedUnitIds = [], includeIdentity = false) {
    const persisted = readPersistedMobileStateV5331();
    if (!persisted) return;
    const changed = new Set(changedUnitIds.map(String));
    // Preserve state-level settings written outside the mobile while keeping the current selection/PIN.
    const selectedId = state.selected;
    const pin = state.mobileAdminPinHash;
    Object.keys(persisted).forEach(key => { if (!['blocks','selected','mobileAdminPinHash'].includes(key)) state[key] = persisted[key]; });
    state.selected = selectedId || persisted.selected;
    if (pin) state.mobileAdminPinHash = pin;

    persisted.blocks.forEach(remoteBlock => {
      let localBlock = state.blocks.find(item => String(item.id) === String(remoteBlock.id));
      if (!localBlock) { state.blocks.push(remoteBlock); return; }
      const localUnits = localBlock.units;
      Object.keys(remoteBlock).forEach(key => { if (key !== 'units') localBlock[key] = remoteBlock[key]; });
      const mergedUnits = [];
      remoteBlock.units.forEach(remoteUnit => {
        const localUnit = localUnits.find(item => String(item.id) === String(remoteUnit.id));
        if (!localUnit) { mergedUnits.push(remoteUnit); return; }
        if (!changed.has(String(localUnit.id))) {
          Object.keys(localUnit).forEach(key => { if (!(key in remoteUnit)) delete localUnit[key]; });
          Object.assign(localUnit, remoteUnit);
        } else {
          const owned = {};
          MOBILE_READING_FIELDS_V5331.forEach(key => { owned[key] = localUnit[key]; });
          if (includeIdentity) MOBILE_IDENTITY_FIELDS_V5331.forEach(key => { owned[key] = localUnit[key]; });
          Object.assign(localUnit, remoteUnit, owned);
        }
        mergedUnits.push(localUnit);
      });
      // If a unit is being edited and was concurrently removed elsewhere, do not silently discard the local reading.
      localUnits.filter(unit => changed.has(String(unit.id)) && !mergedUnits.some(item => String(item.id) === String(unit.id))).forEach(unit => mergedUnits.push(unit));
      localBlock.units = mergedUnits;
    });
  }
  function appendMobileJournalV5331(unitIds = []) {
    if (!unitIds.length) return;
    let journal = [];
    try { const parsed = JSON.parse(localStorage.getItem(MOBILE_JOURNAL_KEY_V5331)); journal = Array.isArray(parsed) ? parsed : []; } catch {}
    const now = new Date().toISOString();
    state.blocks.forEach(block => block.units.forEach(unit => {
      if (!unitIds.map(String).includes(String(unit.id))) return;
      const payload = { blockId: block.id, unitId: unit.id, month: block.month, at: unit.mobileSavedAt || now, fields: {} };
      MOBILE_READING_FIELDS_V5331.forEach(field => { payload.fields[field] = unit[field]; });
      journal.push(payload);
    }));
    journal = journal.sort((a,b) => String(b.at).localeCompare(String(a.at))).slice(0, 200);
    try { localStorage.setItem(MOBILE_JOURNAL_KEY_V5331, JSON.stringify(journal)); } catch {}
  }
  function recoverMobileJournalV5331() {
    let journal = [];
    try { const parsed = JSON.parse(localStorage.getItem(MOBILE_JOURNAL_KEY_V5331)); journal = Array.isArray(parsed) ? parsed : []; } catch {}
    let recovered = 0;
    journal.forEach(entry => {
      const block = state.blocks.find(item => String(item.id) === String(entry.blockId) && String(item.month) === String(entry.month));
      const unit = block?.units?.find(item => String(item.id) === String(entry.unitId));
      if (!unit) return;
      const entryAt = Date.parse(entry.at || '') || 0, savedAt = Date.parse(unit.mobileSavedAt || '') || 0;
      if (entryAt <= savedAt) return;
      Object.entries(entry.fields || {}).forEach(([field,value]) => { if (MOBILE_READING_FIELDS_V5331.includes(field)) unit[field] = value; });
      recalcUnit(block, unit); recovered++;
    });
    if (recovered) {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    }
    return recovered;
  }

  const saveV5331Base = save;
  save = function(message = '', options = {}) {
    const unitIds = Array.isArray(options.unitIds) ? options.unitIds : [];
    appendMobileJournalV5331(unitIds); // primeiro grava o diário de recuperação
    applyPersistedBaseV5331(unitIds, Boolean(options.includeIdentity));
    const ok = saveV5331Base(message);
    if (ok) {
      try { localStorage.setItem(MOBILE_SIGNAL_KEY_V5331, JSON.stringify({ at: new Date().toISOString(), blockId: currentBlock()?.id || '', unitIds })); } catch {}
    }
    return ok;
  };

  function syncFromMainStateV5331(options = {}) {
    const persisted = readPersistedMobileStateV5331();
    if (!persisted) return false;
    const block = currentBlock(), unit = currentUnit();
    const blockId = block?.id, unitId = unit?.id;
    const draft = currentDraftV5331(block, unit);
    state = persisted;
    state.selected = state.blocks.some(item => item.id === blockId) ? blockId : (state.selected || state.blocks[0]?.id || null);
    initIndexes();
    const selectedBlock = currentBlock();
    if (selectedBlock && unitId) {
      const idx = selectedBlock.units.findIndex(item => String(item.id) === String(unitId));
      if (idx >= 0) unitIndex = idx;
    }
    if (options.render !== false) render();
    if (draft) {
      const current = $('#currentReading'), note = $('#mobileNote');
      if (current) current.value = draft.current;
      if (note) note.value = draft.note;
      readingDirty = true;
      checkAlert(draft.current);
    }
    return true;
  }

  const renderV5331Base = render;
  render = function() {
    renderV5331Base();
    const block = currentBlock(), unit = currentUnit();
    if (!block || !unit) return;
    const draft = currentDraftV5331(block, unit);
    if (draft) {
      const current = $('#currentReading'), note = $('#mobileNote');
      if (current) current.value = draft.current;
      if (note) note.value = draft.note;
      readingDirty = true;
      checkAlert(draft.current);
      const card = document.querySelector('.reading-card .unit-overview');
      if (card && !card.querySelector('.draft-pill-v5331')) card.insertAdjacentHTML('beforeend', '<span class="pill warn draft-pill-v5331">Rascunho protegido</span>');
    }
    const hero = document.querySelector('.hero');
    if (hero && !document.querySelector('.sync-bridge-mobile-v5331')) {
      hero.insertAdjacentHTML('afterend', `<section class="card sync-bridge-mobile-v5331"><div><strong>Dados compartilhados com Leituras do mês</strong><small>Salvamento local seguro + recuperação de rascunho</small></div><span class="pill ok">Protegido</span></section>`);
    }
  };

  const bindV5331Base = bind;
  bind = function() {
    bindV5331Base();
    const reading = $('#currentReading'), note = $('#mobileNote');
    if (reading) reading.oninput = event => {
      readingDirty = true;
      writeDraftV5331(currentBlock(), currentUnit(), { current: event.target.value, note: note?.value || '' });
      checkAlert(event.target.value);
    };
    if (note) {
      note.oninput = event => {
        readingDirty = true;
        writeDraftV5331(currentBlock(), currentUnit(), { current: reading?.value || '', note: event.target.value });
      };
      // Evita salvar o estado inteiro em onchange. A observação viaja junto com a leitura/rascunho.
      note.onchange = () => {};
    }
  };

  const saveReadingV5331Base = saveReading;
  saveReading = async function() {
    const block = currentBlock(), unit = currentUnit();
    if (!block || !unit) return;
    const beforeId = unit.id;
    // O corpo original chama save(); passamos o alvo por um marcador temporário.
    const originalSave = save;
    save = (message = '') => originalSave(message, { unitIds: [beforeId] });
    try { await saveReadingV5331Base(); }
    finally { save = originalSave; }
    const freshBlock = currentBlock();
    const freshUnit = freshBlock?.units?.find(item => String(item.id) === String(beforeId));
    if (freshUnit?.mobileDone) clearDraftV5331(freshBlock, freshUnit);
  };

  const createAverageReadingV5331Base = createAverageReading;
  createAverageReading = function() {
    const unit = currentUnit(); if (!unit) return;
    const id = unit.id, originalSave = save;
    save = (message = '') => originalSave(message, { unitIds: [id] });
    try { return createAverageReadingV5331Base(); }
    finally { save = originalSave; const block = currentBlock(); const saved = block?.units?.find(item => String(item.id) === String(id)); if (saved?.mobileDone) clearDraftV5331(block, saved); }
  };
  const markNoAccessV5331Base = markNoAccess;
  markNoAccess = function() {
    const unit = currentUnit(); if (!unit) return;
    const id = unit.id, originalSave = save;
    save = (message = '') => originalSave(message, { unitIds: [id] });
    try { return markNoAccessV5331Base(); }
    finally { save = originalSave; const block = currentBlock(); const saved = block?.units?.find(item => String(item.id) === String(id)); if (saved?.mobileDone) clearDraftV5331(block, saved); }
  };
  const reopenReadingV5331Base = reopenReading;
  reopenReading = function() {
    const unit = currentUnit(); if (!unit) return;
    const id = unit.id, originalSave = save;
    save = (message = '') => originalSave(message, { unitIds: [id] });
    try { return reopenReadingV5331Base(); } finally { save = originalSave; }
  };
  const editCurrentUnitV5331Base = editCurrentUnit;
  editCurrentUnit = function() {
    const unit = currentUnit(); if (!unit) return;
    const id = unit.id, originalSave = save;
    save = (message = '') => originalSave(message, { unitIds: [id], includeIdentity: true });
    try { return editCurrentUnitV5331Base(); } finally { save = originalSave; }
  };

  window.addEventListener('storage', event => {
    if (event.key !== KEY || !event.newValue) return;
    // Outra aba (Leituras do mês) atualizou o mesmo banco local. Recarrega sem apagar rascunho.
    syncFromMainStateV5331({ render: true });
    toast('Atualização recebida de Leituras do mês.');
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncFromMainStateV5331({ render: true });
  });


  // ===================== KR2MELO v5.3.32 — Offline-first / IndexedDB / fila segura =====================
  const OFFLINE_DB_V5332 = 'kr2melo-offline-v5332';
  const OFFLINE_DB_VERSION_V5332 = 1;
  const OFFLINE_OP_STORE_V5332 = 'readingOps';
  const OFFLINE_SNAPSHOT_STORE_V5332 = 'snapshots';
  const CLOUD_READING_FIELDS_V5332 = ['current','m3','value','note','mobileDone','mobileSavedAt','mobileReopened','readingType','operationalStatus','estimatedReason','changeLog'];
  let syncRunningV5332 = false;

  function opIdV5332() {
    return `op-${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  }
  function openOfflineDbV5332() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB indisponível neste navegador.'));
      const req = indexedDB.open(OFFLINE_DB_V5332, OFFLINE_DB_VERSION_V5332);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OFFLINE_OP_STORE_V5332)) {
          const store = db.createObjectStore(OFFLINE_OP_STORE_V5332, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('blockMonth', ['blockId','month'], { unique: false });
        }
        if (!db.objectStoreNames.contains(OFFLINE_SNAPSHOT_STORE_V5332)) db.createObjectStore(OFFLINE_SNAPSHOT_STORE_V5332, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Falha ao abrir armazenamento offline.'));
    });
  }
  async function idbPutV5332(storeName, value) {
    const db = await openOfflineDbV5332();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value);
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
    return value;
  }
  async function idbGetAllV5332(storeName) {
    const db = await openOfflineDbV5332();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => reject(req.error);
      });
    } finally { db.close(); }
  }
  async function idbDeleteV5332(storeName, id) {
    const db = await openOfflineDbV5332();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).delete(id);
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  async function requestPersistentStorageV5332() {
    try {
      if (!navigator.storage?.persist) return false;
      const already = await navigator.storage.persisted?.();
      if (already) return true;
      return Boolean(await navigator.storage.persist());
    } catch { return false; }
  }
  function snapshotReadingFieldsV5332(unit) {
    const fields = {};
    CLOUD_READING_FIELDS_V5332.forEach(field => { fields[field] = JSON.parse(JSON.stringify(unit[field] ?? null)); });
    return fields;
  }
  function persistStateDirectV5332() {
    try { state.version = APP_VERSION; localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
  }
  function findUnitByOpV5332(container, op) {
    const block = container?.blocks?.find(item => String(item.id) === String(op.blockId) && String(item.month) === String(op.month));
    const unit = block?.units?.find(item => String(item.id) === String(op.unitId));
    return { block, unit };
  }
  async function queueUnitForCloudV5332(blockId, unitId) {
    const block = state.blocks.find(item => String(item.id) === String(blockId));
    const unit = block?.units?.find(item => String(item.id) === String(unitId));
    if (!block || !unit || !unit.mobileDone) return null;
    const op = {
      id: opIdV5332(), blockId: block.id, unitId: unit.id, unitNumber: unit.number, month: block.month,
      at: unit.mobileSavedAt || new Date().toISOString(), createdAt: new Date().toISOString(), status: 'pending',
      attempts: 0, fields: snapshotReadingFieldsV5332(unit), remoteFields: null, lastError: ''
    };
    // Segunda cópia durável independente do localStorage.
    await idbPutV5332(OFFLINE_OP_STORE_V5332, op);
    await idbPutV5332(OFFLINE_SNAPSHOT_STORE_V5332, { id: `${block.id}:${unit.id}:${op.at}`, blockId: block.id, unitId: unit.id, month: block.month, at: op.at, fields: op.fields });
    unit.mobileSyncStatus = window.KR2Sync?.connected?.() ? 'pending' : 'local';
    unit.mobileSyncOperationId = op.id;
    unit.mobileSyncAt = '';
    unit.mobileSyncConflict = null;
    persistStateDirectV5332();
    render();
    if (navigator.onLine && window.KR2Sync?.connected?.()) processOfflineQueueV5332();
    return op;
  }
  function fieldsDifferV5332(a = {}, b = {}) {
    return CLOUD_READING_FIELDS_V5332.some(field => JSON.stringify(a[field] ?? null) !== JSON.stringify(b[field] ?? null));
  }
  function applyFieldsV5332(unit, fields = {}) {
    CLOUD_READING_FIELDS_V5332.forEach(field => { if (field in fields) unit[field] = JSON.parse(JSON.stringify(fields[field])); });
  }
  async function pendingOpsV5332() {
    const all = await idbGetAllV5332(OFFLINE_OP_STORE_V5332);
    return all.filter(op => ['pending','syncing','conflict'].includes(op.status));
  }
  async function markOpsSyncedV5332(ops, syncedAt) {
    for (const op of ops) {
      op.status = 'synced'; op.syncedAt = syncedAt; op.lastError = '';
      await idbPutV5332(OFFLINE_OP_STORE_V5332, op);
      const { unit } = findUnitByOpV5332(state, op);
      if (unit && String(unit.mobileSyncOperationId || '') === String(op.id)) {
        unit.mobileSyncStatus = 'synced'; unit.mobileSyncAt = syncedAt; unit.mobileSyncConflict = null;
      }
    }
    persistStateDirectV5332();
  }
  async function markOpConflictV5332(op, remoteUnit) {
    op.status = 'conflict'; op.remoteFields = snapshotReadingFieldsV5332(remoteUnit); op.lastError = 'Leitura mais nova encontrada na nuvem.';
    await idbPutV5332(OFFLINE_OP_STORE_V5332, op);
    const { unit } = findUnitByOpV5332(state, op);
    if (unit) {
      unit.mobileSyncStatus = 'conflict'; unit.mobileSyncConflict = { opId: op.id, remoteAt: remoteUnit.mobileSavedAt || '', remoteFields: op.remoteFields };
    }
    persistStateDirectV5332();
  }
  async function processOfflineQueueV5332(options = {}) {
    if (syncRunningV5332) return;
    if (!navigator.onLine || !window.KR2Sync?.connected?.()) { render(); return; }
    syncRunningV5332 = true;
    try {
      let ops = (await pendingOpsV5332()).filter(op => op.status !== 'conflict' || op.forceLocal === true);
      if (!ops.length) { if (options.message) toast('Tudo já está sincronizado.'); return; }
      for (const op of ops) { op.status = 'syncing'; op.attempts = Number(op.attempts || 0) + 1; await idbPutV5332(OFFLINE_OP_STORE_V5332, op); const { unit } = findUnitByOpV5332(state, op); if (unit) unit.mobileSyncStatus = 'syncing'; }
      persistStateDirectV5332(); render();

      let remote = await window.KR2Sync.pullState();
      remote = remote && Array.isArray(remote.blocks) ? normalizeMobileState(remote) : normalizeMobileState(JSON.parse(JSON.stringify(state)));
      const safeOps = [];
      for (const op of ops) {
        const { unit: remoteUnit } = findUnitByOpV5332(remote, op);
        if (!remoteUnit) {
          const localBlock = state.blocks.find(item => String(item.id) === String(op.blockId));
          let targetBlock = remote.blocks.find(item => String(item.id) === String(op.blockId));
          if (!targetBlock && localBlock) { targetBlock = JSON.parse(JSON.stringify(localBlock)); remote.blocks.push(targetBlock); }
          const localUnit = localBlock?.units?.find(item => String(item.id) === String(op.unitId));
          if (targetBlock && localUnit && !targetBlock.units.some(item => String(item.id) === String(op.unitId))) targetBlock.units.push(JSON.parse(JSON.stringify(localUnit)));
          safeOps.push(op); continue;
        }
        const remoteAt = Date.parse(remoteUnit.mobileSavedAt || '') || 0;
        const localAt = Date.parse(op.at || '') || 0;
        if (!op.forceLocal && remoteAt > localAt && fieldsDifferV5332(remoteUnit, op.fields)) {
          await markOpConflictV5332(op, remoteUnit);
          continue;
        }
        applyFieldsV5332(remoteUnit, op.fields);
        remoteUnit.mobileSyncStatus = 'synced'; remoteUnit.mobileSyncAt = new Date().toISOString(); remoteUnit.mobileSyncOperationId = op.id; remoteUnit.mobileSyncConflict = null;
        safeOps.push(op);
      }
      if (safeOps.length) {
        try { await window.KR2Sync.pushState(remote); }
        catch (error) {
          if (error?.code === 'KR2_SYNC_CONFLICT') {
            safeOps.forEach(op => { op.status = 'pending'; });
            for (const op of safeOps) await idbPutV5332(OFFLINE_OP_STORE_V5332, op);
            if (!options.retry) {
              syncRunningV5332 = false;
              return processOfflineQueueV5332({ ...options, retry: true });
            }
          }
          throw error;
        }
        await markOpsSyncedV5332(safeOps, new Date().toISOString());
      }
      if (options.message) toast(safeOps.length ? `${safeOps.length} leitura(s) sincronizada(s).` : 'Há conflito que precisa ser revisado.', !safeOps.length);
    } catch (error) {
      const ops = await pendingOpsV5332().catch(() => []);
      for (const op of ops.filter(item => item.status === 'syncing')) { op.status = 'pending'; op.lastError = String(error?.message || error); await idbPutV5332(OFFLINE_OP_STORE_V5332, op); const { unit } = findUnitByOpV5332(state, op); if (unit) unit.mobileSyncStatus = 'pending'; }
      persistStateDirectV5332();
      if (options.message) toast(`Dados continuam seguros no celular. Sincronização pendente: ${error?.message || 'sem conexão'}`, true);
    } finally { syncRunningV5332 = false; render(); }
  }
  function syncStatusLabelV5332(unit) {
    const status = unit?.mobileSyncStatus || (unit?.mobileDone ? 'local' : 'idle');
    if (!unit?.mobileDone) return { cls: 'warn', text: 'Leitura pendente' };
    if (status === 'synced') return { cls: 'ok', text: '✓ Sincronizado' };
    if (status === 'conflict') return { cls: 'danger', text: '⚠ Conflito' };
    if (status === 'syncing') return { cls: 'warn', text: '↑ Sincronizando' };
    if (status === 'pending') return { cls: 'warn', text: '↑ Aguardando nuvem' };
    return { cls: 'ok', text: '● Salvo no aparelho' };
  }
  function offlineSummaryMarkupV5332(block) {
    const units = block?.units || [];
    const synced = units.filter(u => u.mobileDone && u.mobileSyncStatus === 'synced').length;
    const pending = units.filter(u => u.mobileDone && ['local','pending','syncing'].includes(u.mobileSyncStatus)).length;
    const conflicts = units.filter(u => u.mobileSyncStatus === 'conflict').length;
    const online = navigator.onLine;
    const cloud = Boolean(window.KR2Sync?.connected?.());
    return `<section class="card offline-first-v5332"><div class="offline-first-head"><div><strong>Proteção offline-first</strong><small>IndexedDB + diário local + fila de sincronização</small></div><span class="pill ${conflicts ? 'danger' : (online ? 'ok' : 'warn')}">${conflicts ? 'Conflito' : (online ? 'Online' : 'Sem internet')}</span></div><div class="offline-first-stats"><span><b>${synced}</b><small>Sincronizados</small></span><span><b>${pending}</b><small>Seguros no celular</small></span><span><b>${conflicts}</b><small>Conflitos</small></span></div><div class="row"><button class="secondary" id="syncQueueNowV5332" type="button" ${!cloud ? 'disabled' : ''}>↻ Sincronizar agora</button><small>${cloud ? 'Nuvem conectada' : 'Conecte o Supabase no painel para sincronizar entre celular e computador'}</small></div></section>`;
  }
  const renderV5332Base = render;
  render = function() {
    renderV5332Base();
    const block = currentBlock(), unit = currentUnit();
    const bridge = document.querySelector('.sync-bridge-mobile-v5331');
    if (bridge && block && !document.querySelector('.offline-first-v5332')) bridge.insertAdjacentHTML('afterend', offlineSummaryMarkupV5332(block));
    if (unit) {
      const status = syncStatusLabelV5332(unit);
      const savedLine = document.querySelector('.reading-card .saved-line');
      const overview = document.querySelector('.reading-card .unit-overview');
      if (overview && !overview.querySelector('.sync-status-v5332')) overview.insertAdjacentHTML('beforeend', `<span class="pill ${status.cls} sync-status-v5332">${status.text}</span>`);
      if (unit.mobileSyncStatus === 'conflict' && overview && !document.querySelector('.conflict-actions-v5332')) {
        overview.insertAdjacentHTML('afterend', `<div class="alert danger conflict-actions-v5332"><strong>Conflito protegido</strong><span>A nuvem possui uma leitura mais nova. Nenhum valor foi apagado.</span><div class="row"><button class="secondary" id="useCloudV5332" type="button">Usar nuvem</button><button class="primary" id="keepPhoneV5332" type="button">Manter celular</button></div></div>`);
      }
      if (savedLine && unit.mobileSyncAt) savedLine.insertAdjacentHTML('beforeend', ` · nuvem ${esc(savedAtLabel(unit.mobileSyncAt))}`);
    }
  };
  const bindV5332Base = bind;
  bind = function() {
    bindV5332Base();
    const syncBtn = $('#syncQueueNowV5332'); if (syncBtn) syncBtn.onclick = () => processOfflineQueueV5332({ message: true });
    const keep = $('#keepPhoneV5332'); if (keep) keep.onclick = async () => {
      const unit = currentUnit(); const opId = unit?.mobileSyncOperationId; if (!opId) return;
      const ops = await idbGetAllV5332(OFFLINE_OP_STORE_V5332); const op = ops.find(item => item.id === opId); if (!op) return;
      if (!confirm('Manter a leitura deste celular e substituir a leitura conflitante na nuvem? A cópia da nuvem continuará registrada no histórico de conflito local.')) return;
      op.forceLocal = true; op.status = 'pending'; await idbPutV5332(OFFLINE_OP_STORE_V5332, op); unit.mobileSyncStatus = 'pending'; persistStateDirectV5332(); processOfflineQueueV5332({ message: true });
    };
    const useCloud = $('#useCloudV5332'); if (useCloud) useCloud.onclick = async () => {
      const block = currentBlock(), unit = currentUnit(); const opId = unit?.mobileSyncOperationId; if (!block || !unit || !opId) return;
      const ops = await idbGetAllV5332(OFFLINE_OP_STORE_V5332); const op = ops.find(item => item.id === opId); if (!op?.remoteFields) return;
      if (!confirm('Usar a leitura da nuvem neste apartamento? A leitura do celular continuará preservada no diário offline.')) return;
      applyFieldsV5332(unit, op.remoteFields); unit.mobileSyncStatus = 'synced'; unit.mobileSyncAt = new Date().toISOString(); unit.mobileSyncConflict = null; op.status = 'resolved-cloud'; await idbPutV5332(OFFLINE_OP_STORE_V5332, op); persistStateDirectV5332(); render(); toast('Leitura da nuvem aplicada. A cópia local anterior foi preservada no diário.');
    };
  };

  async function protectSavedUnitV5332(blockId, unitId) {
    try {
      await requestPersistentStorageV5332();
      await queueUnitForCloudV5332(blockId, unitId);
    } catch (error) {
      // O diário v5.3.31 e o localStorage continuam como duas camadas mesmo se IndexedDB falhar.
      console.error('Falha na camada IndexedDB', error);
      toast('Leitura salva, mas a camada extra IndexedDB falhou. Faça um BKP antes de continuar.', true);
    }
  }
  const saveReadingV5332Base = saveReading;
  saveReading = async function() {
    const block = currentBlock(), unit = currentUnit(); if (!block || !unit) return;
    const blockId = block.id, unitId = unit.id, beforeAt = unit.mobileSavedAt;
    await saveReadingV5332Base();
    const savedBlock = state.blocks.find(item => String(item.id) === String(blockId));
    const savedUnit = savedBlock?.units?.find(item => String(item.id) === String(unitId));
    if (savedUnit?.mobileDone && savedUnit.mobileSavedAt && savedUnit.mobileSavedAt !== beforeAt) await protectSavedUnitV5332(blockId, unitId);
  };
  const createAverageReadingV5332Base = createAverageReading;
  createAverageReading = function() {
    const block = currentBlock(), unit = currentUnit(); if (!block || !unit) return;
    const blockId = block.id, unitId = unit.id, beforeAt = unit.mobileSavedAt;
    const result = createAverageReadingV5332Base();
    const savedUnit = state.blocks.find(item => String(item.id) === String(blockId))?.units?.find(item => String(item.id) === String(unitId));
    if (savedUnit?.mobileDone && savedUnit.mobileSavedAt && savedUnit.mobileSavedAt !== beforeAt) protectSavedUnitV5332(blockId, unitId);
    return result;
  };
  const markNoAccessV5332Base = markNoAccess;
  markNoAccess = function() {
    const block = currentBlock(), unit = currentUnit(); if (!block || !unit) return;
    const blockId = block.id, unitId = unit.id, beforeAt = unit.mobileSavedAt;
    const result = markNoAccessV5332Base();
    const savedUnit = state.blocks.find(item => String(item.id) === String(blockId))?.units?.find(item => String(item.id) === String(unitId));
    if (savedUnit?.mobileDone && savedUnit.mobileSavedAt && savedUnit.mobileSavedAt !== beforeAt) protectSavedUnitV5332(blockId, unitId);
    return result;
  };

  window.addEventListener('online', () => { toast('Internet disponível. Retomando sincronização…'); processOfflineQueueV5332(); });
  window.addEventListener('offline', () => { toast('Sem internet. As leituras continuarão salvas no celular.'); render(); });
  document.addEventListener('kr2sync:session', () => processOfflineQueueV5332());
  document.addEventListener('kr2sync:push', () => render());
  setTimeout(() => { if (navigator.onLine && window.KR2Sync?.connected?.()) processOfflineQueueV5332(); }, 900);

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
  recoverMobileJournalV5331();
  initIndexes(); render(); checkVersionNotice(); bootstrapCloudMobile();
  $('#mobileImportInput')?.addEventListener('change', importMobileBackup);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();

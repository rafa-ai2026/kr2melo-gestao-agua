(() => {
  'use strict';
  const KEY = 'kr2melo.hidrometro.v1';
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
  const n = value => Number(value) || 0;
  const esc = (value = '') => { const node = document.createElement('div'); node.textContent = String(value ?? ''); return node.innerHTML; };
  const fmt = value => n(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const today = () => { const now = new Date(); const off = now.getTimezoneOffset() * 60000; return new Date(now.getTime() - off).toISOString().slice(0, 10); };
  const monthLabel = month => monthFmt.format(new Date(`${month}-02T12:00:00`));
  const KEY_DB = 'kr2melo-v5-photos';
  let state = load(), blockIndex = 0, unitIndex = 0, pendingPhoto = '';

  function load() { try { const parsed = JSON.parse(localStorage.getItem(KEY)); return parsed && Array.isArray(parsed.blocks) ? parsed : { selected: null, blocks: [] }; } catch { return { selected: null, blocks: [] }; } }
  function save(message = '') { try { localStorage.setItem(KEY, JSON.stringify(state)); if (window.KR2Sync?.autoEnabled?.()) window.KR2Sync.queuePush(JSON.parse(JSON.stringify(state))); if (message) toast(message); return true; } catch { toast('Não foi possível salvar. Faça backup e libere espaço no navegador.', true); return false; } }
  function toast(message, error = false) { const el = $('#toast'); el.textContent = message; el.className = `toast show${error ? ' error' : ''}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.className = 'toast'; }, 2800); }
  function cost(m3, tariff) { const use = Math.max(0, n(m3)), t = { minimum: 64.6, tier1: 8.94, tier2: 13.82, ...(tariff || {}) }; if (use <= 10) return n(t.minimum); if (use <= 20) return n(t.minimum) + (use - 10) * n(t.tier1); return n(t.minimum) + 10 * n(t.tier1) + (use - 20) * n(t.tier2); }
  function currentBlock() { return state.blocks.find(block => block.id === state.selected) || state.blocks[blockIndex] || state.blocks[0] || null; }
  function currentUnit() { return currentBlock()?.units?.[unitIndex] || null; }
  function isDone(unit) { return unit && unit.current !== '' && unit.current !== null && unit.current !== undefined && (unit.mobileDone || true); }
  function doneCount(block) { return block.units.filter(isDone).length; }
  function initIndexes() { const selectedIndex = state.blocks.findIndex(block => block.id === state.selected); blockIndex = selectedIndex >= 0 ? selectedIndex : 0; const block = currentBlock(); const next = block?.units?.findIndex(unit => !isDone(unit)); unitIndex = next >= 0 ? next : 0; }
  function issueFor(unit, current) { const previous = n(unit.previous), diff = current - previous; if (current < previous) return { level: 'danger', text: '⚠ A leitura atual está menor que a anterior. Confira se houve erro de digitação.' }; if (diff > 30) return { level: 'danger', text: '🚨 Consumo acima de 30 m³. Verifique possível vazamento ou leitura fora do padrão.' }; if (diff > 20) return { level: 'warn', text: '⚠ Consumo entre 21 e 30 m³. Confira o hidrômetro antes de salvar.' }; if (diff > 15) return { level: 'warn', text: '⚠ Consumo acima de 15 m³. Atenção ao consumo elevado.' }; return null; }

  function photoDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(KEY_DB, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('photos')) request.result.createObjectStore('photos'); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  async function putPhoto(key, data) { const db = await photoDb(); return new Promise((resolve, reject) => { const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').put(data, key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
  async function getPhoto(key) { const db = await photoDb(); return new Promise((resolve, reject) => { const tx = db.transaction('photos', 'readonly'); const req = tx.objectStore('photos').get(key); req.onsuccess = () => resolve(req.result || ''); req.onerror = () => reject(req.error); }); }
  function photoKey(block, unit) { return `${block.id}:${block.month}:${unit.id}`; }
  async function showStoredPhoto(unit) { const image = $('#photoPreview'); if (!image) return; if (pendingPhoto) { image.src = pendingPhoto; image.classList.add('show'); return; } if (unit.photo) { image.src = unit.photo; image.classList.add('show'); return; } if (!unit.photoKey) return; try { const data = await getPhoto(unit.photoKey); if (data && currentUnit()?.id === unit.id) { image.src = data; image.classList.add('show'); } } catch {} }
  async function compressPhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url; });
      const max = 1280; const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale)); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', .72);
    } finally { URL.revokeObjectURL(url); }
  }

  function render() {
    const app = $('#mobileApp');
    if (!state.blocks.length) { app.innerHTML = `<section class="card hero"><h1>Nenhum condomínio cadastrado</h1><p>Cadastre condomínios e apartamentos no modo Admin antes de usar o celular.</p></section><a class="primary" href="index.html" style="display:block;text-align:center;text-decoration:none;border-radius:14px;padding:16px">Abrir Admin</a>`; return; }
    const block = currentBlock(); const unit = currentUnit();
    if (!block || !unit) { app.innerHTML = '<section class="card"><h2>Sem apartamentos</h2><p class="muted">Cadastre apartamentos no painel administrativo.</p></section>'; return; }
    const done = doneCount(block), percent = block.units.length ? Math.round(done / block.units.length * 100) : 0;
    const hasPhoto = Boolean(unit.photo || unit.photoKey || pendingPhoto);
    app.innerHTML = `<section class="card hero"><p>Leitura em campo</p><h1>${esc(block.name)}</h1><p>${monthLabel(block.month)} · ${done}/${block.units.length} concluídos</p><div class="progress"><i style="width:${percent}%"></i></div></section><section class="card"><label class="muted"><b>Selecionar condomínio</b></label><select id="blockPick">${state.blocks.map((item, index) => `<option value="${index}" ${item.id === block.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></section><section class="card"><div class="unit-head"><div><span class="muted">Apartamento</span><div class="unit-number">${esc(unit.number)}</div></div><span class="pill ${isDone(unit) ? 'ok' : 'warn'}">${isDone(unit) ? 'Salvo' : 'Pendente'}</span></div><p class="muted">${esc(unit.resident || 'Responsável não informado')} · ${esc(unit.operationalStatus || 'ocupado')}</p><div class="row"><div><small class="muted"><b>Leitura anterior</b></small><h2>${fmt(unit.previous)}</h2></div><div><small class="muted"><b>Consumo atual</b></small><h2>${fmt(unit.m3)} m³</h2></div></div><div class="reading-big"><label>Leitura atual</label><input id="currentReading" inputmode="decimal" value="${unit.current === '' ? '' : esc(unit.current)}" placeholder="Digite aqui"></div><div id="alertBox"></div><img id="photoPreview" class="photo-preview ${hasPhoto ? 'show' : ''}" alt="Foto do hidrômetro"><div class="row" style="margin-top:12px"><button class="secondary" id="photoBtn">📷 Fotografar</button><button class="secondary" id="gpsBtn">📍 GPS</button></div><p class="photo-note">Fotos novas são reduzidas e guardadas neste aparelho, sem ocupar o armazenamento das leituras.</p><button class="primary" id="saveBtn" style="margin-top:12px">💾 Salvar e próximo</button><div class="row" style="margin-top:9px"><button class="secondary" id="prevBtn">◀ Anterior</button><button class="secondary" id="nextBtn">Próximo ▶</button></div></section><section class="card"><h3>Apartamentos</h3><div class="apt-list">${block.units.map((item, index) => `<button data-jump="${index}" class="${index === unitIndex ? 'active' : ''} ${isDone(item) ? 'done' : ''}">${esc(item.number)}</button>`).join('')}</div></section><section class="card"><button class="secondary" id="exportMobile">Exportar backup de leituras</button><button class="primary" id="syncMobile" style="margin-top:10px">☁ Sincronizar com painel</button><p class="muted" style="margin:10px 0 0">Use a mesma conta na tela Sincronização do painel.</p></section>`;
    bind(); showStoredPhoto(unit); checkAlert($('#currentReading').value);
  }
  function bind() {
    const block = currentBlock();
    $('#blockPick').onchange = event => { blockIndex = n(event.target.value); state.selected = state.blocks[blockIndex].id; unitIndex = 0; pendingPhoto = ''; save(); render(); };
    $('#currentReading').oninput = event => checkAlert(event.target.value);
    $('#photoBtn').onclick = () => $('#cameraInput').click(); $('#gpsBtn').onclick = captureGps; $('#saveBtn').onclick = saveReading;
    $('#prevBtn').onclick = () => { unitIndex = Math.max(0, unitIndex - 1); pendingPhoto = ''; render(); };
    $('#nextBtn').onclick = () => { unitIndex = Math.min(block.units.length - 1, unitIndex + 1); pendingPhoto = ''; render(); };
    document.querySelectorAll('[data-jump]').forEach(button => { button.onclick = () => { unitIndex = n(button.dataset.jump); pendingPhoto = ''; render(); }; });
    $('#exportMobile').onclick = exportBackup;
    $('#syncMobile').onclick = () => { location.href = './index.html#sincronizacao'; };
  }
  function checkAlert(value) { const unit = currentUnit(), box = $('#alertBox'); if (!unit || !box) return; const raw = String(value).replace(',', '.').trim(); if (raw === '') { box.innerHTML = ''; return; } const current = Number(raw); if (!Number.isFinite(current) || current < 0) { box.innerHTML = '<p class="alert danger">Digite uma leitura numérica válida.</p>'; return; } const issue = issueFor(unit, current); box.innerHTML = issue ? `<p class="alert ${issue.level === 'danger' ? 'danger' : ''}">${issue.text}</p>` : '<p class="alert ok">Leitura dentro da faixa de atenção.</p>'; }
  async function saveReading() {
    const block = currentBlock(), unit = currentUnit(), input = $('#currentReading'); const raw = String(input.value).replace(',', '.').trim();
    if (raw === '') return toast('Digite a leitura atual.', true); const current = Number(raw); if (!Number.isFinite(current) || current < 0) return toast('Digite uma leitura válida.', true);
    const issue = issueFor(unit, current); if (issue && !confirm(`${issue.text}\n\nDeseja manter esta leitura?`)) return;
    unit.current = current; unit.readingType = 'real'; unit.m3 = Math.max(0, current - n(unit.previous)); unit.value = cost(unit.m3, block.tariff); unit.mobileDone = true; unit.mobileSavedAt = new Date().toISOString();
    if (pendingPhoto) { try { const key = photoKey(block, unit); await putPhoto(key, pendingPhoto); unit.photoKey = key; unit.photo = ''; } catch { toast('A leitura foi salva, mas a foto não pôde ser guardada.', true); } }
    state.selected = block.id; if (!save(`Apto ${unit.number} salvo`)) return; if (unitIndex < block.units.length - 1) unitIndex++; pendingPhoto = ''; render();
  }
  function captureGps() { if (!navigator.geolocation) return toast('GPS não disponível neste aparelho.', true); navigator.geolocation.getCurrentPosition(position => { const unit = currentUnit(); unit.gps = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, at: new Date().toISOString() }; save('Localização salva'); }, () => toast('Não foi possível capturar o GPS.', true), { enableHighAccuracy: true, timeout: 10000 }); }
  $('#cameraInput').onchange = async event => { const file = event.target.files?.[0]; if (!file) return; try { pendingPhoto = await compressPhoto(file); const image = $('#photoPreview'); image.src = pendingPhoto; image.classList.add('show'); toast('Foto preparada. Salve a leitura para guardar.'); } catch { toast('Não foi possível processar a foto.', true); } event.target.value = ''; };
  function exportBackup() { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), state }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `backup-mobile-kr2melo-${today()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); toast('Backup de leituras baixado'); }

  async function bootstrapCloudMobile() {
    if (!window.KR2Sync?.connected?.() || state.blocks.length) return;
    try { const remote = await window.KR2Sync.pullState(); if (remote && Array.isArray(remote.blocks) && remote.blocks.length) { state = remote; localStorage.setItem(KEY, JSON.stringify(state)); initIndexes(); render(); toast('Dados baixados da nuvem'); } } catch {}
  }
  initIndexes(); render(); bootstrapCloudMobile();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();

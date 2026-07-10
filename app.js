(() => {
  'use strict';

  const KEY = 'kr2melo.hidrometro.v1';
  const APP_VERSION = '5.3.12';
  const DEFAULT_TARIFF = { minimum: 80.84, minimumM3: 10, tier1: 8.37, tier1Limit: 20, tier2: 10.87, tier2Limit: 30 };
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const deepClone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const esc = (value = '') => { const node = document.createElement('div'); node.textContent = String(value ?? ''); return node.innerHTML; };
  const n = value => Number(value) || 0;
  const isSet = value => value !== '' && value !== null && value !== undefined;
  const fmtM3 = value => n(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const fmtInt = value => n(value).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

  const routes = {
    dashboard: ['PAINEL', 'Visão geral'],
    leituras: ['OPERAÇÃO', 'Leituras do mês'],
    fechamento: ['CICLO MENSAL', 'Fechamento do mês'],
    historico: ['REGISTROS', 'Histórico mensal'],
    relatorios: ['GESTÃO', 'Relatórios'],
    financeiro: ['FINANCEIRO', 'Controle de pagamentos'],
    recibos: ['RECIBOS', 'Recibos para síndicos'],
    boletos: ['COBRANÇA', 'Boletos mensais'],
    configuracoes: ['AJUSTES', 'Configurações'],
    ajuda: ['MANUAL', 'Manual de uso']
  };

  const roleLabels = { normal: 'Sem função', sindico: 'Síndico', tesoureiro: 'Tesoureiro', indicado: 'Indicado pelo síndico' };
  const ruleLabels = { normal: 'Cobrança normal', isento: 'Isento de condomínio', desconto_fixo: 'Desconto fixo', desconto_percentual: 'Desconto percentual' };
  let closingRefreshAt = '';

  function localDate() {
    const now = new Date();
    const off = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - off).toISOString();
  }
  function currentMonth() { return localDate().slice(0, 7); }
  function today() { return localDate().slice(0, 10); }
  function shiftMonth(month, offset) {
    const d = new Date(`${month}-02T12:00:00`);
    d.setMonth(d.getMonth() + offset);
    return d.toISOString().slice(0, 7);
  }
  function monthLabel(month) { return monthFmt.format(new Date(`${month}-02T12:00:00`)); }
  function dateBr(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—';
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  function dayOf(value, fallback = 10) {
    const result = Number(String(value || '').slice(8, 10));
    return Number.isFinite(result) && result >= 1 && result <= 31 ? result : fallback;
  }
  function dateForMonth(month, day = 10) {
    const [year, mon] = month.split('-').map(Number);
    const last = new Date(year, mon, 0).getDate();
    return `${year}-${String(mon).padStart(2, '0')}-${String(Math.min(Math.max(1, Number(day) || 10), last)).padStart(2, '0')}`;
  }
  function addMonthToDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const d = new Date(`${value}T12:00:00`);
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  }
  function normalizedHeader(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function defaultBilling(month) {
    return {
      dueDate: dateForMonth(month, 10),
      previousReadDate: '',
      currentReadDate: today(),
      nextReadDate: '',
      waterBill: 0,
      serviceFee: 6.25,
      chargeService: true,
      serviceLabel: 'SERVIÇO DE LEITURA HIDRÔMETRO',
      condoFee: 50,
      notes: 'EM CASO DE ATRASO, SERÁ COBRADA A MULTA PREVISTA PELO CONDOMÍNIO.\nEM CASO DE DÚVIDAS, PROCURE O SÍNDICO OU O PRESTADOR RESPONSÁVEL.'
    };
  }
  function normalizeRule(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const mode = ['normal', 'isento', 'desconto_fixo', 'desconto_percentual'].includes(r.mode) ? r.mode : 'normal';
    const role = ['normal', 'sindico', 'tesoureiro', 'indicado'].includes(r.role) ? r.role : 'normal';
    return {
      role,
      mode,
      value: Math.max(0, n(r.value)),
      reason: String(r.reason || ''),
      startsAt: String(r.startsAt || '').slice(0, 7),
      endsAt: String(r.endsAt || '').slice(0, 7),
      authorizedBy: String(r.authorizedBy || '')
    };
  }
  function normalizeMeter(raw) {
    const meter = raw && typeof raw === 'object' ? raw : {};
    return {
      serial: String(meter.serial || ''),
      location: String(meter.location || ''),
      installedAt: String(meter.installedAt || ''),
      replacedAt: String(meter.replacedAt || ''),
      initialReading: Math.max(0, n(meter.initialReading)),
      note: String(meter.note || '')
    };
  }
  function normalizePayment(raw, legacy = {}) {
    const payment = raw && typeof raw === 'object' ? raw : {};
    const allowed = ['pendente', 'pago', 'parcial', 'negociado', 'vencido', 'isento'];
    const status = allowed.includes(payment.status) ? payment.status : (legacy.paid ? 'pago' : 'pendente');
    return {
      status,
      received: Math.max(0, n(payment.received)),
      date: String(payment.date || legacy.paymentDate || ''),
      method: String(payment.method || ''),
      pixId: String(payment.pixId || ''),
      proofNote: String(payment.proofNote || ''),
      agreement: String(payment.agreement || '')
    };
  }

  function normalizeUnit(raw, index = 0) {
    const u = raw && typeof raw === 'object' ? raw : {};
    const previous = n(u.previous);
    const current = isSet(u.current) ? (u.current === '' ? '' : n(u.current)) : '';
    const m3 = current === '' ? 0 : Math.max(0, current - previous);
    const migratedRule = u.condoRule || u.adjustment || {
      role: u.role || 'normal', mode: u.condoExempt ? 'isento' : 'normal', value: u.condoDiscount || 0,
      reason: u.condoDiscountReason || ''
    };
    return {
      id: String(u.id || uid()),
      number: String(u.number || String(index + 1).padStart(2, '0')),
      resident: String(u.resident || ''),
      previous,
      current,
      m3,
      value: n(u.value),
      note: String(u.note || ''),
      mobileDone: Boolean(u.mobileDone),
      mobileSavedAt: String(u.mobileSavedAt || ''),
      gps: u.gps || null,
      photoKey: String(u.photoKey || ''),
      photo: String(u.photo || ''),
      extraChargeLabel: String(u.extraChargeLabel || 'VALOR ADICIONAL'),
      extraCharge: Math.max(0, n(u.extraCharge)),
      extraCharges: Array.isArray(u.extraCharges) ? u.extraCharges.map(item => ({
        label: String(item?.label || 'VALOR ADICIONAL'),
        value: n(item?.value)
      })).filter(item => item.label || item.value) : [],
      billingFineLabel: String(u.billingFineLabel || 'MULTAS / OUTROS'),
      billingFine: Math.max(0, n(u.billingFine)),
      billingFineNote: String(u.billingFineNote || ''),
      billingNote: String(u.billingNote || ''),
      condoRule: normalizeRule(migratedRule),
      paid: Boolean(u.paid),
      paymentDate: String(u.paymentDate || ''),
      phone: String(u.phone || ''),
      operationalStatus: ['ocupado','vazio','alugado','reforma','sem_acesso','parado','trocado','estimada'].includes(u.operationalStatus) ? u.operationalStatus : 'ocupado',
      readingType: ['real','estimated'].includes(u.readingType) ? u.readingType : 'real',
      estimatedReason: String(u.estimatedReason || ''),
      meter: normalizeMeter(u.meter),
      payment: normalizePayment(u.payment, u)
    };
  }
  function normalizeBilling(raw, month) {
    const defaults = defaultBilling(month);
    const b = raw && typeof raw === 'object' ? raw : {};
    return {
      ...defaults,
      ...b,
      dueDate: String(b.dueDate || defaults.dueDate),
      previousReadDate: String(b.previousReadDate || ''),
      currentReadDate: String(b.currentReadDate || defaults.currentReadDate),
      nextReadDate: String(b.nextReadDate || ''),
      waterBill: Math.max(0, n(b.waterBill)),
      serviceFee: Math.max(0, n(b.serviceFee)),
      condoFee: Math.max(0, n(b.condoFee)),
      chargeService: b.chargeService !== false,
      serviceLabel: String(b.serviceLabel || defaults.serviceLabel),
      notes: String(b.notes || defaults.notes)
    };
  }
  function normalizeHistoryEntry(raw) {
    const h = raw && typeof raw === 'object' ? raw : {};
    const month = String(h.month || currentMonth());
    const units = Array.isArray(h.units) ? h.units.map((u, i) => normalizeUnit(u, i)) : [];
    const billing = normalizeBilling(h.billing || {}, month);
    return {
      id: String(h.id || uid()), month, version: n(h.version) || 1,
      closedAt: String(h.closedAt || ''), checks: Array.isArray(h.checks) ? h.checks : [],
      units, tariff: { ...DEFAULT_TARIFF, ...(h.tariff || {}) }, billing,
      charges: Array.isArray(h.charges) ? h.charges : [],
      totalM3: n(h.totalM3), totalValue: n(h.totalValue), waterTotal: n(h.waterTotal),
      grandTotal: n(h.grandTotal), totalDiscount: n(h.totalDiscount),
      source: ['fechado','importado','manual','revisado'].includes(h.source) ? h.source : 'fechado',
      status: ['bloqueado','importado','revisado'].includes(h.status) ? h.status : 'bloqueado',
      revisionOf: String(h.revisionOf || ''),
      revisionReason: String(h.revisionReason || ''),
      importedAt: String(h.importedAt || '')
    };
  }
  function normalizeBlock(raw) {
    const b = raw && typeof raw === 'object' ? raw : {};
    const month = /^\d{4}-\d{2}$/.test(b.month || '') ? b.month : shiftMonth(currentMonth(), -1);
    const units = Array.isArray(b.units) ? b.units.map((u, i) => normalizeUnit(u, i)) : [];
    const block = {
      id: String(b.id || uid()), name: String(b.name || 'Condomínio sem nome'), address: String(b.address || ''), manager: String(b.manager || ''),
      month, tariff: { ...DEFAULT_TARIFF, ...(b.tariff || {}) }, billing: normalizeBilling(b.billing, month),
      units, history: Array.isArray(b.history) ? b.history.map(normalizeHistoryEntry) : [],
      serviceReceipts: Array.isArray(b.serviceReceipts || b.receipts) ? (b.serviceReceipts || b.receipts) : [],
      serviceReceiptDraft: b.serviceReceiptDraft && typeof b.serviceReceiptDraft === 'object' ? b.serviceReceiptDraft : null,
      operator: String(b.operator || 'Operador'),
      audit: Array.isArray(b.audit) ? b.audit.slice(0, 500) : []
    };
    recalculateBlock(block);
    return block;
  }
  function normalizeState(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const blocks = Array.isArray(source.blocks) ? source.blocks.map(normalizeBlock) : [];
    return { version: APP_VERSION, selected: blocks.some(b => b.id === source.selected) ? source.selected : (blocks[0]?.id || null), blocks };
  }
  function load() {
    try { return normalizeState(JSON.parse(localStorage.getItem(KEY))); }
    catch { return normalizeState({ blocks: [] }); }
  }
  let state = load();
  // Seleção temporária da tela Leituras. Não é gravada no backup.
  let selectedReadingIds = new Set();

  function toast(message, error = false) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.className = `toast show${error ? ' error' : ''}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.className = 'toast'; }, 3000);
  }
  let suspendCloudSyncV52 = false;
  function save(message = '') {
    try {
      state.version = APP_VERSION;
      localStorage.setItem(KEY, JSON.stringify(state));
      if (!suspendCloudSyncV52 && window.KR2Sync?.autoEnabled?.()) window.KR2Sync.queuePush(deepClone(state));
      if (message) toast(message);
      return true;
    } catch (error) {
      console.error(error);
      toast('Não foi possível salvar. Exporte um backup e libere espaço no navegador.', true);
      return false;
    }
  }
  function selected() { return state.blocks.find(block => block.id === state.selected) || state.blocks[0] || null; }
  function findUnit(block, id) { return block?.units.find(unit => unit.id === id) || null; }
  function currentRoute() { const key = location.hash.slice(1) || 'dashboard'; return routes[key] ? key : 'dashboard'; }
  function setRoute(route) { location.hash = route; }

  function waterCost(m3, tariff) {
    const use = Math.max(0, n(m3));
    const t = { ...DEFAULT_TARIFF, ...(tariff || {}) };
    const minimumM3 = Math.max(0, n(t.minimumM3 || 10));
    const tier1Limit = Math.max(minimumM3, n(t.tier1Limit || 20));
    if (use <= minimumM3) return n(t.minimum);
    if (use <= tier1Limit) return n(t.minimum) + (use - minimumM3) * n(t.tier1);
    return n(t.minimum) + (tier1Limit - minimumM3) * n(t.tier1) + (use - tier1Limit) * n(t.tier2);
  }
  function recalculateUnit(unit, block) {
    const current = unit.current === '' ? null : n(unit.current);
    unit.m3 = current === null ? 0 : Math.max(0, current - n(unit.previous));
    unit.value = waterCost(unit.m3, block.tariff);
  }
  function recalculateBlock(block) { block.units.forEach(unit => recalculateUnit(unit, block)); }
  function ruleActive(rule, month) {
    if (!rule || rule.mode === 'normal') return false;
    const start = String(rule.startsAt || '').slice(0, 7);
    const end = String(rule.endsAt || '').slice(0, 7);
    return (!start || start <= month) && (!end || end >= month);
  }
  function unitCharges(unit, block, options = {}) {
    const billing = options.billing || block.billing || defaultBilling(block.month);
    const month = options.month || block.month;
    const water = options.water ?? waterCost(options.m3 ?? unit.m3, options.tariff || block.tariff);
    const grossCondo = Math.max(0, n(billing.condoFee));
    const rule = normalizeRule(options.rule || unit.condoRule);
    let condoDiscount = 0;
    if (ruleActive(rule, month)) {
      if (rule.mode === 'isento') condoDiscount = grossCondo;
      if (rule.mode === 'desconto_fixo') condoDiscount = Math.min(grossCondo, Math.max(0, n(rule.value)));
      if (rule.mode === 'desconto_percentual') condoDiscount = Math.min(grossCondo, grossCondo * Math.min(100, Math.max(0, n(rule.value))) / 100);
    }
    const condo = Math.max(0, grossCondo - condoDiscount);
    const service = billing.chargeService !== false && String(billing.serviceLabel || '').trim() ? Math.max(0, n(billing.serviceFee)) : 0;
    const extraList = Array.isArray(unit.extraCharges) ? unit.extraCharges : [];
    const extraCharge = extraList.reduce((sum, item) => sum + Math.max(0, n(item?.value)), Math.max(0, n(options.extraCharge ?? unit.extraCharge)));
    const fine = Math.max(0, n(options.fine ?? unit.billingFine));
    return { water, grossCondo, condoDiscount, condo, service, extraCharge, fine, total: water + condo + service + extraCharge + fine, rule };
  }
  function adjustmentText(charges) {
    if (!charges.condoDiscount) return '';
    const rule = charges.rule;
    const role = rule.role !== 'normal' ? ` — ${roleLabels[rule.role]}` : '';
    const reason = rule.reason ? ` · ${rule.reason}` : '';
    const label = rule.mode === 'isento' ? 'Isenção de condomínio' : 'Desconto de condomínio';
    return `${label}${role}${reason}`;
  }
  function chargeTotals(block, options = {}) {
    return block.units.reduce((sum, unit) => {
      const c = unitCharges(unit, block, options);
      sum.m3 += n(unit.m3); sum.water += c.water; sum.grossCondo += c.grossCondo; sum.discount += c.condoDiscount;
      sum.condo += c.condo; sum.service += c.service; sum.extraCharge += c.extraCharge; sum.fine += c.fine; sum.total += c.total;
      if (unit.paid) { sum.paid += c.total; sum.paidCount++; }
      return sum;
    }, { m3: 0, water: 0, grossCondo: 0, discount: 0, condo: 0, service: 0, extraCharge: 0, fine: 0, total: 0, paid: 0, paidCount: 0 });
  }
  function waterCoverage(block) {
    const totals = chargeTotals(block);
    const bill = n(block.billing?.waterBill);
    const diff = totals.water - bill;
    return { bill, total: totals.water, diff, covered: bill > 0 && diff >= 0, percent: bill > 0 ? totals.water / bill * 100 : 0 };
  }
  function readingIssue(unit) {
    if (unit.current === '' || unit.current === null || unit.current === undefined) return null;
    const current = n(unit.current), previous = n(unit.previous), diff = current - previous;
    if (current < previous) return { type: 'danger', key: 'typing-error', short: '⚠ Erro?', text: `Leitura atual (${fmtInt(current)}) menor que a anterior (${fmtInt(previous)}). Confira se faltou algum dígito.` };
    if (diff > 30) return { type: 'danger', key: 'typing-critical', short: '🚨 Conferir', text: `Consumo de ${fmtInt(diff)} m³. Verifique possível vazamento ou erro de digitação.` };
    if (diff > 20) return { type: 'warn', key: 'typing-high', short: '⚠ Conferir', text: `Consumo de ${fmtInt(diff)} m³. Pode ser consumo alto ou erro de digitação.` };
    if (diff > 15) return { type: 'warn', key: 'high-consumption', short: 'Atenção', text: `Consumo de ${fmtInt(diff)} m³. Confira o hidrômetro e o imóvel.` };
    return null;
  }
  function readingBadge(unit) {
    const issue = readingIssue(unit);
    if (!issue) return '<span class="pill ok">Normal</span>';
    return `<span class="pill ${issue.type === 'danger' ? 'danger' : 'warn'}" title="${esc(issue.text)}">${esc(issue.short)}</span>`;
  }
  function allAlerts(block) {
    const alerts = [];
    for (const unit of block.units) {
      if (unit.current === '') alerts.push({ type: 'warn', unit: unit.number, title: 'Leitura pendente', text: 'A leitura atual ainda não foi lançada.' });
      const issue = readingIssue(unit);
      if (issue) alerts.push({ type: issue.type, unit: unit.number, title: issue.short, text: issue.text });
    }
    return alerts;
  }

  function refreshPicker() {
    const select = $('#blockSelect');
    if (!select) return;
    const block = selected();
    select.innerHTML = state.blocks.length ? state.blocks.map(item => `<option value="${item.id}" ${item.id === block?.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('') : '<option>Cadastre o primeiro</option>';
    select.disabled = !state.blocks.length;
    if (block && state.selected !== block.id) { state.selected = block.id; save(); }
  }
  async function newBlock(data) {
    try {
      const count = Math.min(500, Math.max(1, n(data.count) || 12));
      const month = shiftMonth(currentMonth(), -1);
      const initialFile = data.initialSheet;
      let units;
      if (initialFile && initialFile.name && initialFile.size > 0) {
        const rows = await rowsFromSpreadsheetFile(initialFile);
        units = initialBlockUnitsFromRows(rows);
      } else {
        units = Array.from({ length: count }, (_, index) => ({ id: uid(), number: String(index + 1).padStart(2, '0'), resident: '', previous: 0, current: '' }));
      }
      const block = normalizeBlock({
        id: uid(), name: data.name || 'Novo condomínio', address: data.address || '', manager: data.manager || '', month,
        units, history: []
      });
      state.blocks.push(block); state.selected = block.id;
      audit(block, 'Condomínio criado', `${block.units.length} unidade(s) cadastrada(s)${initialFile && initialFile.name ? ' por planilha inicial' : ''}.`, { importedInitialSheet: Boolean(initialFile && initialFile.name) });
      save(initialFile && initialFile.name ? `Condomínio criado com ${block.units.length} unidade(s) importada(s)` : 'Condomínio criado'); render();
    } catch (error) {
      toast(error.message || 'Não foi possível criar o condomínio a partir da planilha.', true);
    }
  }
  function emptyState() {
    return `<section class="hero"><div><p class="eyebrow">BEM-VINDO</p><h2>Seu controle de água começa aqui.</h2><p>Cadastre o primeiro condomínio e organize leituras, regras, descontos e cobranças.</p><br><button class="primary" data-new type="button">+ Cadastrar condomínio</button></div></section><div class="card empty" style="margin-top:16px"><img src="assets/logo.png" width="90" alt=""><h3>Nenhum condomínio cadastrado</h3><p>Os dados ficam salvos neste navegador. Use backups regularmente.</p></div>`;
  }

  function renderDashboard(block) {
    const totals = chargeTotals(block);
    const coverage = waterCoverage(block);
    const alerts = allAlerts(block);
    const max = Math.max(1, ...block.units.map(unit => n(unit.m3)));
    return `<section class="hero"><div><p class="eyebrow">KR²MELO ${VERSION_LABEL}</p><h2>${esc(block.name)}</h2><p>${esc(block.address || 'Endereço não informado')} · ${monthLabel(block.month)}</p></div><div><button class="secondary" data-go="leituras">Lançar leituras →</button></div></section>
      <section class="metrics"><article class="metric red"><span class="label">Consumo do mês</span><strong>${fmtM3(totals.m3)} m³</strong><small>${block.units.length} unidade(s) cadastrada(s)</small></article><article class="metric"><span class="label">Cobrança total</span><strong>${money.format(totals.total)}</strong><small>Água, condomínio, serviço e outros</small></article><article class="metric ${coverage.bill && !coverage.covered ? 'red' : 'green'}"><span class="label">Cobertura da água</span><strong>${coverage.bill ? `${coverage.percent.toFixed(1)}%` : '—'}</strong><small>${coverage.bill ? (coverage.covered ? 'Conta global coberta' : `Faltam ${money.format(Math.abs(coverage.diff))}`) : 'Informe a conta global'}</small></article><article class="metric"><span class="label">Descontos concedidos</span><strong>${money.format(totals.discount)}</strong><small>Somente no condomínio</small></article></section>
      <section class="grid-2"><article class="card"><div class="card-head"><h3>Consumo por apartamento</h3><button class="secondary" data-go="leituras">Ver leituras</button></div><div class="bar-list">${block.units.slice(0, 8).map(unit => `<div class="bar-row"><strong>${esc(unit.number)}</strong><div class="bar"><i style="width:${Math.min(100, n(unit.m3) / max * 100)}%"></i></div><span>${fmtM3(unit.m3)} m³</span></div>`).join('') || '<p class="empty">Sem apartamentos.</p>'}</div></article><article class="card"><div class="card-head"><h3>Alertas operacionais</h3><span class="pill ${alerts.length ? 'warn' : 'ok'}">${alerts.length}</span></div><div class="alert-list">${alerts.slice(0, 5).map(alert => `<div class="alert-item ${alert.type}"><strong>Apto ${esc(alert.unit)} · ${esc(alert.title)}</strong><small>${esc(alert.text)}</small></div>`).join('') || '<div class="alert-item ok"><strong>Sem pendências críticas</strong><small>As leituras atuais estão em situação normal.</small></div>'}</div></article></section>
      <section class="card search-card"><div class="card-head"><h3>Pesquisa rápida</h3><span class="muted">Apto, morador ou condomínio</span></div><input id="globalSearch" data-global-search placeholder="Ex.: 01, Maria ou nome do condomínio"><div id="globalSearchResult" class="notice-list" style="margin-top:12px"></div></section>`;
  }
  function waterCoverageCard(block) {
    const coverage = waterCoverage(block);
    const stateClass = !coverage.bill ? 'neutral' : coverage.covered ? 'ok' : 'bad';
    const title = !coverage.bill ? 'Informe a conta global' : coverage.covered ? 'Conta de água coberta' : 'Conta de água não coberta';
    return `<section class="card water-rate-card"><div class="card-head"><div><h3>Rateio da conta global de água</h3><span class="muted">Condomínio, serviço, multas e descontos não entram nesta conferência.</span></div><span class="pill ${coverage.covered ? 'ok' : coverage.bill ? 'danger' : 'info'}">${title}</span></div><div class="water-rate-grid"><label class="field"><span>Valor da conta global de água</span><input data-water-bill type="number" min="0" step="0.01" value="${coverage.bill || ''}" placeholder="Ex.: 2842,17"></label><div><small>Conta global</small><strong>${money.format(coverage.bill)}</strong></div><div><small>Soma da água</small><strong>${money.format(coverage.total)}</strong></div><div><small>${coverage.diff >= 0 ? 'Saldo' : 'Falta'}</small><strong class="${stateClass}">${money.format(Math.abs(coverage.diff))}</strong></div><div><small>Cobertura</small><strong class="${stateClass}">${coverage.bill ? `${coverage.percent.toFixed(1)}%` : '0,0%'}</strong></div></div></section>`;
  }
  function readingSelectionFor(block) {
    const valid = new Set((block?.units || []).map(unit => unit.id));
    selectedReadingIds = new Set([...selectedReadingIds].filter(id => valid.has(id)));
    return selectedReadingIds;
  }
  function updateReadingSelectionUi() {
    const block = selected(); if (!block) return;
    const selectedIds = readingSelectionFor(block), total = block.units.length, count = selectedIds.size;
    $$('[data-reading-selection-count]').forEach(node => { node.textContent = String(count); });
    $$('[data-clear-selected-readings],[data-remove-selected-units]').forEach(button => { button.disabled = count === 0; });
    const all = $('[data-select-all-readings]');
    if (all) { all.checked = total > 0 && count === total; all.indeterminate = count > 0 && count < total; }
  }
  function clearReadings(block, ids, label) {
    const selectedIds = new Set(ids || []);
    const units = block.units.filter(unit => selectedIds.has(unit.id));
    if (!units.length) return toast('Selecione ao menos uma leitura.', true);
    if (!confirm(`${label}?

Serão apagadas somente as leituras atuais, consumos, valores de água, fotos/GPS e marcações móveis. Apartamentos, responsáveis, leituras anteriores, regras, descontos, pagamentos e histórico serão preservados.`)) return;
    units.forEach(unit => {
      unit.current = ''; unit.m3 = 0; unit.value = waterCost(0, block.tariff);
      unit.mobileDone = false; unit.mobileSavedAt = ''; unit.photo = ''; unit.photoKey = ''; unit.gps = null;
      unit.readingType = 'real'; unit.estimatedReason = '';
    });
    selectedReadingIds.clear();
    audit(block, 'Leituras removidas', `${units.length} leitura(s) atual(is) removida(s).`, { unitIds: units.map(unit => unit.id) });
    save(`${units.length} leitura(s) removida(s)`); render();
  }
  function removeSelectedUnits(block, ids) {
    const selectedIds = new Set(ids || []);
    const units = block.units.filter(unit => selectedIds.has(unit.id));
    if (!units.length) return toast('Selecione ao menos um apartamento.', true);
    if (!confirm(`Excluir ${units.length} cadastro(s) de apartamento?

Esta ação remove os apartamentos da competência atual. O histórico já fechado não será alterado.`)) return;
    block.units = block.units.filter(unit => !selectedIds.has(unit.id));
    selectedReadingIds.clear();
    audit(block, 'Cadastros removidos', `${units.length} apartamento(s) removido(s) da competência atual.`, { unitIds: units.map(unit => unit.id) });
    save(`${units.length} apartamento(s) excluído(s)`); render();
  }
  function renderReadings(block) {
    const totals = chargeTotals(block), selectedIds = readingSelectionFor(block), selectedCount = selectedIds.size;
    return `${waterCoverageCard(block)}<div class="section-actions"><div><h2>${monthLabel(block.month)}</h2><span class="muted">Importe uma planilha Excel/CSV ou digite a Leitura Atual. As regras de desconto são preservadas.</span></div><div class="button-row"><button class="secondary" data-import-readings type="button">⇧ Importar Excel/CSV</button><button class="secondary" data-export-readings type="button">⇩ Planilha Excel (.csv)</button><button class="secondary" data-export-readings-xlsx type="button">⇩ Modelo .xlsx</button><button class="secondary" data-add-unit type="button">+ Unidade</button><button class="primary" data-go="fechamento" type="button">Fechamento mensal</button></div></div><section class="reading-bulk-actions card no-print"><div><strong><span data-reading-selection-count>${selectedCount}</span> selecionada(s)</strong><small>Use a caixa da primeira coluna para escolher leituras. “Limpar” preserva apartamento e leitura anterior.</small></div><div class="button-row"><button class="secondary" data-select-all-readings type="button">Selecionar todas</button><button class="secondary" data-clear-selected-readings type="button" ${selectedCount ? '' : 'disabled'}>Limpar selecionadas</button><button class="danger" data-clear-all-readings type="button">Limpar todas as leituras</button><button class="danger" data-remove-selected-units type="button" ${selectedCount ? '' : 'disabled'}>Excluir cadastros selecionados</button></div></section><div class="table-wrap"><table><thead><tr><th class="reading-check"><input type="checkbox" data-select-all-readings aria-label="Selecionar todas as leituras"></th><th>Apto / Hidrômetro</th><th>Responsável</th><th>Anterior</th><th>Atual</th><th>Consumo</th><th>Status</th><th>Água</th><th>Observação</th><th></th></tr></thead><tbody>${block.units.map(unit => { const issue = readingIssue(unit), checked = selectedIds.has(unit.id); return `<tr data-reading-row="${unit.id}" class="${issue ? `reading-issue ${issue.type}` : ''}"><td class="reading-check"><input data-reading-select type="checkbox" value="${unit.id}" ${checked ? 'checked' : ''} aria-label="Selecionar apartamento ${esc(unit.number)}"></td><td><input data-reading-field="number" value="${esc(unit.number)}" aria-label="Apartamento"></td><td><input data-reading-field="resident" value="${esc(unit.resident)}" placeholder="Nome"></td><td><input data-reading-field="previous" type="number" min="0" step="0.001" value="${unit.previous}"></td><td><input data-reading-field="current" type="number" min="0" step="0.001" value="${unit.current}"></td><td class="value">${fmtM3(unit.m3)} m³</td><td>${readingBadge(unit)}</td><td class="value">${money.format(unit.value)}</td><td><input data-reading-field="note" value="${esc(unit.note)}" placeholder="Opcional"></td><td><div class="row-actions"><button class="danger" data-remove-unit title="Excluir cadastro do apartamento" type="button">×</button></div></td></tr>`; }).join('')}</tbody><tfoot><tr><td></td><td colspan="4">TOTAL DE ÁGUA</td><td>${fmtM3(totals.m3)} m³</td><td></td><td>${money.format(totals.water)}</td><td colspan="2"></td></tr></tfoot></table></div>`;
  }
  function renderRules(block) {
    const totals = chargeTotals(block);
    const exempt = block.units.filter(unit => ruleActive(unit.condoRule, block.month) && unit.condoRule.mode === 'isento').length;
    const discounted = block.units.filter(unit => ruleActive(unit.condoRule, block.month) && unit.condoRule.mode.startsWith('desconto')).length;
    return `<section class="hero"><div><p class="eyebrow">REGRAS POR APARTAMENTO</p><h2>Isenções, descontos e lançamentos individuais</h2><p>Os descontos afetam somente o valor do condomínio; a água permanece calculada normalmente.</p></div><div><button class="secondary" data-go="boletos">Conferir boletos →</button></div></section><div class="rule-summary"><span class="pill ok">${exempt} isenção(ões) ativa(s)</span><span class="pill info">${discounted} desconto(s) ativo(s)</span><span class="pill warn">${money.format(totals.discount)} abatido no mês</span></div><div class="info-box"><strong>Valor adicional:</strong> use os campos “Valor adicional” quando quiser somar um valor individual ao total do apartamento sem lançar como multa/outros.</div><div class="table-wrap"><table class="rule-table"><thead><tr><th>Apto</th><th>Responsável</th><th>Função</th><th>Regra</th><th>Valor</th><th>Motivo / benefício</th><th>Início</th><th>Fim</th><th>Autorizado por</th><th>Descrição adicional</th><th>Valor adicional</th><th>Multas / outros</th><th>Valor</th><th>Resultado</th></tr></thead><tbody>${block.units.map(unit => { const r = normalizeRule(unit.condoRule), c = unitCharges(unit, block); return `<tr data-rule-row="${unit.id}"><td><strong>${esc(unit.number)}</strong></td><td>${esc(unit.resident || '—')}</td><td><select data-rule-field="role">${Object.entries(roleLabels).map(([value, label]) => `<option value="${value}" ${r.role === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td><select data-rule-field="mode">${Object.entries(ruleLabels).map(([value, label]) => `<option value="${value}" ${r.mode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td><input data-rule-field="value" type="number" min="0" step="0.01" value="${r.value || ''}" placeholder="R$ ou %"></td><td><input data-rule-field="reason" value="${esc(r.reason)}" placeholder="Ex.: Internet das câmeras"></td><td><input data-rule-field="startsAt" type="month" value="${esc(r.startsAt)}"></td><td><input data-rule-field="endsAt" type="month" value="${esc(r.endsAt)}"></td><td><input data-rule-field="authorizedBy" value="${esc(r.authorizedBy)}" placeholder="Síndico / ata"></td><td><input data-rule-field="extraChargeLabel" value="${esc(unit.extraChargeLabel || 'VALOR ADICIONAL')}"></td><td><input data-rule-field="extraCharge" type="number" min="0" step="0.01" value="${unit.extraCharge || ''}"></td><td><input data-rule-field="billingFineLabel" value="${esc(unit.billingFineLabel)}"></td><td><input data-rule-field="billingFine" type="number" min="0" step="0.01" value="${unit.billingFine || ''}"></td><td><strong>${money.format(c.total)}</strong>${c.extraCharge ? `<br><small>${esc(unit.extraChargeLabel || 'Valor adicional')}: ${money.format(c.extraCharge)}</small>` : ''}${c.condoDiscount ? `<br><small class="adjustment">− ${money.format(c.condoDiscount)}</small>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function closeChecks(block) {
    const checks = [];
    const done = block.units.filter(unit => unit.current !== '').length;
    checks.push(done === block.units.length ? { type: 'ok', title: 'Todas as leituras lançadas', text: `${done}/${block.units.length} unidades preenchidas.` } : { type: 'warn', title: 'Leituras pendentes', text: `${block.units.length - done} unidade(s) ainda sem leitura atual.` });
    for (const unit of block.units) {
      if (!unit.resident) checks.push({ type: 'warn', unit: unit.number, title: 'Responsável não cadastrado', text: 'Preencha o nome antes de imprimir documentos.' });
      const issue = readingIssue(unit);
      if (issue) checks.push({ type: issue.type, unit: unit.number, title: issue.short, text: issue.text });
    }
    return checks;
  }
  function renderClosing(block) {
    const checks = closeChecks(block), totals = chargeTotals(block), next = shiftMonth(block.month, 1);
    const refreshed = closingRefreshAt ? `<span class="closing-refresh-status" aria-live="polite">✓ Conferência recalculada às ${esc(closingRefreshAt)}</span>` : '<span class="closing-refresh-status muted">Use “Atualizar” depois de alterar leituras, responsáveis ou regras.</span>';
    return `<section class="hero"><div><p class="eyebrow">ASSISTENTE DE FECHAMENTO</p><h2>Fechar ${monthLabel(block.month)}</h2><p>Arquiva leituras, regras utilizadas, cobrança detalhada e prepara ${monthLabel(next)}.</p></div><div class="button-row"><button class="secondary" data-export-readings type="button">Planilha próxima leitura</button><button class="primary" data-close-month type="button">Executar fechamento</button></div></section><section class="metrics"><article class="metric"><span class="label">Unidades</span><strong>${block.units.length}</strong><small>${block.units.filter(unit => unit.current !== '').length} com leitura</small></article><article class="metric"><span class="label">Água</span><strong>${money.format(totals.water)}</strong><small>${fmtM3(totals.m3)} m³</small></article><article class="metric"><span class="label">Descontos</span><strong>${money.format(totals.discount)}</strong><small>Aplicados no condomínio</small></article><article class="metric ${checks.some(item => item.type === 'danger') ? 'red' : 'green'}"><span class="label">Pendências</span><strong>${checks.filter(item => item.type !== 'ok').length}</strong><small>Revise antes de fechar</small></article></section><section class="grid-2"><article class="card"><div class="card-head"><div><h3>Conferência automática</h3>${refreshed}</div><button class="secondary" data-refresh-closing type="button">↻ Atualizar</button></div><div class="alert-list">${checks.map(check => `<div class="alert-item ${check.type}"><strong>${check.unit ? `Apto ${esc(check.unit)} · ` : ''}${esc(check.title)}</strong><small>${esc(check.text)}</small></div>`).join('')}</div></article><article class="card"><h3>O que será registrado</h3><div class="notice-list"><div class="info-box">✓ Leituras, tarifa, dados de cobrança e detalhamento financeiro por apartamento.</div><div class="info-box">✓ Água, condomínio bruto, isenções/descontos, serviço, multas e total final.</div><div class="info-box">✓ A Leitura Atual passa para Leitura Anterior somente nos apartamentos efetivamente lidos.</div><div class="warning-box">O vencimento e as datas de leitura são avançados automaticamente. Confira os boletos antes de imprimir.</div></div><div class="form-foot"><button class="secondary" data-export type="button">Baixar backup agora</button><button class="primary" data-close-month type="button">Confirmar fechamento</button></div></article></section>`;
  }
  function historyTotals(entry) {
    if (entry.charges?.length) return entry.charges.reduce((a, c) => { a.water += n(c.water); a.total += n(c.total); a.discount += n(c.condoDiscount); a.m3 += n(c.m3); return a; }, { water: 0, total: 0, discount: 0, m3: 0 });
    const temp = { month: entry.month, tariff: entry.tariff, billing: entry.billing, units: entry.units };
    return chargeTotals(temp);
  }
  function renderHistory(block) {
    return `<div class="section-actions"><div><h2>Fechamentos de ${esc(block.name)}</h2><span class="muted">Cada registro preserva o retrato financeiro do mês encerrado.</span></div><button class="secondary" data-print>Imprimir</button></div><div class="history-list">${block.history.map(entry => { const t = historyTotals(entry); return `<article class="history-row"><div class="history-date"><strong>${entry.month.slice(5)}</strong><small>${entry.month.slice(0, 4)}</small></div><div><strong>${monthLabel(entry.month)}</strong><br><small class="muted">${entry.units.length} unidades · fechado ${entry.closedAt ? dateBr(entry.closedAt.slice(0, 10)) : '—'}</small></div><div class="history-data"><span><small>Água</small><strong>${money.format(t.water)}</strong></span><span><small>Descontos</small><strong>${money.format(t.discount)}</strong></span><span><small>Total final</small><strong>${money.format(t.total)}</strong></span></div><div class="history-actions"><button class="secondary" data-history="${entry.id}">Detalhes</button><button class="danger" data-delete-history="${entry.id}">Excluir</button></div></article>`; }).join('') || '<div class="card empty"><h3>Nenhum mês fechado</h3><p>Revise as leituras e use o fechamento mensal quando estiver tudo pronto.</p></div>'}</div>`;
  }
  function renderReports(block) {
    const totals = chargeTotals(block);
    const rows = block.units.map(unit => { const c = unitCharges(unit, block); return `<tr><td><strong>${esc(unit.number)}</strong></td><td>${esc(unit.resident || '—')}</td><td>${fmtM3(unit.m3)} m³</td><td>${money.format(c.water)}</td><td>${money.format(c.grossCondo)}</td><td class="adjustment">${c.condoDiscount ? `− ${money.format(c.condoDiscount)}` : '—'}</td><td>${money.format(c.service)}</td><td>${money.format(c.fine)}</td><td class="value">${money.format(c.total)}</td></tr>`; }).join('');
    return `<section class="monthly-report" id="monthlyReportPrint"><div class="section-actions no-print"><div><h2>Relatório mensal</h2><span class="muted">Resumo para conferência do síndico antes da distribuição dos boletos.</span></div><div class="button-row"><button class="secondary" data-export-report-csv type="button">Exportar CSV</button><button class="secondary" data-print-report type="button">Imprimir A4 retrato</button></div></div><header class="report-print-header"><div><p class="eyebrow">KR²MELO · GESTÃO DE ÁGUA</p><h2>Relatório mensal</h2><p>${esc(block.name)} · Referência: <strong>${monthLabel(block.month)}</strong></p></div><div class="report-print-meta"><span>Unidades: <b>${block.units.length}</b></span><span>Emitido em: <b>${dateBr(today())}</b></span></div></header><div class="report-coverage">${waterCoverageCard(block)}</div><section class="finance-summary report-finance-summary"><div><small>Água</small><strong>${money.format(totals.water)}</strong></div><div><small>Condomínio bruto</small><strong>${money.format(totals.grossCondo)}</strong></div><div><small>Isenções / descontos</small><strong>${money.format(totals.discount)}</strong></div><div><small>Condomínio líquido</small><strong>${money.format(totals.condo)}</strong></div><div><small>Serviço + outros</small><strong>${money.format(totals.service + totals.fine)}</strong></div><div><small>Total mensal</small><strong>${money.format(totals.total)}</strong></div></section><div class="table-wrap report-table-wrap"><table class="monthly-report-table"><thead><tr><th>Apto</th><th>Responsável</th><th>Consumo</th><th>Água</th><th>Condomínio</th><th>Desconto</th><th>Serviço</th><th>Outros</th><th>Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3">TOTAL</td><td>${money.format(totals.water)}</td><td>${money.format(totals.grossCondo)}</td><td>− ${money.format(totals.discount)}</td><td>${money.format(totals.service)}</td><td>${money.format(totals.fine)}</td><td>${money.format(totals.total)}</td></tr></tfoot></table></div><footer class="report-print-footer">KR²MELO · Relatório para conferência do síndico</footer></section>`;
  }
  function renderFinance(block) {
    const totals = chargeTotals(block);
    const pending = Math.max(0, totals.total - totals.paid);
    return `<div class="section-actions"><div><h2>Controle de pagamentos</h2><span class="muted">O status é do mês atual e será arquivado no fechamento.</span></div><button class="secondary" data-print>Imprimir</button></div><section class="finance-summary"><div><small>Cobrança total</small><strong>${money.format(totals.total)}</strong></div><div><small>Recebido</small><strong>${money.format(totals.paid)}</strong></div><div><small>Em aberto</small><strong>${money.format(pending)}</strong></div><div><small>Pagamentos</small><strong>${totals.paidCount}/${block.units.length}</strong></div><div><small>Descontos</small><strong>${money.format(totals.discount)}</strong></div><div><small>Água</small><strong>${money.format(totals.water)}</strong></div></section><div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Pago</th><th>Data</th><th>Apto</th><th>Responsável</th><th>Água</th><th>Condomínio</th><th>Desconto</th><th>Outros</th><th>Total</th><th>Recibo</th></tr></thead><tbody>${block.units.map(unit => { const c = unitCharges(unit, block); return `<tr data-payment-row="${unit.id}"><td><input data-payment-field="paid" type="checkbox" ${unit.paid ? 'checked' : ''} aria-label="Pago"></td><td><input data-payment-field="paymentDate" type="date" value="${esc(unit.paymentDate)}"></td><td><strong>${esc(unit.number)}</strong></td><td>${esc(unit.resident || '—')}</td><td>${money.format(c.water)}</td><td>${money.format(c.condo)}</td><td class="adjustment">${c.condoDiscount ? `− ${money.format(c.condoDiscount)}` : '—'}</td><td>${money.format(c.service + c.fine)}</td><td class="value">${money.format(c.total)}</td><td><button class="secondary" data-payment-receipt="${unit.id}" type="button">Imprimir</button></td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function receiptDraft(block) {
    return { payer: block.name, service: `Serviço de leitura de hidrômetros — ${monthLabel(block.month)}`, amount: n(block.billing?.serviceFee), amountWords: '', issueDate: today(), city: '', issuer: block.manager || 'KR²MELO', phone: '', notes: '' , ...(block.serviceReceiptDraft || {}) };
  }
  function receiptHtml(data) {
    return `<article class="receipt-preview"><h2>RECIBO</h2><p>Recebi de <strong>${esc(data.payer || '—')}</strong> a quantia de <strong>${money.format(n(data.amount))}</strong>${data.amountWords ? ` (${esc(data.amountWords)})` : ''}, referente a <strong>${esc(data.service || '—')}</strong>.</p>${data.notes ? `<p>${esc(data.notes)}</p>` : ''}<p>${esc(data.city || '________________')}, ${dateBr(data.issueDate)}</p><footer><img class="receipt-signature" src="assets/assinatura.png" alt="Assinatura"><div></div><b>${esc(data.issuer || 'KR²MELO')}</b><br><small>${esc(data.phone || '')}</small></footer></article>`;
  }
  function renderReceipts(block) {
    const draft = receiptDraft(block);
    return `<section class="receipt-layout"><form class="card form-grid" id="receiptForm"><div class="card-head field full"><h3>Recibo de serviço</h3></div><div class="field full"><label>Recebi de</label><input name="payer" value="${esc(draft.payer)}"></div><div class="field"><label>Valor (R$)</label><input name="amount" type="number" min="0" step="0.01" value="${draft.amount || ''}"></div><div class="field"><label>Valor por extenso</label><input name="amountWords" value="${esc(draft.amountWords)}"></div><div class="field full"><label>Referente a</label><input name="service" value="${esc(draft.service)}"></div><div class="field"><label>Data</label><input name="issueDate" type="date" value="${esc(draft.issueDate)}"></div><div class="field"><label>Cidade</label><input name="city" value="${esc(draft.city)}"></div><div class="field"><label>Nome para assinatura</label><input name="issuer" value="${esc(draft.issuer)}"></div><div class="field"><label>Telefone</label><input name="phone" value="${esc(draft.phone)}"></div><div class="field full"><label>Observação</label><textarea name="notes" rows="3">${esc(draft.notes)}</textarea></div><div class="form-foot"><button class="secondary" data-clear-receipt type="button">Limpar</button><button class="primary" type="submit">Salvar recibo</button></div></form><section class="card"><div class="card-head"><h3>Pré-visualização</h3><button class="secondary" data-print-service-receipt type="button">Imprimir meia A4 retrato</button></div><div id="receiptPreview">${receiptHtml(draft)}</div></section></section><section class="card"><div class="card-head"><h3>Recibos emitidos</h3></div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Recebi de</th><th>Referente</th><th>Valor</th><th></th></tr></thead><tbody>${(block.serviceReceipts || []).slice(0, 20).map(item => `<tr><td>${dateBr(item.issueDate)}</td><td>${esc(item.payer)}</td><td>${esc(item.service)}</td><td>${money.format(n(item.amount))}</td><td><button class="danger" data-delete-service-receipt="${item.id}" type="button">Excluir</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhum recibo salvo.</td></tr>'}</tbody></table></div></section>`;
  }
  function chunk(items, size) { const result = []; for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size)); return result; }
  function blockLetter(index) { let n = index + 1, out = ''; while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); } return out; }
  function groupShareWaterBill(block, units) {
    const totalM3 = block.units.reduce((sum, unit) => sum + n(unit.m3), 0);
    const groupM3 = units.reduce((sum, unit) => sum + n(unit.m3), 0);
    return totalM3 ? n(block.billing.waterBill) * groupM3 / totalM3 : 0;
  }
  function coverSheet(block, units, index) {
    const groupName = `Bloco ${blockLetter(index)}`;
    return `<section class="cover-sheet cover-sheet-v531"><div class="cut-line-horizontal"></div><article class="cover-half cover-front"><header><img src="assets/logo.png" alt="KR²MELO"><div><p class="eyebrow">CAPA DOS BOLETOS</p><h1>${esc(groupName)}</h1></div></header><div class="cover-simple-kv"><span><b>Condomínio</b>${esc(block.name)}</span><span><b>Vencimento</b>${dateBr(block.billing.dueDate)}</span><span><b>Próxima leitura</b>${dateBr(block.billing.nextReadDate)}</span></div></article><article class="cover-half cover-back cover-back-inverted"><header><img src="assets/logo.png" alt="KR²MELO"><div><p class="eyebrow">CONTRACAPA</p><h1>KR²MELO</h1><p>${esc(block.name)} · ${monthLabel(block.month)}</p></div></header><div class="provider-services"><span>Leitura mensal dos hidrômetros</span><span>Cálculo individual de consumo</span><span>Rateio de água</span><span>Boletos e recibos</span></div><footer>Prestador responsável pelo serviço de leitura</footer></article></section>`;
  }
  function summarySheet(block, units, index) {
    const t = units.reduce((sum, unit) => { const c = unitCharges(unit, block); sum.m3 += n(unit.m3); sum.water += c.water; sum.discount += c.condoDiscount; sum.total += c.total; return sum; }, { m3: 0, water: 0, discount: 0, total: 0 });
    return `<section class="block-summary-page"><p class="eyebrow">FICHA TÉCNICA DO BLOCO</p><h1>Bloco ${blockLetter(index)} · ${monthLabel(block.month)}</h1><p class="muted">Resumo para conferência do síndico antes da distribuição dos boletos.</p><div class="summary-grid"><div><small>Apartamentos</small><strong>${units.length}</strong></div><div><small>Leituras feitas</small><strong>${units.filter(unit => unit.current !== '').length}/${units.length}</strong></div><div><small>Consumo</small><strong>${fmtM3(t.m3)} m³</strong></div><div><small>Conta água</small><strong>${money.format(groupShareWaterBill(block, units))}</strong></div><div><small>Rateio água</small><strong>${money.format(t.water)}</strong></div><div><small>Descontos</small><strong>${money.format(t.discount)}</strong></div><div><small>Total boletos</small><strong>${money.format(t.total)}</strong></div><div><small>Vencimento</small><strong>${dateBr(block.billing.dueDate)}</strong></div></div><div class="resident-note"><strong>Explicação:</strong> descontos e isenções reduzem apenas o condomínio. A água é calculada separadamente conforme consumo.</div></section>`;
  }
  function billCopy(unit, block, copy) {
    const c = unitCharges(unit, block); const billing = block.billing; const managerCopy = copy === 'SÍNDICO';
    const ruleText = adjustmentText(c);
    const discountLine = c.condoDiscount ? `<div class="bill-charge-line bill-adjustment"><span>${esc(ruleText || 'Desconto de condomínio')}</span><b>− ${money.format(c.condoDiscount)}</b></div>` : '';
    const serviceLine = c.service ? `<div class="bill-charge-line"><span>${esc(billing.serviceLabel)}</span><b>${money.format(c.service)}</b></div>` : '';
    const extraLine = c.extraCharge ? `<div class="bill-charge-line"><span>${esc(unit.extraChargeLabel || 'VALOR ADICIONAL')}</span><b>${money.format(c.extraCharge)}</b></div>` : '';
    const notes = String(billing.notes || '').split(/\r?\n/).filter(Boolean).slice(0, 2);
    const footer = managerCopy ? `<footer class="bill-signature"><div></div><small>RECEBIDO POR / ASSINATURA DO MORADOR</small></footer>` : `<section class="bill-notes"><strong>OBS.</strong><div>${notes.map(note => `<p>${esc(note)}</p>`).join('') || '<p>Sem observações adicionais.</p>'}</div></section>`;
    return `<article class="bill-copy ${managerCopy ? 'bill-copy-manager' : 'bill-copy-resident'}"><div class="bill-copy-tag">VIA DO ${copy}</div><header class="bill-head"><strong>${esc(unit.number)}</strong><b>Vencimento · ${dateBr(billing.dueDate)}</b></header><div class="bill-party"><span>RESPONSÁVEL</span><strong>${esc(unit.resident || '—')}</strong><small>REFERÊNCIA · ${monthLabel(block.month).toUpperCase().replace(' DE ', ' / ')}</small></div><section class="bill-reading-grid"><div><span>LEITURA ANTERIOR</span><small>${dateBr(billing.previousReadDate)}</small><b>${fmtInt(unit.previous)}</b></div><div><span>LEITURA ATUAL</span><small>${dateBr(billing.currentReadDate)}</small><b>${unit.current === '' ? '—' : fmtInt(unit.current)}</b></div><div><span>CONSUMO</span><small>METROS CÚBICOS</small><b>${fmtM3(unit.m3)} m³</b></div></section><section class="bill-charge-list"><div class="bill-charge-line"><span>ÁGUA</span><b>${money.format(c.water)}</b></div>${discountLine}<div class="bill-charge-line bill-condo-net"><span>CONDOMÍNIO A PAGAR</span><b>${money.format(c.condo)}</b></div>${serviceLine}${extraLine}<div class="bill-charge-line"><span>${esc(unit.billingFineLabel || 'MULTAS / OUTROS')}</span><b>${money.format(c.fine)}</b></div></section><div class="bill-total"><strong>TOTAL</strong><span>VALOR A PAGAR</span><b>${money.format(c.total)}</b></div>${footer}</article>`;
  }
  function billPages(block, units, index) {
    const pages = [];
    for (let i = 0; i < units.length; i += 2) {
      const pair = units.slice(i, i + 2);
      const copies = pair.flatMap(unit => [billCopy(unit, block, 'SÍNDICO'), billCopy(unit, block, 'MORADOR')]);
      pages.push(`<section class="bill-page bill-page-with-cuts"><div class="bill-page-group-label">Bloco ${blockLetter(index)}</div><div class="bill-cut-guide bill-cut-guide-v" aria-hidden="true">✂ CORTE</div><div class="bill-cut-guide bill-cut-guide-h" aria-hidden="true">✂ CORTE</div>${copies.join('')}</section>`);
    }
    return pages.join('');
  }
  function renderBills(block) {
    const groups = chunk(block.units, 16);
    const content = groups.map((units, index) => `<div class="bill-group-title no-print">Bloco ${blockLetter(index)} · ${units.length} apartamento(s)</div>${coverSheet(block, units, index)}${billPages(block, units, index)}`).join('');
    const b = block.billing;
    return `<section class="billing-controls no-print"><div class="section-actions"><div><h2>Boletos mensais</h2><span class="muted">Cada boleto mostra água, condomínio, desconto/isenção, serviço e outros separadamente.</span></div><div class="button-row"><button class="secondary" data-go="leituras">Lançamentos nas leituras</button><button class="primary" data-print-bills>Imprimir conjunto</button></div></div><form class="card form-grid" id="billingForm"><div class="field"><label>Vencimento</label><input name="dueDate" type="date" value="${esc(b.dueDate)}" required></div><div class="field"><label>Conta global de água (R$)</label><input name="waterBill" type="number" min="0" step="0.01" value="${b.waterBill || ''}"></div><div class="field"><label>Data da leitura anterior</label><input name="previousReadDate" type="date" value="${esc(b.previousReadDate)}"></div><div class="field"><label>Data da leitura atual</label><input name="currentReadDate" type="date" value="${esc(b.currentReadDate)}"></div><div class="field"><label>Próxima leitura</label><input name="nextReadDate" type="date" value="${esc(b.nextReadDate)}"></div><div class="field"><label>Condomínio bruto (R$)</label><input name="condoFee" type="number" min="0" step="0.01" value="${b.condoFee}"></div><div class="field"><label>Serviço de leitura (R$)</label><input name="serviceFee" type="number" min="0" step="0.01" value="${b.serviceFee}"></div><div class="field"><label>Descrição do serviço</label><input name="serviceLabel" value="${esc(b.serviceLabel)}"></div><div class="field full"><label><input name="chargeService" type="checkbox" ${b.chargeService !== false ? 'checked' : ''}> Cobrar serviço de leitura neste mês</label></div><div class="field full"><label>Observações — uma por linha</label><textarea name="notes" rows="4">${esc(b.notes)}</textarea></div><div class="form-foot"><button class="primary" type="submit">Salvar e atualizar boletos</button></div></form></section><div class="billing-preview">${content || '<div class="card empty">Cadastre apartamentos antes de gerar boletos.</div>'}</div>`;
  }
  function renderSettings(block) {
    return `<section class="settings"><article class="card"><div class="card-head"><h3>Dados do condomínio</h3></div><form class="form-grid" id="blockForm"><div class="field"><label>Nome</label><input name="name" value="${esc(block.name)}" required></div><div class="field"><label>Referência atual</label><input name="month" type="month" value="${esc(block.month)}" required></div><div class="field full"><label>Endereço</label><input name="address" value="${esc(block.address)}"></div><div class="field full"><label>Responsável / síndico</label><input name="manager" value="${esc(block.manager)}"></div><div class="form-foot"><button class="primary" type="submit">Salvar alterações</button></div></form></article><article class="card"><div class="card-head"><h3>Tarifa da água</h3></div><form class="form-grid" id="tariffForm"><div class="field full"><label>Mínimo até 10 m³ (R$)</label><input name="minimum" type="number" min="0" step="0.01" value="${block.tariff.minimum}"></div><div class="field"><label>De 11 a 20 m³ (R$/m³)</label><input name="tier1" type="number" min="0" step="0.01" value="${block.tariff.tier1}"></div><div class="field"><label>Acima de 20 m³ (R$/m³)</label><input name="tier2" type="number" min="0" step="0.01" value="${block.tariff.tier2}"></div><div class="form-foot"><button class="primary" type="submit">Salvar e recalcular</button></div></form></article><article class="card"><h3>Backup e restauração</h3><p class="muted">O backup JSON protege leituras, regras, boletos, histórico e recibos. Fotos novas capturadas no celular ficam no armazenamento local do aparelho.</p><div class="button-row"><button class="secondary" data-export>Baixar backup</button><button class="secondary" data-import>Restaurar backup</button></div></article><article class="card"><h3>Zona de atenção</h3><p class="muted">A exclusão remove o condomínio, as leituras e o histórico armazenado neste navegador.</p><button class="danger" data-delete-block>Excluir condomínio</button></article></section>`;
  }
  function renderHelp() {
    return `<section class="hero"><div><p class="eyebrow">KR²MELO ${VERSION_LABEL}</p><h2>Manual de uso</h2><p>Guia para operador, síndico, tesoureiro e moradores.</p></div><button class="secondary" data-print>Imprimir manual</button></section><section class="help-grid" style="margin-top:16px"><article class="card help-card"><h3>1. Ciclo mensal</h3><ol><li>Cadastre o condomínio e os apartamentos.</li><li>Informe as leituras atuais.</li><li>Confira a conta global de água.</li><li>Defina regras e descontos por apartamento.</li><li>Gere boletos, relatórios e recibos.</li><li>Feche o mês para arquivar o retrato completo.</li></ol></article><article class="card help-card"><h3>2. Água</h3><p>O consumo é calculado por <strong>Leitura Atual − Leitura Anterior</strong>.</p><div class="simple-calc"><strong>Exemplo:</strong><br>Anterior: 1500<br>Atual: 1518<br>Consumo: 18 m³</div><p>A conferência da conta global soma apenas o campo Água de cada apartamento.</p></article><article class="card help-card"><h3>3. Isenção e desconto</h3><p>Síndicos, tesoureiros e indicados podem ficar isentos do condomínio. Também é possível aplicar desconto fixo ou percentual, sempre com motivo e vigência.</p><div class="resident-note">A água não é isenta automaticamente. O abatimento recai somente sobre o valor do condomínio.</div></article><article class="card help-card"><h3>4. Transparência no boleto</h3><p>Quando houver benefício, o boleto mostra o condomínio bruto, a linha de isenção ou desconto, o condomínio líquido e o motivo. Isso evita confusão na conferência.</p></article><article class="card help-card"><h3>5. Fechamento e histórico</h3><p>O fechamento arquiva as leituras, as regras usadas, valores de cobrança e pagamentos do mês. Alterações futuras não modificam o registro histórico.</p></article><article class="card help-card"><h3>6. Modo leiturista</h3><p>O celular permite lançar leitura, foto e GPS. Para sincronizar sem nuvem, use o mesmo navegador/perfil do painel ou exporte/importa backups entre aparelhos.</p></article></section>`;
  }

  function render() {
    refreshPicker();
    const route = currentRoute();
    const meta = routes[route];
    $('#pageEyebrow').textContent = meta[0]; $('#pageTitle').textContent = meta[1];
    $$('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === route));
    const app = $('#app'); const block = selected();
    if (!block && route !== 'ajuda') { app.innerHTML = emptyState(); app.focus({ preventScroll: true }); return; }
    const pages = {
      dashboard: () => renderDashboard(block), leituras: () => renderReadings(block), regras: () => renderRules(block),
      fechamento: () => renderClosing(block), historico: () => renderHistory(block), relatorios: () => renderReports(block),
      financeiro: () => renderFinance(block), recibos: () => renderReceipts(block), boletos: () => renderBills(block),
      configuracoes: () => renderSettings(block), ajuda: () => renderHelp()
    };
    app.innerHTML = pages[route]();
    app.focus({ preventScroll: true });
  }

  function openModal(body, submitLabel = 'Salvar', callback = null) {
    const dialog = $('#modal'), form = $('#modalForm'), content = $('#modalContent');
    content.innerHTML = `<div class="modal-inner">${body}<div class="modal-actions"><button type="submit" value="cancel" class="secondary">Cancelar</button><button type="submit" value="default" class="primary">${esc(submitLabel)}</button></div></div>`;
    form.onsubmit = event => {
      const action = event.submitter?.value || 'default';
      if (action === 'cancel' || !callback) return;
      event.preventDefault();
      if (!form.reportValidity()) return;
      callback(Object.fromEntries(new FormData(form)));
      dialog.close();
    };
    dialog.showModal();
  }
  function openNewBlock() {
    openModal(`<h2>Novo condomínio</h2><p>Crie o bloco vazio ou importe a planilha inicial já preenchida.</p><div class="form-grid"><div class="field"><label>Nome</label><input name="name" required autofocus placeholder="Ex.: Residencial Aurora"></div><div class="field"><label>Quantidade de unidades</label><input name="count" type="number" min="1" max="500" value="12"></div><div class="field full"><label>Endereço</label><input name="address"></div><div class="field full"><label>Responsável / síndico</label><input name="manager"></div><div class="field full"><label>Planilha inicial opcional</label><input name="initialSheet" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"><small class="muted">Colunas obrigatórias: Apt, Leitura Anterior, Leitura Atual e Responsável. A leitura atual pode ficar vazia.</small></div><div class="field full"><div class="info-box"><strong>Modelo de cadastro inicial:</strong> baixe, preencha e selecione o arquivo acima antes de criar o bloco. A quantidade de linhas segue o campo “Quantidade de unidades”.</div><div class="button-row" style="margin-top:10px"><button class="secondary" type="button" data-download-initial-template-csv>⇩ Modelo para Excel (.csv)</button><a class="secondary" href="modelo-cadastro-inicial-bloco.xlsx" download style="text-decoration:none;display:inline-flex;align-items:center">⇩ Modelo .xlsx (32 aptos)</a></div></div></div>`, 'Criar condomínio', newBlock);
  }
  function showHistory(id) {
    const block = selected(); const entry = block?.history.find(item => item.id === id); if (!entry) return;
    const rows = entry.charges?.length ? entry.charges : entry.units.map(unit => { const c = unitCharges(unit, { month: entry.month, tariff: entry.tariff, billing: entry.billing }); return { unitId: unit.id, number: unit.number, resident: unit.resident, m3: unit.m3, ...c, rule: unit.condoRule, fineLabel: unit.billingFineLabel, paid: unit.paid, paymentDate: unit.paymentDate }; });
    const totals = rows.reduce((a, c) => { a.water += n(c.water); a.discount += n(c.condoDiscount); a.total += n(c.total); return a; }, { water: 0, discount: 0, total: 0 });
    openModal(`<h2>${monthLabel(entry.month)}</h2><p>Fechado em ${entry.closedAt ? dateBr(entry.closedAt.slice(0, 10)) : 'data não registrada'} · Versão ${entry.version}</p><div class="table-wrap"><table><thead><tr><th>Apto</th><th>Responsável</th><th>Água</th><th>Condomínio</th><th>Desconto</th><th>Total</th><th>Pago</th></tr></thead><tbody>${rows.map(c => `<tr><td>${esc(c.number)}</td><td>${esc(c.resident || '—')}</td><td>${money.format(n(c.water))}</td><td>${money.format(n(c.condo))}</td><td class="adjustment">${c.condoDiscount ? `− ${money.format(n(c.condoDiscount))}` : '—'}</td><td><strong>${money.format(n(c.total))}</strong></td><td>${c.paid ? `Sim${c.paymentDate ? ` · ${dateBr(c.paymentDate)}` : ''}` : 'Não'}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2">TOTAL</td><td>${money.format(totals.water)}</td><td></td><td>− ${money.format(totals.discount)}</td><td>${money.format(totals.total)}</td><td></td></tr></tfoot></table></div>`, 'Fechar');
  }
  function executeMonthlyClose(block) {
    if (!block?.units.length) return toast('Adicione ao menos uma unidade antes de fechar.', true);
    const checks = closeChecks(block); const danger = checks.filter(check => check.type === 'danger').length; const warn = checks.filter(check => check.type === 'warn').length;
    if (!confirm(`Fechar ${monthLabel(block.month)}?\n\nPendências: ${warn}\nCríticas: ${danger}\n\nO sistema guardará um retrato financeiro completo e preparará o próximo mês.`)) return;
    const totals = chargeTotals(block); const closingMonth = block.month;
    const charges = block.units.map(unit => { const c = unitCharges(unit, block); return { unitId: unit.id, number: unit.number, resident: unit.resident, m3: unit.m3, water: c.water, grossCondo: c.grossCondo, condoDiscount: c.condoDiscount, condo: c.condo, service: c.service, extraCharge: c.extraCharge, extraChargeLabel: unit.extraChargeLabel, fine: c.fine, total: c.total, rule: deepClone(c.rule), fineLabel: unit.billingFineLabel, paid: unit.paid, paymentDate: unit.paymentDate }; });
    const snapshot = { id: uid(), month: closingMonth, version: (block.history.filter(item => item.month === closingMonth).length + 1), closedAt: new Date().toISOString(), checks: deepClone(checks), units: deepClone(block.units), tariff: deepClone(block.tariff), billing: deepClone(block.billing), charges, totalM3: totals.m3, totalValue: totals.water, waterTotal: totals.water, grandTotal: totals.total, totalDiscount: totals.discount };
    block.history.unshift(snapshot);
    const nextMonth = shiftMonth(closingMonth, 1);
    const oldBilling = deepClone(block.billing);
    block.units.forEach(unit => {
      if (unit.current !== '') unit.previous = n(unit.current);
      unit.current = ''; unit.m3 = 0; unit.value = waterCost(0, block.tariff); unit.note = ''; unit.mobileDone = false; unit.mobileSavedAt = ''; unit.gps = null; unit.photoKey = ''; unit.photo = ''; unit.paid = false; unit.paymentDate = ''; unit.extraCharge = 0; unit.billingFine = 0;
    });
    block.month = nextMonth;
    block.billing = normalizeBilling({ ...oldBilling, dueDate: dateForMonth(nextMonth, dayOf(oldBilling.dueDate)), previousReadDate: oldBilling.currentReadDate || oldBilling.previousReadDate || '', currentReadDate: oldBilling.nextReadDate || addMonthToDate(oldBilling.currentReadDate) || dateForMonth(nextMonth, 1), nextReadDate: oldBilling.nextReadDate ? addMonthToDate(oldBilling.nextReadDate) : '' }, nextMonth);
    save(`Fechamento concluído. ${monthLabel(nextMonth)} está pronto.`);
    openModal(`<h2>Fechamento concluído</h2><p>${monthLabel(closingMonth)} foi arquivado com leituras, descontos e valores finais.</p><div class="close-result"><span>Água<b>${money.format(totals.water)}</b></span><span>Descontos<b>${money.format(totals.discount)}</b></span><span>Total final<b>${money.format(totals.total)}</b></span><span>Próximo mês<b>${monthLabel(nextMonth)}</b></span></div><div class="info-box">Revise as novas datas de vencimento e leitura na tela Boletos antes de imprimir.</div>`, 'Abrir leituras', () => setRoute('leituras'));
  }

  function saveBilling(form) {
    const block = selected(); if (!block) return;
    const data = Object.fromEntries(new FormData(form));
    block.billing = normalizeBilling({ ...block.billing, ...data, chargeService: data.chargeService === 'on', waterBill: n(data.waterBill), serviceFee: n(data.serviceFee), condoFee: n(data.condoFee) }, block.month);
    save('Configuração de boletos atualizada'); render();
  }
  function exportData() {
    const payload = { exportedAt: new Date().toISOString(), appVersion: APP_VERSION, state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `backup-kr2melo-v5-${today()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); toast('Backup baixado');
  }
  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result); const incoming = parsed.state || parsed;
        if (!Array.isArray(incoming.blocks)) throw new Error('Formato inválido');
        if (!confirm('Restaurar este backup substituirá os dados atuais deste navegador. Continuar?')) return;
        state = normalizeState(incoming); save('Backup restaurado'); render();
      } catch { toast('Arquivo de backup inválido.', true); }
    };
    reader.readAsText(file);
  }
  function exportReportCsv() {
    const block = selected(); if (!block) return;
    const rows = [['Apto', 'Responsável', 'Consumo m³', 'Água', 'Condomínio bruto', 'Desconto condomínio', 'Condomínio líquido', 'Serviço', 'Multas/Outros', 'Total', 'Pago', 'Data pagamento', 'Regra', 'Motivo']];
    block.units.forEach(unit => { const c = unitCharges(unit, block); rows.push([unit.number, unit.resident, unit.m3, c.water.toFixed(2), c.grossCondo.toFixed(2), c.condoDiscount.toFixed(2), c.condo.toFixed(2), c.service.toFixed(2), c.fine.toFixed(2), c.total.toFixed(2), unit.paid ? 'Sim' : 'Não', unit.paymentDate, ruleLabels[c.rule.mode], c.rule.reason]); });
    const blob = new Blob(['\ufeff' + rows.map(row => row.map(csvValue).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `relatorio-${normalizedHeader(block.name)}-${block.month}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); toast('Relatório CSV exportado');
  }
  function printHtml(title, html) {
    const win = window.open('', '_blank');
    if (!win) return toast('Permita pop-ups para imprimir.', true);
    const css = new URL('styles.css', location.href).href;
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><link rel="stylesheet" href="${css}"><style>body{padding:18px;background:#f7f7f5}.print-toolbar{position:sticky;top:0;background:#111;color:#fff;padding:12px;display:flex;gap:12px;align-items:center;justify-content:center;margin:-18px -18px 18px;z-index:2}.print-toolbar button{background:#ff1100;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-weight:800;cursor:pointer}@media print{body{padding:0;background:#fff}.print-toolbar{display:none!important}}</style></head><body><div class="print-toolbar"><span>Revise a pré-visualização antes de imprimir.</span><button onclick="window.print()">Imprimir agora</button></div>${html}</body></html>`);
    win.document.close();
  }
  function printMonthlyReport() {
    const report = $('#monthlyReportPrint');
    if (!report) return toast('Relatório não disponível para impressão.', true);
    const win = window.open('', '_blank');
    if (!win) return toast('Permita pop-ups para imprimir o relatório.', true);
    const css = new URL('styles.css', location.href).href;
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório mensal KR²MELO</title><link rel="stylesheet" href="${css}"><style>@page{size:A4 portrait;margin:8mm}body{margin:0;padding:0;background:#fff}.print-toolbar{position:sticky;top:0;z-index:5;background:#111;color:#fff;padding:10px;display:flex;align-items:center;justify-content:center;gap:12px;font-family:Arial,sans-serif}.print-toolbar button{background:#ff1100;color:#fff;border:0;border-radius:7px;padding:9px 15px;font-weight:800;cursor:pointer}@media print{.print-toolbar{display:none!important}body{padding:0!important}.monthly-report{width:194mm!important;min-height:281mm!important;margin:0!important}}</style></head><body><div class="print-toolbar"><span>Relatório configurado para uma página A4 em retrato.</span><button onclick="window.print()">Imprimir agora</button></div>${report.outerHTML}</body></html>`);
    win.document.close();
  }
  function printPaymentReceipt(id) {
    const block = selected(); const unit = findUnit(block, id); if (!unit) return;
    const c = unitCharges(unit, block);
    printHtml(`Recibo Apto ${unit.number}`, `<article class="receipt-preview"><h2>RECIBO DE PAGAMENTO</h2><p>Recebemos de <strong>${esc(unit.resident || '—')}</strong>, referente ao apartamento <strong>${esc(unit.number)}</strong>, o valor de <strong>${money.format(c.total)}</strong> referente a água, condomínio e demais lançamentos de ${monthLabel(block.month)}.</p><p>Pagamento registrado em: <strong>${dateBr(unit.paymentDate || today())}</strong>.</p><footer><div></div><b>${esc(block.manager || 'Síndico responsável')}</b></footer></article>`);
  }

  // Exportadores de planilha. O CSV é o formato padrão por ser o mais confiável no Excel brasileiro.
  // O XLSX continua disponível para quem precisar do formato Office Open XML.
  function u16(num) { return Uint8Array.of(num & 255, (num >>> 8) & 255); }
  function u32(num) { return Uint8Array.of(num & 255, (num >>> 8) & 255, (num >>> 16) & 255, (num >>> 24) & 255); }
  function bytesJoin(parts) { const size = parts.reduce((sum, part) => sum + part.length, 0); const out = new Uint8Array(size); let offset = 0; parts.forEach(part => { out.set(part, offset); offset += part.length; }); return out; }
  function crc32(bytes) { let crc = -1; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ -1) >>> 0; }
  function zipDosDateTime(source = new Date()) {
    const year = Math.min(2107, Math.max(1980, source.getFullYear()));
    const time = (source.getSeconds() >> 1) | (source.getMinutes() << 5) | (source.getHours() << 11);
    const date = source.getDate() | ((source.getMonth() + 1) << 5) | ((year - 1980) << 9);
    return { time, date };
  }
  function zipStore(files) {
    const enc = new TextEncoder(), locals = [], central = []; let offset = 0;
    const stamp = zipDosDateTime();
    for (const [name, content] of Object.entries(files)) {
      const nameBytes = enc.encode(name), data = enc.encode(content), crc = crc32(data), flags = 0;
      const local = bytesJoin([u32(0x04034b50), u16(20), u16(flags), u16(0), u16(stamp.time), u16(stamp.date), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, data]);
      locals.push(local);
      central.push(bytesJoin([u32(0x02014b50), u16(0x0314), u16(20), u16(flags), u16(0), u16(stamp.time), u16(stamp.date), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes]));
      offset += local.length;
    }
    const center = bytesJoin(central);
    return bytesJoin([...locals, center, u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(center.length), u32(offset), u16(0)]);
  }
  function xmlText(value) {
    return String(value ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
  }
  function xlsxColumnName(index) {
    let out = '', number = index + 1;
    while (number > 0) { const rest = (number - 1) % 26; out = String.fromCharCode(65 + rest) + out; number = Math.floor((number - 1) / 26); }
    return out;
  }
  function safeSheetName(name) { const safe = String(name || 'Leituras').replace(/[\\/:*?\[\]]/g, ' ').trim().slice(0, 31); return safe || 'Leituras'; }
  function downloadBlob(blob, fileName) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = fileName; link.style.display = 'none'; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 30000);
  }
  function csvValue(value) { const text = String(value ?? ''); return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
  function makeCsv(rows, fileName) {
    const body = '\ufeff' + rows.map(row => (Array.isArray(row) ? row : []).map(csvValue).join(';')).join('\r\n');
    downloadBlob(new Blob([body], { type: 'text/csv;charset=utf-8' }), fileName);
  }
  function parseCsvRows(text) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    const first = source.split(/\r?\n/).find(line => line.trim()) || '';
    const delimiter = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
    const rows = [], row = []; let field = '', quoted = false;
    for (let i = 0; i < source.length; i++) {
      const char = source[i], next = source[i + 1];
      if (quoted) { if (char === '"' && next === '"') { field += '"'; i++; } else if (char === '"') quoted = false; else field += char; continue; }
      if (char === '"') { quoted = true; continue; }
      if (char === delimiter) { row.push(field); field = ''; continue; }
      if (char === '\r') continue;
      if (char === '\n') { row.push(field); rows.push(row.splice(0)); field = ''; continue; }
      field += char;
    }
    row.push(field); if (row.length > 1 || row[0] !== '' || !rows.length) rows.push(row);
    return rows.filter(item => item.some(value => String(value).trim() !== ''));
  }
  function makeXlsx(rows, fileName, sheetName = 'Leituras') {
    const dataRows = Array.isArray(rows) && rows.length ? rows : [['Apt', 'Leitura Atual']];
    const columns = Math.max(1, ...dataRows.map(row => Array.isArray(row) ? row.length : 0));
    const lastRef = `${xlsxColumnName(columns - 1)}${dataRows.length}`;
    const rowXml = dataRows.map((row, r) => {
      const values = Array.isArray(row) ? row : [];
      const cells = Array.from({ length: columns }, (_, c) => {
        const value = values[c] ?? '', ref = `${xlsxColumnName(c)}${r + 1}`, style = r === 0 ? ' s="1"' : (typeof value === 'number' && Number.isFinite(value) ? ' s="2"' : '');
        if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
        const raw = String(value ?? ''), preserve = /^\s|\s$/.test(raw) ? ' xml:space="preserve"' : '';
        return `<c r="${ref}" t="inlineStr"${style}><is><t${preserve}>${xmlText(raw)}</t></is></c>`;
      }).join('');
      return `<row r="${r + 1}" spans="1:${columns}">${cells}</row>`;
    }).join('');
    const sheet = safeSheetName(sheetName), now = new Date().toISOString();
    const colsXml = Array.from({ length: columns }, (_, index) => `<col min="${index + 1}" max="${index + 1}" width="${index === 0 ? 18 : index === 1 ? 20 : 32}" customWidth="1"/>`).join('');
    const files = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>',
      'docProps/app.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>KR²MELO</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>Leituras</vt:lpstr></vt:vector></TitlesOfParts><Company>KR²MELO</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>5.1</AppVersion></Properties>',
      'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>KR²MELO</dc:creator><cp:lastModifiedBy>KR²MELO</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><fileVersion appName="xl"/><workbookPr defaultThemeVersion="164011"/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets><sheet name="${xmlText(sheet)}" sheetId="1" state="visible" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>`,
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.000"/></numFmts><fonts count="2"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFF1100"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>',
      'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><outlinePr summaryBelow="1"/></sheetPr><dimension ref="A1:${lastRef}"/><sheetViews><sheetView workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${colsXml}</cols><sheetData>${rowXml}</sheetData><autoFilter ref="A1:${lastRef}"/><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`
    };
    downloadBlob(new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
  }
  function initialBlockTemplateRows(count = 12) {
    const total = Math.min(500, Math.max(1, n(count) || 12));
    return [['Apt', 'Leitura Anterior', 'Leitura Atual', 'Responsável'], ...Array.from({ length: total }, (_, index) => [String(index + 1).padStart(2, '0'), '', '', ''])];
  }
  function exportInitialBlockCsv(count = 12) {
    makeCsv(initialBlockTemplateRows(count), `modelo-cadastro-inicial-${Math.min(500, Math.max(1, n(count) || 12))}-apartamentos.csv`);
    toast('Modelo CSV exportado. Ele abre diretamente no Microsoft Excel.');
  }
  function exportInitialBlockXlsx(count = 12) {
    makeXlsx(initialBlockTemplateRows(count), `modelo-cadastro-inicial-${Math.min(500, Math.max(1, n(count) || 12))}-apartamentos.xlsx`, 'Cadastro Inicial');
    toast('Modelo XLSX exportado. Caso o Excel bloqueie o arquivo baixado, use o modelo CSV.');
  }
  async function rowsFromSpreadsheetFile(file) {
    const isCsv = /\.csv$/i.test(file.name) || String(file.type || '').includes('csv');
    return isCsv ? parseCsvRows(await file.text()) : parseXlsxRows(await unzipXlsx(await file.arrayBuffer()));
  }
  function initialBlockUnitsFromRows(rows) {
    const required = ['apt', 'leituraanterior', 'leituraatual', 'responsavel'];
    const headerIndex = rows.findIndex(row => required.every(name => row.some(value => normalizedHeader(value) === name)));
    if (headerIndex < 0) throw new Error('Use as quatro colunas: Apt, Leitura Anterior, Leitura Atual e Responsável.');
    const headers = rows[headerIndex].map(normalizedHeader);
    const aptCol = headers.indexOf('apt'), previousCol = headers.indexOf('leituraanterior'), currentCol = headers.indexOf('leituraatual'), residentCol = headers.indexOf('responsavel');
    const units = [], seen = new Set();
    for (let line = headerIndex + 1; line < rows.length; line++) {
      const row = rows[line] || [], apt = String(row[aptCol] ?? '').trim();
      if (!apt) continue;
      const key = normalizedHeader(apt);
      if (!key) continue;
      if (seen.has(key)) throw new Error(`Apartamento duplicado na linha ${line + 1}: ${apt}.`);
      const rawPrevious = String(row[previousCol] ?? '').replace(',', '.').trim();
      const rawCurrent = String(row[currentCol] ?? '').replace(',', '.').trim();
      const previous = rawPrevious === '' ? 0 : Number(rawPrevious);
      const current = rawCurrent === '' ? '' : Number(rawCurrent);
      if (!Number.isFinite(previous) || (current !== '' && !Number.isFinite(current))) throw new Error(`Leitura inválida na linha ${line + 1}. Use apenas números nas colunas de leitura.`);
      const resident = String(row[residentCol] ?? '').trim();
      units.push(normalizeUnit({ id: uid(), number: apt, resident, previous, current, mobileDone: current !== '' }, units.length));
      seen.add(key);
      if (units.length > 500) throw new Error('O limite é de 500 unidades por condomínio.');
    }
    if (!units.length) throw new Error('A planilha não possui apartamentos preenchidos na coluna Apt.');
    return units;
  }
  function readingTemplateRows(block) { return [['Apt', 'Leitura Atual', 'Responsável'], ...block.units.map(unit => [unit.number, '', unit.resident || ''])]; }
  function exportReadingsCsv() {
    const block = selected(); if (!block) return;
    makeCsv(readingTemplateRows(block), `proxima-leitura-${normalizedHeader(block.name)}-${block.month}.csv`);
    toast('Planilha CSV exportada. Ela abre diretamente no Microsoft Excel.');
  }
  function exportReadingsXlsx() {
    const block = selected(); if (!block) return;
    makeXlsx(readingTemplateRows(block), `proxima-leitura-${normalizedHeader(block.name)}-${block.month}.xlsx`, 'Proxima leitura');
    toast('Modelo XLSX exportado. Caso o Excel bloqueie arquivos baixados, use a opção CSV, que também abre no Excel.');
  }
  async function unzipXlsx(buffer) {
    const bytes = new Uint8Array(buffer), view = new DataView(buffer); let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Arquivo XLSX inválido.');
    const count = view.getUint16(eocd + 10, true), offset = view.getUint32(eocd + 16, true), dec = new TextDecoder(), files = {}; let pos = offset;
    for (let i = 0; i < count; i++) {
      if (view.getUint32(pos, true) !== 0x02014b50) throw new Error('Estrutura XLSX inválida.');
      const method = view.getUint16(pos + 10, true), size = view.getUint32(pos + 20, true), nameLength = view.getUint16(pos + 28, true), extraLength = view.getUint16(pos + 30, true), commentLength = view.getUint16(pos + 32, true), localOffset = view.getUint32(pos + 42, true), name = dec.decode(bytes.slice(pos + 46, pos + 46 + nameLength));
      const localNameLength = view.getUint16(localOffset + 26, true), localExtraLength = view.getUint16(localOffset + 28, true), start = localOffset + 30 + localNameLength + localExtraLength; const compressed = bytes.slice(start, start + size); let data;
      if (method === 0) data = compressed; else if (method === 8 && 'DecompressionStream' in window) { const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw')); data = new Uint8Array(await new Response(stream).arrayBuffer()); } else throw new Error('Este navegador não suporta a compactação desta planilha.');
      files[name] = dec.decode(data); pos += 46 + nameLength + extraLength + commentLength;
    }
    return files;
  }
  function parseXlsxRows(files) {
    const parser = new DOMParser(), shared = [];
    if (files['xl/sharedStrings.xml']) parser.parseFromString(files['xl/sharedStrings.xml'], 'application/xml').querySelectorAll('si').forEach(node => shared.push(node.textContent || ''));
    const name = Object.keys(files).filter(file => /^xl\/worksheets\/sheet\d+\.xml$/.test(file)).sort()[0];
    if (!name) throw new Error('Nenhuma planilha encontrada.');
    const xml = parser.parseFromString(files[name], 'application/xml'); const rows = [];
    xml.querySelectorAll('row').forEach(row => { const values = []; row.querySelectorAll('c').forEach(cell => { const ref = cell.getAttribute('r') || 'A1', letters = (ref.match(/[A-Z]+/i) || ['A'])[0].toUpperCase(); let col = 0; for (const letter of letters) col = col * 26 + letter.charCodeAt(0) - 64; col--; const type = cell.getAttribute('t'), raw = cell.querySelector('v')?.textContent ?? '', value = type === 's' ? shared[n(raw)] ?? '' : type === 'inlineStr' ? cell.querySelector('is')?.textContent ?? '' : raw === '' ? '' : Number(raw); values[col] = value; }); rows.push(values); });
    return rows;
  }
  function chooseReadingsXlsx() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
    input.onchange = async () => { const file = input.files?.[0]; if (!file) return; try {
      applyImportedReadings(await rowsFromSpreadsheetFile(file));
    } catch (error) { toast(error.message || 'Não foi possível importar a planilha.', true); } };
    input.click();
  }
  function applyImportedReadings(rows) {
    const block = selected(); if (!block) return;
    const headerIndex = rows.findIndex(row => row.some(value => normalizedHeader(value) === 'apt') && row.some(value => normalizedHeader(value) === 'leituraatual'));
    if (headerIndex < 0) throw new Error('Use as colunas Apt e Leitura Atual. Responsável e Leitura Anterior são opcionais.');
    const headers = rows[headerIndex].map(normalizedHeader), aptCol = headers.indexOf('apt'), currentCol = headers.indexOf('leituraatual'), previousCol = headers.indexOf('leituraanterior'), residentCol = headers.indexOf('responsavel');
    const byApt = new Map(block.units.map(unit => [normalizedHeader(unit.number), unit])); let updated = 0, created = 0, ignored = 0;
    for (const row of rows.slice(headerIndex + 1)) {
      const apt = String(row[aptCol] ?? '').trim(); if (!apt) continue;
      const raw = String(row[currentCol] ?? '').replace(',', '.').trim(); if (raw === '') { ignored++; continue; }
      const current = Number(raw); if (!Number.isFinite(current)) { ignored++; continue; }
      let unit = byApt.get(normalizedHeader(apt));
      if (!unit) { unit = normalizeUnit({ id: uid(), number: apt, resident: '', previous: 0, current: '' }, block.units.length); block.units.push(unit); byApt.set(normalizedHeader(apt), unit); created++; } else updated++;
      if (previousCol >= 0 && isSet(row[previousCol]) && String(row[previousCol]).trim() !== '') unit.previous = n(String(row[previousCol]).replace(',', '.'));
      if (residentCol >= 0 && String(row[residentCol] ?? '').trim()) unit.resident = String(row[residentCol]).trim();
      unit.current = current; unit.mobileDone = true; unit.mobileSavedAt = new Date().toISOString(); recalculateUnit(unit, block);
      const issue = readingIssue(unit); if (issue && !unit.note.includes(issue.short)) unit.note = [unit.note, `${issue.short} ${issue.text}`].filter(Boolean).join(' | ');
    }
    if (!updated && !created) throw new Error('A planilha não contém leituras atuais preenchidas.');
    save(`${updated} leitura(s) atualizada(s)${created ? ` e ${created} unidade(s) criada(s)` : ''}${ignored ? ` · ${ignored} linha(s) ignorada(s)` : ''}`); render();
  }

  function handleClick(event) {
    const target = event.target;
    const sidebarLink = target.closest('.sidebar a'); if (sidebarLink) $('#sidebar').classList.remove('open');
    const go = target.closest('[data-go]'); if (go) { setRoute(go.dataset.go); return; }
    if (target.closest('[data-new]')) { openNewBlock(); return; }
    if (target.closest('[data-add-unit]')) { const block = selected(); block.units.push(normalizeUnit({ id: uid(), number: String(block.units.length + 1).padStart(2, '0'), previous: 0, current: '' }, block.units.length)); save('Unidade adicionada'); render(); return; }
    if (target.closest('[data-select-all-readings]')) { const block = selected(); if (!block) return; const ids = readingSelectionFor(block); if (ids.size === block.units.length) selectedReadingIds.clear(); else selectedReadingIds = new Set(block.units.map(unit => unit.id)); updateReadingSelectionUi(); return; }
    if (target.closest('[data-clear-selected-readings]')) { const block = selected(); if (block) clearReadings(block, readingSelectionFor(block), 'Limpar as leituras selecionadas'); return; }
    if (target.closest('[data-clear-all-readings]')) { const block = selected(); if (block) clearReadings(block, block.units.map(unit => unit.id), 'Limpar todas as leituras do mês'); return; }
    if (target.closest('[data-remove-selected-units]')) { const block = selected(); if (block) removeSelectedUnits(block, readingSelectionFor(block)); return; }
    const remove = target.closest('[data-remove-unit]'); if (remove) { const row = remove.closest('[data-reading-row]'); const block = selected(); const unit = findUnit(block, row?.dataset.readingRow); if (unit && confirm(`Excluir o apartamento ${unit.number}?`)) { block.units = block.units.filter(item => item.id !== unit.id); selectedReadingIds.delete(unit.id); save('Unidade excluída'); render(); } return; }
    if (target.closest('[data-import-readings]')) { chooseReadingsXlsx(); return; }
    if (target.closest('[data-export-readings]')) { exportReadingsCsv(); return; }
    if (target.closest('[data-export-readings-xlsx]')) { exportReadingsXlsx(); return; }
    if (target.closest('[data-close-month]')) { executeMonthlyClose(selected()); return; }
    if (target.closest('[data-refresh],[data-refresh-closing]')) { const block = selected(); if (!block) return; ensureV51(block); recalculateBlock(block); closingRefreshAt = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); audit(block, 'Conferência atualizada', `Fechamento de ${monthLabel(block.month)} recalculado.`, { month: block.month }); save('Conferência recalculada com sucesso'); render(); return; }
    const history = target.closest('[data-history]'); if (history) { showHistory(history.dataset.history); return; }
    const deleteHistory = target.closest('[data-delete-history]'); if (deleteHistory) { const block = selected(); const entry = block.history.find(item => item.id === deleteHistory.dataset.deleteHistory); if (entry && confirm(`Excluir permanentemente o histórico de ${monthLabel(entry.month)}?`)) { block.history = block.history.filter(item => item.id !== entry.id); save('Histórico excluído'); render(); } return; }
    if (target.closest('[data-export-report-csv]')) { exportReportCsv(); return; }
    if (target.closest('[data-export]')) { exportData(); return; }
    if (target.closest('[data-import]')) { $('#importInput').click(); return; }
    if (target.closest('[data-delete-block]')) { const block = selected(); if (block && confirm(`Excluir ${block.name}, suas leituras e seu histórico deste navegador?`)) { state.blocks = state.blocks.filter(item => item.id !== block.id); state.selected = state.blocks[0]?.id || null; save('Condomínio excluído'); setRoute('dashboard'); render(); } return; }
    if (target.closest('[data-print-report]')) { printMonthlyReport(); return; }
    if (target.closest('[data-print]')) { window.print(); return; }
    if (target.closest('[data-print-bills]')) { printHtml('Boletos KR²MELO', $('.billing-preview')?.innerHTML || ''); return; }
    const receipt = target.closest('[data-payment-receipt]'); if (receipt) { printPaymentReceipt(receipt.dataset.paymentReceipt); return; }
    if (target.closest('[data-print-service-receipt]')) { printHtml('Recibo KR²MELO', $('#receiptPreview')?.innerHTML || ''); return; }
    if (target.closest('[data-clear-receipt]')) { const block = selected(); block.serviceReceiptDraft = null; save('Rascunho limpo'); render(); return; }
    const deleteReceipt = target.closest('[data-delete-service-receipt]'); if (deleteReceipt) { const block = selected(); if (confirm('Excluir este recibo?')) { block.serviceReceipts = block.serviceReceipts.filter(item => item.id !== deleteReceipt.dataset.deleteServiceReceipt); save('Recibo excluído'); render(); } return; }
  }
  function handleChange(event) {
    const target = event.target;
    if (target.id === 'blockSelect') { state.selected = target.value; save(); render(); return; }
    if (target.matches('[data-water-bill]')) { const block = selected(); block.billing.waterBill = Math.max(0, n(target.value)); save('Conta global atualizada'); render(); return; }
    if (target.matches('[data-reading-select]')) { if (target.checked) selectedReadingIds.add(target.value); else selectedReadingIds.delete(target.value); updateReadingSelectionUi(); return; }
    const readingField = target.closest('[data-reading-field]');
    if (readingField) {
      const row = target.closest('[data-reading-row]'); const block = selected(); const unit = findUnit(block, row?.dataset.readingRow); const field = target.dataset.readingField; if (!unit) return;
      const previousValue = unit[field];
      if (['previous', 'current'].includes(field)) unit[field] = target.value === '' ? '' : n(target.value); else unit[field] = target.value;
      if (field === 'previous' && unit.previous === '') unit.previous = 0;
      recalculateUnit(unit, block);
      const issue = (field === 'previous' || field === 'current') ? readingIssue(unit) : null;
      if (issue && (field === 'previous' || field === 'current') && !confirm(`${issue.text}\n\nDeseja manter esta leitura?`)) { unit[field] = previousValue; recalculateUnit(unit, block); render(); return; }
      save('Leitura atualizada'); render(); return;
    }
    const ruleField = target.closest('[data-rule-field]');
    if (ruleField) {
      const row = target.closest('[data-rule-row]'); const block = selected(); const unit = findUnit(block, row?.dataset.ruleRow); if (!unit) return; const field = target.dataset.ruleField;
      if (field === 'billingFineLabel') unit.billingFineLabel = target.value || 'MULTAS / OUTROS'; else if (field === 'billingFine') unit.billingFine = Math.max(0, n(target.value)); else if (field === 'extraChargeLabel') unit.extraChargeLabel = target.value || 'VALOR ADICIONAL'; else if (field === 'extraCharge') unit.extraCharge = Math.max(0, n(target.value)); else { unit.condoRule = normalizeRule(unit.condoRule); unit.condoRule[field] = ['value'].includes(field) ? Math.max(0, n(target.value)) : target.value; unit.condoRule = normalizeRule(unit.condoRule); }
      save('Regra atualizada'); render(); return;
    }
    const paymentField = target.closest('[data-payment-field]');
    if (paymentField) { const row = target.closest('[data-payment-row]'); const block = selected(); const unit = findUnit(block, row?.dataset.paymentRow); if (!unit) return; const field = target.dataset.paymentField; if (field === 'paid') { unit.paid = target.checked; unit.paymentDate = target.checked ? (unit.paymentDate || today()) : ''; } else unit.paymentDate = target.value; save('Pagamento atualizado'); render(); }
  }
  function handleInput(event) {
    if (event.target.matches('[data-global-search]')) {
      const term = normalizedHeader(event.target.value); const result = $('#globalSearchResult'); if (!result) return;
      if (!term) { result.innerHTML = ''; return; }
      const matches = state.blocks.flatMap(block => block.units.filter(unit => [block.name, unit.number, unit.resident].some(value => normalizedHeader(value).includes(term))).map(unit => ({ block, unit }))).slice(0, 15);
      result.innerHTML = matches.length ? matches.map(item => `<button class="secondary" data-search-select="${item.block.id}" data-search-route="leituras" type="button"><strong>${esc(item.block.name)}</strong> · Apto ${esc(item.unit.number)} · ${esc(item.unit.resident || 'Sem responsável')}</button>`).join('') : '<p class="muted">Nenhum resultado encontrado.</p>';
      $$('#globalSearchResult [data-search-select]').forEach(button => button.onclick = () => { state.selected = button.dataset.searchSelect; save(); setRoute(button.dataset.searchRoute); render(); });
    }
    if (event.target.closest('#receiptForm')) { const form = $('#receiptForm'); const preview = $('#receiptPreview'); if (form && preview) preview.innerHTML = receiptHtml(Object.fromEntries(new FormData(form))); }
  }
  function handleSubmit(event) {
    const form = event.target;
    if (form.id === 'blockForm') { event.preventDefault(); const block = selected(); Object.assign(block, Object.fromEntries(new FormData(form))); block.month = String(block.month); block.billing = normalizeBilling(block.billing, block.month); recalculateBlock(block); save('Dados atualizados'); render(); return; }
    if (form.id === 'tariffForm') { event.preventDefault(); const block = selected(); const data = Object.fromEntries(new FormData(form)); block.tariff = { minimum: Math.max(0, n(data.minimum)), tier1: Math.max(0, n(data.tier1)), tier2: Math.max(0, n(data.tier2)) }; recalculateBlock(block); save('Tarifa salva e água recalculada'); render(); return; }
    if (form.id === 'billingForm') { event.preventDefault(); saveBilling(form); return; }
    if (form.id === 'receiptForm') { event.preventDefault(); const block = selected(); const data = Object.fromEntries(new FormData(form)); block.serviceReceiptDraft = data; block.serviceReceipts.unshift({ ...data, id: uid(), createdAt: new Date().toISOString() }); save('Recibo salvo'); render(); }
  }

  function bindStatic() {
    window.addEventListener('hashchange', render);
    $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
    $('#newBlockBtn').onclick = openNewBlock;
    $('#exportBtn').onclick = exportData;
    $('#importBackupBtn').onclick = () => $('#importInput').click();
    $('#importInput').onchange = event => { const file = event.target.files?.[0]; if (file) importData(file); event.target.value = ''; };
    document.addEventListener('click', handleClick);
    document.addEventListener('change', handleChange);
    document.addEventListener('input', handleInput);
    document.addEventListener('submit', handleSubmit);
  }



  // ===================== Histórico, auditoria e operação =====================
  Object.assign(routes, {
    unidades: ['OPERAÇÃO', 'Unidades e hidrômetros'],
    excecoes: ['ATENÇÕES', 'Painel de exceções']
  });

  const V51_SNAPSHOT_KEY = `${KEY}.snapshots.v51`;
  const operationLabels = {
    ocupado: 'Ocupado', vazio: 'Vazio', alugado: 'Alugado', reforma: 'Em reforma',
    sem_acesso: 'Sem acesso', parado: 'Hidrômetro parado', trocado: 'Hidrômetro trocado', estimada: 'Leitura estimada'
  };
  const paymentLabels = { pendente: 'Pendente', pago: 'Pago', parcial: 'Pago parcialmente', negociado: 'Negociado', vencido: 'Vencido', isento: 'Isento' };
  let historyTabV51 = 'consultar';
  let historyAnalysisUnitV51 = '';

  function ensureV51(block) {
    if (!block) return;
    block.operator = String(block.operator || 'Operador');
    block.audit = Array.isArray(block.audit) ? block.audit.slice(0, 500) : [];
    block.units.forEach(unit => {
      unit.phone = String(unit.phone || '');
      unit.operationalStatus = operationLabels[unit.operationalStatus] ? unit.operationalStatus : 'ocupado';
      unit.readingType = unit.readingType === 'estimated' ? 'estimated' : 'real';
      unit.estimatedReason = String(unit.estimatedReason || '');
      unit.meter = normalizeMeter(unit.meter);
      unit.payment = normalizePayment(unit.payment, unit);
      unit.paid = unit.payment.status === 'pago';
      unit.paymentDate = unit.payment.date || unit.paymentDate || '';
    });
    block.history.forEach(entry => {
      entry.source = ['fechado','importado','manual','revisado'].includes(entry.source) ? entry.source : 'fechado';
      entry.status = ['bloqueado','importado','revisado'].includes(entry.status) ? entry.status : 'bloqueado';
      entry.revisionOf = String(entry.revisionOf || '');
      entry.revisionReason = String(entry.revisionReason || '');
      entry.importedAt = String(entry.importedAt || '');
      entry.units.forEach(unit => {
        unit.meter = normalizeMeter(unit.meter);
        unit.payment = normalizePayment(unit.payment, unit);
        unit.operationalStatus = operationLabels[unit.operationalStatus] ? unit.operationalStatus : 'ocupado';
        unit.readingType = unit.readingType === 'estimated' ? 'estimated' : 'real';
      });
    });
  }
  state.blocks.forEach(ensureV51);

  function audit(block, type, detail, context = {}) {
    if (!block) return;
    ensureV51(block);
    block.audit.unshift({
      id: uid(), at: new Date().toISOString(), operator: block.operator || 'Operador',
      type: String(type || 'Registro'), detail: String(detail || ''), context: deepClone(context || {})
    });
    block.audit = block.audit.slice(0, 500);
  }
  function auditDate(value) { return value ? `${dateBr(String(value).slice(0, 10))} ${String(value).slice(11, 16)}` : '—'; }
  function monthFromValue(value) {
    if (typeof value === 'number' && value > 20000) {
      const d = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    const text = String(value ?? '').trim();
    const direct = text.match(/^(\d{4})[-/](\d{1,2})/);
    if (direct) return `${direct[1]}-${String(Number(direct[2])).padStart(2, '0')}`;
    const br = text.match(/^(\d{1,2})[-/](\d{4})$/);
    if (br) return `${br[2]}-${String(Number(br[1])).padStart(2, '0')}`;
    return '';
  }
  function entryTitle(entry) {
    const source = { fechado: 'Fechado pelo sistema', importado: 'Importado', manual: 'Cadastro manual', revisado: 'Revisão' }[entry.source] || 'Registro';
    return `${source}${entry.version > 1 ? ` · versão ${entry.version}` : ''}`;
  }
  function entryUnits(entry) { return Array.isArray(entry.units) ? entry.units : []; }
  function entryCharges(entry) {
    if (Array.isArray(entry.charges) && entry.charges.length) return entry.charges;
    const temp = { month: entry.month, tariff: entry.tariff, billing: entry.billing, units: entryUnits(entry) };
    return temp.units.map(unit => { const c = unitCharges(unit, temp); return { unitId: unit.id, number: unit.number, resident: unit.resident, m3: unit.m3, ...c, fineLabel: unit.billingFineLabel, paid: unit.paid, paymentDate: unit.paymentDate }; });
  }
  function latestEntryForMonth(block, month) {
    return block.history.filter(entry => entry.month === month).sort((a, b) => n(b.version) - n(a.version) || String(b.closedAt).localeCompare(String(a.closedAt)))[0] || null;
  }
  function historySeries(block, unit) {
    const number = normalizedHeader(unit.number);
    return [...block.history]
      .sort((a, b) => a.month.localeCompare(b.month) || n(a.version) - n(b.version))
      .filter(entry => latestEntryForMonth(block, entry.month)?.id === entry.id)
      .map(entry => {
        const match = entryUnits(entry).find(item => normalizedHeader(item.id) === normalizedHeader(unit.id) || normalizedHeader(item.number) === number);
        const charge = entryCharges(entry).find(item => normalizedHeader(item.unitId) === normalizedHeader(unit.id) || normalizedHeader(item.number) === number);
        if (!match && !charge) return null;
        return { month: entry.month, m3: n(charge?.m3 ?? match?.m3), previous: n(match?.previous), current: n(match?.current), water: n(charge?.water ?? match?.value), total: n(charge?.total), source: entry.source, entryId: entry.id };
      }).filter(Boolean);
  }
  function averageHistoricConsumption(block, unit, take = 3) {
    const series = historySeries(block, unit).filter(item => item.m3 >= 0).slice(-take);
    return series.length ? series.reduce((sum, item) => sum + item.m3, 0) / series.length : 0;
  }
  function paymentInfo(unit, total) {
    const payment = normalizePayment(unit.payment, unit);
    let received = Math.max(0, n(payment.received));
    let waived = 0;
    if (payment.status === 'pago') received = total;
    if (payment.status === 'isento') waived = total;
    const balance = Math.max(0, total - received - waived);
    return { ...payment, received, waived, balance, settled: balance <= 0.005 };
  }
  function financeTotalsV51(block) {
    return block.units.reduce((sum, unit) => {
      const charge = unitCharges(unit, block), payment = paymentInfo(unit, charge.total);
      sum.total += charge.total; sum.received += payment.received; sum.waived += payment.waived; sum.open += payment.balance;
      if (payment.status === 'pago') sum.paid++; if (payment.status === 'parcial') sum.partial++; if (payment.status === 'vencido') sum.overdue++;
      return sum;
    }, { total: 0, received: 0, waived: 0, open: 0, paid: 0, partial: 0, overdue: 0 });
  }
  function monthSnapshot(block, month, source, rows, meta = {}) {
    const billing = normalizeBilling({ ...block.billing, dueDate: dateForMonth(month, dayOf(block.billing.dueDate)), currentReadDate: block.billing.currentReadDate || '' }, month);
    const units = rows.map((row, index) => normalizeUnit(row, index));
    const temp = { month, tariff: deepClone(block.tariff), billing, units };
    const charges = units.map(unit => { const c = unitCharges(unit, temp); return { unitId: unit.id, number: unit.number, resident: unit.resident, m3: unit.m3, water: c.water, grossCondo: c.grossCondo, condoDiscount: c.condoDiscount, condo: c.condo, service: c.service, extraCharge: c.extraCharge, extraChargeLabel: unit.extraChargeLabel, fine: c.fine, total: c.total, rule: deepClone(c.rule), fineLabel: unit.billingFineLabel, paid: unit.paid, paymentDate: unit.paymentDate }; });
    const totals = charges.reduce((sum, row) => { sum.m3 += n(row.m3); sum.water += n(row.water); sum.discount += n(row.condoDiscount); sum.total += n(row.total); return sum; }, { m3: 0, water: 0, discount: 0, total: 0 });
    const existing = block.history.filter(entry => entry.month === month);
    return normalizeHistoryEntry({
      id: uid(), month, version: existing.length + 1, closedAt: new Date().toISOString(), checks: [], units, tariff: deepClone(block.tariff), billing, charges,
      totalM3: totals.m3, totalValue: totals.water, waterTotal: totals.water, grandTotal: totals.total, totalDiscount: totals.discount,
      source, status: source === 'importado' ? 'importado' : source === 'revisado' ? 'revisado' : 'bloqueado', importedAt: source === 'importado' ? new Date().toISOString() : '', ...meta
    });
  }
  function createHistoryEntry(block, month, rows, source = 'manual', meta = {}) {
    const entry = monthSnapshot(block, month, source, rows, meta);
    block.history.unshift(entry);
    audit(block, source === 'revisado' ? 'Revisão histórica criada' : 'Histórico criado', `${monthLabel(month)} · ${entryTitle(entry)}`, { entryId: entry.id, source, revisionOf: entry.revisionOf || '' });
    return entry;
  }
  function renderHistoryChart(series) {
    const max = Math.max(1, ...series.map(item => n(item.m3)));
    return `<div class="history-chart">${series.map(item => `<div class="history-bar"><div class="history-bar-fill" style="height:${Math.max(3, Math.round(n(item.m3) / max * 100))}%" title="${esc(monthLabel(item.month))}: ${fmtM3(item.m3)} m³"></div><small>${esc(item.month.slice(5))}/${esc(item.month.slice(2,4))}</small><b>${fmtM3(item.m3)}</b></div>`).join('')}</div>`;
  }
  function renderHistoryV51(block) {
    ensureV51(block);
    const entries = [...block.history].sort((a, b) => b.month.localeCompare(a.month) || n(b.version) - n(a.version));
    const choices = block.units.map(unit => `<option value="${unit.id}" ${historyAnalysisUnitV51 === unit.id ? 'selected' : ''}>Apto ${esc(unit.number)} · ${esc(unit.resident || 'Sem responsável')}</option>`).join('');
    if (!historyAnalysisUnitV51 && block.units[0]) historyAnalysisUnitV51 = block.units[0].id;
    const analysisUnit = findUnit(block, historyAnalysisUnitV51) || block.units[0];
    const series = analysisUnit ? historySeries(block, analysisUnit) : [];
    const usage = series.length ? series.reduce((sum, item) => sum + n(item.m3), 0) : 0;
    const avg = series.length ? usage / series.length : 0;
    const consult = `<div class="history-list">${entries.map(entry => { const t = historyTotals(entry); return `<article class="history-row history-row-v51"><div class="history-date"><strong>${entry.month.slice(5)}</strong><small>${entry.month.slice(0,4)}</small></div><div><strong>${monthLabel(entry.month)}</strong><br><small class="muted">${esc(entryTitle(entry))} · ${entryUnits(entry).length} unidade(s) · ${entry.closedAt ? auditDate(entry.closedAt) : 'sem data'}</small>${entry.revisionReason ? `<br><small class="adjustment">Motivo: ${esc(entry.revisionReason)}</small>` : ''}</div><div class="history-data"><span><small>Consumo</small><strong>${fmtM3(t.m3)} m³</strong></span><span><small>Água</small><strong>${money.format(t.water)}</strong></span><span><small>Total</small><strong>${money.format(t.total)}</strong></span></div><div class="history-actions"><button class="secondary" data-history="${entry.id}" type="button">Detalhes</button><button class="secondary" data-revise-history="${entry.id}" type="button">Criar revisão</button></div></article>`; }).join('') || '<div class="card empty"><h3>Sem histórico</h3><p>Importe meses antigos ou feche o primeiro mês do sistema.</p></div>'}</div>`;
    const importer = `<section class="card"><div class="card-head"><div><h3>Importar leituras passadas</h3><p class="muted">A importação não altera a leitura atual. Cada mês entra como histórico bloqueado e rastreável.</p></div><button class="primary" data-import-history type="button">⇧ Importar XLSX</button></div><div class="info-box"><strong>Modelo de planilha:</strong> Competência, Apt, Responsável, Leitura Anterior, Leitura Atual. Competência pode ser <code>2025-01</code>, <code>01/2025</code> ou uma data.</div><div class="button-row"><button class="secondary" data-export-history-template type="button">⇩ Baixar modelo XLSX</button><button class="secondary" data-manual-history type="button">+ Cadastrar mês manualmente</button></div></section><section class="card"><h3>Garantias do histórico</h3><div class="notice-list"><div class="info-box">Meses fechados ficam bloqueados. Uma correção cria uma nova versão, sem apagar a anterior.</div><div class="info-box">O sistema identifica a origem como importado, manual, fechado ou revisado.</div><div class="warning-box">Confira as leituras antes da importação: valores antigos permanecem preservados mesmo após uma revisão.</div></div></section>`;
    const analysis = `<section class="card"><div class="card-head"><div><h3>Análise por apartamento</h3><p class="muted">Consumo histórico, médias e tendência.</p></div><label class="field compact-field"><span>Apartamento</span><select data-history-analysis>${choices}</select></label></div>${analysisUnit ? `<div class="analysis-kpis"><div><small>Meses com histórico</small><strong>${series.length}</strong></div><div><small>Consumo médio</small><strong>${fmtM3(avg)} m³</strong></div><div><small>Consumo acumulado</small><strong>${fmtM3(usage)} m³</strong></div><div><small>Último consumo</small><strong>${series.length ? `${fmtM3(series.at(-1).m3)} m³` : '—'}</strong></div></div>${series.length ? renderHistoryChart(series) : '<p class="empty">Ainda não há registros suficientes para este apartamento.</p>'}<div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Competência</th><th>Anterior</th><th>Atual</th><th>Consumo</th><th>Água</th><th>Total</th><th>Origem</th></tr></thead><tbody>${series.map(item => `<tr><td>${monthLabel(item.month)}</td><td>${fmtM3(item.previous)}</td><td>${fmtM3(item.current)}</td><td><strong>${fmtM3(item.m3)} m³</strong></td><td>${money.format(item.water)}</td><td>${money.format(item.total)}</td><td>${esc(item.source)}</td></tr>`).join('')}</tbody></table></div>` : ''}</section>`;
    const auditHtml = `<section class="card"><div class="card-head"><div><h3>Trilha de auditoria</h3><p class="muted">Mudanças relevantes registradas nesta instalação.</p></div><button class="secondary" data-export-audit type="button">Exportar CSV</button></div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Operador</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>${block.audit.map(item => `<tr><td>${auditDate(item.at)}</td><td>${esc(item.operator || 'Operador')}</td><td><strong>${esc(item.type)}</strong></td><td>${esc(item.detail)}</td></tr>`).join('') || '<tr><td colspan="4">Nenhuma alteração auditada ainda.</td></tr>'}</tbody></table></div></section>`;
    const tabs = [['consultar','Consultar histórico'],['importar','Importar meses passados'],['analise','Análise por apartamento'],['auditoria','Auditoria']].map(([key,label]) => `<button class="tab-button ${historyTabV51 === key ? 'active' : ''}" data-history-tab="${key}" type="button">${label}</button>`).join('');
    const body = historyTabV51 === 'importar' ? importer : historyTabV51 === 'analise' ? analysis : historyTabV51 === 'auditoria' ? auditHtml : consult;
    return `<section class="hero"><div><p class="eyebrow">HISTÓRICO INTELIGENTE</p><h2>Leituras passadas, revisões e auditoria</h2><p>Consulte períodos anteriores sem misturar dados históricos com as leituras do mês atual.</p></div><div><button class="secondary" data-export-history type="button">Exportar histórico</button></div></section><div class="tabs" role="tablist">${tabs}</div>${body}`;
  }
  function renderUnitsV51(block) {
    ensureV51(block);
    return `<section class="hero"><div><p class="eyebrow">CADASTRO TÉCNICO</p><h2>Unidades, moradores e hidrômetros</h2><p>Controle técnico para trocas de equipamento, imóveis vazios, leituras estimadas e contato do morador.</p></div><div><button class="secondary" data-go="leituras">Abrir leituras →</button></div></section><div class="table-wrap"><table class="technical-table"><thead><tr><th>Apto</th><th>Responsável</th><th>WhatsApp</th><th>Situação</th><th>Serial do hidrômetro</th><th>Localização</th><th>Instalação</th><th>Troca</th><th>Leitura inicial</th><th>Tipo de leitura</th><th>Motivo / observação</th><th></th></tr></thead><tbody>${block.units.map(unit => { const m = normalizeMeter(unit.meter); return `<tr data-tech-row="${unit.id}"><td><strong>${esc(unit.number)}</strong></td><td>${esc(unit.resident || '—')}</td><td><input data-tech-field="phone" value="${esc(unit.phone)}" placeholder="5511999999999"></td><td><select data-tech-field="operationalStatus">${Object.entries(operationLabels).map(([key,label]) => `<option value="${key}" ${unit.operationalStatus === key ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td><input data-tech-field="meter.serial" value="${esc(m.serial)}" placeholder="Nº do hidrômetro"></td><td><input data-tech-field="meter.location" value="${esc(m.location)}" placeholder="Ex.: garagem"></td><td><input data-tech-field="meter.installedAt" type="date" value="${esc(m.installedAt)}"></td><td><input data-tech-field="meter.replacedAt" type="date" value="${esc(m.replacedAt)}"></td><td><input data-tech-field="meter.initialReading" type="number" min="0" step="0.001" value="${m.initialReading || ''}"></td><td><span class="pill ${unit.readingType === 'estimated' ? 'warn' : 'ok'}">${unit.readingType === 'estimated' ? 'Estimativa' : 'Real'}</span></td><td><input data-tech-field="estimatedReason" value="${esc(unit.estimatedReason)}" placeholder="Ex.: sem acesso"></td><td><button class="secondary" data-estimate-unit="${unit.id}" type="button">Estimar</button></td></tr>`; }).join('')}</tbody></table></div><section class="card" style="margin-top:16px"><h3>Como usar a leitura estimada</h3><p class="muted">Use somente quando não houver acesso ao hidrômetro. O sistema usa a média dos últimos três períodos disponíveis, marca a leitura como estimada e preserva o motivo no histórico.</p></section>`;
  }
  function exceptionsForBlock(block) {
    const items = [];
    const todayValue = today();
    block.units.forEach(unit => {
      const issue = readingIssue(unit); if (issue) items.push({ level: issue.type, unit: unit.number, title: issue.short, text: issue.text, route: 'leituras' });
      if (unit.current === '') items.push({ level: 'warn', unit: unit.number, title: 'Leitura pendente', text: 'A leitura atual ainda não foi registrada.', route: 'leituras' });
      if (!unit.resident) items.push({ level: 'warn', unit: unit.number, title: 'Sem responsável', text: 'Cadastre o responsável antes da emissão de boletos.', route: 'leituras' });
      if (!normalizeMeter(unit.meter).serial) items.push({ level: 'warn', unit: unit.number, title: 'Hidrômetro sem serial', text: 'Complete o cadastro técnico do equipamento.', route: 'unidades' });
      if (unit.operationalStatus === 'parado') items.push({ level: 'danger', unit: unit.number, title: 'Hidrômetro parado', text: 'Verifique manutenção, troca ou estimativa de leitura.', route: 'unidades' });
      if (unit.operationalStatus === 'sem_acesso') items.push({ level: 'warn', unit: unit.number, title: 'Imóvel sem acesso', text: 'Registre motivo ou faça leitura estimada.', route: 'unidades' });
      const payment = paymentInfo(unit, unitCharges(unit, block).total);
      const due = block.billing?.dueDate || '';
      if (due && due < todayValue && payment.balance > 0.005 && ['pendente','parcial','negociado','vencido'].includes(payment.status)) items.push({ level: 'danger', unit: unit.number, title: 'Cobrança em aberto', text: `${money.format(payment.balance)} pendente após ${dateBr(due)}.`, route: 'financeiro' });
      const rule = normalizeRule(unit.condoRule);
      if (rule.endsAt && rule.endsAt < block.month) items.push({ level: 'warn', unit: unit.number, title: 'Desconto vencido', text: `A regra terminou em ${monthLabel(rule.endsAt)}. Revise antes de cobrar.`, route: 'regras' });
      const hist = historySeries(block, unit); const avg = hist.length ? hist.slice(-3).reduce((sum, item) => sum + item.m3, 0) / Math.min(3, hist.length) : 0;
      if (avg > 0 && n(unit.m3) >= avg * 2 && n(unit.m3) - avg >= 8) items.push({ level: 'danger', unit: unit.number, title: 'Consumo fora do padrão', text: `Média recente ${fmtM3(avg)} m³; consumo atual ${fmtM3(unit.m3)} m³.`, route: 'leituras' });
    });
    return items;
  }
  function renderExceptionsV51(block) {
    const items = exceptionsForBlock(block);
    const grouped = { danger: items.filter(item => item.level === 'danger'), warn: items.filter(item => item.level === 'warn'), ok: items.filter(item => item.level === 'ok') };
    return `<section class="hero"><div><p class="eyebrow">ATENÇÕES DO MÊS</p><h2>Painel de exceções</h2><p>Leituras, hidrômetros, descontos, cadastros e cobranças que exigem acompanhamento.</p></div><div><button class="secondary" data-refresh type="button">Atualizar</button></div></section><section class="metrics"><article class="metric red"><span class="label">Críticas</span><strong>${grouped.danger.length}</strong><small>Vazamento, cobrança vencida ou equipamento parado</small></article><article class="metric"><span class="label">Atenções</span><strong>${grouped.warn.length}</strong><small>Itens a conferir antes do fechamento</small></article><article class="metric green"><span class="label">Unidades</span><strong>${block.units.length}</strong><small>Monitoradas neste condomínio</small></article><article class="metric"><span class="label">Competência</span><strong>${block.month}</strong><small>${monthLabel(block.month)}</small></article></section><section class="card"><div class="alert-list big">${items.map(item => `<div class="alert-item ${item.level}"><div><strong>Apto ${esc(item.unit)} · ${esc(item.title)}</strong><small>${esc(item.text)}</small></div><button class="secondary" data-go="${item.route}" type="button">Abrir</button></div>`).join('') || '<div class="alert-item ok"><strong>Nenhuma exceção encontrada</strong><small>As leituras, cadastros e pagamentos estão em situação normal.</small></div>'}</div></section>`;
  }
  function renderFinanceV51(block) {
    const totals = financeTotalsV51(block);
    return `<section class="hero"><div><p class="eyebrow">FINANCEIRO</p><h2>Inadimplência, Pix e acordos</h2><p>Controle o status de cobrança por apartamento sem perder o valor original do mês.</p></div><div><button class="secondary" data-print type="button">Imprimir</button></div></section><section class="finance-summary"><div><small>Cobrança total</small><strong>${money.format(totals.total)}</strong></div><div><small>Recebido</small><strong>${money.format(totals.received)}</strong></div><div><small>Isento / baixado</small><strong>${money.format(totals.waived)}</strong></div><div><small>Em aberto</small><strong>${money.format(totals.open)}</strong></div><div><small>Pagos</small><strong>${totals.paid}/${block.units.length}</strong></div><div><small>Vencidos</small><strong>${totals.overdue}</strong></div></section><div class="table-wrap" style="margin-top:16px"><table class="finance-table"><thead><tr><th>Apto</th><th>Responsável</th><th>Status</th><th>Recebido</th><th>Data</th><th>Forma</th><th>ID Pix / comprovante</th><th>Acordo / observação</th><th>Total</th><th>Aberto</th><th></th></tr></thead><tbody>${block.units.map(unit => { const charge = unitCharges(unit, block), pay = paymentInfo(unit, charge.total); return `<tr data-finance-row="${unit.id}"><td><strong>${esc(unit.number)}</strong></td><td>${esc(unit.resident || '—')}</td><td><select data-payment-plus="status">${Object.entries(paymentLabels).map(([key,label]) => `<option value="${key}" ${pay.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td><input data-payment-plus="received" type="number" min="0" step="0.01" value="${pay.status === 'pago' ? charge.total.toFixed(2) : pay.received || ''}"></td><td><input data-payment-plus="date" type="date" value="${esc(pay.date)}"></td><td><select data-payment-plus="method"><option value="">—</option>${['Pix','Dinheiro','Transferência','Boleto','Outro'].map(v => `<option value="${v}" ${pay.method === v ? 'selected' : ''}>${v}</option>`).join('')}</select></td><td><input data-payment-plus="pixId" value="${esc(pay.pixId)}" placeholder="TXID ou referência"></td><td><input data-payment-plus="proofNote" value="${esc(pay.proofNote || pay.agreement)}" placeholder="Acordo / comprovante"></td><td class="value">${money.format(charge.total)}</td><td class="${pay.balance ? 'adjustment' : ''}">${pay.balance ? money.format(pay.balance) : '—'}</td><td><div class="row-actions"><button class="secondary" data-whatsapp-unit="${unit.id}" type="button">WhatsApp</button><button class="secondary" data-payment-receipt="${unit.id}" type="button">Recibo</button></div></td></tr>`; }).join('')}</tbody></table></div><section class="card" style="margin-top:16px"><p class="muted">O botão WhatsApp abre uma mensagem pronta no aplicativo do aparelho. O envio automático e a conciliação bancária exigem integração com servidor ou API financeira.</p></section>`;
  }
  function renderSettingsV51(block) {
    const snapshots = loadSnapshots();
    return `${renderSettings(block)}<section class="settings" style="margin-top:16px"><article class="card"><div class="card-head"><h3>Responsável pelas alterações</h3></div><form class="form-grid" id="operatorForm"><div class="field full"><label>Nome do operador</label><input name="operator" value="${esc(block.operator || 'Operador')}"></div><div class="form-foot"><button class="primary" type="submit">Salvar operador</button></div></form></article><article class="card"><div class="card-head"><h3>Cópias locais automáticas</h3></div><p class="muted">O sistema guarda até três retratos locais antes de fechamentos e importações. Eles não substituem o backup JSON externo.</p><div class="button-row"><button class="secondary" data-create-snapshot type="button">Criar cópia local agora</button>${snapshots.length ? `<button class="secondary" data-restore-snapshot="${snapshots[0].id}" type="button">Restaurar mais recente</button>` : ''}</div>${snapshots.length ? `<div class="snapshot-list">${snapshots.map(s => `<small>${auditDate(s.at)} · ${esc(s.label || 'Cópia local')}</small>`).join('')}</div>` : ''}</article></section>`;
  }
  function renderHelpV51() {
    return `${renderHelp()}<section class="help-grid" style="margin-top:16px"><article class="card help-card"><h3>7. Histórico e revisões</h3><p>Meses importados e fechados ficam preservados. Para corrigir uma competência, use “Criar revisão”; a versão anterior continua disponível para auditoria.</p></article><article class="card help-card"><h3>8. Cadastro técnico</h3><p>Registre serial, localização, instalação e troca do hidrômetro. Marque imóveis sem acesso, vazios, em reforma e hidrômetros parados.</p></article><article class="card help-card"><h3>9. Financeiro</h3><p>Use pendente, parcial, negociado, vencido, pago ou isento. Informe valor recebido, data, Pix e observação do acordo.</p></article><article class="card help-card"><h3>10. Limites do modo offline</h3><p>Portal do morador com login, sincronização entre aparelhos, envio automático pelo WhatsApp e conciliação bancária exigem um servidor. Esta versão prepara os dados e oferece mensagens manuais, mas não simula segurança inexistente.</p></article></section>`;
  }
  function loadSnapshots() { try { const value = JSON.parse(localStorage.getItem(V51_SNAPSHOT_KEY)); return Array.isArray(value) ? value : []; } catch { return []; } }
  function saveSnapshots(items) { try { localStorage.setItem(V51_SNAPSHOT_KEY, JSON.stringify(items.slice(0, 3))); return true; } catch { return false; } }
  function createSnapshot(label = 'Cópia local') { const snapshots = loadSnapshots(); snapshots.unshift({ id: uid(), at: new Date().toISOString(), label, state: deepClone(state) }); if (!saveSnapshots(snapshots)) return toast('Não foi possível guardar a cópia local. Use o backup JSON.', true); toast('Cópia local criada'); }
  function maybeWeeklySnapshot() { const latest = loadSnapshots()[0]; const week = 7 * 24 * 60 * 60 * 1000; if (!latest || Date.now() - new Date(latest.at).getTime() > week) createSnapshot('Cópia automática semanal'); }
  function restoreSnapshot(id) { const item = loadSnapshots().find(snapshot => snapshot.id === id); if (!item) return toast('Cópia local não encontrada.', true); if (!confirm(`Restaurar a cópia de ${auditDate(item.at)}? Os dados atuais serão substituídos.`)) return; state = normalizeState(item.state); state.blocks.forEach(ensureV51); save('Cópia local restaurada'); render(); }

  function exportHistoryTemplate() {
    const rows = [['Competência','Apt','Responsável','Leitura Anterior','Leitura Atual'], [shiftMonth(currentMonth(), -1),'01','Exemplo de morador',1000,1012]];
    makeCsv(rows, 'modelo-historico-leituras-kr2melo.csv'); toast('Modelo de histórico CSV exportado');
  }
  function chooseHistoryXlsx() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
    input.onchange = async () => { const file = input.files?.[0]; if (!file) return; try {
      const isCsv = /\.csv$/i.test(file.name) || String(file.type || '').includes('csv');
      const rows = isCsv ? parseCsvRows(await file.text()) : parseXlsxRows(await unzipXlsx(await file.arrayBuffer()));
      importHistoricalRows(rows);
    } catch (error) { toast(error.message || 'Não foi possível importar o histórico.', true); } };
    input.click();
  }
  function importHistoricalRows(rows) {
    const block = selected(); if (!block) return;
    const headerIndex = rows.findIndex(row => row.some(value => ['competencia','competência','mes','mês','referencia','referência'].includes(normalizedHeader(value))) && row.some(value => normalizedHeader(value) === 'apt') && row.some(value => normalizedHeader(value) === 'leituraatual'));
    if (headerIndex < 0) throw new Error('Use as colunas Competência, Apt, Leitura Anterior e Leitura Atual. Responsável é opcional.');
    const headers = rows[headerIndex].map(normalizedHeader);
    const monthCol = headers.findIndex(value => ['competencia','mes','referencia'].includes(value)); const aptCol = headers.indexOf('apt'); const previousCol = headers.indexOf('leituraanterior'); const currentCol = headers.indexOf('leituraatual'); const residentCol = headers.indexOf('responsavel');
    const groups = new Map();
    rows.slice(headerIndex + 1).forEach(row => {
      const month = monthFromValue(row[monthCol]); const apt = String(row[aptCol] ?? '').trim(); if (!month || !apt) return;
      const previous = n(String(row[previousCol] ?? 0).replace(',', '.')); const currentRaw = String(row[currentCol] ?? '').replace(',', '.').trim(); if (currentRaw === '') return; const current = Number(currentRaw); if (!Number.isFinite(current)) return;
      const resident = residentCol >= 0 ? String(row[residentCol] ?? '').trim() : ''; if (!groups.has(month)) groups.set(month, []);
      const existing = block.units.find(unit => normalizedHeader(unit.number) === normalizedHeader(apt));
      groups.get(month).push({ id: existing?.id || uid(), number: apt, resident: resident || existing?.resident || '', previous, current, note: 'Importado do histórico', condoRule: existing?.condoRule || {}, meter: existing?.meter || {}, phone: existing?.phone || '' });
    });
    if (!groups.size) throw new Error('Nenhuma leitura histórica válida foi encontrada.');
    let created = 0;
    [...groups.entries()].sort(([a],[b]) => a.localeCompare(b)).forEach(([month, units]) => { createHistoryEntry(block, month, units, 'importado'); created++; });
    audit(block, 'Importação de histórico', `${created} competência(s) importada(s).`, { months: [...groups.keys()] }); save(`${created} mês(es) históricos importados`); render();
  }
  function openManualHistory(baseEntry = null) {
    const block = selected(); if (!block) return;
    const sourceUnits = baseEntry ? entryUnits(baseEntry) : block.units;
    const rows = sourceUnits.map(unit => `<tr><td><strong>${esc(unit.number)}</strong><input type="hidden" name="id_${unit.id}" value="${esc(unit.id)}"><input type="hidden" name="number_${unit.id}" value="${esc(unit.number)}"></td><td><input name="resident_${unit.id}" value="${esc(unit.resident)}"></td><td><input name="previous_${unit.id}" type="number" min="0" step="0.001" value="${n(unit.previous)}"></td><td><input name="current_${unit.id}" type="number" min="0" step="0.001" value="${unit.current === '' ? '' : n(unit.current)}"></td></tr>`).join('');
    const month = baseEntry?.month || shiftMonth(currentMonth(), -1);
    openModal(`<h2>${baseEntry ? 'Criar revisão histórica' : 'Cadastrar mês histórico'}</h2><p>${baseEntry ? 'A versão anterior ficará bloqueada e uma nova versão será criada.' : 'Preencha as leituras antigas. Esta ação não modifica a competência atual.'}</p><div class="form-grid"><div class="field"><label>Competência</label><input name="month" type="month" value="${month}" required></div><div class="field"><label>Motivo / observação</label><input name="reason" value="${esc(baseEntry ? `Revisão de ${monthLabel(baseEntry.month)}` : 'Cadastro manual de histórico')}"></div></div><div class="table-wrap"><table><thead><tr><th>Apto</th><th>Responsável</th><th>Leitura anterior</th><th>Leitura atual</th></tr></thead><tbody>${rows}</tbody></table></div>`, baseEntry ? 'Criar revisão' : 'Salvar histórico', data => {
      const selectedMonth = String(data.month || ''); if (!/^\d{4}-\d{2}$/.test(selectedMonth)) return toast('Informe uma competência válida.', true);
      const records = sourceUnits.map(unit => ({ id: data[`id_${unit.id}`] || unit.id, number: data[`number_${unit.id}`] || unit.number, resident: data[`resident_${unit.id}`] || '', previous: n(data[`previous_${unit.id}`]), current: n(data[`current_${unit.id}`]), note: data.reason || '', condoRule: unit.condoRule || {}, meter: unit.meter || {}, phone: unit.phone || '' }));
      createHistoryEntry(block, selectedMonth, records, baseEntry ? 'revisado' : 'manual', baseEntry ? { revisionOf: baseEntry.id, revisionReason: data.reason || 'Revisão manual' } : { revisionReason: data.reason || '' });
      save(baseEntry ? 'Revisão histórica criada' : 'Histórico manual salvo'); render();
    });
  }
  function estimateReading(unitId) {
    const block = selected(), unit = findUnit(block, unitId); if (!block || !unit) return;
    const average = averageHistoricConsumption(block, unit); if (!average) return toast('Não há histórico suficiente para estimar este apartamento.', true);
    const estimated = Math.round((n(unit.previous) + average) * 1000) / 1000;
    if (!confirm(`Criar leitura estimada para o Apto ${unit.number}?\n\nBase: média de ${fmtM3(average)} m³ dos últimos meses\nLeitura anterior: ${fmtM3(unit.previous)}\nLeitura estimada: ${fmtM3(estimated)}`)) return;
    unit.current = estimated; unit.readingType = 'estimated'; unit.operationalStatus = unit.operationalStatus === 'ocupado' ? 'estimada' : unit.operationalStatus; unit.estimatedReason = unit.estimatedReason || 'Estimativa pela média dos últimos meses'; recalculateUnit(unit, block);
    audit(block, 'Leitura estimada', `Apto ${unit.number}: ${fmtM3(average)} m³ pela média histórica.`, { unitId: unit.id, average, estimated }); save('Leitura estimada registrada'); render();
  }
  function exportHistoryCsv() {
    const block = selected(); if (!block) return;
    const rows = [['Competência','Versão','Origem','Status','Apto','Responsável','Anterior','Atual','Consumo m³','Água','Condomínio','Desconto','Serviço','Outros','Total','Motivo revisão']];
    [...block.history].sort((a,b) => a.month.localeCompare(b.month) || n(a.version)-n(b.version)).forEach(entry => entryCharges(entry).forEach(charge => { const unit = entryUnits(entry).find(u => u.id === charge.unitId || normalizedHeader(u.number) === normalizedHeader(charge.number)) || {}; rows.push([entry.month, entry.version, entry.source, entry.status, charge.number, charge.resident, unit.previous, unit.current, charge.m3, n(charge.water).toFixed(2), n(charge.condo).toFixed(2), n(charge.condoDiscount).toFixed(2), n(charge.service).toFixed(2), n(charge.fine).toFixed(2), n(charge.total).toFixed(2), entry.revisionReason]); }));
    const blob = new Blob(['\ufeff' + rows.map(row => row.map(csvValue).join(';')).join('\n')], { type:'text/csv;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `historico-${normalizedHeader(block.name)}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href),1000); toast('Histórico exportado');
  }
  function exportAuditCsv() {
    const block = selected(); if (!block) return; const rows = [['Data','Operador','Ação','Detalhe'], ...block.audit.map(item => [item.at, item.operator, item.type, item.detail])]; const blob = new Blob(['\ufeff' + rows.map(row => row.map(csvValue).join(';')).join('\n')],{type:'text/csv;charset=utf-8'}); const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`auditoria-${normalizedHeader(block.name)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);toast('Auditoria exportada');
  }
  function openWhatsApp(unitId) {
    const block = selected(), unit = findUnit(block, unitId); if (!block || !unit) return; const raw = String(unit.phone || '').replace(/\D/g,''); if (!raw) return toast(`Cadastre o WhatsApp do Apto ${unit.number} em Unidades e hidrômetros.`, true); const phone = raw.startsWith('55') ? raw : `55${raw}`; const charge = unitCharges(unit, block), pay = paymentInfo(unit, charge.total); const message = `Olá, ${unit.resident || 'morador(a)'}!\n\nCobrança de ${monthLabel(block.month)} · Apto ${unit.number}\nÁgua: ${money.format(charge.water)}\nCondomínio: ${money.format(charge.condo)}${charge.condoDiscount ? `\nDesconto: −${money.format(charge.condoDiscount)}` : ''}\nTotal: ${money.format(charge.total)}\nVencimento: ${dateBr(block.billing.dueDate)}\nStatus: ${paymentLabels[pay.status]}${pay.balance ? `\nEm aberto: ${money.format(pay.balance)}` : ''}`; window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener'); audit(block, 'Mensagem WhatsApp preparada', `Apto ${unit.number} · ${phone}`, { unitId: unit.id }); save();
  }

  const originalRenderV51 = render;
  render = function() {
    state.blocks.forEach(ensureV51);
    refreshPicker();
    const route = currentRoute(), meta = routes[route];
    $('#pageEyebrow').textContent = meta[0]; $('#pageTitle').textContent = meta[1];
    $$('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === route));
    const app = $('#app'), block = selected();
    if (!block && route !== 'ajuda') { app.innerHTML = emptyState(); app.focus({ preventScroll:true }); return; }
    const pages = { dashboard: () => renderDashboard(block), leituras: () => renderReadings(block), regras: () => renderRules(block), fechamento: () => renderClosing(block), historico: () => renderHistoryV51(block), relatorios: () => renderReports(block), financeiro: () => renderFinanceV51(block), recibos: () => renderReceipts(block), boletos: () => renderBills(block), configuracoes: () => renderSettingsV52(block), unidades: () => renderUnitsV51(block), excecoes: () => renderExceptionsV51(block), ajuda: () => renderHelpV51() };
    app.innerHTML = pages[route](); app.focus({ preventScroll:true });
  };

  const originalExecuteMonthlyCloseV51 = executeMonthlyClose;
  executeMonthlyClose = function(block) {
    const month = block?.month, before = block?.history?.length || 0;
    const result = originalExecuteMonthlyCloseV51(block);
    if (block && block.history.length > before && block.month !== month) { const entry = block.history[0]; entry.source = 'fechado'; entry.status = 'bloqueado'; audit(block, 'Fechamento bloqueado', `${monthLabel(month)} fechado como versão ${entry.version}.`, { entryId: entry.id }); createSnapshot(`Antes/depois do fechamento de ${monthLabel(month)}`); save(); }
    return result;
  };

  const originalHandleClickV51 = handleClick;
  handleClick = function(event) {
    const target = event.target;
    if (target.closest('[data-download-initial-template-csv]')) { exportInitialBlockCsv($('#modal input[name="count"]')?.value); return; }
    const tab = target.closest('[data-history-tab]'); if (tab) { historyTabV51 = tab.dataset.historyTab; render(); return; }
    if (target.closest('[data-import-history]')) { chooseHistoryXlsx(); return; }
    if (target.closest('[data-export-history-template]')) { exportHistoryTemplate(); return; }
    if (target.closest('[data-manual-history]')) { openManualHistory(); return; }
    const revise = target.closest('[data-revise-history]'); if (revise) { const entry = selected()?.history.find(item => item.id === revise.dataset.reviseHistory); if (entry) openManualHistory(entry); return; }
    const estimate = target.closest('[data-estimate-unit]'); if (estimate) { estimateReading(estimate.dataset.estimateUnit); return; }
    const whatsapp = target.closest('[data-whatsapp-unit]'); if (whatsapp) { openWhatsApp(whatsapp.dataset.whatsappUnit); return; }
    if (target.closest('[data-export-history]')) { exportHistoryCsv(); return; }
    if (target.closest('[data-export-audit]')) { exportAuditCsv(); return; }
    if (target.closest('[data-create-snapshot]')) { createSnapshot('Cópia manual nas configurações'); return; }
    const restore = target.closest('[data-restore-snapshot]'); if (restore) { restoreSnapshot(restore.dataset.restoreSnapshot); return; }
    return originalHandleClickV51(event);
  };

  const originalHandleChangeV51 = handleChange;
  handleChange = function(event) {
    const target = event.target;
    if (target.matches('[data-history-analysis]')) { historyAnalysisUnitV51 = target.value; render(); return; }
    const tech = target.closest('[data-tech-field]');
    if (tech) { const row = target.closest('[data-tech-row]'), block = selected(), unit = findUnit(block, row?.dataset.techRow); if (!unit) return; const field = target.dataset.techField; if (field.startsWith('meter.')) { unit.meter = normalizeMeter(unit.meter); const key = field.split('.')[1]; unit.meter[key] = key === 'initialReading' ? Math.max(0, n(target.value)) : target.value; unit.meter = normalizeMeter(unit.meter); } else { unit[field] = target.value; if (field === 'operationalStatus' && target.value !== 'estimada' && unit.readingType === 'estimated') unit.readingType = 'real'; }
      audit(block, 'Cadastro técnico atualizado', `Apto ${unit.number} · ${field}`, { unitId: unit.id, field, value: target.value }); save('Cadastro técnico atualizado'); render(); return; }
    const payment = target.closest('[data-payment-plus]');
    if (payment) { const row = target.closest('[data-finance-row]'), block = selected(), unit = findUnit(block, row?.dataset.financeRow); if (!unit) return; const charge = unitCharges(unit, block); unit.payment = normalizePayment(unit.payment, unit); const field = target.dataset.paymentPlus; unit.payment[field] = field === 'received' ? Math.max(0, n(target.value)) : target.value; if (field === 'status' && target.value === 'pago') { unit.payment.received = charge.total; unit.payment.date = unit.payment.date || today(); } if (field === 'status' && target.value === 'isento') { unit.payment.received = 0; unit.payment.date = unit.payment.date || today(); } unit.payment = normalizePayment(unit.payment, unit); unit.paid = unit.payment.status === 'pago'; unit.paymentDate = unit.payment.date || ''; audit(block, 'Financeiro atualizado', `Apto ${unit.number} · ${paymentLabels[unit.payment.status]}`, { unitId: unit.id, status: unit.payment.status, received: unit.payment.received }); save('Status financeiro atualizado'); render(); return; }
    const reading = target.closest('[data-reading-field]');
    if (reading) { const row = target.closest('[data-reading-row]'), block = selected(), unit = findUnit(block, row?.dataset.readingRow); const field = target.dataset.readingField; const old = unit ? unit[field] : ''; const result = originalHandleChangeV51(event); if (unit && unit[field] !== old) { if (field === 'current') unit.readingType = 'real'; audit(block, 'Leitura atualizada', `Apto ${unit.number} · ${field}: ${old} → ${unit[field]}`, { unitId: unit.id, field, old, value: unit[field] }); save(); } return result; }
    const rule = target.closest('[data-rule-field]');
    if (rule) { const row = target.closest('[data-rule-row]'), block = selected(), unit = findUnit(block, row?.dataset.ruleRow); const result = originalHandleChangeV51(event); if (unit) { audit(block, 'Regra de cobrança atualizada', `Apto ${unit.number} · ${rule.dataset.ruleField}`, { unitId: unit.id }); save(); } return result; }
    return originalHandleChangeV51(event);
  };

  const originalHandleSubmitV51 = handleSubmit;
  handleSubmit = function(event) {
    if (event.target.id === 'operatorForm') { event.preventDefault(); const block = selected(), data = Object.fromEntries(new FormData(event.target)); block.operator = String(data.operator || 'Operador'); audit(block, 'Operador alterado', `Responsável atual: ${block.operator}`); save('Operador salvo'); render(); return; }
    if (event.target.id === 'billingForm') { const block = selected(); audit(block, 'Configuração de boletos alterada', `Competência ${monthLabel(block.month)}`); }
    return originalHandleSubmitV51(event);
  };



  // ===================== Reset seguro, sincronização e painel anual =====================
  Object.assign(routes, {
    anual: ['ANÁLISE', 'Dashboard anual'],
    sincronizacao: ['NUVEM', 'Sincronização entre dispositivos']
  });

  function yearOptionsV52(block) {
    const years = new Set([String(block?.month || currentMonth()).slice(0, 4), String(currentMonth()).slice(0, 4)]);
    (block?.history || []).forEach(entry => years.add(String(entry.month || '').slice(0, 4)));
    return [...years].filter(year => /^\d{4}$/.test(year)).sort((a, b) => b.localeCompare(a));
  }
  let annualYearV52 = '';
  function annualRowsV52(block, year) {
    if (!block) return [];
    const byMonth = new Map();
    (block.history || []).forEach(entry => {
      if (!String(entry.month || '').startsWith(`${year}-`)) return;
      const previous = byMonth.get(entry.month);
      if (!previous || n(entry.version) >= n(previous.version)) byMonth.set(entry.month, entry);
    });
    const rows = [...byMonth.values()].map(entry => {
      const charges = entryCharges(entry);
      const total = charges.reduce((sum, charge) => {
        sum.m3 += n(charge.m3); sum.water += n(charge.water); sum.grossCondo += n(charge.grossCondo); sum.discount += n(charge.condoDiscount); sum.condo += n(charge.condo); sum.service += n(charge.service); sum.fine += n(charge.fine); sum.total += n(charge.total);
        return sum;
      }, { m3: 0, water: 0, grossCondo: 0, discount: 0, condo: 0, service: 0, fine: 0, total: 0 });
      return { month: entry.month, source: entry.source || 'fechado', status: entry.status || 'bloqueado', version: n(entry.version) || 1, ...total };
    });
    if (String(block.month || '').startsWith(`${year}-`) && !byMonth.has(block.month)) {
      const current = chargeTotals(block);
      rows.push({ month: block.month, source: 'em_aberto', status: 'atual', version: 0, m3: current.m3, water: current.water, grossCondo: current.grossCondo, discount: current.discount, condo: current.condo, service: current.service, fine: current.fine, total: current.total });
    }
    return rows.sort((a, b) => a.month.localeCompare(b.month));
  }
  function annualTotalsV52(rows) {
    return rows.reduce((sum, row) => {
      ['m3','water','grossCondo','discount','condo','service','fine','total'].forEach(key => sum[key] += n(row[key]));
      return sum;
    }, { m3: 0, water: 0, grossCondo: 0, discount: 0, condo: 0, service: 0, fine: 0, total: 0 });
  }
  function annualSourceV52(source) {
    return ({ fechado: 'Fechado', importado: 'Importado', manual: 'Manual', revisado: 'Revisado', em_aberto: 'Em aberto' })[source] || 'Registro';
  }
  function renderAnnualDashboardV52(block) {
    if (!block) return emptyState();
    const years = yearOptionsV52(block); const year = annualYearV52 && years.includes(annualYearV52) ? annualYearV52 : years[0]; annualYearV52 = year;
    const rows = annualRowsV52(block, year); const totals = annualTotalsV52(rows); const maxM3 = Math.max(1, ...rows.map(row => n(row.m3)));
    const average = rows.length ? totals.m3 / rows.length : 0;
    return `<section class="hero annual-hero"><div><p class="eyebrow">VISÃO CONSOLIDADA</p><h2>Dashboard anual · ${esc(year)}</h2><p>${esc(block.name)} · meses fechados, importados e a competência em aberto.</p></div><div class="button-row"><button class="secondary" data-print-annual type="button">Imprimir A4 retrato</button><button class="primary" data-export-annual type="button">Exportar CSV</button></div></section>
      <section class="card annual-controls no-print"><label class="field"><span>Ano analisado</span><select data-annual-year>${years.map(item => `<option value="${item}" ${item === year ? 'selected' : ''}>${item}</option>`).join('')}</select></label><p class="muted">O mês atual aparece como <strong>Em aberto</strong> enquanto ainda não foi fechado.</p></section>
      <section class="metrics annual-metrics"><article class="metric red"><span class="label">Consumo anual</span><strong>${fmtM3(totals.m3)} m³</strong><small>Média de ${fmtM3(average)} m³ por mês</small></article><article class="metric"><span class="label">Água</span><strong>${money.format(totals.water)}</strong><small>Soma dos rateios individuais</small></article><article class="metric"><span class="label">Cobrança total</span><strong>${money.format(totals.total)}</strong><small>Água, condomínio, serviço e outros</small></article><article class="metric"><span class="label">Descontos</span><strong>${money.format(totals.discount)}</strong><small>Benefícios de condomínio</small></article></section>
      <section class="grid-2 annual-grid"><article class="card"><div class="card-head"><h3>Consumo mês a mês</h3><span class="muted">${rows.length} competência(s)</span></div><div class="annual-bars">${rows.length ? rows.map(row => `<div class="annual-bar-row"><strong>${esc(monthLabel(row.month).slice(0, 3))}</strong><div class="annual-bar"><i style="width:${Math.max(2, n(row.m3) / maxM3 * 100)}%"></i></div><b>${fmtM3(row.m3)} m³</b></div>`).join('') : '<p class="empty">Ainda não há histórico para este ano.</p>'}</div></article><article class="card"><div class="card-head"><h3>Resumo financeiro</h3></div><dl class="annual-summary"><div><dt>Condomínio líquido</dt><dd>${money.format(totals.condo)}</dd></div><div><dt>Serviço de leitura</dt><dd>${money.format(totals.service)}</dd></div><div><dt>Multas / outros</dt><dd>${money.format(totals.fine)}</dd></div><div><dt>Meses registrados</dt><dd>${rows.length}</dd></div></dl></article></section>
      <section class="card annual-table-card"><div class="card-head"><h3>Demonstrativo anual</h3><small class="muted">Valores em reais, por competência.</small></div><div class="table-wrap"><table class="annual-table"><thead><tr><th>Mês</th><th>Status</th><th>Consumo</th><th>Água</th><th>Condomínio</th><th>Desconto</th><th>Serviço</th><th>Outros</th><th>Total</th></tr></thead><tbody>${rows.map(row => `<tr><td><strong>${esc(monthLabel(row.month))}</strong></td><td><span class="pill ${row.source === 'em_aberto' ? 'warn' : 'ok'}">${esc(annualSourceV52(row.source))}</span></td><td>${fmtM3(row.m3)} m³</td><td>${money.format(row.water)}</td><td>${money.format(row.condo)}</td><td class="adjustment">${row.discount ? `− ${money.format(row.discount)}` : '—'}</td><td>${money.format(row.service)}</td><td>${money.format(row.fine)}</td><td><strong>${money.format(row.total)}</strong></td></tr>`).join('') || '<tr><td colspan="9">Nenhuma competência registrada neste ano.</td></tr>'}</tbody><tfoot><tr><td colspan="2">TOTAL DO ANO</td><td>${fmtM3(totals.m3)} m³</td><td>${money.format(totals.water)}</td><td>${money.format(totals.condo)}</td><td>− ${money.format(totals.discount)}</td><td>${money.format(totals.service)}</td><td>${money.format(totals.fine)}</td><td>${money.format(totals.total)}</td></tr></tfoot></table></div></section>`;
  }
  function exportAnnualCsvV52() {
    const block = selected(); if (!block) return;
    const year = annualYearV52 || yearOptionsV52(block)[0] || String(currentMonth()).slice(0, 4); const rows = annualRowsV52(block, year); const totals = annualTotalsV52(rows);
    const csv = [['Ano','Competência','Status','Consumo m³','Água','Condomínio líquido','Desconto','Serviço','Outros','Total'], ...rows.map(row => [year, row.month, annualSourceV52(row.source), row.m3.toFixed(3), row.water.toFixed(2), row.condo.toFixed(2), row.discount.toFixed(2), row.service.toFixed(2), row.fine.toFixed(2), row.total.toFixed(2)]), ['', 'TOTAL', '', totals.m3.toFixed(3), totals.water.toFixed(2), totals.condo.toFixed(2), totals.discount.toFixed(2), totals.service.toFixed(2), totals.fine.toFixed(2), totals.total.toFixed(2)]];
    downloadBlob(new Blob(['\ufeff' + csv.map(row => row.map(csvValue).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' }), `dashboard-anual-${normalizedHeader(block.name)}-${year}.csv`);
    toast('Dashboard anual exportado');
  }
  function printAnnualV52() {
    const content = $('#app')?.innerHTML || ''; if (!content) return;
    const win = window.open('', '_blank');
    if (!win) return toast('Permita pop-ups para imprimir o dashboard anual.', true);
    const cssUrl = new URL('styles.css', location.href).href;
    win.document.open();
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Dashboard anual KR²MELO</title><link rel="stylesheet" href="${cssUrl}"><style>@page{size:A4 portrait;margin:8mm}@media print{.annual-print-document .hero{display:block!important;background:#fff!important;color:#111!important;border:1px solid #111!important;padding:5mm!important}.annual-print-document .hero:after{display:none!important}.annual-print-document .hero p{color:#444!important}.annual-print-document .button-row,.annual-print-document .annual-controls,.annual-print-document .no-print{display:none!important}.annual-print-document .metrics{grid-template-columns:repeat(4,1fr)!important}.annual-print-document .metric{padding:3mm!important}.annual-print-document .annual-table{min-width:0!important;font-size:7pt!important}.annual-print-document .annual-table th,.annual-print-document .annual-table td{padding:1.7mm 1mm!important}.annual-print-document .annual-table-card{margin-top:3mm!important}.annual-print-document .table-wrap{overflow:visible!important}}</style></head><body><main class="annual-print-document">${content}</main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));<\/script></body></html>`);
    win.document.close();
  }
  function syncConfigV52() { return window.KR2Sync?.getConfig?.() || {}; }
  function syncStatusV52(config) {
    if (!window.KR2Sync?.configured?.()) return '<span class="pill warn">Não configurada</span>';
    if (!window.KR2Sync?.connected?.()) return '<span class="pill warn">Conexão configurada · entre na conta</span>';
    return `<span class="pill ok">Conectado como ${esc(config.user?.email || 'usuário')}</span>`;
  }
  function renderSyncV52() {
    const c = syncConfigV52(); const connected = window.KR2Sync?.connected?.();
    return `<section class="hero sync-hero"><div><p class="eyebrow">DADOS NA NUVEM</p><h2>Sincronização computador + celular</h2><p>Use a mesma conta nos dois aparelhos. Leituras e cadastros são sincronizados; fotos permanecem no aparelho onde foram tiradas.</p></div><div>${syncStatusV52(c)}</div></section>
      <section class="grid-2 sync-grid"><article class="card"><div class="card-head"><h3>Conexão Supabase</h3><span class="muted">Uma configuração por dispositivo</span></div><form class="form-grid" id="syncConfigForm"><div class="field full"><label>URL do projeto</label><input name="url" type="url" placeholder="https://seu-projeto.supabase.co" value="${esc(c.url || '')}" required></div><div class="field full"><label>Chave pública anon/publishable</label><input name="anonKey" type="password" autocomplete="off" placeholder="Cole somente a chave pública" value="${esc(c.anonKey || '')}" required><small class="muted">Nunca informe a chave service_role.</small></div><div class="field"><label>E-mail</label><input name="email" type="email" autocomplete="email" value="${esc(c.user?.email || '')}" required></div><div class="field"><label>Senha</label><input name="password" type="password" autocomplete="current-password" placeholder="Sua senha" ${connected ? '' : 'required'}></div><div class="field full"><label><input name="autoSync" type="checkbox" ${c.autoSync ? 'checked' : ''}> Sincronizar automaticamente após salvar uma alteração</label><small class="muted">Em alterações feitas simultaneamente, prevalece a última gravação enviada.</small></div><div class="form-foot"><button class="secondary" data-sync-signup type="button">Criar conta</button><button class="secondary" data-sync-login type="button">Entrar</button><button class="primary" type="submit">Salvar conexão</button></div></form></article>
      <article class="card"><div class="card-head"><h3>Operações de sincronização</h3>${syncStatusV52(c)}</div><div class="notice-list"><div class="info-box">Último envio: <strong>${c.lastPushAt ? auditDate(c.lastPushAt) : '—'}</strong></div><div class="info-box">Último recebimento: <strong>${c.lastPullAt ? auditDate(c.lastPullAt) : '—'}</strong></div><div class="warning-box">Antes de usar outro aparelho pela primeira vez, entre na mesma conta e use <strong>Baixar da nuvem</strong>. Isso evita substituir dados mais novos.</div></div><div class="button-row" style="margin-top:14px"><button class="primary" data-sync-push type="button" ${connected ? '' : 'disabled'}>☁ Enviar para nuvem</button><button class="secondary" data-sync-pull type="button" ${connected ? '' : 'disabled'}>⇩ Baixar da nuvem</button><button class="secondary" data-sync-signout type="button" ${connected ? '' : 'disabled'}>Sair desta conta</button></div><div class="danger-zone" style="margin-top:16px"><strong>Apagar cópia na nuvem</strong><p>Remove a cópia remota desta conta, sem apagar os dados locais.</p><button class="danger" data-sync-delete-cloud type="button" ${connected ? '' : 'disabled'}>Apagar cópia na nuvem</button></div></article></section>
      <section class="card sync-setup-card"><h3>Primeira configuração</h3><ol><li>Crie um projeto Supabase e habilite login por e-mail.</li><li>Execute o arquivo <code>supabase-setup.sql</code> que acompanha esta versão.</li><li>Copie a URL do projeto e a chave pública anon/publishable para a tela acima.</li><li>Crie a conta e entre com o mesmo e-mail e senha no computador e no celular.</li></ol></section>`;
  }

  const renderSettingsV52Base = renderSettingsV51;
  function renderSettingsV52(block) {
    const base = renderSettingsV52Base(block);
    const resetCard = `<article class="card reset-total-card"><div class="card-head"><h3>Reset total do sistema</h3><span class="pill danger">Irreversível</span></div><p class="muted">Baixa um backup automático e apaga leituras, históricos, recibos, fotos locais, regras, condomínios e configurações deste navegador.</p><div class="warning-box">Use apenas para reiniciar completamente o sistema neste aparelho.</div><div class="form-foot"><button class="danger" data-reset-total type="button">Resetar todos os dados</button></div></article>`;
    return base.replace('</section>', `</section>${resetCard}`);
  }

  function countResetV52() {
    const blocks = state.blocks.length; const units = state.blocks.reduce((sum, block) => sum + block.units.length, 0); const history = state.blocks.reduce((sum, block) => sum + block.history.length, 0); const receipts = state.blocks.reduce((sum, block) => sum + block.serviceReceipts.length, 0); const photos = state.blocks.reduce((sum, block) => sum + block.units.filter(unit => unit.photo || unit.photoKey).length, 0);
    return { blocks, units, history, receipts, photos };
  }
  function requestTotalResetV52() {
    const c = countResetV52(); const cloud = window.KR2Sync?.connected?.();
    openModal(`<h2>Reset total do sistema</h2><p>Esta ação apaga os dados deste navegador após baixar um backup automático.</p><div class="danger-zone"><strong>Serão apagados neste aparelho:</strong><ul><li>${c.blocks} condomínio(s)</li><li>${c.units} unidade(s)</li><li>${c.history} histórico(s)</li><li>${c.receipts} recibo(s)</li><li>${c.photos} foto(s) de hidrômetro</li></ul></div><div class="field full"><label>Digite exatamente <strong>RESETAR TODOS OS DADOS</strong></label><input name="confirmation" autocomplete="off" required></div>${cloud ? '<div class="field full"><label><input type="checkbox" name="deleteCloud"> Também apagar minha cópia na nuvem</label><small class="muted">Essa opção apaga o backup remoto da conta conectada.</small></div>' : ''}`, 'Executar reset total', data => {
      if (String(data.confirmation || '').trim() !== 'RESETAR TODOS OS DADOS') return toast('A frase de confirmação não confere. Nenhum dado foi apagado.', true);
      performTotalResetV52(data.deleteCloud === 'on');
    });
  }
  function deleteIndexedDbV52(name) { return new Promise(resolve => { if (!('indexedDB' in window)) return resolve(); const request = indexedDB.deleteDatabase(name); request.onsuccess = request.onerror = request.onblocked = () => resolve(); }); }
  async function performTotalResetV52(deleteCloud) {
    const cloud = window.KR2Sync;
    exportData();
    try { if (deleteCloud && cloud?.connected?.()) await cloud.deleteRemote(); } catch (error) { toast(`Backup baixado, mas a cópia na nuvem não foi apagada: ${error.message}`, true); return; }
    suspendCloudSyncV52 = true;
    await deleteIndexedDbV52('kr2melo-v5-photos');
    localStorage.removeItem(KEY); localStorage.removeItem(V51_SNAPSHOT_KEY); localStorage.removeItem('kr2melo.sync.supabase.v1');
    selectedReadingIds.clear(); closingRefreshAt = ''; annualYearV52 = '';
    state = normalizeState({ blocks: [] });
    suspendCloudSyncV52 = false;
    location.hash = 'dashboard'; render(); toast('Reset total concluído. O backup foi baixado antes da limpeza.');
  }
  async function saveSyncConfigV52(form) {
    const data = Object.fromEntries(new FormData(form));
    window.KR2Sync?.setConfig?.({ url: data.url, anonKey: data.anonKey, autoSync: data.autoSync === 'on' });
    toast('Conexão salva neste dispositivo'); render();
  }
  function getSyncFormV52() { return $('#syncConfigForm'); }
  async function syncLoginV52(signUp = false) {
    const form = getSyncFormV52(); if (!form) return; const data = Object.fromEntries(new FormData(form));
    window.KR2Sync?.setConfig?.({ url: data.url, anonKey: data.anonKey, autoSync: data.autoSync === 'on' });
    try {
      const result = signUp ? await window.KR2Sync.signUp(data.email, data.password) : await window.KR2Sync.signIn(data.email, data.password);
      if (signUp && result?.confirmationRequired) { toast('Conta criada. Confirme o e-mail e depois use “Entrar”.'); render(); return; }
      toast(signUp ? 'Conta criada e conectada' : 'Conta conectada'); render();
    } catch (error) { toast(error.message || 'Não foi possível entrar.', true); }
  }
  async function uploadCloudV52() { try { await window.KR2Sync.pushState(deepClone(state)); toast('Dados enviados para a nuvem'); render(); } catch (error) { toast(error.message || 'Falha no envio.', true); } }
  async function downloadCloudV52() {
    try {
      const remote = await window.KR2Sync.pullState();
      if (!remote || !Array.isArray(remote.blocks)) { toast('Nenhuma cópia encontrada para esta conta.'); render(); return; }
      if (state.blocks.length && !confirm('Baixar a nuvem substituirá os dados locais deste aparelho. Você já possui backup local?')) { render(); return; }
      suspendCloudSyncV52 = true; state = normalizeState(remote); state.blocks.forEach(ensureV51); localStorage.setItem(KEY, JSON.stringify(state)); suspendCloudSyncV52 = false; selectedReadingIds.clear(); toast('Dados baixados da nuvem'); render();
    } catch (error) { toast(error.message || 'Falha ao baixar dados.', true); }
  }
  async function bootstrapCloudV52() {
    if (!window.KR2Sync?.connected?.() || state.blocks.length) return;
    try {
      const remote = await window.KR2Sync.pullState();
      if (remote && Array.isArray(remote.blocks) && remote.blocks.length) { suspendCloudSyncV52 = true; state = normalizeState(remote); state.blocks.forEach(ensureV51); localStorage.setItem(KEY, JSON.stringify(state)); suspendCloudSyncV52 = false; render(); toast('Dados sincronizados da nuvem'); }
    } catch { /* o uso offline continua disponível */ }
  }

  const renderV52Base = render;
  render = function() {
    state.blocks.forEach(ensureV51);
    refreshPicker();
    const route = currentRoute(), meta = routes[route];
    $('#pageEyebrow').textContent = meta[0]; $('#pageTitle').textContent = meta[1];
    $$('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === route));
    const app = $('#app'), block = selected();
    if (!block && !['ajuda','sincronizacao'].includes(route)) { app.innerHTML = emptyState(); app.focus({ preventScroll: true }); return; }
    const pages = { dashboard: () => renderDashboard(block), leituras: () => renderReadings(block), regras: () => renderRules(block), fechamento: () => renderClosing(block), historico: () => renderHistoryV51(block), relatorios: () => renderReports(block), financeiro: () => renderFinanceV51(block), recibos: () => renderReceipts(block), boletos: () => renderBills(block), configuracoes: () => renderSettingsV52(block), unidades: () => renderUnitsV51(block), excecoes: () => renderExceptionsV51(block), ajuda: () => renderHelpV51(), anual: () => renderAnnualDashboardV52(block), sincronizacao: () => renderSyncV52() };
    app.innerHTML = pages[route](); app.focus({ preventScroll: true });
  };

  const handleClickV52Base = handleClick;
  handleClick = async function(event) {
    const target = event.target;
    if (target.closest('[data-reset-total]')) { requestTotalResetV52(); return; }
    if (target.closest('[data-print-annual]')) { printAnnualV52(); return; }
    if (target.closest('[data-export-annual]')) { exportAnnualCsvV52(); return; }
    if (target.closest('[data-sync-signup]')) { await syncLoginV52(true); return; }
    if (target.closest('[data-sync-login]')) { await syncLoginV52(false); return; }
    if (target.closest('[data-sync-push]')) { await uploadCloudV52(); return; }
    if (target.closest('[data-sync-pull]')) { await downloadCloudV52(); return; }
    if (target.closest('[data-sync-signout]')) { window.KR2Sync?.signOut?.(); toast('Sessão removida deste dispositivo'); render(); return; }
    if (target.closest('[data-sync-delete-cloud]')) { if (!confirm('Apagar a cópia na nuvem? Os dados locais não serão apagados.')) return; try { await window.KR2Sync.deleteRemote(); toast('Cópia na nuvem apagada'); render(); } catch (error) { toast(error.message || 'Não foi possível apagar a cópia.', true); } return; }
    return handleClickV52Base(event);
  };
  const handleChangeV52Base = handleChange;
  handleChange = function(event) {
    if (event.target.matches('[data-annual-year]')) { annualYearV52 = event.target.value; render(); return; }
    return handleChangeV52Base(event);
  };
  const handleSubmitV52Base = handleSubmit;
  handleSubmit = async function(event) {
    if (event.target.id === 'syncConfigForm') { event.preventDefault(); await saveSyncConfigV52(event.target); return; }
    return handleSubmitV52Base(event);
  };



  // ===================== Relatórios históricos e recibos A4 retrato =====================
  // O seletor abaixo usa exatamente o retrato financeiro salvo no fechamento mensal.
  // Nenhum valor do mês atual é recalculado quando uma competência histórica é escolhida.
  const reportPeriodByBlockV521 = new Map();

  function selectedHistoricalReportV521(block) {
    const id = reportPeriodByBlockV521.get(block?.id || '') || '';
    return (block?.history || []).find(entry => entry.id === id) || null;
  }

  function reportContextV521(block) {
    const entry = selectedHistoricalReportV521(block);
    const archived = Boolean(entry);
    const period = archived ? entry.month : block.month;
    const billing = archived ? normalizeBilling(entry.billing || {}, period) : block.billing;
    const tariff = archived ? { ...DEFAULT_TARIFF, ...(entry.tariff || {}) } : block.tariff;
    const units = archived ? entryUnits(entry) : block.units;
    const snapshot = { month: period, billing, tariff, units };
    const snapshotCharges = archived ? entryCharges(entry) : [];
    const chargeById = new Map();
    snapshotCharges.forEach(charge => {
      if (charge?.unitId) chargeById.set(String(charge.unitId), charge);
      if (charge?.number) chargeById.set(`number:${normalizedHeader(charge.number)}`, charge);
    });
    const rows = units.map(unit => {
      const saved = chargeById.get(String(unit.id)) || chargeById.get(`number:${normalizedHeader(unit.number)}`);
      const calculated = saved || unitCharges(unit, snapshot);
      return {
        number: String(saved?.number || unit.number || '—'),
        resident: String(saved?.resident || unit.resident || '—'),
        previous: unit.previous,
        current: unit.current,
        m3: n(saved?.m3 ?? unit.m3),
        water: n(saved?.water ?? calculated.water),
        grossCondo: n(saved?.grossCondo ?? calculated.grossCondo),
        condoDiscount: n(saved?.condoDiscount ?? calculated.condoDiscount),
        condo: n(saved?.condo ?? calculated.condo),
        service: n(saved?.service ?? calculated.service),
        extraCharge: n(saved?.extraCharge ?? calculated.extraCharge),
        fine: n(saved?.fine ?? calculated.fine),
        total: n(saved?.total ?? calculated.total),
        paid: Boolean(saved?.paid ?? unit.paid),
        paymentDate: String(saved?.paymentDate ?? unit.paymentDate ?? '')
      };
    });
    const totals = rows.reduce((sum, row) => {
      sum.m3 += row.m3; sum.water += row.water; sum.grossCondo += row.grossCondo;
      sum.discount += row.condoDiscount; sum.condo += row.condo; sum.service += row.service; sum.extraCharge += row.extraCharge;
      sum.fine += row.fine; sum.total += row.total;
      if (row.paid) { sum.paid += row.total; sum.paidCount++; }
      return sum;
    }, { m3: 0, water: 0, grossCondo: 0, discount: 0, condo: 0, service: 0, extraCharge: 0, fine: 0, total: 0, paid: 0, paidCount: 0 });
    const bill = n(billing?.waterBill);
    const diff = totals.water - bill;
    return { entry, archived, period, billing, rows, totals, bill, diff, coverage: bill ? totals.water / bill * 100 : 0 };
  }

  function reportPeriodOptionsV521(block, selectedEntry) {
    const entries = [...(block.history || [])].sort((a, b) => b.month.localeCompare(a.month) || n(b.version) - n(a.version));
    const current = `<option value="" ${selectedEntry ? '' : 'selected'}>Competência atual · ${esc(monthLabel(block.month))}</option>`;
    const historic = entries.map(entry => `<option value="${esc(entry.id)}" ${selectedEntry?.id === entry.id ? 'selected' : ''}>Histórico · ${esc(monthLabel(entry.month))} · ${esc(entryTitle(entry))}</option>`).join('');
    return current + historic;
  }

  // Atalhos visíveis para que o operador encontre facilmente os relatórios salvos.
  function reportPeriodQuickListV522(block, selectedEntry) {
    const entries = [...(block.history || [])].sort((a, b) => b.month.localeCompare(a.month) || n(b.version) - n(a.version));
    const currentActive = selectedEntry ? '' : ' active';
    const current = `<button class="report-period-choice${currentActive}" data-report-period-open="" type="button"><span class="report-choice-tag">ATUAL</span><strong>${esc(monthLabel(block.month))}</strong><small>Competência em edição</small></button>`;
    const history = entries.map(entry => {
      const active = selectedEntry?.id === entry.id ? ' active' : '';
      const closed = entry.closedAt ? auditDate(entry.closedAt) : 'data não registrada';
      return `<button class="report-period-choice${active}" data-report-period-open="${esc(entry.id)}" type="button"><span class="report-choice-tag">HISTÓRICO</span><strong>${esc(monthLabel(entry.month))}</strong><small>${esc(entryTitle(entry))} · fechado em ${esc(closed)}</small></button>`;
    }).join('');
    const empty = entries.length ? '' : `<div class="report-history-empty"><strong>Nenhum mês fechado ainda.</strong><span>Ao confirmar o fechamento mensal, o período aparecerá aqui para impressão.</span></div>`;
    return `<section class="report-period-picker no-print"><div class="report-period-picker-head"><div><p class="eyebrow">ESCOLHA O PERÍODO</p><h3>Relatórios salvos do bloco</h3><p>Selecione a competência atual ou abra um mês já encerrado no Histórico mensal.</p></div><label class="field report-period-field"><span>Período do relatório</span><select data-report-period-select aria-label="Período do relatório">${reportPeriodOptionsV521(block, selectedEntry)}</select></label></div><div class="report-period-choices">${current}${history}</div>${empty}</section>`;
  }

  function reportCoverageCardV521(context) {
    const stateClass = !context.bill ? 'neutral' : context.diff >= 0 ? 'ok' : 'bad';
    const status = !context.bill ? 'Conta global não informada' : context.diff >= 0 ? 'Conta de água coberta' : 'Conta de água não coberta';
    return `<section class="card water-rate-card report-coverage-static"><div class="card-head"><div><h3>Rateio da conta global de água</h3><span class="muted">${context.archived ? 'Valores preservados no fechamento do período selecionado.' : 'Condomínio, serviço, multas e descontos não entram nesta conferência.'}</span></div><span class="pill ${context.diff >= 0 && context.bill ? 'ok' : context.bill ? 'danger' : 'info'}">${status}</span></div><div class="water-rate-grid"><div><small>Conta global</small><strong>${money.format(context.bill)}</strong></div><div><small>Soma da água</small><strong>${money.format(context.totals.water)}</strong></div><div><small>${context.diff >= 0 ? 'Saldo' : 'Falta'}</small><strong class="${stateClass}">${money.format(Math.abs(context.diff))}</strong></div><div><small>Cobertura</small><strong class="${stateClass}">${context.bill ? `${context.coverage.toFixed(1)}%` : '0,0%'}</strong></div></div></section>`;
  }

  renderReports = function(block) {
    const context = reportContextV521(block);
    const { entry, archived, period, billing, rows, totals } = context;
    const periodLabel = monthLabel(period);
    const origin = archived ? `${entryTitle(entry)} · fechado em ${entry.closedAt ? auditDate(entry.closedAt) : 'data não registrada'}` : 'Competência em edição · valores atuais do bloco';
    const tableRows = rows.map(row => `<tr><td><strong>${esc(row.number)}</strong></td><td>${esc(row.resident || '—')}</td><td>${fmtM3(row.m3)} m³</td><td>${money.format(row.water)}</td><td>${money.format(row.condo)}</td><td class="adjustment">${row.condoDiscount ? `− ${money.format(row.condoDiscount)}` : '—'}</td><td>${money.format(row.service)}</td><td>${money.format(row.fine)}</td><td class="value">${money.format(row.total)}</td></tr>`).join('') || '<tr><td colspan="9">Nenhum apartamento disponível neste período.</td></tr>';
    return `${reportPeriodQuickListV522(block, entry)}<section class="monthly-report" id="monthlyReportPrint" data-report-period="${esc(period)}" data-report-archived="${archived ? 'true' : 'false'}"><div class="section-actions no-print"><div><h2>Relatório mensal</h2><span class="muted">Período aberto: <strong>${esc(periodLabel)}</strong></span></div><div class="button-row"><button class="secondary" data-export-report-csv type="button">Exportar CSV</button><button class="primary" data-print-report type="button">Imprimir A4 retrato</button></div></div><div class="report-context-note ${archived ? 'archived' : 'current'}"><strong>${archived ? 'Relatório do histórico mensal' : 'Relatório da competência atual'}</strong><span>${esc(origin)}</span></div><header class="report-print-header"><div><p class="eyebrow">KR²MELO · GESTÃO DE ÁGUA</p><h2>Relatório mensal</h2><p>${esc(block.name)} · Referência: <strong>${esc(periodLabel)}</strong></p></div><div class="report-print-meta"><span>Unidades: <b>${rows.length}</b></span><span>${archived ? 'Fechado em' : 'Emitido em'}: <b>${archived && entry?.closedAt ? auditDate(entry.closedAt) : dateBr(today())}</b></span></div></header><div class="report-coverage">${reportCoverageCardV521(context)}</div><section class="finance-summary report-finance-summary"><div><small>Água</small><strong>${money.format(totals.water)}</strong></div><div><small>Condomínio bruto</small><strong>${money.format(totals.grossCondo)}</strong></div><div><small>Isenções / descontos</small><strong>${money.format(totals.discount)}</strong></div><div><small>Condomínio líquido</small><strong>${money.format(totals.condo)}</strong></div><div><small>Serviço + outros</small><strong>${money.format(totals.service + totals.fine)}</strong></div><div><small>Total mensal</small><strong>${money.format(totals.total)}</strong></div></section><div class="report-dates"><span><b>Leitura anterior:</b> ${dateBr(billing.previousReadDate)}</span><span><b>Leitura atual:</b> ${dateBr(billing.currentReadDate)}</span><span><b>Vencimento:</b> ${dateBr(billing.dueDate)}</span><span><b>Próxima leitura:</b> ${dateBr(billing.nextReadDate)}</span></div><div class="table-wrap report-table-wrap"><table class="monthly-report-table"><thead><tr><th>Apto</th><th>Responsável</th><th>Consumo</th><th>Água</th><th>Condomínio</th><th>Desconto</th><th>Serviço</th><th>Outros</th><th>Total</th></tr></thead><tbody>${tableRows}</tbody><tfoot><tr><td colspan="3">TOTAL</td><td>${money.format(totals.water)}</td><td>${money.format(totals.condo)}</td><td>− ${money.format(totals.discount)}</td><td>${money.format(totals.service)}</td><td>${money.format(totals.fine)}</td><td>${money.format(totals.total)}</td></tr></tfoot></table></div><footer class="report-print-footer">KR²MELO · ${archived ? 'Relatório histórico preservado no fechamento mensal' : 'Relatório para conferência do síndico'}</footer></section>`;
  };

  exportReportCsv = function() {
    const block = selected(); if (!block) return;
    const context = reportContextV521(block);
    const rows = [['Bloco', block.name], ['Competência', context.period], ['Origem', context.archived ? 'Histórico mensal' : 'Competência atual'], ['Vencimento', context.billing.dueDate], [], ['Apto', 'Responsável', 'Consumo m³', 'Água', 'Condomínio', 'Desconto condomínio', 'Serviço', 'Multas/Outros', 'Total', 'Pago', 'Data pagamento']];
    context.rows.forEach(row => rows.push([row.number, row.resident, row.m3, row.water.toFixed(2), row.condo.toFixed(2), row.condoDiscount.toFixed(2), row.service.toFixed(2), row.fine.toFixed(2), row.total.toFixed(2), row.paid ? 'Sim' : 'Não', row.paymentDate]));
    rows.push(['', 'TOTAL', context.totals.m3.toFixed(3), context.totals.water.toFixed(2), context.totals.condo.toFixed(2), context.totals.discount.toFixed(2), context.totals.service.toFixed(2), context.totals.fine.toFixed(2), context.totals.total.toFixed(2)]);
    const blob = new Blob(['\ufeff' + rows.map(row => row.map(csvValue).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `relatorio-${normalizedHeader(block.name)}-${context.period}${context.archived ? '-historico' : ''}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); toast('Relatório CSV exportado');
  };

  printMonthlyReport = function() {
    const report = $('#monthlyReportPrint');
    if (!report) return toast('Relatório não disponível para impressão.', true);
    const archived = report.dataset.reportArchived === 'true';
    const win = window.open('', '_blank');
    if (!win) return toast('Permita pop-ups para imprimir o relatório.', true);
    const css = new URL('styles.css', location.href).href;
    const title = archived ? 'Relatório histórico KR²MELO' : 'Relatório mensal KR²MELO';
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><base href="${esc(location.href)}"><title>${title}</title><link rel="stylesheet" href="${css}"><style>@page{size:A4 portrait;margin:8mm}body{margin:0;padding:0;background:#fff}.print-toolbar{position:sticky;top:0;z-index:5;background:#111;color:#fff;padding:10px;display:flex;align-items:center;justify-content:center;gap:12px;font-family:Arial,sans-serif}.print-toolbar button{background:#ff1100;color:#fff;border:0;border-radius:7px;padding:9px 15px;font-weight:800;cursor:pointer}@media print{.print-toolbar,.report-period-controls,.report-context-note{display:none!important}body{padding:0!important}.monthly-report{width:194mm!important;min-height:281mm!important;margin:0!important}}</style></head><body><div class="print-toolbar"><span>${archived ? 'Relatório histórico preservado, configurado para A4 em retrato.' : 'Relatório configurado para uma página A4 em retrato.'}</span><button onclick="window.print()">Imprimir agora</button></div>${report.outerHTML}</body></html>`);
    win.document.close();
  };

  function printReceiptHalfPortraitV521(title, receiptMarkup) {
    const win = window.open('', '_blank');
    if (!win) return toast('Permita pop-ups para imprimir o recibo.', true);
    const css = new URL('styles.css', location.href).href;
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><base href="${esc(location.href)}"><title>${esc(title)}</title><link rel="stylesheet" href="${css}"><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,sans-serif}.receipt-toolbar{position:sticky;top:0;z-index:5;background:#111;color:#fff;padding:10px;display:flex;gap:12px;align-items:center;justify-content:center;font-family:Arial,sans-serif}.receipt-toolbar button{background:#ff1100;color:#fff;border:0;border-radius:7px;padding:9px 15px;font-weight:800;cursor:pointer}.receipt-half-page{width:190mm;height:138.5mm;margin:0 auto;display:block;page-break-inside:avoid}.receipt-half-page .receipt-preview{width:100%;height:100%;min-height:0!important;margin:0!important;padding:10mm 13mm 8mm!important;border:1.3pt solid #111!important;box-shadow:none!important;display:flex!important;flex-direction:column!important;background:#fff!important}.receipt-half-page .receipt-preview h2{font-size:17pt!important;letter-spacing:.12em!important;margin:0 0 7mm!important;text-align:center}.receipt-half-page .receipt-preview p{font-size:10.5pt!important;line-height:1.48!important;margin:0 0 4mm!important}.receipt-half-page .receipt-preview footer{margin-top:auto!important;text-align:center!important}.receipt-half-page .receipt-signature{display:block!important;max-height:22mm!important;max-width:65mm!important;object-fit:contain!important;margin:2mm auto 1mm!important}.receipt-half-page .receipt-preview footer div{border-bottom:1pt solid #111!important;max-width:82mm!important;margin:0 auto 2mm!important}.receipt-half-page .receipt-preview footer b{font-size:9.5pt!important}.receipt-half-page .receipt-preview footer small{font-size:8pt!important}@media print{.receipt-toolbar{display:none!important}html,body{width:100%!important;height:auto!important;background:#fff!important}.receipt-half-page{width:190mm!important;height:138.5mm!important;margin:0!important;break-inside:avoid!important;page-break-inside:avoid!important}.receipt-half-page .receipt-preview{width:100%!important;height:138.5mm!important;min-height:0!important;overflow:hidden!important;color:#111!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}</style></head><body><div class="receipt-toolbar"><span>Recibo em meia folha A4 · retrato</span><button onclick="window.print()">Imprimir agora</button></div><main class="receipt-half-page">${receiptMarkup}</main></body></html>`);
    win.document.close();
  }

  function printPaymentReceiptPortraitV521(id) {
    const block = selected(); const unit = findUnit(block, id); if (!unit) return;
    const c = unitCharges(unit, block);
    printReceiptHalfPortraitV521(`Recibo Apto ${unit.number}`, `<article class="receipt-preview"><h2>RECIBO DE PAGAMENTO</h2><p>Recebemos de <strong>${esc(unit.resident || '—')}</strong>, referente ao apartamento <strong>${esc(unit.number)}</strong>, o valor de <strong>${money.format(c.total)}</strong> referente a água, condomínio e demais lançamentos de ${esc(monthLabel(block.month))}.</p><p>Pagamento registrado em: <strong>${dateBr(unit.paymentDate || today())}</strong>.</p><footer><img class="receipt-signature" src="assets/assinatura.png" alt="Assinatura"><div></div><b>${esc(block.manager || 'Síndico responsável')}</b></footer></article>`);
  }

  const handleChangeV521Base = handleChange;
  handleChange = function(event) {
    if (event.target.matches('[data-report-period-select]')) {
      const block = selected();
      if (!block) return;
      const id = String(event.target.value || '');
      if (id) reportPeriodByBlockV521.set(block.id, id); else reportPeriodByBlockV521.delete(block.id);
      render();
      return;
    }
    return handleChangeV521Base(event);
  };

  const handleClickV521Base = handleClick;
  handleClick = async function(event) {
    const target = event.target;
    if (target.closest('[data-print-service-receipt]')) {
      printReceiptHalfPortraitV521('Recibo KR²MELO', $('#receiptPreview')?.innerHTML || '');
      return;
    }
    const paymentReceipt = target.closest('[data-payment-receipt]');
    if (paymentReceipt) {
      printPaymentReceiptPortraitV521(paymentReceipt.dataset.paymentReceipt);
      return;
    }
    return handleClickV521Base(event);
  };

  const handleClickV522Base = handleClick;
  handleClick = async function(event) {
    const periodButton = event.target.closest('[data-report-period-open]');
    if (periodButton) {
      const block = selected();
      if (!block) return;
      const id = String(periodButton.dataset.reportPeriodOpen || '');
      if (id) reportPeriodByBlockV521.set(block.id, id); else reportPeriodByBlockV521.delete(block.id);
      render();
      return;
    }
    return handleClickV522Base(event);
  };

  // ===================== Impressão, recibos, observações e conflitos =====================
  const VERSION_LABEL = `v${APP_VERSION}`;

  function versionText(text = '') {
    return String(text).replace(/v5\.\d+(?:\.\d+)?/g, VERSION_LABEL);
  }
  function refreshVersionLabelsV53() {
    document.title = `KR²MELO · Gestão de Água ${VERSION_LABEL}`;
    const brand = $('.brand small');
    if (brand) brand.textContent = `Gestão de água · ${VERSION_LABEL}`;
  }
  function ensureV53(block) {
    if (!block) return;
    block.units = (block.units || []).map(unit => {
      if (!('billingNote' in unit)) unit.billingNote = '';
      return unit;
    });
    block.billing = normalizeBilling(block.billing || {}, block.month || currentMonth());
  }
  const normalizeUnitV53Base = normalizeUnit;
  normalizeUnit = function(raw, index = 0) {
    const unit = normalizeUnitV53Base(raw, index);
    unit.billingNote = String(raw?.billingNote || '');
    return unit;
  };
  const normalizeBillingV53Base = normalizeBilling;
  normalizeBilling = function(raw, month) {
    const billing = normalizeBillingV53Base(raw, month);
    billing.notes = String(raw?.notes ?? billing.notes ?? '');
    return billing;
  };

  function cleanNoteLines(value, limit = 5) {
    return String(value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, limit);
  }
  function billingNoteLines(unit, billing) {
    const global = cleanNoteLines(billing?.notes, 4);
    const individual = cleanNoteLines(unit?.billingNote, 3);
    return [...global, ...individual].slice(0, 6);
  }
  function noteParagraphs(lines) {
    return lines.length ? lines.map(note => `<p>${esc(note)}</p>`).join('') : '<p>Sem observações adicionais.</p>';
  }

  const onesV53 = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const teensV53 = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const tensV53 = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const hundredsV53 = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  function intToWordsV53(value) {
    const num = Math.trunc(Math.max(0, Number(value) || 0));
    if (num === 0) return 'zero';
    if (num === 100) return 'cem';
    if (num < 10) return onesV53[num];
    if (num < 20) return teensV53[num - 10];
    if (num < 100) {
      const ten = Math.floor(num / 10), one = num % 10;
      return tensV53[ten] + (one ? ` e ${onesV53[one]}` : '');
    }
    if (num < 1000) {
      const hundred = Math.floor(num / 100), rest = num % 100;
      return hundredsV53[hundred] + (rest ? ` e ${intToWordsV53(rest)}` : '');
    }
    if (num < 1000000) {
      const thousand = Math.floor(num / 1000), rest = num % 1000;
      const prefix = thousand === 1 ? 'mil' : `${intToWordsV53(thousand)} mil`;
      return prefix + (rest ? `${rest < 100 ? ' e ' : ' '}${intToWordsV53(rest)}` : '');
    }
    return String(num);
  }
  function amountToWordsV53(value) {
    const centsTotal = Math.round(Math.max(0, n(value)) * 100);
    const reais = Math.floor(centsTotal / 100);
    const cents = centsTotal % 100;
    const parts = [];
    if (reais) parts.push(`${intToWordsV53(reais)} ${reais === 1 ? 'real' : 'reais'}`);
    if (cents) parts.push(`${intToWordsV53(cents)} ${cents === 1 ? 'centavo' : 'centavos'}`);
    return parts.length ? parts.join(' e ') : 'zero real';
  }
  function receiptDataV53(data) {
    const amount = n(data?.amount);
    return { ...(data || {}), amount, amountWords: amountToWordsV53(amount) };
  }

  receiptDraft = function(block) {
    const base = { payer: block.name, service: `Serviço de leitura de hidrômetros — ${monthLabel(block.month)}`, amount: n(block.billing?.serviceFee), issueDate: today(), city: '', issuer: block.manager || 'KR²MELO', phone: '', notes: '' , ...(block.serviceReceiptDraft || {}) };
    return receiptDataV53(base);
  };
  receiptHtml = function(data) {
    const receipt = receiptDataV53(data);
    const notes = cleanNoteLines(receipt.notes, 4);
    return `<article class="receipt-preview receipt-preview-branded"><header class="receipt-brand"><img src="assets/logo.png" alt="KR²MELO"><div><p class="eyebrow">KR²MELO · GESTÃO DE ÁGUA</p><h2>RECIBO</h2></div></header><p>Recebi de <strong>${esc(receipt.payer || '—')}</strong> a quantia de <strong>${money.format(n(receipt.amount))}</strong> (<strong>${esc(receipt.amountWords)}</strong>), referente a <strong>${esc(receipt.service || '—')}</strong>.</p>${notes.map(note => `<p>${esc(note)}</p>`).join('')}<p>${esc(receipt.city || '________________')}, ${dateBr(receipt.issueDate)}</p><footer><img class="receipt-signature" src="assets/assinatura.png" alt="Assinatura"><div></div><b>${esc(receipt.issuer || 'KR²MELO')}</b><br><small>${esc(receipt.phone || '')}</small></footer></article>`;
  };
  renderReceipts = function(block) {
    const draft = receiptDraft(block);
    return `<section class="receipt-layout"><form class="card form-grid" id="receiptForm"><div class="card-head field full"><h3>Recibo de serviço</h3></div><div class="field full"><label>Recebi de</label><input name="payer" value="${esc(draft.payer)}"></div><div class="field"><label>Valor (R$)</label><input name="amount" type="number" min="0" step="0.01" value="${draft.amount || ''}"></div><div class="field"><label>Valor por extenso automático</label><input name="amountWords" value="${esc(draft.amountWords)}" readonly></div><div class="field full"><label>Referente a</label><input name="service" value="${esc(draft.service)}"></div><div class="field"><label>Data</label><input name="issueDate" type="date" value="${esc(draft.issueDate)}"></div><div class="field"><label>Cidade</label><input name="city" value="${esc(draft.city)}"></div><div class="field"><label>Nome para assinatura</label><input name="issuer" value="${esc(draft.issuer)}"></div><div class="field"><label>Telefone</label><input name="phone" value="${esc(draft.phone)}"></div><div class="field full"><label>Observação</label><textarea name="notes" rows="3">${esc(draft.notes)}</textarea></div><div class="form-foot"><button class="secondary" data-clear-receipt type="button">Limpar</button><button class="primary" type="submit">Salvar recibo</button></div></form><section class="card"><div class="card-head"><h3>Pré-visualização</h3><button class="secondary" data-print-service-receipt type="button">Imprimir meia A4 retrato</button></div><div id="receiptPreview">${receiptHtml(draft)}</div></section></section><section class="card"><div class="card-head"><h3>Recibos emitidos</h3></div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Recebi de</th><th>Referente</th><th>Valor</th><th></th></tr></thead><tbody>${(block.serviceReceipts || []).slice(0, 20).map(item => `<tr><td>${dateBr(item.issueDate)}</td><td>${esc(item.payer)}</td><td>${esc(item.service)}</td><td>${money.format(n(item.amount))}</td><td><button class="danger" data-delete-service-receipt="${item.id}" type="button">Excluir</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhum recibo salvo.</td></tr>'}</tbody></table></div></section>`;
  };

  billCopy = function(unit, block, copy) {
    const c = unitCharges(unit, block); const billing = block.billing; const managerCopy = copy === 'SÍNDICO';
    const ruleText = adjustmentText(c);
    const discountLine = c.condoDiscount ? `<div class="bill-charge-line bill-adjustment"><span>${esc(ruleText || 'Desconto de condomínio')}</span><b>− ${money.format(c.condoDiscount)}</b></div>` : '';
    const serviceLine = c.service ? `<div class="bill-charge-line"><span>${esc(billing.serviceLabel)}</span><b>${money.format(c.service)}</b></div>` : '';
    const extraLine = c.extraCharge ? `<div class="bill-charge-line"><span>${esc(unit.extraChargeLabel || 'VALOR ADICIONAL')}</span><b>${money.format(c.extraCharge)}</b></div>` : '';
    const notes = billingNoteLines(unit, billing);
    const footer = managerCopy ? `<footer class="bill-signature"><div></div><small>RECEBIDO POR / ASSINATURA DO MORADOR</small></footer>` : `<section class="bill-notes"><strong>OBS.</strong><div>${noteParagraphs(notes)}</div></section>`;
    return `<article class="bill-copy ${managerCopy ? 'bill-copy-manager' : 'bill-copy-resident'}"><div class="bill-copy-tag">VIA DO ${copy}</div><header class="bill-head"><strong>${esc(unit.number)}</strong><b>Vencimento · ${dateBr(billing.dueDate)}</b></header><div class="bill-party"><span>RESPONSÁVEL</span><strong>${esc(unit.resident || '—')}</strong><small>REFERÊNCIA · ${monthLabel(block.month).toUpperCase().replace(' DE ', ' / ')}</small></div><section class="bill-reading-grid"><div><span>LEITURA ANTERIOR</span><small>${dateBr(billing.previousReadDate)}</small><b>${fmtInt(unit.previous)}</b></div><div><span>LEITURA ATUAL</span><small>${dateBr(billing.currentReadDate)}</small><b>${unit.current === '' ? '—' : fmtInt(unit.current)}</b></div><div><span>CONSUMO</span><small>METROS CÚBICOS</small><b>${fmtM3(unit.m3)} m³</b></div></section><section class="bill-charge-list"><div class="bill-charge-line"><span>ÁGUA</span><b>${money.format(c.water)}</b></div>${discountLine}<div class="bill-charge-line bill-condo-net"><span>CONDOMÍNIO A PAGAR</span><b>${money.format(c.condo)}</b></div>${serviceLine}${extraLine}<div class="bill-charge-line"><span>${esc(unit.billingFineLabel || 'MULTAS / OUTROS')}</span><b>${money.format(c.fine)}</b></div></section><div class="bill-total"><strong>TOTAL</strong><span>VALOR A PAGAR</span><b>${money.format(c.total)}</b></div>${footer}</article>`;
  };
  renderBills = function(block) {
    ensureV53(block);
    const groups = chunk(block.units, 16);
    const content = groups.map((units, index) => `<div class="bill-group-title no-print">Bloco ${blockLetter(index)} · ${units.length} apartamento(s)</div>${coverSheet(block, units, index)}${billPages(block, units, index)}`).join('');
    const b = block.billing;
    const unitNotes = `<section class="card billing-unit-notes"><div class="card-head"><h3>Observações individuais nos boletos</h3><span class="muted">Aparecem somente no boleto do respectivo apartamento.</span></div><div class="table-wrap"><table><thead><tr><th>Apto</th><th>Responsável</th><th>Observação individual</th></tr></thead><tbody>${block.units.map(unit => `<tr><td><strong>${esc(unit.number)}</strong></td><td>${esc(unit.resident || '—')}</td><td><textarea name="billingNote_${esc(unit.id)}" rows="2" placeholder="Ex.: Acordo, aviso, orientação específica">${esc(unit.billingNote || '')}</textarea></td></tr>`).join('')}</tbody></table></div></section>`;
    return `<section class="billing-controls no-print"><div class="section-actions"><div><h2>Boletos mensais</h2><span class="muted">Cada boleto mostra água, condomínio, desconto/isenção, serviço e outros separadamente.</span></div><div class="button-row"><button class="secondary" data-go="leituras">Lançamentos nas leituras</button><button class="primary" data-print-bills>Imprimir conjunto</button></div></div><form class="card form-grid" id="billingForm"><div class="field"><label>Vencimento</label><input name="dueDate" type="date" value="${esc(b.dueDate)}" required></div><div class="field"><label>Conta global de água (R$)</label><input name="waterBill" type="number" min="0" step="0.01" value="${b.waterBill || ''}"></div><div class="field"><label>Data da leitura anterior</label><input name="previousReadDate" type="date" value="${esc(b.previousReadDate)}"></div><div class="field"><label>Data da leitura atual</label><input name="currentReadDate" type="date" value="${esc(b.currentReadDate)}"></div><div class="field"><label>Próxima leitura</label><input name="nextReadDate" type="date" value="${esc(b.nextReadDate)}"></div><div class="field"><label>Condomínio bruto (R$)</label><input name="condoFee" type="number" min="0" step="0.01" value="${b.condoFee}"></div><div class="field"><label>Serviço de leitura (R$)</label><input name="serviceFee" type="number" min="0" step="0.01" value="${b.serviceFee}"></div><div class="field"><label>Descrição do serviço</label><input name="serviceLabel" value="${esc(b.serviceLabel)}"></div><div class="field full"><label><input name="chargeService" type="checkbox" ${b.chargeService !== false ? 'checked' : ''}> Cobrar serviço de leitura neste mês</label></div><div class="field full"><label>Observações gerais — uma por linha</label><textarea name="notes" rows="5" placeholder="Cada linha aparece no boleto. Linhas em branco são ignoradas.">${esc(b.notes)}</textarea></div><div class="field full">${unitNotes}</div><div class="form-foot"><button class="primary" type="submit">Salvar e atualizar boletos</button></div></form></section><div class="billing-preview">${content || '<div class="card empty">Cadastre apartamentos antes de gerar boletos.</div>'}</div>`;
  };
  saveBilling = function(form) {
    const block = selected(); if (!block) return;
    ensureV53(block);
    const data = Object.fromEntries(new FormData(form));
    block.units.forEach(unit => { unit.billingNote = String(data[`billingNote_${unit.id}`] || ''); });
    block.billing = normalizeBilling({ ...block.billing, ...data, chargeService: data.chargeService === 'on', waterBill: n(data.waterBill), serviceFee: n(data.serviceFee), condoFee: n(data.condoFee) }, block.month);
    save('Configuração de boletos atualizada'); render();
  };

  const handleInputV53Base = handleInput;
  handleInput = function(event) {
    if (event.target.closest('#receiptForm')) {
      const form = $('#receiptForm');
      const preview = $('#receiptPreview');
      if (form) {
        const data = receiptDataV53(Object.fromEntries(new FormData(form)));
        const amountWords = form.querySelector('[name="amountWords"]');
        if (amountWords) amountWords.value = data.amountWords;
        if (preview) preview.innerHTML = receiptHtml(data);
      }
      return;
    }
    return handleInputV53Base(event);
  };
  const handleSubmitV53Base = handleSubmit;
  handleSubmit = function(event) {
    if (event.target.id === 'receiptForm') {
      event.preventDefault();
      const block = selected(); if (!block) return;
      const data = receiptDataV53(Object.fromEntries(new FormData(event.target)));
      block.serviceReceiptDraft = data;
      block.serviceReceipts.unshift({ ...data, id: uid(), createdAt: new Date().toISOString() });
      save('Recibo salvo'); render(); return;
    }
    return handleSubmitV53Base(event);
  };

  function printReceiptHalfPortraitV53(title, receiptMarkup) {
    const win = window.open('', '_blank');
    if (!win) return toast('Permita pop-ups para imprimir o recibo.', true);
    const css = new URL('styles.css', location.href).href;
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><base href="${esc(location.href)}"><title>${esc(title)}</title><link rel="stylesheet" href="${css}"><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,sans-serif}.receipt-toolbar{position:sticky;top:0;z-index:5;background:#111;color:#fff;padding:10px;display:flex;gap:12px;align-items:center;justify-content:center}.receipt-toolbar button{background:#ff1100;color:#fff;border:0;border-radius:7px;padding:9px 15px;font-weight:800;cursor:pointer}.receipt-half-page{width:190mm;height:138.5mm;margin:0 auto;display:block;page-break-inside:avoid}@media print{.receipt-toolbar{display:none!important}html,body{width:100%!important;height:auto!important;background:#fff!important}.receipt-half-page{width:190mm!important;height:138.5mm!important;margin:0!important;break-inside:avoid!important;page-break-inside:avoid!important}.receipt-half-page .receipt-preview{width:100%!important;height:138.5mm!important;min-height:0!important;overflow:hidden!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}</style></head><body><div class="receipt-toolbar"><span>Recibo em meia folha A4 · retrato</span><button onclick="window.print()">Imprimir agora</button></div><main class="receipt-half-page">${receiptMarkup}</main></body></html>`);
    win.document.close();
  }
  printReceiptHalfPortraitV521 = printReceiptHalfPortraitV53;
  function printPaymentReceiptPortraitV53(id) {
    const block = selected(); const unit = findUnit(block, id); if (!unit) return;
    const c = unitCharges(unit, block);
    printReceiptHalfPortraitV53(`Recibo Apto ${unit.number}`, receiptHtml({ payer: unit.resident || '—', amount: c.total, service: `Pagamento do apartamento ${unit.number}, referente a água, condomínio e demais lançamentos de ${monthLabel(block.month)}`, issueDate: unit.paymentDate || today(), city: '', issuer: block.manager || 'Síndico responsável', phone: '' }));
  }

  async function uploadCloudV53() {
    try {
      const c = window.KR2Sync?.getConfig?.() || {};
      const remote = await window.KR2Sync?.remoteInfo?.();
      if (remote?.updated_at && c.remoteUpdatedAt && remote.updated_at !== c.remoteUpdatedAt) {
        const ok = confirm(`A cópia na nuvem foi alterada em ${auditDate(remote.updated_at)} depois da última sincronização deste aparelho.\n\nEnviar agora pode substituir dados de outro aparelho. Deseja continuar?`);
        if (!ok) { render(); return; }
      }
      await window.KR2Sync.pushState(deepClone(state));
      toast('Dados enviados para a nuvem'); render();
    } catch (error) { toast(error.message || 'Falha no envio.', true); }
  }
  async function downloadCloudV53() {
    try {
      const remoteInfo = await window.KR2Sync?.remoteInfo?.();
      const remote = await window.KR2Sync.pullState();
      if (!remote || !Array.isArray(remote.blocks)) { toast('Nenhuma cópia encontrada para esta conta.'); render(); return; }
      const msg = remoteInfo?.updated_at ? `A nuvem foi atualizada em ${auditDate(remoteInfo.updated_at)}.\n\nBaixar a nuvem substituirá os dados locais deste aparelho. Você já possui backup local?` : 'Baixar a nuvem substituirá os dados locais deste aparelho. Você já possui backup local?';
      if (state.blocks.length && !confirm(msg)) { render(); return; }
      suspendCloudSyncV52 = true; state = normalizeState(remote); state.blocks.forEach(ensureV51); state.blocks.forEach(ensureV53); localStorage.setItem(KEY, JSON.stringify(state)); suspendCloudSyncV52 = false; selectedReadingIds.clear(); toast('Dados baixados da nuvem'); render();
    } catch (error) { toast(error.message || 'Falha ao baixar dados.', true); }
  }
  uploadCloudV52 = uploadCloudV53;
  downloadCloudV52 = downloadCloudV53;

  // ===================== KR2MELO v5.3.12 =====================
  delete routes.financeiro;

  function extraChargeItems(unit) {
    const items = Array.isArray(unit.extraCharges) ? unit.extraCharges.map(item => ({
      label: String(item?.label || '').trim() || 'VALOR ADICIONAL',
      value: Math.max(0, n(item?.value))
    })).filter(item => item.value > 0 || item.label !== 'VALOR ADICIONAL') : [];
    if (n(unit.extraCharge) > 0) items.unshift({ label: String(unit.extraChargeLabel || 'VALOR ADICIONAL'), value: Math.max(0, n(unit.extraCharge)) });
    return items;
  }
  function extraChargesText(unit) {
    return extraChargeItems(unit).map(item => `${item.label}; ${item.value.toFixed(2).replace('.', ',')}`).join('\n');
  }
  function parseExtraCharges(text) {
    return String(text || '').split(/\r?\n/).map(line => {
      const parts = line.split(/[;|]/);
      const valueText = parts.length > 1 ? parts.pop() : line.replace(/[^\d,.-]/g, '');
      const label = (parts.join(';').trim() || 'VALOR ADICIONAL').slice(0, 60);
      const value = Math.max(0, Number(String(valueText).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0);
      return { label, value };
    }).filter(item => item.value > 0);
  }
  function billGroupSize(block) {
    return Math.min(64, Math.max(2, n(block.billing?.groupSize) || 16));
  }
  function coverBackOnly(block, units, index) {
    return `<section class="cover-sheet cover-sheet-v531 cover-back-only"><article class="cover-half cover-back cover-back-inverted"><header><img src="assets/logo.png" alt="KR²MELO"><div><p class="eyebrow">CONTRACAPA</p><h1>KR²MELO</h1><p>${esc(block.name)} · ${monthLabel(block.month)}</p></div></header><div class="provider-services"><span>Leitura mensal dos hidrômetros</span><span>Cálculo individual de consumo</span><span>Rateio de água</span><span>Boletos e recibos</span></div><footer>Prestador responsável pelo serviço de leitura</footer></article></section>`;
  }
  function billPrintContent(block, mode = 'complete') {
    const groups = chunk(block.units, billGroupSize(block));
    return groups.map((units, index) => {
      const title = `<div class="bill-group-title no-print">Bloco ${blockLetter(index)} · ${units.length} apartamento(s)</div>`;
      if (mode === 'cover') return title + coverSheet(block, units, index);
      if (mode === 'back') return title + coverBackOnly(block, units, index);
      if (mode === 'bills') return title + billPages(block, units, index);
      return title + coverSheet(block, units, index) + billPages(block, units, index);
    }).join('');
  }
  function printBillsPart(mode) {
    const block = selected(); if (!block) return;
    const titles = { complete: 'Bloco completo de boletos', cover: 'Capas dos boletos', bills: 'Boletos sem capas', back: 'Contracapas dos boletos' };
    printHtml(titles[mode] || 'Boletos KR²MELO', billPrintContent(block, mode));
  }
  function printCheckPanel() {
    const block = selected(); if (!block) return;
    const cover = $('.cover-sheet'), lastCoverField = $('.cover-simple-kv span:last-child');
    let clearance = 'Prévia disponível após abrir Boletos.';
    if (cover && lastCoverField) {
      const coverBox = cover.getBoundingClientRect(), fieldBox = lastCoverField.getBoundingClientRect();
      clearance = `${Math.round((coverBox.top + coverBox.height / 2) - fieldBox.bottom)} px de folga antes da linha central`;
    }
    openModal(`<h2>Conferir impressão</h2><p>Use esta conferência antes de imprimir e cortar os blocos.</p><div class="notice-list"><div class="info-box"><strong>Capa frontal:</strong> ${esc(clearance)}</div><div class="info-box"><strong>Capas:</strong> ${$('.cover-sheet') ? 'geradas' : 'não encontradas'}</div><div class="info-box"><strong>Folhas de boletos:</strong> ${$$('.bill-page-with-cuts').length}</div><div class="info-box"><strong>Fichas técnicas:</strong> ${$$('.block-summary-page').length ? 'ainda existem na prévia' : 'não serão impressas no conjunto'}</div></div><div class="button-row"><button class="secondary" type="button" data-print-bill-part="cover">Capa</button><button class="secondary" type="button" data-print-bill-part="bills">Boletos</button><button class="secondary" type="button" data-print-bill-part="back">Contracapa</button></div>`, 'Fechar');
  }

  renderRules = function(block) {
    const totals = chargeTotals(block);
    const exempt = block.units.filter(unit => ruleActive(unit.condoRule, block.month) && unit.condoRule.mode === 'isento').length;
    const discounted = block.units.filter(unit => ruleActive(unit.condoRule, block.month) && unit.condoRule.mode.startsWith('desconto')).length;
    return `<section class="hero"><div><p class="eyebrow">REGRAS POR APARTAMENTO</p><h2>Isenções, descontos e lançamentos individuais</h2><p>Os descontos afetam somente o valor do condomínio; a água permanece calculada normalmente.</p></div><div><button class="secondary" data-go="boletos">Conferir boletos →</button></div></section><div class="rule-summary"><span class="pill ok">${exempt} isenção(ões) ativa(s)</span><span class="pill info">${discounted} desconto(s) ativo(s)</span><span class="pill warn">${money.format(totals.discount)} abatido no mês</span><span class="pill info">${money.format(totals.extraCharge || 0)} adicionais</span></div><div class="info-box"><strong>Adicionais:</strong> escreva um por linha no formato <b>Descrição; valor</b>. Ex.: 2ª via; 10,00</div><div class="table-wrap"><table class="rule-table"><thead><tr><th>Apto</th><th>Responsável</th><th>Função</th><th>Regra</th><th>Valor</th><th>Motivo / benefício</th><th>Início</th><th>Fim</th><th>Autorizado por</th><th>Valores adicionais</th><th>Multas / outros</th><th>Valor</th><th>Resultado</th></tr></thead><tbody>${block.units.map(unit => { const r = normalizeRule(unit.condoRule), c = unitCharges(unit, block); return `<tr data-rule-row="${unit.id}"><td><strong>${esc(unit.number)}</strong></td><td>${esc(unit.resident || '—')}</td><td><select data-rule-field="role">${Object.entries(roleLabels).map(([value, label]) => `<option value="${value}" ${r.role === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td><select data-rule-field="mode">${Object.entries(ruleLabels).map(([value, label]) => `<option value="${value}" ${r.mode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td><input data-rule-field="value" type="number" min="0" step="0.01" value="${r.value || ''}" placeholder="R$ ou %"></td><td><input data-rule-field="reason" value="${esc(r.reason)}" placeholder="Ex.: Internet das câmeras"></td><td><input data-rule-field="startsAt" type="month" value="${esc(r.startsAt)}"></td><td><input data-rule-field="endsAt" type="month" value="${esc(r.endsAt)}"></td><td><input data-rule-field="authorizedBy" value="${esc(r.authorizedBy)}" placeholder="Síndico / ata"></td><td><textarea class="extra-charge-editor" data-rule-field="extraChargesText" rows="3" placeholder="Descrição; valor">${esc(extraChargesText(unit))}</textarea></td><td><input data-rule-field="billingFineLabel" value="${esc(unit.billingFineLabel)}"></td><td><input data-rule-field="billingFine" type="number" min="0" step="0.01" value="${unit.billingFine || ''}"></td><td><strong>${money.format(c.total)}</strong>${c.extraCharge ? `<br><small>Adicionais: ${money.format(c.extraCharge)}</small>` : ''}${c.condoDiscount ? `<br><small class="adjustment">− ${money.format(c.condoDiscount)}</small>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  };

  const unitChargesV535Base = unitCharges;
  unitCharges = function(unit, block, options = {}) {
    const c = unitChargesV535Base(unit, block, options);
    const listTotal = extraChargeItems(unit).reduce((sum, item) => sum + n(item.value), 0);
    if (listTotal !== c.extraCharge) {
      c.total += listTotal - c.extraCharge;
      c.extraCharge = listTotal;
    }
    return c;
  };

  billCopy = function(unit, block, copy) {
    const c = unitCharges(unit, block); const billing = block.billing; const managerCopy = copy === 'SÍNDICO';
    const ruleText = adjustmentText(c);
    const discountLine = c.condoDiscount ? `<div class="bill-charge-line bill-adjustment"><span>${esc(ruleText || 'Desconto de condomínio')}</span><b>− ${money.format(c.condoDiscount)}</b></div>` : '';
    const serviceLine = c.service ? `<div class="bill-charge-line"><span>${esc(billing.serviceLabel)}</span><b>${money.format(c.service)}</b></div>` : '';
    const extraLine = extraChargeItems(unit).map(item => `<div class="bill-charge-line"><span>${esc(item.label)}</span><b>${money.format(item.value)}</b></div>`).join('');
    const notes = billingNoteLines(unit, billing);
    const footer = managerCopy ? `<footer class="bill-signature"><div></div><small>RECEBIDO POR / ASSINATURA DO MORADOR</small></footer>` : `<section class="bill-notes"><strong>OBS.</strong><div>${noteParagraphs(notes)}</div></section>`;
    return `<article class="bill-copy ${managerCopy ? 'bill-copy-manager' : 'bill-copy-resident'}"><div class="bill-copy-tag">VIA DO ${copy}</div><header class="bill-head"><strong>${esc(unit.number)}</strong><b>Vencimento · ${dateBr(billing.dueDate)}</b></header><div class="bill-party"><span>RESPONSÁVEL</span><strong>${esc(unit.resident || '—')}</strong><small>REFERÊNCIA · ${monthLabel(block.month).toUpperCase().replace(' DE ', ' / ')}</small></div><section class="bill-reading-grid"><div><span>LEITURA ANTERIOR</span><small>${dateBr(billing.previousReadDate)}</small><b>${fmtInt(unit.previous)}</b></div><div><span>LEITURA ATUAL</span><small>${dateBr(billing.currentReadDate)}</small><b>${unit.current === '' ? '—' : fmtInt(unit.current)}</b></div><div><span>CONSUMO</span><small>METROS CÚBICOS</small><b>${fmtM3(unit.m3)} m³</b></div></section><section class="bill-charge-list"><div class="bill-charge-line"><span>ÁGUA</span><b>${money.format(c.water)}</b></div>${discountLine}<div class="bill-charge-line bill-condo-net"><span>CONDOMÍNIO A PAGAR</span><b>${money.format(c.condo)}</b></div>${serviceLine}${extraLine}<div class="bill-charge-line"><span>${esc(unit.billingFineLabel || 'MULTAS / OUTROS')}</span><b>${money.format(c.fine)}</b></div></section><div class="bill-total"><strong>TOTAL</strong><span>VALOR A PAGAR</span><b>${money.format(c.total)}</b></div>${footer}</article>`;
  };

  renderBills = function(block) {
    ensureV53(block);
    const content = billPrintContent(block, 'complete');
    const b = block.billing;
    const unitNotes = `<section class="card billing-unit-notes"><div class="card-head"><h3>Observações individuais nos boletos</h3><span class="muted">Aparecem somente no boleto do respectivo apartamento.</span></div><div class="table-wrap"><table><thead><tr><th>Apto</th><th>Responsável</th><th>Observação individual</th></tr></thead><tbody>${block.units.map(unit => `<tr><td><strong>${esc(unit.number)}</strong></td><td>${esc(unit.resident || '—')}</td><td><textarea name="billingNote_${esc(unit.id)}" rows="2" placeholder="Ex.: Acordo, aviso, orientação específica">${esc(unit.billingNote || '')}</textarea></td></tr>`).join('')}</tbody></table></div></section>`;
    return `<section class="billing-controls no-print"><div class="section-actions"><div><h2>Boletos mensais</h2><span class="muted">Monte o bloco, confira a impressão e imprima por partes se preferir.</span></div><div class="button-row"><button class="secondary" data-print-check type="button">Conferir impressão</button><button class="primary" data-print-bill-part="complete" type="button">Imprimir bloco completo</button></div></div><section class="card bill-builder"><div class="card-head"><h3>Gerar bloco de boletos</h3><span class="muted">Útil para impressão manual</span></div><div class="button-row"><button class="secondary" data-print-bill-part="cover" type="button">Só capa</button><button class="secondary" data-print-bill-part="bills" type="button">Só boletos</button><button class="secondary" data-print-bill-part="back" type="button">Só contracapa</button></div></section><form class="card form-grid" id="billingForm"><div class="field"><label>Vencimento</label><input name="dueDate" type="date" value="${esc(b.dueDate)}" required></div><div class="field"><label>Conta global de água (R$)</label><input name="waterBill" type="number" min="0" step="0.01" value="${b.waterBill || ''}"></div><div class="field"><label>Data da leitura anterior</label><input name="previousReadDate" type="date" value="${esc(b.previousReadDate)}"></div><div class="field"><label>Data da leitura atual</label><input name="currentReadDate" type="date" value="${esc(b.currentReadDate)}"></div><div class="field"><label>Próxima leitura</label><input name="nextReadDate" type="date" value="${esc(b.nextReadDate)}"></div><div class="field"><label>Apartamentos por bloco</label><input name="groupSize" type="number" min="2" max="64" step="1" value="${billGroupSize(block)}"></div><div class="field"><label>Condomínio bruto (R$)</label><input name="condoFee" type="number" min="0" step="0.01" value="${b.condoFee}"></div><div class="field"><label>Serviço de leitura (R$)</label><input name="serviceFee" type="number" min="0" step="0.01" value="${b.serviceFee}"></div><div class="field"><label>Descrição do serviço</label><input name="serviceLabel" value="${esc(b.serviceLabel)}"></div><div class="field full"><label><input name="chargeService" type="checkbox" ${b.chargeService !== false ? 'checked' : ''}> Cobrar serviço de leitura neste mês</label></div><div class="field full"><label>Observações gerais — uma por linha</label><textarea name="notes" rows="5" placeholder="Cada linha aparece no boleto. Linhas em branco são ignoradas.">${esc(b.notes)}</textarea></div><div class="field full">${unitNotes}</div><div class="form-foot"><button class="primary" type="submit">Salvar e atualizar boletos</button></div></form></section><div class="billing-preview">${content || '<div class="card empty">Cadastre apartamentos antes de gerar boletos.</div>'}</div>`;
  };

  const saveBillingV535Base = saveBilling;
  saveBilling = function(form) {
    const block = selected(); if (!block) return;
    const data = Object.fromEntries(new FormData(form));
    block.billing = normalizeBilling({ ...block.billing, ...data, groupSize: Math.min(64, Math.max(2, n(data.groupSize) || 16)), chargeService: data.chargeService === 'on', waterBill: n(data.waterBill), serviceFee: n(data.serviceFee), condoFee: n(data.condoFee) }, block.month);
    block.units.forEach(unit => { unit.billingNote = String(data[`billingNote_${unit.id}`] || ''); });
    save('Configuração de boletos atualizada'); render();
  };

  function managerReportMarkup(block) {
    const totals = chargeTotals(block);
    const rows = block.units.map(unit => { const c = unitCharges(unit, block); return `<tr><td>${esc(unit.number)}</td><td>${esc(unit.resident || '—')}</td><td>${fmtM3(unit.m3)} m³</td><td>${money.format(c.water)}</td><td>${money.format(c.condo)}</td><td>${money.format(c.extraCharge)}</td><td>${money.format(c.fine)}</td><td><strong>${money.format(c.total)}</strong></td></tr>`; }).join('');
    return `<section class="monthly-report manager-report" id="managerReportPrint"><header class="report-print-header"><div><p class="eyebrow">KR²MELO · RELATÓRIO DO SÍNDICO</p><h2>${esc(block.name)}</h2><p>Referência: <strong>${monthLabel(block.month)}</strong></p></div><div class="report-print-meta"><span>Unidades: <b>${block.units.length}</b></span><span>Emitido em: <b>${dateBr(today())}</b></span></div></header><section class="finance-summary report-finance-summary"><div><small>Água</small><strong>${money.format(totals.water)}</strong></div><div><small>Condomínio</small><strong>${money.format(totals.condo)}</strong></div><div><small>Descontos</small><strong>${money.format(totals.discount)}</strong></div><div><small>Adicionais</small><strong>${money.format(totals.extraCharge || 0)}</strong></div><div><small>Outros</small><strong>${money.format(totals.fine)}</strong></div><div><small>Total</small><strong>${money.format(totals.total)}</strong></div></section><div class="table-wrap report-table-wrap"><table class="monthly-report-table"><thead><tr><th>Apto</th><th>Responsável</th><th>Consumo</th><th>Água</th><th>Condomínio</th><th>Adicionais</th><th>Outros</th><th>Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3">TOTAL</td><td>${money.format(totals.water)}</td><td>${money.format(totals.condo)}</td><td>${money.format(totals.extraCharge || 0)}</td><td>${money.format(totals.fine)}</td><td>${money.format(totals.total)}</td></tr></tfoot></table></div><footer class="report-print-footer">KR²MELO · Relatório do síndico</footer></section>`;
  }
  function printManagerReport() {
    const block = selected(); if (!block) return;
    printHtml('Relatório do síndico KR²MELO', managerReportMarkup(block));
  }
  const renderReportsV535Base = renderReports;
  renderReports = function(block) {
    return `<section class="section-actions no-print"><div><h2>Relatório do síndico</h2><span class="muted">Resumo limpo para conferência e entrega.</span></div><button class="primary" data-print-manager-report type="button">Imprimir relatório do síndico</button></section>${renderReportsV535Base(block)}`;
  };

  const executeMonthlyCloseV535Base = executeMonthlyClose;
  executeMonthlyClose = function(block) {
    if (block) exportData();
    return executeMonthlyCloseV535Base(block);
  };

  const handleChangeV535Base = handleChange;
  handleChange = function(event) {
    const field = event.target.closest('[data-rule-field="extraChargesText"]');
    if (field) {
      const row = event.target.closest('[data-rule-row]'); const block = selected(); const unit = findUnit(block, row?.dataset.ruleRow); if (!unit) return;
      unit.extraCharge = 0; unit.extraChargeLabel = 'VALOR ADICIONAL'; unit.extraCharges = parseExtraCharges(event.target.value);
      save('Valores adicionais atualizados'); render(); return;
    }
    return handleChangeV535Base(event);
  };

  const handleClickV535Base = handleClick;
  handleClick = async function(event) {
    const target = event.target;
    const part = target.closest('[data-print-bill-part]');
    if (part) { printBillsPart(part.dataset.printBillPart || 'complete'); return; }
    if (target.closest('[data-print-check]')) { printCheckPanel(); return; }
    if (target.closest('[data-print-manager-report]')) { printManagerReport(); return; }
    return handleClickV535Base(event);
  };

  const renderV53Base = render;
  render = function() {
    state.blocks.forEach(ensureV53);
    renderV53Base();
    const heroEyebrow = $('#app .hero .eyebrow');
    if (heroEyebrow) heroEyebrow.textContent = versionText(heroEyebrow.textContent);
    refreshVersionLabelsV53();
  };

  const handleClickV53Base = handleClick;
  handleClick = async function(event) {
    const target = event.target;
    const paymentReceipt = target.closest('[data-payment-receipt]');
    if (paymentReceipt) { printPaymentReceiptPortraitV53(paymentReceipt.dataset.paymentReceipt); return; }
    if (target.closest('[data-print-service-receipt]')) { printReceiptHalfPortraitV53('Recibo KR²MELO', $('#receiptPreview')?.innerHTML || ''); return; }
    if (target.closest('[data-sync-push]')) { await uploadCloudV53(); return; }
    if (target.closest('[data-sync-pull]')) { await downloadCloudV53(); return; }
    return handleClickV53Base(event);
  };


  // ===================== KR2MELO v5.3.12 =====================
  // Centraliza multas, descontos, adicionais e abatimentos avulsos dentro da tela Leituras.
  delete routes.regras;

  function moneyValueFromTextV537(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return 0;
    const cleaned = raw.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : 0;
  }
  function ensureV537(block) {
    if (!block) return;
    ensureV53(block);
    block.units.forEach(unit => {
      unit.billingFineNote = String(unit.billingFineNote || '');
      unit.billingNote = String(unit.billingNote || '');
      unit.extraCharges = Array.isArray(unit.extraCharges) ? unit.extraCharges.map(item => ({
        label: String(item?.label || '').trim() || 'AJUSTE AVULSO',
        value: moneyValueFromTextV537(item?.value)
      })).filter(item => item.value !== 0 || item.label !== 'AJUSTE AVULSO') : [];
    });
  }

  const normalizeUnitV537Base = normalizeUnit;
  normalizeUnit = function(raw, index = 0) {
    const unit = normalizeUnitV537Base(raw, index);
    unit.billingFineNote = String(raw?.billingFineNote || '');
    unit.billingNote = String(raw?.billingNote || unit.billingNote || '');
    unit.extraCharges = Array.isArray(raw?.extraCharges) ? raw.extraCharges.map(item => ({
      label: String(item?.label || '').trim() || 'AJUSTE AVULSO',
      value: moneyValueFromTextV537(item?.value)
    })).filter(item => item.value !== 0 || item.label !== 'AJUSTE AVULSO') : unit.extraCharges;
    return unit;
  };

  extraChargeItems = function(unit) {
    const items = Array.isArray(unit.extraCharges) ? unit.extraCharges.map(item => ({
      label: String(item?.label || '').trim() || 'AJUSTE AVULSO',
      value: moneyValueFromTextV537(item?.value)
    })).filter(item => item.value !== 0) : [];
    const legacy = moneyValueFromTextV537(unit.extraCharge);
    if (legacy !== 0) items.unshift({ label: String(unit.extraChargeLabel || 'VALOR ADICIONAL'), value: legacy });
    return items;
  };
  extraChargesText = function(unit) {
    return extraChargeItems(unit).map(item => `${item.label}; ${Number(item.value).toFixed(2).replace('.', ',')}`).join('\n');
  };
  parseExtraCharges = function(text) {
    return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const parts = line.split(/[;|]/);
      const valueText = parts.length > 1 ? parts.pop() : (line.match(/[-+]?\s*R?\$?\s*\d[\d.,]*/)?.[0] || '0');
      const label = (parts.length > 0 ? parts.join(';').trim() : line.replace(valueText, '').trim()).replace(/;+$/, '').trim() || 'AJUSTE AVULSO';
      const value = moneyValueFromTextV537(valueText);
      return { label: label.slice(0, 80), value };
    }).filter(item => item.value !== 0);
  };

  const billingNoteLinesV537Base = billingNoteLines;
  billingNoteLines = function(unit, billing) {
    const global = cleanNoteLines(billing?.notes, 4);
    const fineNote = cleanNoteLines(unit?.billingFineNote ? `Multas/outros: ${unit.billingFineNote}` : '', 1);
    const individual = cleanNoteLines(unit?.billingNote, 3);
    return [...global, ...fineNote, ...individual].slice(0, 6);
  };

  function adjustmentCenterV537(block) {
    ensureV537(block);
    const totals = chargeTotals(block);
    const activeRules = block.units.filter(unit => ruleActive(unit.condoRule, block.month) && unit.condoRule.mode !== 'normal').length;
    const extras = block.units.reduce((sum, unit) => sum + extraChargeItems(unit).reduce((a, item) => a + n(item.value), 0), 0);
    const fines = block.units.reduce((sum, unit) => sum + Math.max(0, n(unit.billingFine)), 0);
    return `<section class="card adjustment-center no-print" data-adjustment-center><div class="card-head"><div><h3>Lançamentos e ajustes por apartamento</h3><span class="muted">Multas/outros, observações, descontos, valores adicionais e abatimentos ficam juntos nesta tela.</span></div><div class="button-row"><span class="pill info">${activeRules} regra(s)</span><span class="pill warn">${money.format(totals.discount)} desconto</span><span class="pill ${extras < 0 ? 'ok' : 'info'}">${money.format(extras)} extras ±</span><span class="pill danger">${money.format(fines)} multas</span></div></div><div class="info-box"><strong>Como lançar extras:</strong> em “Adicionais / abatimentos”, use uma linha por item no formato <b>Descrição; valor</b>. Para subtrair, coloque valor negativo, por exemplo: <b>Abatimento combinado; -15,00</b>.</div><div class="table-wrap"><table class="adjustment-table"><thead><tr><th>Apto</th><th>Desconto / isenção</th><th>Valor</th><th>Observação do desconto</th><th>Vigência / autorização</th><th>Adicionais / abatimentos</th><th>Multas / outros</th><th>Obs. da multa</th><th>Obs. no boleto</th><th>Total</th></tr></thead><tbody>${block.units.map(unit => { const r = normalizeRule(unit.condoRule), c = unitCharges(unit, block); return `<tr data-rule-row="${unit.id}"><td><strong>${esc(unit.number)}</strong><br><small>${esc(unit.resident || 'Sem responsável')}</small></td><td><select data-rule-field="role" title="Função">${Object.entries(roleLabels).map(([value, label]) => `<option value="${value}" ${r.role === value ? 'selected' : ''}>${label}</option>`).join('')}</select><select data-rule-field="mode" title="Regra de desconto">${Object.entries(ruleLabels).map(([value, label]) => `<option value="${value}" ${r.mode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td><input data-rule-field="value" type="number" min="0" step="0.01" value="${r.value || ''}" placeholder="R$ ou %"></td><td><textarea data-rule-field="reason" rows="3" placeholder="Motivo do desconto, isenção ou benefício">${esc(r.reason)}</textarea></td><td><div class="mini-grid"><input data-rule-field="startsAt" type="month" value="${esc(r.startsAt)}" title="Início"><input data-rule-field="endsAt" type="month" value="${esc(r.endsAt)}" title="Fim"></div><input data-rule-field="authorizedBy" value="${esc(r.authorizedBy)}" placeholder="Autorizado por"></td><td><textarea class="extra-charge-editor" data-rule-field="extraChargesText" rows="4" placeholder="Ex.: 2ª via; 10,00\nAbatimento; -15,00">${esc(extraChargesText(unit))}</textarea></td><td><input data-rule-field="billingFineLabel" value="${esc(unit.billingFineLabel || 'MULTAS / OUTROS')}" placeholder="Descrição"><input data-rule-field="billingFine" type="number" min="0" step="0.01" value="${unit.billingFine || ''}" placeholder="Valor"></td><td><textarea data-rule-field="billingFineNote" rows="3" placeholder="Observação da multa/outros">${esc(unit.billingFineNote || '')}</textarea></td><td><textarea data-rule-field="billingNote" rows="3" placeholder="Observação individual para o boleto">${esc(unit.billingNote || '')}</textarea></td><td><strong>${money.format(c.total)}</strong>${c.condoDiscount ? `<br><small class="adjustment">Desconto: − ${money.format(c.condoDiscount)}</small>` : ''}${c.extraCharge ? `<br><small>Extras: ${money.format(c.extraCharge)}</small>` : ''}${c.fine ? `<br><small>${esc(unit.billingFineLabel || 'Multas/outros')}: ${money.format(c.fine)}</small>` : ''}</td></tr>`; }).join('')}</tbody></table></div></section>`;
  }

  renderReadings = function(block) {
    ensureV537(block);
    const totals = chargeTotals(block), selectedIds = readingSelectionFor(block), selectedCount = selectedIds.size;
    return `${waterCoverageCard(block)}<div class="section-actions"><div><h2>${monthLabel(block.month)}</h2><span class="muted">Digite a leitura atual e ajuste multas, descontos, adicionais e observações no mesmo bloco de trabalho.</span></div><div class="button-row"><button class="secondary" data-import-readings type="button">⇧ Importar Excel/CSV</button><button class="secondary" data-export-readings type="button">⇩ Planilha Excel (.csv)</button><button class="secondary" data-export-readings-xlsx type="button">⇩ Modelo .xlsx</button><button class="secondary" data-add-unit type="button">+ Unidade</button><button class="primary" data-go="fechamento" type="button">Fechamento mensal</button></div></div>${adjustmentCenterV537(block)}<section class="reading-bulk-actions card no-print"><div><strong><span data-reading-selection-count>${selectedCount}</span> selecionada(s)</strong><small>Use a caixa da primeira coluna para escolher leituras. “Limpar” preserva apartamento, leitura anterior e lançamentos financeiros.</small></div><div class="button-row"><button class="secondary" data-select-all-readings type="button">Selecionar todas</button><button class="secondary" data-clear-selected-readings type="button" ${selectedCount ? '' : 'disabled'}>Limpar selecionadas</button><button class="danger" data-clear-all-readings type="button">Limpar todas as leituras</button><button class="danger" data-remove-selected-units type="button" ${selectedCount ? '' : 'disabled'}>Excluir cadastros selecionados</button></div></section><div class="table-wrap"><table><thead><tr><th class="reading-check"><input type="checkbox" data-select-all-readings aria-label="Selecionar todas as leituras"></th><th>Apto / Hidrômetro</th><th>Responsável</th><th>Anterior</th><th>Atual</th><th>Consumo</th><th>Status</th><th>Água</th><th>Observação operacional</th><th></th></tr></thead><tbody>${block.units.map(unit => { const issue = readingIssue(unit), checked = selectedIds.has(unit.id); return `<tr data-reading-row="${unit.id}" class="${issue ? `reading-issue ${issue.type}` : ''}"><td class="reading-check"><input data-reading-select type="checkbox" value="${unit.id}" ${checked ? 'checked' : ''} aria-label="Selecionar apartamento ${esc(unit.number)}"></td><td><input data-reading-field="number" value="${esc(unit.number)}" aria-label="Apartamento"></td><td><input data-reading-field="resident" value="${esc(unit.resident)}" placeholder="Nome"></td><td><input data-reading-field="previous" type="number" min="0" step="0.001" value="${unit.previous}"></td><td><input data-reading-field="current" type="number" min="0" step="0.001" value="${unit.current}"></td><td class="value">${fmtM3(unit.m3)} m³</td><td>${readingBadge(unit)}</td><td class="value">${money.format(unit.value)}</td><td><input data-reading-field="note" value="${esc(unit.note)}" placeholder="Observação da leitura"></td><td><div class="row-actions"><button class="danger" data-remove-unit title="Excluir cadastro do apartamento" type="button">×</button></div></td></tr>`; }).join('')}</tbody><tfoot><tr><td></td><td colspan="4">TOTAL DE ÁGUA</td><td>${fmtM3(totals.m3)} m³</td><td></td><td>${money.format(totals.water)}</td><td colspan="2"></td></tr></tfoot></table></div>`;
  };

  renderBills = function(block) {
    ensureV537(block);
    const content = billPrintContent(block, 'complete');
    const b = block.billing;
    return `<section class="billing-controls no-print"><div class="section-actions"><div><h2>Boletos mensais</h2><span class="muted">Monte o bloco, confira a impressão e imprima por partes se preferir.</span></div><div class="button-row"><button class="secondary" data-print-check type="button">Conferir impressão</button><button class="primary" data-print-bill-part="complete" type="button">Imprimir bloco completo</button></div></div><section class="card bill-builder"><div class="card-head"><h3>Gerar bloco de boletos</h3><span class="muted">Útil para impressão manual</span></div><div class="button-row"><button class="secondary" data-print-bill-part="cover" type="button">Só capa</button><button class="secondary" data-print-bill-part="bills" type="button">Só boletos</button><button class="secondary" data-print-bill-part="back" type="button">Só contracapa</button></div></section><form class="card form-grid" id="billingForm"><div class="field full"><div class="info-box"><strong>Lançamentos individuais:</strong> multas, descontos, adicionais, abatimentos e observações por apartamento agora ficam na tela <b>Leituras</b>, no bloco “Lançamentos e ajustes por apartamento”.</div></div><div class="field"><label>Vencimento</label><input name="dueDate" type="date" value="${esc(b.dueDate)}" required></div><div class="field"><label>Conta global de água (R$)</label><input name="waterBill" type="number" min="0" step="0.01" value="${b.waterBill || ''}"></div><div class="field"><label>Data da leitura anterior</label><input name="previousReadDate" type="date" value="${esc(b.previousReadDate)}"></div><div class="field"><label>Data da leitura atual</label><input name="currentReadDate" type="date" value="${esc(b.currentReadDate)}"></div><div class="field"><label>Próxima leitura</label><input name="nextReadDate" type="date" value="${esc(b.nextReadDate)}"></div><div class="field"><label>Apartamentos por bloco</label><input name="groupSize" type="number" min="2" max="64" step="1" value="${billGroupSize(block)}"></div><div class="field"><label>Condomínio bruto (R$)</label><input name="condoFee" type="number" min="0" step="0.01" value="${b.condoFee}"></div><div class="field"><label>Serviço de leitura (R$)</label><input name="serviceFee" type="number" min="0" step="0.01" value="${b.serviceFee}"></div><div class="field"><label>Descrição do serviço</label><input name="serviceLabel" value="${esc(b.serviceLabel)}"></div><div class="field full"><label><input name="chargeService" type="checkbox" ${b.chargeService !== false ? 'checked' : ''}> Cobrar serviço de leitura neste mês</label></div><div class="field full"><label>Observações gerais — uma por linha</label><textarea name="notes" rows="5" placeholder="Cada linha aparece no boleto. Linhas em branco são ignoradas.">${esc(b.notes)}</textarea></div><div class="form-foot"><button class="primary" type="submit">Salvar e atualizar boletos</button></div></form></section><div class="billing-preview">${content || '<div class="card empty">Cadastre apartamentos antes de gerar boletos.</div>'}</div>`;
  };

  saveBilling = function(form) {
    const block = selected(); if (!block) return;
    const data = Object.fromEntries(new FormData(form));
    block.billing = normalizeBilling({ ...block.billing, ...data, groupSize: Math.min(64, Math.max(2, n(data.groupSize) || 16)), chargeService: data.chargeService === 'on', waterBill: n(data.waterBill), serviceFee: n(data.serviceFee), condoFee: n(data.condoFee) }, block.month);
    block.units.forEach(unit => {
      if (Object.prototype.hasOwnProperty.call(data, `billingNote_${unit.id}`)) unit.billingNote = String(data[`billingNote_${unit.id}`] || '');
    });
    save('Configuração de boletos atualizada'); render();
  };

  const handleChangeV537Base = handleChange;
  handleChange = function(event) {
    const target = event.target;
    const ruleField = target.closest('[data-rule-field]');
    if (ruleField) {
      const row = target.closest('[data-rule-row]'); const block = selected(); const unit = findUnit(block, row?.dataset.ruleRow); if (!unit) return;
      const field = target.dataset.ruleField;
      if (field === 'extraChargesText') {
        unit.extraCharge = 0; unit.extraChargeLabel = 'VALOR ADICIONAL'; unit.extraCharges = parseExtraCharges(target.value);
        save('Adicionais e abatimentos atualizados'); render(); return;
      }
      if (field === 'billingFineNote') { unit.billingFineNote = String(target.value || ''); save('Observação de multa atualizada'); render(); return; }
      if (field === 'billingNote') { unit.billingNote = String(target.value || ''); save('Observação do boleto atualizada'); render(); return; }
    }
    return handleChangeV537Base(event);
  };

  const renderV537Base = render;
  render = function() {
    if (location.hash === '#regras') location.hash = '#leituras';
    state.blocks.forEach(ensureV537);
    renderV537Base();
    refreshVersionLabelsV53();
  };



  // ===================== KR2MELO v5.3.12 =====================
  // Opção de cálculo igual à planilha Bloco 1938: mínimo fixo até 10 m³ + excedente por m³.
  function tariffV538(raw = {}) {
    const t = { ...DEFAULT_TARIFF, ...(raw || {}) };
    const mode = String(t.calculationMode || t.mode || '').trim();
    const wasOldDefault = n(raw?.minimum) === 64.6 && n(raw?.tier1) === 8.94 && n(raw?.tier2) === 13.82 && raw?.minimumM3 === undefined && raw?.tier1Limit === undefined;
    if (wasOldDefault) {
      t.minimum = DEFAULT_TARIFF.minimum;
      t.minimumM3 = DEFAULT_TARIFF.minimumM3;
      t.tier1 = DEFAULT_TARIFF.tier1;
      t.tier1Limit = DEFAULT_TARIFF.tier1Limit;
      t.tier2 = DEFAULT_TARIFF.tier2;
      t.tier2Limit = DEFAULT_TARIFF.tier2Limit;
    }
    const nonNegative = (value, fallback) => {
      const source = value === '' || value === null || value === undefined ? fallback : value;
      return Math.max(0, n(source));
    };
    return {
      ...t,
      calculationMode: mode === 'spreadsheet_1938' ? 'spreadsheet_1938' : 'tiered',
      minimum: nonNegative(t.minimum, DEFAULT_TARIFF.minimum),
      minimumM3: nonNegative(t.minimumM3, DEFAULT_TARIFF.minimumM3),
      tier1: nonNegative(t.tier1, DEFAULT_TARIFF.tier1),
      tier1Limit: Math.max(nonNegative(t.minimumM3, DEFAULT_TARIFF.minimumM3), nonNegative(t.tier1Limit, DEFAULT_TARIFF.tier1Limit)),
      tier2: nonNegative(t.tier2, DEFAULT_TARIFF.tier2),
      tier2Limit: Math.max(nonNegative(t.tier1Limit, DEFAULT_TARIFF.tier1Limit), nonNegative(t.tier2Limit, DEFAULT_TARIFF.tier2Limit)),
      sheetMinimum: nonNegative(t.sheetMinimum, 80.84),
      sheetAllowance: nonNegative(t.sheetAllowance, 10),
      sheetExcess: nonNegative(t.sheetExcess, 8.37)
    };
  }
  function tariffModeLabelV538(tariff) {
    const t = tariffV538(tariff);
    if (t.calculationMode === 'spreadsheet_1938') return `Planilha Bloco 1938 · ${money.format(t.sheetMinimum)} até ${fmtM3(t.sheetAllowance)} m³ + ${money.format(t.sheetExcess)}/m³ excedente`;
    return `Faixas do site · ${money.format(t.minimum)} até 10 m³; ${money.format(t.tier1)}/m³ de 11 a 20; ${money.format(t.tier2)}/m³ acima de 20`;
  }
  waterCost = function(m3, tariff) {
    const use = Math.max(0, n(m3));
    const t = tariffV538(tariff);
    if (t.calculationMode === 'spreadsheet_1938') {
      if (use <= t.sheetAllowance) return t.sheetMinimum;
      return t.sheetMinimum + (use - t.sheetAllowance) * t.sheetExcess;
    }
    const minimumM3 = Math.max(0, n(t.minimumM3));
    const tier1Limit = Math.max(minimumM3, n(t.tier1Limit));
    if (use <= minimumM3) return n(t.minimum);
    if (use <= tier1Limit) return n(t.minimum) + (use - minimumM3) * n(t.tier1);
    return n(t.minimum) + (tier1Limit - minimumM3) * n(t.tier1) + (use - tier1Limit) * n(t.tier2);
  };
  function ensureV538(block) {
    if (!block) return;
    ensureV537(block);
    block.tariff = tariffV538(block.tariff);
    recalculateBlock(block);
  }

  const waterCoverageCardV538Base = waterCoverageCard;
  waterCoverageCard = function(block) {
    ensureV538(block);
    const markup = waterCoverageCardV538Base(block);
    const summary = `<div class="info-box tariff-mode-box"><strong>Modelo de água ativo:</strong> ${esc(tariffModeLabelV538(block.tariff))}<br><small>Para trocar, vá em Configurações → Tarifa da água.</small></div>`;
    return markup.replace('</section>', `${summary}</section>`);
  };

  renderSettings = function(block) {
    ensureV538(block);
    const t = tariffV538(block.tariff);
    return `<section class="settings"><article class="card"><div class="card-head"><h3>Dados do condomínio</h3></div><form class="form-grid" id="blockForm"><div class="field"><label>Nome</label><input name="name" value="${esc(block.name)}" required></div><div class="field"><label>Referência atual</label><input name="month" type="month" value="${esc(block.month)}" required></div><div class="field full"><label>Endereço</label><input name="address" value="${esc(block.address)}"></div><div class="field full"><label>Responsável / síndico</label><input name="manager" value="${esc(block.manager)}"></div><div class="form-foot"><button class="primary" type="submit">Salvar alterações</button></div></form></article><article class="card"><div class="card-head"><div><h3>Tarifa da água</h3><span class="muted">Escolha o modelo de cálculo usado nas leituras, boletos, relatórios e fechamento.</span></div></div><form class="form-grid" id="tariffForm"><div class="field full"><label>Modelo de cálculo</label><select name="calculationMode"><option value="tiered" ${t.calculationMode === 'tiered' ? 'selected' : ''}>Faixas do site / SABESP simplificado</option><option value="spreadsheet_1938" ${t.calculationMode === 'spreadsheet_1938' ? 'selected' : ''}>Planilha Bloco 1938 · mínimo + excedente</option></select><small class="muted">Modelo ativo: ${esc(tariffModeLabelV538(t))}</small></div><div class="field full"><div class="info-box"><strong>Planilha Bloco 1938:</strong> até 10 m³ cobra o mínimo. Acima de 10 m³ cobra o mínimo + cada m³ excedente.</div></div><div class="field full"><h4>Modelo Planilha Bloco 1938</h4></div><div class="field"><label>Mínimo até a franquia (R$)</label><input name="sheetMinimum" type="number" min="0" step="0.01" value="${t.sheetMinimum}"></div><div class="field"><label>Franquia em m³</label><input name="sheetAllowance" type="number" min="0" step="0.001" value="${t.sheetAllowance}"></div><div class="field"><label>Excedente por m³ (R$)</label><input name="sheetExcess" type="number" min="0" step="0.01" value="${t.sheetExcess}"></div><div class="field full"><h4>Modelo por faixas do site</h4></div><div class="field full"><label>Mínimo até 10 m³ (R$)</label><input name="minimum" type="number" min="0" step="0.01" value="${t.minimum}"></div><div class="field"><label>De 11 a 20 m³ (R$/m³)</label><input name="tier1" type="number" min="0" step="0.01" value="${t.tier1}"></div><div class="field"><label>Acima de 20 m³ (R$/m³)</label><input name="tier2" type="number" min="0" step="0.01" value="${t.tier2}"></div><div class="form-foot"><button class="primary" type="submit">Salvar modelo e recalcular</button></div></form></article><article class="card"><h3>Backup e restauração</h3><p class="muted">O backup JSON protege leituras, regras, boletos, histórico e recibos. Fotos novas capturadas no celular ficam no armazenamento local do aparelho.</p><div class="button-row"><button class="secondary" data-export>Baixar backup</button><button class="secondary" data-import>Restaurar backup</button></div></article><article class="card"><h3>Zona de atenção</h3><p class="muted">A exclusão remove o condomínio, as leituras e o histórico armazenado neste navegador.</p><button class="danger" data-delete-block>Excluir condomínio</button></article></section>`;
  };

  const handleSubmitV538Base = handleSubmit;
  handleSubmit = function(event) {
    if (event.target.id === 'tariffForm') {
      event.preventDefault();
      const block = selected(); if (!block) return;
      const data = Object.fromEntries(new FormData(event.target));
      block.tariff = tariffV538({
        ...block.tariff,
        calculationMode: data.calculationMode === 'spreadsheet_1938' ? 'spreadsheet_1938' : 'tiered',
        minimum: n(data.minimum),
        minimumM3: n(data.minimumM3),
        tier1: n(data.tier1),
        tier1Limit: n(data.tier1Limit),
        tier2: n(data.tier2),
        tier2Limit: n(data.tier2Limit),
        sheetMinimum: n(data.sheetMinimum),
        sheetAllowance: n(data.sheetAllowance),
        sheetExcess: n(data.sheetExcess)
      });
      recalculateBlock(block);
      save(block.tariff.calculationMode === 'spreadsheet_1938' ? 'Modelo da planilha aplicado e água recalculada' : 'Modelo por faixas salvo e água recalculada');
      render();
      return;
    }
    return handleSubmitV538Base(event);
  };

  function tariffExampleRowsV539(tariff) {
    return [10, 11, 30].map(m3 => `<div><small>${fmtM3(m3)} m3</small><strong>${money.format(waterCost(m3, tariff))}</strong></div>`).join('');
  }

  renderSettings = function(block) {
    ensureV538(block);
    const t = tariffV538(block.tariff);
    return `<section class="settings"><article class="card"><div class="card-head"><h3>Dados do condominio</h3></div><form class="form-grid" id="blockForm"><div class="field"><label>Nome</label><input name="name" value="${esc(block.name)}" required></div><div class="field"><label>Referencia atual</label><input name="month" type="month" value="${esc(block.month)}" required></div><div class="field full"><label>Endereco</label><input name="address" value="${esc(block.address)}"></div><div class="field full"><label>Responsavel / sindico</label><input name="manager" value="${esc(block.manager)}"></div><div class="form-foot"><button class="primary" type="submit">Salvar alteracoes</button></div></form></article><article class="card tariff-editor-card"><div class="card-head"><div><h3>Tarifa da agua</h3><span class="muted">Campos editaveis para atualizar a tabela sempre que os valores mudarem.</span></div></div><form class="form-grid" id="tariffForm"><div class="field full"><label>Modelo de calculo</label><select name="calculationMode"><option value="tiered" ${t.calculationMode === 'tiered' ? 'selected' : ''}>Faixas editaveis - minimo + excedentes</option><option value="spreadsheet_1938" ${t.calculationMode === 'spreadsheet_1938' ? 'selected' : ''}>Planilha Bloco 1938 - minimo + excedente unico</option></select><small class="muted">Modelo ativo: ${esc(tariffModeLabelV538(t))}</small></div><div class="field full"><div class="info-box"><strong>Exemplo atual:</strong> 0 a 10 m3 = R$ 80,84. De 11 a 20 m3 = R$ 8,37 por m3 excedente. Acima de 20 m3 = R$ 10,87 por m3 excedente. Todos os campos abaixo podem ser editados.</div></div><div class="field full"><div class="tariff-preview">${tariffExampleRowsV539(t)}</div></div><div class="field"><label>Tarifa minima total (R$)</label><input name="minimum" type="number" min="0" step="0.01" value="${t.minimum}"></div><div class="field"><label>Minimo cobre ate (m3)</label><input name="minimumM3" type="number" min="0" step="0.001" value="${t.minimumM3}"></div><div class="field"><label>2a faixa - valor por m3 (R$)</label><input name="tier1" type="number" min="0" step="0.01" value="${t.tier1}"></div><div class="field"><label>2a faixa vai ate (m3)</label><input name="tier1Limit" type="number" min="0" step="0.001" value="${t.tier1Limit}"></div><div class="field"><label>3a faixa - valor por m3 (R$)</label><input name="tier2" type="number" min="0" step="0.01" value="${t.tier2}"></div><div class="field"><label>Referencia da 3a faixa ate (m3)</label><input name="tier2Limit" type="number" min="0" step="0.001" value="${t.tier2Limit}"></div><div class="field full"><h4>Modelo alternativo: minimo + excedente unico</h4></div><div class="field"><label>Minimo ate a franquia (R$)</label><input name="sheetMinimum" type="number" min="0" step="0.01" value="${t.sheetMinimum}"></div><div class="field"><label>Franquia em m3</label><input name="sheetAllowance" type="number" min="0" step="0.001" value="${t.sheetAllowance}"></div><div class="field"><label>Excedente unico por m3 (R$)</label><input name="sheetExcess" type="number" min="0" step="0.01" value="${t.sheetExcess}"></div><div class="form-foot"><button class="primary" type="submit">Salvar tarifa e recalcular</button></div></form></article><article class="card"><h3>Backup e restauracao</h3><p class="muted">O backup JSON protege leituras, regras, boletos, historico e recibos.</p><div class="button-row"><button class="secondary" data-export>Baixar backup</button><button class="secondary" data-import>Restaurar backup</button></div></article><article class="card"><h3>Zona de atencao</h3><p class="muted">A exclusao remove o condominio, as leituras e o historico armazenado neste navegador.</p><button class="danger" data-delete-block>Excluir condominio</button></article></section>`;
  };

  function tariffPeriodsV5311(block) {
    const raw = Array.isArray(block.tariffPeriods) ? block.tariffPeriods : [];
    const periods = raw.map(item => ({
      effectiveMonth: /^\d{4}-\d{2}$/.test(item?.effectiveMonth || '') ? item.effectiveMonth : block.month,
      tariff: tariffV538(item?.tariff || item || block.tariff)
    })).sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
    if (!periods.length) periods.push({ effectiveMonth: block.month, tariff: tariffV538(block.tariff) });
    return periods;
  }
  function tariffForMonthV5311(block, month = block.month) {
    return tariffPeriodsV5311(block).filter(item => item.effectiveMonth <= month).pop()?.tariff || tariffV538(block.tariff);
  }
  function tariffPeriodRowsV5311(block) {
    return tariffPeriodsV5311(block).map(item => `<tr><td>${esc(item.effectiveMonth)}</td><td>${esc(item.tariff.calculationMode === 'spreadsheet_1938' ? 'Minimo + excedente unico' : 'Faixas editaveis')}</td><td>${money.format(item.tariff.minimum)} ate ${fmtM3(item.tariff.minimumM3)} m3</td><td>${money.format(item.tariff.tier1)} / ${money.format(item.tariff.tier2)}</td></tr>`).join('');
  }
  function tariffEffectiveInfoV5311(block) {
    const active = tariffForMonthV5311(block, block.month);
    return `<div class="info-box tariff-effective-box"><strong>Tarifa aplicada em ${esc(block.month)}:</strong> ${esc(tariffModeLabelV538(active))}</div>`;
  }

  const handleSubmitV5311Base = handleSubmit;
  handleSubmit = function(event) {
    if (event.target.id === 'tariffForm') {
      event.preventDefault();
      const block = selected(); if (!block) return;
      const data = Object.fromEntries(new FormData(event.target));
      const effectiveMonth = /^\d{4}-\d{2}$/.test(data.effectiveMonth || '') ? data.effectiveMonth : block.month;
      const newTariff = tariffV538({
        calculationMode: data.calculationMode === 'spreadsheet_1938' ? 'spreadsheet_1938' : 'tiered',
        minimum: n(data.minimum), minimumM3: n(data.minimumM3),
        tier1: n(data.tier1), tier1Limit: n(data.tier1Limit),
        tier2: n(data.tier2), tier2Limit: n(data.tier2Limit),
        sheetMinimum: n(data.sheetMinimum), sheetAllowance: n(data.sheetAllowance), sheetExcess: n(data.sheetExcess)
      });
      const periods = tariffPeriodsV5311(block).filter(item => item.effectiveMonth !== effectiveMonth);
      periods.push({ effectiveMonth, tariff: newTariff });
      block.tariffPeriods = periods.sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
      block.tariff = tariffForMonthV5311(block, block.month);
      recalculateBlock(block);
      save(`Tarifa salva com vigencia em ${effectiveMonth}`);
      render();
      return;
    }
    return handleSubmitV5311Base(event);
  };

  const renderSettingsV5311Base = renderSettings;
  renderSettings = function(block) {
    ensureV538(block);
    const t = tariffForMonthV5311(block, block.month);
    block.tariff = t;
    const markup = renderSettingsV5311Base(block);
    const field = `<div class="field"><label>Vigencia da tarifa</label><input name="effectiveMonth" type="month" value="${esc(block.month)}"></div>`;
    const table = `<div class="field full"><h4>Tarifas por vigencia</h4>${tariffEffectiveInfoV5311(block)}<div class="table-wrap tariff-period-wrap"><table class="tariff-period-table"><thead><tr><th>Vigencia</th><th>Modelo</th><th>Minimo</th><th>Faixas</th></tr></thead><tbody>${tariffPeriodRowsV5311(block)}</tbody></table></div></div>`;
    return markup.replace('<div class="field full"><div class="info-box"><strong>Exemplo atual:', `${field}<div class="field full"><div class="info-box"><strong>Exemplo atual:`).replace('<div class="form-foot"><button class="primary" type="submit">Salvar tarifa e recalcular</button></div>', `${table}<div class="form-foot"><button class="primary" type="submit">Salvar tarifa e recalcular</button></div>`);
  };

  const ensureV5311Base = ensureV538;
  ensureV538 = function(block) {
    ensureV5311Base(block);
    block.tariffPeriods = tariffPeriodsV5311(block);
    block.tariff = tariffForMonthV5311(block, block.month);
    recalculateBlock(block);
  };

  routes.proposta = ['COMERCIAL', 'Proposta de trabalho'];

  function proposalDocumentMarkup() {
    const issued = dateBr(today());
    return `<article class="proposal-document" id="proposalDocument"><header class="proposal-header"><div><img src="assets/logo.png" alt="KR2MELO"><span>KR2MELO CONTRATADA</span></div><aside><strong>Proposta de trabalho</strong><small>Gestao de leitura individual de hidrometros</small><small>Emitida em ${issued}</small></aside></header><section class="proposal-hero"><p class="eyebrow">SERVICO PARA ADMINISTRADORAS, CONDOMINIOS E BLOCOS</p><h1>Leitura de hidrometros, calculo individual de consumo e emissao organizada dos boletos mensais.</h1><p>A KR2MELO oferece um processo completo para condominios e blocos de apartamentos que precisam controlar o consumo individual de agua com clareza, rapidez e documentacao pronta para conferencia.</p></section><section class="proposal-grid"><div><h2>Como o servico funciona</h2><ol><li>Cadastro do condominio, bloco e apartamentos no sistema.</li><li>Coleta das leituras in loco pelo celular, com historico rapido por apartamento.</li><li>Calculo automatico do consumo individual, tarifa, condominio, servico e lancamentos extras.</li><li>Geracao de boletos organizados por bloco, com capa, contracapa e vias de sindico/morador.</li><li>Relatorios para sindico, recibos, historico mensal e backup dos dados.</li></ol></div><div><h2>Beneficios para a administradora</h2><ul><li>Menos retrabalho na conferencia das leituras e valores.</li><li>Padronizacao dos boletos entregues aos moradores.</li><li>Historico mensal preservado para consultas futuras.</li><li>Reducao de erros manuais em calculos por faixa de consumo.</li><li>Mais transparencia para sindicos, tesoureiros e moradores.</li></ul></div></section><section class="proposal-services"><h2>Servicos prestados</h2><div><span>Leitura mensal de hidrometros</span><span>Cadastro de apartamentos e responsaveis</span><span>Calculo individual de agua</span><span>Configuracao de tarifas por vigencia</span><span>Emissao de boletos para impressao</span><span>Relatorio mensal do sindico</span><span>Recibos de servico</span><span>Backup e restauracao dos dados</span></div></section><section class="proposal-benefit"><h2>Por que contratar</h2><p>Com o sistema KR2MELO, a administradora passa a receber um fechamento mensal mais organizado, com dados conferiveis, documentos padronizados e reducao de falhas comuns em controles feitos apenas por planilhas. O servico ajuda o condominio a cobrar de forma mais justa, com base no consumo real de cada unidade.</p></section><section class="proposal-conditions"><h2>Escopo da proposta</h2><p>Esta proposta contempla a prestacao de servico de leitura e organizacao mensal dos documentos de cobranca de agua individualizada. Valores, periodicidade, quantidade de unidades atendidas e condicoes comerciais podem ser ajustados conforme cada condominio ou bloco.</p></section><footer class="proposal-signatures"><div><span>Contratante / Administradora</span></div><div><img src="assets/assinatura.png" alt="Assinatura KR2MELO"><span>KR2MELO CONTRATADA</span></div></footer></article>`;
  }
  function renderProposal() {
    const subject = encodeURIComponent('Proposta de trabalho - KR2MELO Contratada');
    const body = encodeURIComponent('Ola,\n\nSegue proposta de trabalho da KR2MELO para leitura de hidrometros, calculo individual de consumo e organizacao mensal dos boletos.\n\nAbra o anexo/PDF gerado pelo sistema para avaliacao.\n\nAtenciosamente,\nKR2MELO Contratada');
    return `<section class="section-actions no-print"><div><h2>Proposta de trabalho</h2><span class="muted">Documento comercial para salvar em PDF, imprimir ou enviar para administradoras.</span></div><div class="button-row"><button class="primary" data-print-proposal type="button">Salvar PDF / imprimir</button><a class="secondary" href="mailto:?subject=${subject}&body=${body}">Enviar por e-mail</a></div></section>${proposalDocumentMarkup()}`;
  }
  function printProposal() {
    printHtml('Proposta de trabalho KR2MELO', proposalDocumentMarkup());
  }

  const handleClickV5312Base = handleClick;
  handleClick = function(event) {
    if (event.target.closest('[data-print-proposal]')) { printProposal(); return; }
    return handleClickV5312Base(event);
  };

  const renderProposalBase = render;
  render = function() {
    if (location.hash === '#proposta') {
      refreshPicker();
      $('#pageEyebrow').textContent = routes.proposta[0];
      $('#pageTitle').textContent = routes.proposta[1];
      $$('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === 'proposta'));
      const app = $('#app');
      app.innerHTML = renderProposal();
      app.focus({ preventScroll: true });
      refreshVersionLabelsV53();
      return;
    }
    renderProposalBase();
  };

  const renderV538Base = render;
  render = function() {
    state.blocks.forEach(ensureV538);
    renderV538Base();
    refreshVersionLabelsV53();
  };

  setTimeout(bootstrapCloudV52, 250);

  maybeWeeklySnapshot();

  bindStatic();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();

(() => {
  'use strict';

  const KEY = 'kr2melo.hidrometro.v1';
  const APP_VERSION = '5.3.31';
  const DEFAULT_TARIFF = { minimum: 80.84, minimumM3: 10, tier1: 8.37, tier1Limit: 20, tier2: 10.87, tier2Limit: 30 };
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const deepClone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const esc = (value = '') => { const node = document.createElement('div'); node.textContent = String(value ?? ''); return node.innerHTML; };
  const n = value => Number(value) || 0;
  function normalizeMeterReadingV5320(value) {
    if (value === '' || value === null || value === undefined) return null;
    const numeric = Number(String(value).replace(',', '.').trim());
    return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : null;
  }
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

  const roleLabels = { normal: 'Sem função', sindico: 'Síndico', secretario: 'Secretário', tesoureiro: 'Tesoureiro', diretoria: 'Outro membro da diretoria', indicado: 'Indicado pelo síndico' };
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
  function orderUnits(units = []) {
    return [...units].sort(routeCompare);
  }
  function orderBlockUnits(block) {
    if (Array.isArray(block?.units)) block.units = orderUnits(block.units);
    return block;
  }
  function pinHash(value) {
    let hash = 2166136261;
    for (const char of String(value || '')) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return String(hash >>> 0);
  }
  function recordUnitChange(block, unit, type, field, oldValue, newValue) {
    if (!block || !unit || String(oldValue ?? '') === String(newValue ?? '')) return;
    const entry = {
      id: uid(),
      at: new Date().toISOString(),
      operator: block.operator || 'Operador',
      type,
      field,
      oldValue: String(oldValue ?? ''),
      newValue: String(newValue ?? '')
    };
    unit.changeLog = Array.isArray(unit.changeLog) ? unit.changeLog : [];
    unit.changeLog.unshift(entry);
    unit.changeLog = unit.changeLog.slice(0, 50);
  }
  function unitChangeSummary(unit) {
    const items = Array.isArray(unit.changeLog) ? unit.changeLog.slice(0, 3) : [];
    if (!items.length) return '<small class="muted">Sem alterações registradas.</small>';
    return `<div class="unit-change-log">${items.map(item => `<small>${esc(auditDate(item.at))} · ${esc(item.field)}: ${esc(item.oldValue || '—')} → ${esc(item.newValue || '—')}</small>`).join('')}</div>`;
  }

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
    const role = ['normal', 'sindico', 'secretario', 'tesoureiro', 'diretoria', 'indicado'].includes(r.role) ? r.role : 'normal';
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
      mobileReopened: Boolean(u.mobileReopened),
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
      discountTarget: ['condo', 'water', 'total'].includes(u.discountTarget) ? u.discountTarget : 'condo',
      changeLog: Array.isArray(u.changeLog) ? u.changeLog.slice(0, 50) : [],
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
    const units = Array.isArray(h.units) ? orderUnits(h.units.map((u, i) => normalizeUnit(u, i))) : [];
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
      state.blocks.forEach(orderBlockUnits);
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
    unit.value = current === null ? 0 : waterCost(unit.m3, block.tariff);
  }
  function recalculateBlock(block) { orderBlockUnits(block).units.forEach(unit => recalculateUnit(unit, block)); }
  function ruleActive(rule, month) {
    if (!rule || rule.mode === 'normal') return false;
    const start = String(rule.startsAt || '').slice(0, 7);
    const end = String(rule.endsAt || '').slice(0, 7);
    return (!start || start <= month) && (!end || end >= month);
  }
  function unitCharges(unit, block, options = {}) {
    const billing = options.billing || block.billing || defaultBilling(block.month);
    const month = options.month || block.month;
    const hasReading = options.hasReading ?? (options.current !== undefined ? options.current !== '' : unit.current !== '');
    const water = options.water ?? (hasReading ? waterCost(options.m3 ?? unit.m3, options.tariff || block.tariff) : 0);
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
    select.innerHTML = state.blocks.length
      ? state.blocks.map(item => `<option value="${item.id}" ${item.id === block?.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')
      : '<option>Cadastre o primeiro prédio</option>';
    select.disabled = !state.blocks.length;
    if (block && state.selected !== block.id) { state.selected = block.id; save(); }
    const picker = select.closest('.global-building-picker');
    if (picker) picker.dataset.currentBuilding = block?.name || '';
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
    return `${waterCoverageCard(block)}<div class="section-actions"><div><h2>${monthLabel(block.month)}</h2><span class="muted">Importe uma planilha Excel/CSV ou digite a Leitura Atual. As regras de desconto são preservadas.</span></div><div class="button-row"><button class="secondary" data-import-readings type="button">⇧ Importar Excel/CSV</button><button class="secondary" data-export-readings type="button">⇩ Planilha Excel (.csv)</button><button class="secondary" data-export-readings-xlsx type="button">⇩ Modelo .xlsx</button><button class="secondary" data-add-unit type="button">+ Unidade</button><button class="primary" data-go="fechamento" type="button">Fechamento mensal</button></div></div><section class="reading-bulk-actions card no-print"><div><strong><span data-reading-selection-count>${selectedCount}</span> selecionada(s)</strong><small>Use a caixa da primeira coluna para escolher leituras. “Limpar” preserva apartamento e leitura anterior.</small></div><div class="button-row"><button class="secondary" data-select-all-readings type="button">Selecionar todas</button><button class="secondary" data-clear-selected-readings type="button" ${selectedCount ? '' : 'disabled'}>Limpar selecionadas</button><button class="danger" data-clear-all-readings type="button">Limpar todas as leituras</button><button class="danger" data-remove-selected-units type="button" ${selectedCount ? '' : 'disabled'}>Excluir cadastros selecionados</button></div></section><div class="table-wrap"><table><thead><tr><th class="reading-check"><input type="checkbox" data-select-all-readings aria-label="Selecionar todas as leituras"></th><th>Apto / Hidrômetro</th><th>Responsável</th><th>Anterior</th><th>Atual</th><th>Consumo</th><th>Status</th><th>Água</th><th>Desconto</th><th>Valor final</th><th>Observação</th><th></th></tr></thead><tbody>${block.units.map(unit => { const issue = readingIssue(unit), checked = selectedIds.has(unit.id); return `<tr data-reading-row="${unit.id}" class="${issue ? `reading-issue ${issue.type}` : ''}"><td class="reading-check"><input data-reading-select type="checkbox" value="${unit.id}" ${checked ? 'checked' : ''} aria-label="Selecionar apartamento ${esc(unit.number)}"></td><td><input data-reading-field="number" value="${esc(unit.number)}" aria-label="Apartamento"></td><td><input data-reading-field="resident" value="${esc(unit.resident)}" placeholder="Nome"></td><td><input data-reading-field="previous" type="number" min="0" step="0.001" value="${unit.previous}"></td><td><input data-reading-field="current" type="number" min="0" step="1" value="${unit.current}"></td><td class="value">${fmtM3(unit.m3)} m³</td><td>${readingBadge(unit)}</td><td class="value">${money.format(unit.value)}</td><td class="value">${money.format(unitCharges(unit, block).condoDiscount)}</td><td class="value"><strong>${money.format(unitCharges(unit, block).total)}</strong></td><td><input data-reading-field="note" value="${esc(unit.note)}" placeholder="Opcional"></td><td><div class="row-actions"><button class="secondary" data-estimate-unit="${unit.id}" title="Criar leitura pela média dos 2 últimos meses" type="button">Média 2 meses</button><button class="danger" data-remove-unit title="Excluir cadastro do apartamento" type="button">×</button></div></td></tr>`; }).join('')}</tbody><tfoot><tr><td></td><td colspan="4">TOTAL DE ÁGUA</td><td>${fmtM3(totals.m3)} m³</td><td></td><td>${money.format(totals.water)}</td><td colspan="4"></td></tr></tfoot></table></div>`;
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
    const charges = block.units.map(unit => { const c = unitCharges(unit, block); return { unitId: unit.id, number: unit.number, resident: unit.resident, m3: unit.m3, water: c.water, waterGross: n(c.waterGross || c.water), waterDiscount: n(c.waterDiscount), grossCondo: c.grossCondo, condoDiscount: c.condoDiscount, condo: c.condo, service: c.service, extraCharge: c.extraCharge, extraChargeLabel: unit.extraChargeLabel, fine: c.fine, totalDiscount: n(c.totalDiscount), discountTotal: n(c.discountTotal || c.condoDiscount), discountTarget: c.discountTarget || unit.discountTarget || 'condo', total: c.total, rule: deepClone(c.rule), fineLabel: unit.billingFineLabel, fineNote: unit.billingFineNote || '', billingNote: unit.billingNote || '', paid: unit.paid, paymentDate: unit.paymentDate }; });
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

    // v5.3.23: imprime no proprio documento para nao depender de pop-ups.
    // A classe temporaria isola somente o resumo mensal do sindico.
    document.body.classList.add('printing-monthly-report');
    report.classList.add('monthly-report-print-target');

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove('printing-monthly-report');
      report.classList.remove('monthly-report-print-target');
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup, { once: true });
    try {
      window.focus();
      window.print();
      // Alguns navegadores nao disparam afterprint quando a impressao e cancelada.
      setTimeout(cleanup, 1500);
    } catch (error) {
      cleanup();
      console.error('Falha ao imprimir relatório mensal:', error);
      toast('Não foi possível abrir a impressão. Tente novamente.', true);
    }
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
      const current = normalizeMeterReadingV5320(raw); if (current === null) { ignored++; continue; }
      let unit = byApt.get(normalizedHeader(apt));
      if (!unit) { unit = normalizeUnit({ id: uid(), number: apt, resident: '', previous: 0, current: '' }, block.units.length); block.units.push(unit); byApt.set(normalizedHeader(apt), unit); created++; } else updated++;
      if (previousCol >= 0 && isSet(row[previousCol]) && String(row[previousCol]).trim() !== '') unit.previous = n(String(row[previousCol]).replace(',', '.'));
      if (residentCol >= 0 && String(row[residentCol] ?? '').trim()) unit.resident = String(row[residentCol]).trim();
      unit.current = current; unit.mobileDone = true; unit.mobileReopened = false; unit.mobileSavedAt = new Date().toISOString(); unit.readingType = 'real'; if (unit.operationalStatus === 'sem_acesso' || unit.operationalStatus === 'estimada') unit.operationalStatus = 'ocupado'; unit.estimatedReason = ''; recalculateUnit(unit, block);
      const issue = readingIssue(unit); if (issue && !unit.note.includes(issue.short)) unit.note = [unit.note, `${issue.short} ${issue.text}`].filter(Boolean).join(' | ');
    }
    if (!updated && !created) throw new Error('A planilha não contém leituras atuais preenchidas.');
    save(`${updated} leitura(s) atualizada(s)${created ? ` e ${created} unidade(s) criada(s)` : ''}${ignored ? ` · ${ignored} linha(s) ignorada(s)` : ''}`); render();
  }

  function handleClick(event) {
    const target = event.target;
    const adjustmentToggle = target.closest('[data-toggle-adjustment-center]');
    if (adjustmentToggle) {
      const block = selected();
      if (!block) return;
      setAdjustmentCenterCollapsedV5320(block, !adjustmentCenterCollapsedV5320(block));
      render();
      return;
    }
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
    if (target.id === 'blockSelect') {
      const previous = selected();
      state.selected = target.value;
      const next = selected();
      save();
      render();
      if (next && next.id !== previous?.id) toast(`Prédio alterado para ${next.name}.`);
      return;
    }
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
  function averageHistoricConsumption(block, unit, take = 2) {
    const series = historySeries(block, unit).filter(item => item.m3 >= 0).slice(-take);
    if (series.length < take) return null;
    return series.reduce((sum, item) => sum + item.m3, 0) / series.length;
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
    const totals = charges.reduce((sum, row) => { sum.m3 += n(row.m3); sum.water += n(row.water); sum.discount += n(row.discountTotal || row.condoDiscount); sum.total += n(row.total); return sum; }, { m3: 0, water: 0, discount: 0, total: 0 });
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
    return `<section class="hero"><div><p class="eyebrow">CADASTRO TÉCNICO</p><h2>Unidades, moradores e hidrômetros</h2><p>Controle técnico para trocas de equipamento, imóveis vazios, leituras estimadas e contato do morador.</p></div><div><button class="secondary" data-go="leituras">Abrir leituras →</button></div></section><div class="table-wrap"><table class="technical-table"><thead><tr><th>Apto</th><th>Responsável</th><th>WhatsApp</th><th>Situação</th><th>Serial do hidrômetro</th><th>Localização</th><th>Instalação</th><th>Troca</th><th>Leitura inicial</th><th>Tipo de leitura</th><th>Motivo / observação</th><th></th></tr></thead><tbody>${block.units.map(unit => { const m = normalizeMeter(unit.meter); return `<tr data-tech-row="${unit.id}"><td><strong>${esc(unit.number)}</strong></td><td>${esc(unit.resident || '—')}</td><td><input data-tech-field="phone" value="${esc(unit.phone)}" placeholder="5511999999999"></td><td><select data-tech-field="operationalStatus">${Object.entries(operationLabels).map(([key,label]) => `<option value="${key}" ${unit.operationalStatus === key ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td><input data-tech-field="meter.serial" value="${esc(m.serial)}" placeholder="Nº do hidrômetro"></td><td><input data-tech-field="meter.location" value="${esc(m.location)}" placeholder="Ex.: garagem"></td><td><input data-tech-field="meter.installedAt" type="date" value="${esc(m.installedAt)}"></td><td><input data-tech-field="meter.replacedAt" type="date" value="${esc(m.replacedAt)}"></td><td><input data-tech-field="meter.initialReading" type="number" min="0" step="0.001" value="${m.initialReading || ''}"></td><td><span class="pill ${unit.readingType === 'estimated' ? 'warn' : 'ok'}">${unit.readingType === 'estimated' ? 'Estimativa' : 'Real'}</span></td><td><input data-tech-field="estimatedReason" value="${esc(unit.estimatedReason)}" placeholder="Ex.: sem acesso"></td><td><button class="secondary" data-estimate-unit="${unit.id}" type="button">Estimar</button></td></tr>`; }).join('')}</tbody></table></div><section class="card" style="margin-top:16px"><h3>Como usar a leitura estimada</h3><p class="muted">Use somente quando não houver acesso ao hidrômetro. O sistema usa a média de consumo dos 2 últimos períodos disponíveis, soma esse consumo médio à leitura anterior, marca o resultado como estimado e preserva o motivo no histórico.</p></section>`;
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
    const average = averageHistoricConsumption(block, unit, 2); if (average === null) return toast('São necessários dois meses no histórico para calcular a média deste apartamento.', true);
    const estimated = normalizeMeterReadingV5320(n(unit.previous) + average);
    if (!confirm(`Criar leitura estimada para o Apto ${unit.number}?\n\nBase: média de ${fmtM3(average)} m³ dos 2 últimos meses\nLeitura anterior: ${fmtM3(unit.previous)}\nLeitura estimada: ${fmtM3(estimated)}`)) return;
    unit.current = estimated; unit.mobileDone = true; unit.mobileReopened = false; unit.mobileSavedAt = new Date().toISOString(); unit.readingType = 'estimated'; unit.operationalStatus = unit.operationalStatus === 'ocupado' ? 'estimada' : unit.operationalStatus; unit.estimatedReason = 'Estimativa pela média dos 2 últimos meses'; recalculateUnit(unit, block);
    audit(block, 'Leitura estimada', `Apto ${unit.number}: ${fmtM3(average)} m³ pela média dos 2 últimos meses.`, { unitId: unit.id, average, estimated }); save('Leitura estimada registrada'); render();
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
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Dashboard anual KR²MELO</title><link rel="stylesheet" href="${cssUrl}"><style>@page{size:A4 landscape;margin:8mm}@media print{.annual-print-document .hero{display:block!important;background:#fff!important;color:#111!important;border:1px solid #111!important;padding:5mm!important}.annual-print-document .hero:after{display:none!important}.annual-print-document .hero p{color:#444!important}.annual-print-document .button-row,.annual-print-document .annual-controls,.annual-print-document .no-print{display:none!important}.annual-print-document .metrics{grid-template-columns:repeat(4,1fr)!important}.annual-print-document .metric{padding:3mm!important}.annual-print-document .annual-table{min-width:0!important;font-size:7pt!important}.annual-print-document .annual-table th,.annual-print-document .annual-table td{padding:1.7mm 1mm!important}.annual-print-document .annual-table-card{margin-top:3mm!important}.annual-print-document .table-wrap{overflow:visible!important}}</style></head><body><main class="annual-print-document">${content}</main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));<\/script></body></html>`);
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
    const printRowsV5320 = rows.map(row => `<tr>
      <td><strong>${esc(row.number)}</strong><br><small>${esc(row.resident || '—')}</small></td>
      <td>${row.previous === '' || row.previous === null || row.previous === undefined ? '—' : fmtM3(row.previous)}</td>
      <td>${row.current === '' || row.current === null || row.current === undefined ? '—' : fmtM3(row.current)}</td>
      <td><strong>${fmtM3(row.m3)} m³</strong></td>
      <td>${money.format(row.fine)}</td>
      <td class="${row.extraCharge < 0 ? 'adjustment' : ''}">${money.format(row.extraCharge)}</td>
      <td><strong>${money.format(row.total)}</strong></td>
    </tr>`).join('') || '<tr><td colspan="7">Nenhum apartamento disponível neste período.</td></tr>';
    const tableRows = rows.map(row => `<tr><td><strong>${esc(row.number)}</strong></td><td>${esc(row.resident || '—')}</td><td>${fmtM3(row.m3)} m³</td><td>${money.format(row.water)}</td><td>${money.format(row.condo)}</td><td class="adjustment">${row.condoDiscount ? `− ${money.format(row.condoDiscount)}` : '—'}</td><td>${money.format(row.service)}</td><td>${money.format(row.fine)}</td><td class="value">${money.format(row.total)}</td></tr>`).join('') || '<tr><td colspan="9">Nenhum apartamento disponível neste período.</td></tr>';
    return `${reportPeriodQuickListV522(block, entry)}<section class="monthly-report" id="monthlyReportPrint" data-report-period="${esc(period)}" data-report-archived="${archived ? 'true' : 'false'}"><div class="section-actions no-print"><div><h2>Relatório mensal</h2><span class="muted">Período aberto: <strong>${esc(periodLabel)}</strong></span></div><div class="button-row"><button class="secondary" data-export-report-csv type="button">Exportar CSV</button><button class="primary" data-print-report type="button">Imprimir A4 retrato</button></div></div><div class="report-context-note ${archived ? 'archived' : 'current'}"><strong>${archived ? 'Relatório do histórico mensal' : 'Relatório da competência atual'}</strong><span>${esc(origin)}</span></div><header class="report-print-header"><div><p class="eyebrow">KR²MELO · GESTÃO DE ÁGUA</p><h2>Relatório mensal</h2><p>${esc(block.name)} · Referência: <strong>${esc(periodLabel)}</strong></p></div><div class="report-print-meta"><span>Unidades: <b>${rows.length}</b></span><span>${archived ? 'Fechado em' : 'Emitido em'}: <b>${archived && entry?.closedAt ? auditDate(entry.closedAt) : dateBr(today())}</b></span></div></header><div class="report-coverage">${reportCoverageCardV521(context)}</div><section class="finance-summary report-finance-summary"><div><small>Água</small><strong>${money.format(totals.water)}</strong></div><div><small>Condomínio bruto</small><strong>${money.format(totals.grossCondo)}</strong></div><div><small>Isenções / descontos</small><strong>${money.format(totals.discount)}</strong></div><div><small>Condomínio líquido</small><strong>${money.format(totals.condo)}</strong></div><div><small>Serviço + outros</small><strong>${money.format(totals.service + totals.fine)}</strong></div><div><small>Total mensal</small><strong>${money.format(totals.total)}</strong></div></section><div class="report-dates"><span><b>Leitura anterior:</b> ${dateBr(billing.previousReadDate)}</span><span><b>Leitura atual:</b> ${dateBr(billing.currentReadDate)}</span><span><b>Vencimento:</b> ${dateBr(billing.dueDate)}</span><span><b>Próxima leitura:</b> ${dateBr(billing.nextReadDate)}</span></div><div class="table-wrap report-table-wrap"><table class="monthly-report-table"><thead><tr><th>Apto</th><th>Responsável</th><th>Consumo</th><th>Água</th><th>Condomínio</th><th>Desconto</th><th>Serviço</th><th>Outros</th><th>Total</th></tr></thead><tbody>${tableRows}</tbody><tfoot><tr><td colspan="3">TOTAL</td><td>${money.format(totals.water)}</td><td>${money.format(totals.condo)}</td><td>− ${money.format(totals.discount)}</td><td>${money.format(totals.service)}</td><td>${money.format(totals.fine)}</td><td>${money.format(totals.total)}</td></tr></tfoot></table></div><section class="monthly-report-print-simple" aria-label="Resumo de apartamentos para impressão">
  <header class="simple-report-head">
    <div><p class="eyebrow">KR²MELO · GESTÃO DE ÁGUA</p><h2>Relatório mensal dos apartamentos</h2><p>${esc(block.name)} · <strong>${esc(periodLabel)}</strong></p></div>
    <div class="simple-report-meta">Emitido em ${dateBr(today())}</div>
  </header>
  <table class="simple-monthly-table">
    <thead><tr><th>Apto / Responsável</th><th>Anterior</th><th>Atual</th><th>Consumo</th><th>Multas / Outros</th><th>Adicionais / Abatimentos</th><th>Total</th></tr></thead>
    <tbody>${printRowsV5320}</tbody>
    <tfoot><tr><td colspan="3"><strong>TOTAL DO PERÍODO</strong></td><td><strong>${fmtM3(totals.m3)} m³</strong></td><td><strong>${money.format(totals.fine)}</strong></td><td><strong>${money.format(totals.extraCharge)}</strong></td><td><strong>${money.format(totals.total)}</strong></td></tr></tfoot>
  </table>
</section><footer class="report-print-footer">KR²MELO · ${archived ? 'Relatório histórico preservado no fechamento mensal' : 'Relatório para conferência do síndico'}</footer></section>`;
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

    // v5.3.23 — impressão do Relatório mensal por período (atual ou histórico)
    // sem pop-up, usando exatamente o relatório que está aberto na Gestão de Relatórios.
    const archived = report.dataset.reportArchived === 'true';
    document.body.classList.add('printing-monthly-report');
    report.classList.add('monthly-report-print-target');
    report.dataset.printingReport = archived ? 'historico' : 'atual';

    const simplePrint = report.querySelector('.monthly-report-print-simple');
    if (simplePrint) {
      simplePrint.style.transform = '';
      simplePrint.style.transformOrigin = '';
      simplePrint.style.width = '';
      const maxPx = (284 / 25.4) * 96;
      const currentHeight = simplePrint.scrollHeight;
      if (currentHeight > maxPx) {
        const scale = Math.max(0.72, Math.min(1, (maxPx / currentHeight) * 0.995));
        simplePrint.style.transformOrigin = 'top left';
        simplePrint.style.transform = `scale(${scale})`;
        simplePrint.style.width = `${100 / scale}%`;
      }
    }

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove('printing-monthly-report');
      report.classList.remove('monthly-report-print-target');
      delete report.dataset.printingReport;
      const simplePrint = report.querySelector('.monthly-report-print-simple');
      if (simplePrint) {
        simplePrint.style.transform = '';
        simplePrint.style.transformOrigin = '';
        simplePrint.style.width = '';
      }
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup, { once: true });
    try {
      window.focus();
      window.print();
      setTimeout(cleanup, 1500);
    } catch (error) {
      cleanup();
      console.error('Falha ao imprimir o relatório mensal por período:', error);
      toast('Não foi possível abrir a impressão do relatório mensal.', true);
    }
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
      let force = false;
      if (remote?.updated_at && c.remoteUpdatedAt && remote.updated_at !== c.remoteUpdatedAt) {
        const ok = confirm(`A cópia na nuvem foi alterada em ${auditDate(remote.updated_at)} depois da última sincronização deste aparelho.\n\nEnviar agora pode substituir dados de outro aparelho. Deseja continuar?`);
        if (!ok) { render(); return; }
        force = true;
      }
      await window.KR2Sync.pushState(deepClone(state), { force });
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

  // ===================== KR2MELO v5.3.13 =====================
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
    const context = reportContextV521(block);
    const { entry, archived, period, rows, totals } = context;
    const periodLabel = monthLabel(period);
    const tableRows = rows.map(row => `<tr>
      <td>${esc(row.number)}</td>
      <td>${esc(row.resident || '—')}</td>
      <td>${row.previous === '' || row.previous === null || row.previous === undefined ? '—' : fmtM3(row.previous)}</td>
      <td>${row.current === '' || row.current === null || row.current === undefined ? '—' : fmtM3(row.current)}</td>
      <td>${fmtM3(row.m3)} m³</td>
      <td>${money.format(row.extraCharge)}</td>
      <td>${money.format(row.fine)}</td>
      <td><strong>${money.format(row.total)}</strong></td>
    </tr>`).join('');

    return `<section class="monthly-report manager-report" id="managerReportPrint">
      <header class="report-print-header">
        <div>
          <p class="eyebrow">KR²MELO · RELATÓRIO DO SÍNDICO</p>
          <h2>${esc(block.name)}</h2>
          <p>Referência: <strong>${esc(periodLabel)}</strong></p>
        </div>
        <div class="report-print-meta">
          <span>Unidades: <b>${rows.length}</b></span>
          <span>${archived ? 'Período histórico' : 'Competência atual'}</span>
          ${archived && entry?.closedAt ? `<span>Fechado em: <b>${auditDate(entry.closedAt)}</b></span>` : `<span>Emitido em: <b>${dateBr(today())}</b></span>`}
        </div>
      </header>

      <section class="finance-summary report-finance-summary">
        <div><small>Água</small><strong>${money.format(totals.water)}</strong></div>
        <div><small>Condomínio</small><strong>${money.format(totals.condo)}</strong></div>
        <div><small>Descontos</small><strong>${money.format(totals.discount)}</strong></div>
        <div><small>Adicionais</small><strong>${money.format(totals.extraCharge || 0)}</strong></div>
        <div><small>Outros</small><strong>${money.format(totals.fine)}</strong></div>
        <div><small>Total</small><strong>${money.format(totals.total)}</strong></div>
      </section>

      <div class="table-wrap report-table-wrap">
        <table class="monthly-report-table">
          <thead><tr><th>Apto</th><th>Responsável</th><th>Anterior</th><th>Atual</th><th>Consumo</th><th>Adicionais</th><th>Outros</th><th>Total</th></tr></thead>
          <tbody>${tableRows}</tbody>
          <tfoot><tr><td colspan="4">TOTAL</td><td>${fmtM3(totals.m3)} m³</td><td>${money.format(totals.extraCharge || 0)}</td><td>${money.format(totals.fine)}</td><td>${money.format(totals.total)}</td></tr></tfoot>
        </table>
      </div>
      <footer class="report-print-footer">KR²MELO · Relatório do síndico · ${esc(periodLabel)}</footer>
    </section>`;
  }

  function printManagerReport() {
    const block = selected();
    if (!block) return;
    const context = reportContextV521(block);
    const periodLabel = monthLabel(context.period);
    printHtml(`Relatório do síndico KR²MELO · ${periodLabel}`, managerReportMarkup(block));
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


  // ===================== KR2MELO v5.3.13 =====================
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

  const ADJUSTMENT_COLLAPSE_KEY_V5320 = `${KEY}.adjustmentCenterCollapsed`;
  function adjustmentCenterCollapsedV5320(block) {
    try {
      const saved = JSON.parse(localStorage.getItem(ADJUSTMENT_COLLAPSE_KEY_V5320) || '{}');
      return Boolean(saved?.[block?.id]);
    } catch { return false; }
  }
  function setAdjustmentCenterCollapsedV5320(block, collapsed) {
    if (!block?.id) return;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(ADJUSTMENT_COLLAPSE_KEY_V5320) || '{}') || {}; } catch {}
    saved[block.id] = Boolean(collapsed);
    localStorage.setItem(ADJUSTMENT_COLLAPSE_KEY_V5320, JSON.stringify(saved));
  }

  function adjustmentCenterV537(block) {
    ensureV537(block);
    const totals = chargeTotals(block);
    const activeRules = block.units.filter(unit => ruleActive(unit.condoRule, block.month) && unit.condoRule.mode !== 'normal').length;
    const extras = block.units.reduce((sum, unit) => sum + extraChargeItems(unit).reduce((a, item) => a + n(item.value), 0), 0);
    const fines = block.units.reduce((sum, unit) => sum + Math.max(0, n(unit.billingFine)), 0);
    const collapsed = adjustmentCenterCollapsedV5320(block);
    return `<section class="card adjustment-center no-print ${collapsed ? 'is-collapsed' : ''}" data-adjustment-center><div class="card-head adjustment-center-head"><div><h3>Lançamentos e ajustes por apartamento</h3><span class="muted">Multas/outros, observações, descontos, valores adicionais e abatimentos ficam juntos nesta tela.</span></div><div class="adjustment-head-actions"><div class="button-row"><span class="pill info">${activeRules} regra(s)</span><span class="pill warn">${money.format(totals.discount)} desconto</span><span class="pill ${extras < 0 ? 'ok' : 'info'}">${money.format(extras)} extras ±</span><span class="pill danger">${money.format(fines)} multas</span></div><button class="secondary adjustment-collapse-btn" type="button" data-toggle-adjustment-center aria-expanded="${collapsed ? 'false' : 'true'}"><span class="adjustment-collapse-icon">${collapsed ? '▾' : '▴'}</span>${collapsed ? 'Expandir' : 'Recolher'}</button></div></div><div class="adjustment-center-body" ${collapsed ? 'hidden' : ''}><div class="info-box"><strong>Como lançar extras:</strong> em “Adicionais / abatimentos”, use uma linha por item no formato <b>Descrição; valor</b>. Para subtrair, coloque valor negativo, por exemplo: <b>Abatimento combinado; -15,00</b>.</div><div class="table-wrap"><table class="adjustment-table"><thead><tr><th>Apto</th><th>Desconto / isenção</th><th>Valor</th><th>Observação do desconto</th><th>Vigência / autorização</th><th>Adicionais / abatimentos</th><th>Multas / outros</th><th>Obs. da multa</th><th>Obs. no boleto</th><th>Total</th></tr></thead><tbody>${block.units.map(unit => { const r = normalizeRule(unit.condoRule), c = unitCharges(unit, block); return `<tr data-rule-row="${unit.id}"><td><strong>${esc(unit.number)}</strong><br><small>${esc(unit.resident || 'Sem responsável')}</small></td><td><select data-rule-field="role" title="Função">${Object.entries(roleLabels).map(([value, label]) => `<option value="${value}" ${r.role === value ? 'selected' : ''}>${label}</option>`).join('')}</select><select data-rule-field="mode" title="Regra de desconto">${Object.entries(ruleLabels).map(([value, label]) => `<option value="${value}" ${r.mode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td><input data-rule-field="value" type="number" min="0" step="0.01" value="${r.value || ''}" placeholder="R$ ou %"></td><td><textarea data-rule-field="reason" rows="3" placeholder="Motivo do desconto, isenção ou benefício">${esc(r.reason)}</textarea></td><td><div class="mini-grid"><input data-rule-field="startsAt" type="month" value="${esc(r.startsAt)}" title="Início"><input data-rule-field="endsAt" type="month" value="${esc(r.endsAt)}" title="Fim"></div><input data-rule-field="authorizedBy" value="${esc(r.authorizedBy)}" placeholder="Autorizado por"></td><td><textarea class="extra-charge-editor" data-rule-field="extraChargesText" rows="4" placeholder="Ex.: 2ª via; 10,00\nAbatimento; -15,00">${esc(extraChargesText(unit))}</textarea></td><td><input data-rule-field="billingFineLabel" value="${esc(unit.billingFineLabel || 'MULTAS / OUTROS')}" placeholder="Descrição"><input data-rule-field="billingFine" type="number" min="0" step="0.01" value="${unit.billingFine || ''}" placeholder="Valor"></td><td><textarea data-rule-field="billingFineNote" rows="3" placeholder="Observação da multa/outros">${esc(unit.billingFineNote || '')}</textarea></td><td><textarea data-rule-field="billingNote" rows="3" placeholder="Observação individual para o boleto">${esc(unit.billingNote || '')}</textarea></td><td><strong>${money.format(c.total)}</strong>${c.condoDiscount ? `<br><small class="adjustment">Desconto: − ${money.format(c.condoDiscount)}</small>` : ''}${c.extraCharge ? `<br><small>Extras: ${money.format(c.extraCharge)}</small>` : ''}${c.fine ? `<br><small>${esc(unit.billingFineLabel || 'Multas/outros')}: ${money.format(c.fine)}</small>` : ''}</td></tr>`; }).join('')}</tbody></table></div></div></section>`;
  }

  renderReadings = function(block) {
    ensureV537(block);
    const totals = chargeTotals(block), selectedIds = readingSelectionFor(block), selectedCount = selectedIds.size;
    return `${waterCoverageCard(block)}<div class="section-actions"><div><h2>${monthLabel(block.month)}</h2><span class="muted">Digite a leitura atual e ajuste multas, descontos, adicionais e observações no mesmo bloco de trabalho.</span></div><div class="button-row"><button class="secondary" data-import-readings type="button">⇧ Importar Excel/CSV</button><button class="secondary" data-export-readings type="button">⇩ Planilha Excel (.csv)</button><button class="secondary" data-export-readings-xlsx type="button">⇩ Modelo .xlsx</button><button class="secondary" data-add-unit type="button">+ Unidade</button><button class="primary" data-go="fechamento" type="button">Fechamento mensal</button></div></div>${adjustmentCenterV537(block)}<section class="reading-bulk-actions card no-print"><div><strong><span data-reading-selection-count>${selectedCount}</span> selecionada(s)</strong><small>Use a caixa da primeira coluna para escolher leituras. “Limpar” preserva apartamento, leitura anterior e lançamentos financeiros.</small></div><div class="button-row"><button class="secondary" data-select-all-readings type="button">Selecionar todas</button><button class="secondary" data-clear-selected-readings type="button" ${selectedCount ? '' : 'disabled'}>Limpar selecionadas</button><button class="danger" data-clear-all-readings type="button">Limpar todas as leituras</button><button class="danger" data-remove-selected-units type="button" ${selectedCount ? '' : 'disabled'}>Excluir cadastros selecionados</button></div></section><div class="table-wrap"><table><thead><tr><th class="reading-check"><input type="checkbox" data-select-all-readings aria-label="Selecionar todas as leituras"></th><th>Apto / Hidrômetro</th><th>Responsável</th><th>Anterior</th><th>Atual</th><th>Consumo</th><th>Status</th><th>Água</th><th>Observação operacional</th><th></th></tr></thead><tbody>${block.units.map(unit => { const issue = readingIssue(unit), checked = selectedIds.has(unit.id); return `<tr data-reading-row="${unit.id}" class="${issue ? `reading-issue ${issue.type}` : ''}"><td class="reading-check"><input data-reading-select type="checkbox" value="${unit.id}" ${checked ? 'checked' : ''} aria-label="Selecionar apartamento ${esc(unit.number)}"></td><td><input data-reading-field="number" value="${esc(unit.number)}" aria-label="Apartamento"></td><td><input data-reading-field="resident" value="${esc(unit.resident)}" placeholder="Nome"></td><td><input data-reading-field="previous" type="number" min="0" step="0.001" value="${unit.previous}"></td><td><input data-reading-field="current" type="number" min="0" step="1" value="${unit.current}"></td><td class="value">${fmtM3(unit.m3)} m³</td><td>${readingBadge(unit)}</td><td class="value">${money.format(unit.value)}</td><td><input data-reading-field="note" value="${esc(unit.note)}" placeholder="Observação da leitura"></td><td><div class="row-actions"><button class="danger" data-remove-unit title="Excluir cadastro do apartamento" type="button">×</button></div></td></tr>`; }).join('')}</tbody><tfoot><tr><td></td><td colspan="4">TOTAL DE ÁGUA</td><td>${fmtM3(totals.m3)} m³</td><td></td><td>${money.format(totals.water)}</td><td colspan="4"></td></tr></tfoot></table></div>`;
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



  // ===================== KR2MELO v5.3.13 =====================
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

  // ===================== KR2MELO v5.3.15 =====================
  function renderUnitChangeHistory(block) {
    const rows = (block?.units || []).flatMap(unit => (Array.isArray(unit.changeLog) ? unit.changeLog : []).slice(0, 5).map(item => ({ unit, item })))
      .sort((a, b) => String(b.item.at).localeCompare(String(a.item.at))).slice(0, 40);
    return `<section class="card unit-change-history"><div class="card-head"><div><h3>Histórico de alteração por apartamento</h3><span class="muted">Mostra as últimas mudanças feitas em leituras, cadastro técnico e edição protegida.</span></div></div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Apto</th><th>Campo</th><th>Antes</th><th>Depois</th><th>Origem</th></tr></thead><tbody>${rows.map(({ unit, item }) => `<tr><td>${esc(auditDate(item.at))}</td><td><strong>${esc(unit.number)}</strong></td><td>${esc(item.field)}</td><td>${esc(item.oldValue || '—')}</td><td>${esc(item.newValue || '—')}</td><td>${esc(item.type || 'Alteração')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhuma alteração registrada ainda.</td></tr>'}</tbody></table></div></section>`;
  }
  const renderUnitsV5315Base = renderUnitsV51;
  renderUnitsV51 = function(block) {
    return `${renderUnitsV5315Base(block)}${renderUnitChangeHistory(block)}`;
  };

  function adminPinCardV5315() {
    const hasPin = Boolean(state.mobileAdminPinHash);
    return `<article class="card admin-pin-card"><div class="card-head"><div><h3>PIN administrativo do mobile</h3><span class="muted">${hasPin ? 'PIN configurado para edição protegida no celular.' : 'Crie um PIN para liberar edição de apartamentos no mobile.'}</span></div><span class="pill ${hasPin ? 'ok' : 'warn'}">${hasPin ? 'Ativo' : 'Pendente'}</span></div><form class="form-grid" id="adminPinForm"><div class="field"><label>Novo PIN</label><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="new-password" placeholder="4 a 8 números"></div><div class="field"><label>Confirmar PIN</label><input name="pinConfirm" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="new-password" placeholder="Repita o PIN"></div><div class="form-foot"><button class="primary" type="submit">Salvar PIN</button></div></form></article>`;
  }
  function reorderUnitsCardV5315() {
    return `<article class="card reorder-units-card"><div class="card-head"><div><h3>Rota física dos apartamentos</h3><span class="muted">Organiza cadastros, leituras, boletos e relatórios em 01, 11, 21, 31; 02, 12, 22, 32.</span></div></div><div class="button-row"><button class="secondary" data-reorder-units type="button">Reordenar apartamentos agora</button></div></article>`;
  }
  const renderSettingsV5315Base = renderSettings;
  renderSettings = function(block) {
    return `${renderSettingsV5315Base(block)}<section class="settings settings-v5315">${adminPinCardV5315()}${reorderUnitsCardV5315()}</section>`;
  };

  function checkVersionNoticeV5315() {
    const key = 'kr2melo.appVersionSeen';
    const seen = localStorage.getItem(key);
    if (seen && seen !== APP_VERSION) toast(`Site atualizado para v${APP_VERSION}. Se algo aparecer estranho, atualize a página.`);
    localStorage.setItem(key, APP_VERSION);
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration?.().then(reg => reg?.update?.()).catch(() => {});
  }

  const handleChangeV5315Base = handleChange;
  handleChange = function(event) {
    const target = event.target;
    const reading = target.closest('[data-reading-field]');
    const tech = target.closest('[data-tech-field]');
    const rule = target.closest('[data-rule-field]');
    let block = null, unit = null, field = '', oldValue = '';
    if (reading) { const row = target.closest('[data-reading-row]'); block = selected(); unit = findUnit(block, row?.dataset.readingRow); field = target.dataset.readingField; oldValue = unit ? unit[field] : ''; }
    if (tech) { const row = target.closest('[data-tech-row]'); block = selected(); unit = findUnit(block, row?.dataset.techRow); field = target.dataset.techField; oldValue = unit ? field.split('.').reduce((obj, key) => obj?.[key], unit) : ''; }
    if (rule) { const row = target.closest('[data-rule-row]'); block = selected(); unit = findUnit(block, row?.dataset.ruleRow); field = target.dataset.ruleField; oldValue = unit ? (unit[field] ?? unit.condoRule?.[field]) : ''; }
    const result = handleChangeV5315Base(event);
    if (unit && field) {
      const newValue = field.includes('.') ? field.split('.').reduce((obj, key) => obj?.[key], unit) : (unit[field] ?? unit.condoRule?.[field]);
      recordUnitChange(block, unit, reading ? 'Leitura' : tech ? 'Cadastro técnico' : 'Lançamento', field, oldValue, newValue);
      save();
    }
    return result;
  };

  const handleClickV5315Base = handleClick;
  handleClick = async function(event) {
    const target = event.target;
    if (target.closest('[data-reorder-units]')) {
      const block = selected(); if (!block) return;
      orderBlockUnits(block);
      audit(block, 'Apartamentos reordenados', 'Cadastros reorganizados pela rota física.', { unitIds: block.units.map(unit => unit.id) });
      save('Apartamentos reordenados pela rota física'); render(); return;
    }
    return handleClickV5315Base(event);
  };

  const handleSubmitV5315Base = handleSubmit;
  handleSubmit = function(event) {
    if (event.target.id === 'adminPinForm') {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target));
      const pin = String(data.pin || '').trim();
      if (!/^\d{4,8}$/.test(pin)) return toast('PIN deve ter 4 a 8 números.', true);
      if (pin !== String(data.pinConfirm || '').trim()) return toast('Confirmação do PIN não confere.', true);
      state.mobileAdminPinHash = pinHash(pin);
      save('PIN administrativo do mobile atualizado'); render(); return;
    }
    return handleSubmitV5315Base(event);
  };

  const renderV5315Base = render;
  render = function() {
    renderV5315Base();
    checkVersionNoticeV5315();
  };

  routes.proposta = ['COMERCIAL', 'Carta de apresentação'];

  function proposalDocumentMarkup() {
    const issued = dateBr(today());
    return `<article class="proposal-document presentation-letter" id="proposalDocument"><header class="proposal-header"><div><img src="assets/logo.png" alt="KR2MELO"><span>KR2MELO CONTRATADA</span></div><aside><strong>Carta de apresentacao</strong><small>Leitura de hidrometros e organizacao mensal</small><small>${issued}</small></aside></header><section class="letter-title"><p class="eyebrow">AOS ADMINISTRADORES, SINDICOS E RESPONSAVEIS POR CONDOMINIOS</p><h1>Apresentacao dos servicos de leitura individual de agua</h1></section><section class="letter-body"><p>Prezados,</p><p>Meu trabalho tem como objetivo auxiliar administradoras, condominios e blocos de apartamentos na organizacao da leitura mensal de hidrometros, no calculo individual do consumo de agua e na preparacao dos documentos usados para cobranca e conferencia dos moradores.</p><p>Para tornar esse processo mais seguro, claro e eficiente, utilizo um sistema proprio da KR2MELO como instrumento de trabalho. Nele sao cadastrados os apartamentos, responsaveis, leituras anteriores e atuais, tarifas por vigencia, observacoes, valores adicionais, relatorios e historico mensal. Dessa forma, cada fechamento fica organizado e pode ser consultado posteriormente com mais facilidade.</p><p>O site tambem permite realizar a leitura em campo pelo celular, registrar apartamentos sem acesso, conferir consumos fora do padrao, gerar boletos organizados por blocos, emitir relatorios para o sindico, recibos de servico e backups dos dados. A proposta nao e apenas fazer a leitura, mas entregar um processo mais transparente e padronizado para quem administra e para quem mora no condominio.</p></section><section class="letter-highlight"><h2>Como essa organizacao ajuda a administradora</h2><div><span>Reduz erros de calculo e retrabalho manual.</span><span>Facilita a conferencia do sindico e da administradora.</span><span>Padroniza boletos, relatorios e recibos.</span><span>Mantem historico mensal das leituras e valores.</span><span>Ajuda a explicar a cobranca individual ao morador.</span><span>Organiza a rotina de leitura in loco pelo celular.</span></div></section><section class="letter-body"><p>Coloco-me a disposicao para apresentar o funcionamento do sistema, demonstrar os modelos de boleto e relatorio, e avaliar a rotina de leitura de cada condominio ou bloco de apartamentos.</p><p>Atenciosamente,</p></section><footer class="letter-signature"><img src="assets/assinatura.png" alt="Assinatura KR2MELO"><div></div><strong>KR2MELO CONTRATADA</strong><span>Prestacao de servico de leitura de hidrometros</span></footer></article>`;
  }
  function renderProposal() {
    const subject = encodeURIComponent('Carta de apresentacao - KR2MELO Contratada');
    const body = encodeURIComponent('Ola,\n\nSegue minha carta de apresentacao dos servicos de leitura de hidrometros e organizacao mensal de agua individualizada.\n\nO documento apresenta meu trabalho e o sistema KR2MELO usado como instrumento de apoio para leituras, calculos, boletos, relatorios e historico.\n\nAtenciosamente,\nKR2MELO Contratada');
    return `<section class="section-actions no-print"><div><h2>Carta de apresentacao</h2><span class="muted">Documento para apresentar seu trabalho e o site como instrumento de apoio.</span></div><div class="button-row"><button class="primary" data-print-proposal type="button">Salvar PDF / imprimir</button><a class="secondary" href="mailto:?subject=${subject}&body=${body}">Enviar por e-mail</a></div></section>${proposalDocumentMarkup()}`;
  }
  function printProposal() {
    printHtml('Carta de apresentacao KR2MELO', proposalDocumentMarkup());
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

  // ===================== KR2MELO v5.3.16 =====================
  function fineUnitsV5316(block) {
    return orderUnits([...(block?.units || [])])
      .map(unit => ({ unit, charges: unitCharges(unit, block) }))
      .filter(item => item.charges.fine > 0);
  }

  function fineUnitsCardV5316(block) {
    const items = fineUnitsV5316(block);
    const total = items.reduce((sum, item) => sum + item.charges.fine, 0);
    if (!items.length) {
      return `<section class="card fine-units-card no-print"><div class="card-head"><div><h3>Apartamentos com multas/outros</h3><span class="muted">Nenhum apartamento possui multa ou outro lancamento neste mes.</span></div><span class="pill ok">0</span></div></section>`;
    }
    return `<section class="card fine-units-card no-print"><div class="card-head"><div><h3>Apartamentos com multas/outros</h3><span class="muted">Lista rapida para conferir quem recebeu lancamento individual.</span></div><span class="pill danger">${items.length} apto(s) · ${money.format(total)}</span></div><div class="fine-unit-list">${items.map(({ unit, charges }) => `<article class="fine-unit-item"><strong>${esc(unit.number)}</strong><div><b>${esc(unit.resident || 'Sem responsavel')}</b><small>${esc(unit.billingFineLabel || 'MULTAS / OUTROS')}${unit.billingFineNote ? ` · ${esc(unit.billingFineNote)}` : ''}</small></div><span>${money.format(charges.fine)}</span></article>`).join('')}</div></section>`;
  }

  function waterStrategyV5316(block) {
    const totals = chargeTotals(block);
    const coverage = waterCoverage(block);
    const bill = coverage.bill;
    const gap = Math.max(0, bill - totals.water);
    const readUnits = (block?.units || []).filter(unit => unit.current !== '' && unit.current !== null && unit.current !== undefined);
    const pending = Math.max(0, (block?.units || []).length - readUnits.length);
    const consumed = (block?.units || []).filter(unit => n(unit.m3) > 0);
    const avgM3 = consumed.length ? totals.m3 / consumed.length : 0;
    const highUnits = consumed
      .filter(unit => n(unit.m3) >= Math.max(20, avgM3 * 1.55))
      .sort((a, b) => n(b.m3) - n(a.m3))
      .slice(0, 3);
    const topUnits = consumed.sort((a, b) => n(b.m3) - n(a.m3)).slice(0, 3);
    const perUnitGap = block.units.length ? gap / block.units.length : 0;
    const proportionalExamples = topUnits.map(unit => {
      const share = totals.m3 > 0 ? gap * n(unit.m3) / totals.m3 : 0;
      return `${esc(unit.number)}: ${money.format(share)}`;
    }).join(' · ');
    const pricePerM3 = bill && totals.m3 ? bill / totals.m3 : 0;
    let recommendation = 'Informe a conta global de agua e as leituras para receber uma recomendacao.';
    let pill = '<span class="pill info">Aguardando dados</span>';
    if (bill && pending > 0) {
      recommendation = `Melhor primeiro passo: concluir ${pending} leitura(s) pendente(s) antes de fechar o rateio.`;
      pill = '<span class="pill warn">Completar leituras</span>';
    } else if (bill && totals.m3 <= 0) {
      recommendation = 'Melhor primeiro passo: conferir leituras, pois ainda nao ha consumo suficiente para dividir a conta com seguranca.';
      pill = '<span class="pill warn">Sem consumo</span>';
    } else if (gap > 0) {
      recommendation = 'Melhor opcao: cobrir a diferenca por rateio proporcional ao consumo, pois quem consumiu mais participa mais da sobra da conta global.';
      pill = '<span class="pill danger">Falta cobertura</span>';
    } else if (bill) {
      recommendation = 'A soma da agua ja cobre a conta global. Se a sobra estiver alta, revise a tarifa configurada ou mantenha como margem/reserva combinada com o predio.';
      pill = '<span class="pill ok">Conta coberta</span>';
    }
    return { totals, coverage, bill, gap, pending, avgM3, highUnits, topUnits, perUnitGap, proportionalExamples, pricePerM3, recommendation, pill };
  }

  function waterStrategyCardV5316(block) {
    const s = waterStrategyV5316(block);
    const high = s.highUnits.length ? s.highUnits.map(unit => `<span>${esc(unit.number)} · ${fmtM3(unit.m3)} m3</span>`).join('') : '<span>Nenhum consumo alto destacado.</span>';
    const proportionalText = s.gap > 0 && s.totals.m3 > 0 ? `Rateio proporcional: ${s.proportionalExamples || 'sem consumo para simular'}.` : 'Rateio proporcional sera calculado quando houver falta de cobertura.';
    return `<section class="card water-strategy-card no-print"><div class="card-head"><div><h3>Melhor forma de sanar a conta de agua</h3><span class="muted">Analise baseada na conta global, nas leituras dos hidrometros e na tarifa configurada.</span></div>${s.pill}</div><div class="strategy-main"><strong>${esc(s.recommendation)}</strong><div class="strategy-kpis"><div><small>Diferenca a cobrir</small><b>${money.format(s.gap)}</b></div><div><small>Conta por m3 real</small><b>${s.pricePerM3 ? money.format(s.pricePerM3) : '---'}</b></div><div><small>Rateio igual</small><b>${s.gap ? money.format(s.perUnitGap) : '---'}</b></div><div><small>Leituras pendentes</small><b>${s.pending}</b></div></div></div><div class="strategy-options"><article><b>1. Proporcional ao consumo</b><small>${proportionalText}</small></article><article><b>2. Igual por apartamento</b><small>${s.gap ? `Cada unidade cobriria ${money.format(s.perUnitGap)}.` : 'Use somente quando o predio decidir dividir a diferenca igualmente.'}</small></article><article><b>3. Revisar tarifa/minimo</b><small>Se a falta ou sobra repetir todo mes, ajuste a tarifa em Configuracoes usando a conta real como conferencia.</small></article></div><div class="strategy-watch"><b>Apartamentos para conferir consumo</b><div>${high}</div></div></section>`;
  }

  const waterCoverageCardV5316Base = waterCoverageCard;
  waterCoverageCard = function(block) {
    return `${waterCoverageCardV5316Base(block)}${waterStrategyCardV5316(block)}`;
  };

  const adjustmentCenterV5316Base = adjustmentCenterV537;
  adjustmentCenterV537 = function(block) {
    return `${fineUnitsCardV5316(block)}${adjustmentCenterV5316Base(block)}`;
  };

  // ===================== KR2MELO v5.3.17 =====================
  function readingDoneV5317(unit) {
    return unit && unit.current !== '' && unit.current !== null && unit.current !== undefined;
  }
  function unitStatusFlagsV5317(unit, block) {
    const c = unitCharges(unit, block);
    const flags = [];
    const issue = readingIssue(unit);
    if (!readingDoneV5317(unit)) flags.push({ type: 'warn', label: 'pendente', text: 'Leitura pendente' });
    if (issue) flags.push({ type: issue.type === 'danger' ? 'danger' : 'warn', label: issue.type === 'danger' ? 'critico' : 'atencao', text: issue.text });
    if (unit.note || unit.billingNote || unit.billingFineNote) flags.push({ type: 'info', label: 'obs', text: 'Possui observacao' });
    if (c.fine > 0) flags.push({ type: 'fine', label: 'multa', text: `${unit.billingFineLabel || 'Multas/outros'}: ${money.format(c.fine)}` });
    if (c.condoDiscount > 0) flags.push({ type: 'discount', label: 'desconto', text: `Desconto: ${money.format(c.condoDiscount)}` });
    return flags;
  }
  function statusLegendV5317() {
    return `<section class="card status-legend no-print"><div class="card-head"><h3>Legenda de status</h3><span class="muted">Cores usadas nas conferencias</span></div><div><span class="status-chip ok">Normal</span><span class="status-chip warn">Pendente/atencao</span><span class="status-chip danger">Erro provavel</span><span class="status-chip info">Observacao</span><span class="status-chip fine">Multa/outros</span><span class="status-chip discount">Desconto/isencao</span></div></section>`;
  }
  function closingChecklistV5317(block) {
    const totals = chargeTotals(block), coverage = waterCoverage(block);
    const fines = fineUnitsV5316(block);
    const discounts = block.units.filter(unit => unitCharges(unit, block).condoDiscount > 0);
    const pending = block.units.filter(unit => !readingDoneV5317(unit));
    const noResident = block.units.filter(unit => !String(unit.resident || '').trim());
    const critical = block.units.filter(unit => readingIssue(unit)?.type === 'danger');
    const diff = coverage.bill ? coverage.bill - totals.water : 0;
    const items = [
      { label: 'Leituras pendentes', value: pending.length, type: pending.length ? 'warn' : 'ok' },
      { label: 'Erros provaveis', value: critical.length, type: critical.length ? 'danger' : 'ok' },
      { label: 'Conta global sem valor', value: coverage.bill ? 0 : 1, type: coverage.bill ? 'ok' : 'warn' },
      { label: 'Diferenca da agua', value: coverage.bill ? money.format(Math.abs(diff)) : '---', type: coverage.bill && diff > 0 ? 'danger' : 'ok' },
      { label: 'Multas/outros', value: fines.length, type: fines.length ? 'fine' : 'ok' },
      { label: 'Descontos/isencoes', value: discounts.length, type: discounts.length ? 'discount' : 'ok' },
      { label: 'Sem responsavel', value: noResident.length, type: noResident.length ? 'warn' : 'ok' }
    ];
    return `<section class="card closing-checklist no-print"><div class="card-head"><div><h3>Checklist inteligente antes do fechamento</h3><span class="muted">Revise estes pontos antes de confirmar o mes.</span></div><span class="pill ${critical.length || diff > 0 ? 'danger' : pending.length ? 'warn' : 'ok'}">${critical.length || diff > 0 ? 'Revisar' : pending.length ? 'Atenção' : 'Pronto'}</span></div><div class="checklist-grid">${items.map(item => `<div class="${item.type}"><small>${esc(item.label)}</small><strong>${esc(item.value)}</strong></div>`).join('')}</div></section>`;
  }
  function waterRateSimulatorV5317(block) {
    const s = waterStrategyV5316(block);
    const gap = s.gap;
    const units = Math.max(1, block.units.length);
    const read = block.units.filter(unit => n(unit.m3) > 0);
    const top = read.sort((a, b) => n(b.m3) - n(a.m3)).slice(0, 5);
    const minimumSuggestion = units ? s.bill / units : 0;
    const proportionalRows = top.map(unit => `<tr><td>${esc(unit.number)}</td><td>${fmtM3(unit.m3)} m3</td><td>${money.format(s.totals.m3 ? gap * n(unit.m3) / s.totals.m3 : 0)}</td></tr>`).join('');
    return `<section class="card water-simulator no-print"><div class="card-head"><div><h3>Simulador de rateio da agua</h3><span class="muted">Mostra caminhos sem alterar boletos automaticamente.</span></div><span class="pill info">Simulacao</span></div><div class="simulator-grid"><article><small>Proporcional ao consumo</small><strong>${gap ? money.format(gap) : '---'}</strong><p>Distribui a diferenca conforme m3 de cada apartamento.</p></article><article><small>Igual por unidade</small><strong>${gap ? money.format(gap / units) : '---'}</strong><p>Mesmo valor para cada apartamento cadastrado.</p></article><article><small>Minimo medio sugerido</small><strong>${s.bill ? money.format(minimumSuggestion) : '---'}</strong><p>Referencia simples para revisar a tarifa minima.</p></article><article><small>Ajuste por m3 real</small><strong>${s.pricePerM3 ? money.format(s.pricePerM3) : '---'}</strong><p>Conta global dividida pelo consumo total do mes.</p></article></div><div class="table-wrap simulator-table"><table><thead><tr><th>Top consumo</th><th>Consumo</th><th>Cota proporcional da diferenca</th></tr></thead><tbody>${proportionalRows || '<tr><td colspan="3">Informe leituras e conta global para simular.</td></tr>'}</tbody></table></div></section>`;
  }
  function managerInsightsV5317(block) {
    const totals = chargeTotals(block), coverage = waterCoverage(block), strategy = waterStrategyV5316(block);
    const pending = block.units.filter(unit => !readingDoneV5317(unit));
    const fines = fineUnitsV5316(block);
    const discounts = block.units.filter(unit => unitCharges(unit, block).condoDiscount > 0);
    const top = [...block.units].sort((a, b) => n(b.m3) - n(a.m3)).slice(0, 5);
    return `<section class="card manager-insights"><div class="card-head"><div><h3>Relatorio executivo do sindico</h3><span class="muted">Resumo para explicar a cobranca do mes.</span></div><span class="pill ${coverage.covered ? 'ok' : coverage.bill ? 'danger' : 'warn'}">${coverage.bill ? `${coverage.percent.toFixed(1)}% da conta` : 'Sem conta global'}</span></div><div class="executive-grid"><div><small>Conta global</small><strong>${money.format(coverage.bill)}</strong></div><div><small>Agua rateada</small><strong>${money.format(totals.water)}</strong></div><div><small>Diferenca</small><strong>${money.format(Math.abs(coverage.bill - totals.water))}</strong></div><div><small>Multas/outros</small><strong>${money.format(totals.fine)}</strong></div><div><small>Descontos</small><strong>${money.format(totals.discount)}</strong></div><div><small>Pendencias</small><strong>${pending.length}</strong></div></div><div class="report-columns"><article><b>Recomendacao</b><p>${esc(strategy.recommendation)}</p></article><article><b>Top consumos</b><p>${top.map(unit => `${unit.number}: ${fmtM3(unit.m3)} m3`).join(' · ') || 'Sem consumo registrado.'}</p></article><article><b>Lancamentos</b><p>${fines.length} multa(s)/outros e ${discounts.length} desconto(s)/isencao(oes).</p></article></div></section>`;
  }
  function tariffHealthCardV5317(block) {
    const t = tariffV538(block.tariff);
    const samples = [0, 10, 11, 20, 30].map(m3 => ({ m3, value: waterCost(m3, t) }));
    const coverage = waterCoverage(block);
    const hint = coverage.bill && coverage.total ? Math.abs(coverage.total - coverage.bill) / coverage.bill : 0;
    return `<article class="card tariff-health-card"><div class="card-head"><div><h3>Conferencia da tarifa</h3><span class="muted">Use para validar se a tabela do mes esta coerente com a conta real.</span></div><span class="pill ${hint > .12 ? 'warn' : 'ok'}">${hint > .12 ? 'Revisar' : 'Coerente'}</span></div><div class="tariff-samples">${samples.map(item => `<div><small>${fmtM3(item.m3)} m3</small><strong>${money.format(item.value)}</strong></div>`).join('')}</div><div class="info-box"><strong>Regra pratica:</strong> se a diferenca entre a conta global e a soma dos apartamentos repetir por varios meses, revise minimo, faixas e vigencia da tarifa.</div></article>`;
  }
  function auditSummaryCardV5317(block) {
    const changes = block.units.flatMap(unit => (Array.isArray(unit.changeLog) ? unit.changeLog : []).map(item => ({ unit, item }))).sort((a, b) => String(b.item.at).localeCompare(String(a.item.at))).slice(0, 8);
    return `<article class="card audit-summary-card"><div class="card-head"><div><h3>Auditoria recente</h3><span class="muted">Ultimas alteracoes por apartamento.</span></div><span class="pill info">${changes.length}</span></div><div class="audit-mini-list">${changes.map(({ unit, item }) => `<div><strong>${esc(unit.number)}</strong><span>${esc(item.type || 'Alteracao')} · ${esc(item.field || '')}</span><small>${esc(auditDate(item.at))}</small></div>`).join('') || '<p class="muted">Nenhuma alteracao registrada.</p>'}</div></article>`;
  }
  function backupHealthCardV5317() {
    const last = localStorage.getItem(`${KEY}.lastBackupAt.v5317`);
    const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : 999;
    return `<article class="card backup-health-card"><div class="card-head"><div><h3>Seguranca do backup</h3><span class="muted">${last ? `Ultimo backup: ${auditDate(last)}` : 'Nenhum backup registrado neste navegador.'}</span></div><span class="pill ${days > 7 ? 'warn' : 'ok'}">${days > 7 ? 'Baixar BKP' : 'Em dia'}</span></div><p class="muted">O fechamento ja baixa backup automaticamente; ainda assim, mantenha uma copia externa depois de grandes alteracoes.</p><div class="button-row"><button class="secondary" data-export type="button">Baixar backup agora</button></div></article>`;
  }
  function searchMatchesV5317(term) {
    const clean = normalizedHeader(term);
    if (!clean) return [];
    return state.blocks.flatMap(block => block.units.map(unit => ({ block, unit, charges: unitCharges(unit, block), flags: unitStatusFlagsV5317(unit, block) })))
      .filter(item => [item.block.name, item.unit.number, item.unit.resident, item.unit.note, item.unit.billingFineLabel, item.unit.billingFineNote, item.unit.billingNote, ...item.flags.map(flag => flag.text), ...item.flags.map(flag => flag.label)].some(value => normalizedHeader(value).includes(clean)))
      .slice(0, 20);
  }
  function annualAdvancedInsightsV5317(block, rows) {
    const max = rows.reduce((best, row) => n(row.m3) > n(best?.m3) ? row : best, null);
    const totalBill = rows.reduce((sum, row) => sum + n(row.water), 0);
    const avg = rows.length ? rows.reduce((sum, row) => sum + n(row.m3), 0) / rows.length : 0;
    const topUnits = [...block.units].sort((a, b) => n(b.m3) - n(a.m3)).slice(0, 5);
    return `<section class="card annual-insights"><div class="card-head"><div><h3>Analise anual ampliada</h3><span class="muted">Evolucao, riscos e apartamentos de maior consumo.</span></div></div><div class="executive-grid"><div><small>Mes de maior consumo</small><strong>${max ? monthLabel(max.month) : '---'}</strong></div><div><small>Media mensal</small><strong>${fmtM3(avg)} m3</strong></div><div><small>Agua no ano</small><strong>${money.format(totalBill)}</strong></div><div><small>Top atual</small><strong>${topUnits[0] ? `${topUnits[0].number} · ${fmtM3(topUnits[0].m3)} m3` : '---'}</strong></div></div><p class="muted">Use esta visao para comparar meses, observar aumentos recorrentes e justificar revisoes de tarifa ou comunicados aos moradores.</p></section>`;
  }

  const closeChecksV5317Base = closeChecks;
  closeChecks = function(block) {
    const checks = closeChecksV5317Base(block);
    const coverage = waterCoverage(block);
    const totals = chargeTotals(block);
    const fines = fineUnitsV5316(block);
    const discounts = block.units.filter(unit => unitCharges(unit, block).condoDiscount > 0);
    if (!coverage.bill) checks.push({ type: 'warn', title: 'Conta global de agua nao informada', text: 'Informe o valor da conta antes de conferir o rateio.' });
    if (coverage.bill && totals.water < coverage.bill) checks.push({ type: 'danger', title: 'Agua nao cobre a conta global', text: `Faltam ${money.format(coverage.bill - totals.water)} para cobrir a conta.` });
    if (fines.length) checks.push({ type: 'warn', title: 'Multas/outros para revisar', text: `${fines.length} apartamento(s) possuem lancamento individual.` });
    if (discounts.length) checks.push({ type: 'warn', title: 'Descontos/isencoes ativos', text: `${discounts.length} apartamento(s) possuem abatimento no condominio.` });
    return checks;
  };

  const renderClosingV5317Base = renderClosing;
  renderClosing = function(block) {
    return `${closingChecklistV5317(block)}${renderClosingV5317Base(block)}${waterRateSimulatorV5317(block)}`;
  };

  const renderDashboardV5317Base = renderDashboard;
  renderDashboard = function(block) {
    return `${renderDashboardV5317Base(block)}${statusLegendV5317()}`;
  };

  const renderReportsV5317Base = renderReports;
  renderReports = function(block) {
    return renderReportsV5317Base(block).replace('<section class="finance-summary', `${managerInsightsV5317(block)}<section class="finance-summary`);
  };

  const renderSettingsV5317Base = renderSettings;
  renderSettings = function(block) {
    return `${renderSettingsV5317Base(block)}<section class="settings settings-v5317">${tariffHealthCardV5317(block)}${auditSummaryCardV5317(block)}${backupHealthCardV5317()}</section>`;
  };

  const renderAnnualDashboardV5317Base = renderAnnualDashboardV52;
  renderAnnualDashboardV52 = function(block) {
    const years = yearOptionsV52(block); const year = annualYearV52 && years.includes(annualYearV52) ? annualYearV52 : years[0];
    return `${renderAnnualDashboardV5317Base(block)}${annualAdvancedInsightsV5317(block, annualRowsV52(block, year))}`;
  };

  const exportDataV5317Base = exportData;
  exportData = function() {
    localStorage.setItem(`${KEY}.lastBackupAt.v5317`, new Date().toISOString());
    exportDataV5317Base();
  };

  const handleInputV5317Base = handleInput;
  handleInput = function(event) {
    if (event.target.matches('[data-global-search]')) {
      const result = $('#globalSearchResult'); if (!result) return;
      const matches = searchMatchesV5317(event.target.value);
      if (!String(event.target.value || '').trim()) { result.innerHTML = ''; return; }
      result.innerHTML = matches.length ? matches.map(item => `<button class="secondary smart-search-result" data-search-select="${item.block.id}" data-search-route="leituras" type="button"><strong>${esc(item.block.name)}</strong> · Apto ${esc(item.unit.number)} · ${esc(item.unit.resident || 'Sem responsavel')}<small>${item.flags.map(flag => flag.text).slice(0, 2).join(' · ') || `${fmtM3(item.unit.m3)} m3`}</small></button>`).join('') : '<p class="muted">Nenhum resultado encontrado.</p>';
      $$('#globalSearchResult [data-search-select]').forEach(button => button.onclick = () => { state.selected = button.dataset.searchSelect; save(); setRoute(button.dataset.searchRoute); render(); });
      return;
    }
    return handleInputV5317Base(event);
  };



  // ===================== KR2MELO v5.3.23 — Dashboard anual Prédio + Apartamento =====================
  const annualUnitByBlockV5321 = new Map();

  function annualUnitSelectionV5321(block) {
    if (!block?.units?.length) return null;
    const saved = annualUnitByBlockV5321.get(block.id);
    const found = block.units.find(unit => unit.id === saved);
    if (found) return found;
    const first = orderUnits(block.units)[0] || null;
    if (first) annualUnitByBlockV5321.set(block.id, first.id);
    return first;
  }

  function latestAnnualEntriesV5321(block, year) {
    const byMonth = new Map();
    (block?.history || []).forEach(entry => {
      if (!String(entry.month || '').startsWith(`${year}-`)) return;
      const previous = byMonth.get(entry.month);
      if (!previous || n(entry.version) >= n(previous.version)) byMonth.set(entry.month, entry);
    });
    return byMonth;
  }

  function annualUnitRowsV5321(block, year, selectedUnit) {
    if (!block || !selectedUnit) return [];
    const byMonth = latestAnnualEntriesV5321(block, year);
    const rows = [...byMonth.values()].map(entry => {
      const units = entryUnits(entry);
      const charges = entryCharges(entry);
      const historicUnit = units.find(unit => String(unit.id) === String(selectedUnit.id))
        || units.find(unit => normalizedHeader(unit.number) === normalizedHeader(selectedUnit.number));
      const savedCharge = charges.find(charge => String(charge.unitId || '') === String(selectedUnit.id))
        || charges.find(charge => normalizedHeader(charge.number) === normalizedHeader(selectedUnit.number));
      if (!historicUnit && !savedCharge) return null;
      const snapshotUnit = historicUnit || selectedUnit;
      const snapshot = {
        month: entry.month,
        billing: normalizeBilling(entry.billing || {}, entry.month),
        tariff: { ...DEFAULT_TARIFF, ...(entry.tariff || {}) },
        units
      };
      const calculated = savedCharge || unitCharges(snapshotUnit, snapshot);
      const previous = historicUnit?.previous ?? '';
      const current = historicUnit?.current ?? '';
      return {
        month: entry.month,
        source: entry.source || 'fechado',
        previous,
        current,
        m3: n(savedCharge?.m3 ?? historicUnit?.m3),
        water: n(savedCharge?.water ?? calculated.water),
        condo: n(savedCharge?.condo ?? calculated.condo),
        discount: n(savedCharge?.condoDiscount ?? calculated.condoDiscount),
        service: n(savedCharge?.service ?? calculated.service),
        extraCharge: n(savedCharge?.extraCharge ?? calculated.extraCharge),
        fine: n(savedCharge?.fine ?? calculated.fine),
        total: n(savedCharge?.total ?? calculated.total)
      };
    }).filter(Boolean);

    if (String(block.month || '').startsWith(`${year}-`) && !byMonth.has(block.month)) {
      const unit = block.units.find(item => item.id === selectedUnit.id) || selectedUnit;
      const charges = unitCharges(unit, block);
      rows.push({
        month: block.month,
        source: 'em_aberto',
        previous: unit.previous,
        current: unit.current,
        m3: n(unit.m3),
        water: n(charges.water),
        condo: n(charges.condo),
        discount: n(charges.condoDiscount),
        service: n(charges.service),
        extraCharge: n(charges.extraCharge),
        fine: n(charges.fine),
        total: n(charges.total)
      });
    }
    return rows.sort((a, b) => a.month.localeCompare(b.month));
  }

  function annualUnitTotalsV5321(rows) {
    return rows.reduce((sum, row) => {
      ['m3','water','condo','discount','service','extraCharge','fine','total'].forEach(key => sum[key] += n(row[key]));
      return sum;
    }, { m3:0, water:0, condo:0, discount:0, service:0, extraCharge:0, fine:0, total:0 });
  }

  function annualTrendV5321(rows) {
    if (rows.length < 2) return { value: 0, label: 'Sem comparação', className: 'neutral' };
    const previous = n(rows[rows.length - 2].m3);
    const current = n(rows[rows.length - 1].m3);
    if (!previous) return { value: 0, label: current ? 'Novo consumo' : 'Estável', className: current ? 'warn' : 'ok' };
    const value = (current - previous) / previous * 100;
    return {
      value,
      label: `${value >= 0 ? '+' : ''}${value.toFixed(1)}% vs. mês anterior`,
      className: value > 15 ? 'danger' : value < -10 ? 'ok' : 'info'
    };
  }

  function annualTopUnitsV5321(block, year) {
    return orderUnits(block.units).map(unit => {
      const rows = annualUnitRowsV5321(block, year, unit);
      const totals = annualUnitTotalsV5321(rows);
      return { unit, rows, totals };
    }).sort((a,b) => b.totals.m3 - a.totals.m3);
  }

  function renderAnnualDashboardV5321(block) {
    if (!block) return emptyState();
    const years = yearOptionsV52(block);
    const year = annualYearV52 && years.includes(annualYearV52) ? annualYearV52 : years[0];
    annualYearV52 = year;

    const buildingRows = annualRowsV52(block, year);
    const buildingTotals = annualTotalsV52(buildingRows);
    const buildingAverage = buildingRows.length ? buildingTotals.m3 / buildingRows.length : 0;
    const buildingMax = buildingRows.reduce((best,row) => n(row.m3) > n(best?.m3) ? row : best, null);
    const maxBuildingM3 = Math.max(1, ...buildingRows.map(row => n(row.m3)));

    const selectedUnit = annualUnitSelectionV5321(block);
    const unitRows = annualUnitRowsV5321(block, year, selectedUnit);
    const unitTotals = annualUnitTotalsV5321(unitRows);
    const unitAverage = unitRows.length ? unitTotals.m3 / unitRows.length : 0;
    const unitPeak = unitRows.reduce((best,row) => n(row.m3) > n(best?.m3) ? row : best, null);
    const maxUnitM3 = Math.max(1, ...unitRows.map(row => n(row.m3)));
    const annualShare = buildingTotals.m3 > 0 ? unitTotals.m3 / buildingTotals.m3 * 100 : 0;
    const trend = annualTrendV5321(unitRows);
    const ranking = annualTopUnitsV5321(block, year);
    const rank = selectedUnit ? ranking.findIndex(item => item.unit.id === selectedUnit.id) + 1 : 0;

    const buildingByMonth = new Map(buildingRows.map(row => [row.month, row]));
    const comparisonRows = unitRows.map(row => {
      const building = buildingByMonth.get(row.month);
      const share = n(building?.m3) > 0 ? n(row.m3) / n(building.m3) * 100 : 0;
      return { ...row, buildingM3: n(building?.m3), share };
    });

    return `<section class="hero annual-hero annual-hero-v5321">
      <div><p class="eyebrow">ANÁLISE ANUAL INTEGRADA</p><h2>Prédio + Apartamento · ${esc(year)}</h2><p>${esc(block.name)} · compare o desempenho consolidado com qualquer apartamento.</p></div>
      <div class="button-row"><button class="secondary" data-print-annual type="button">Imprimir A4</button><button class="primary" data-export-annual type="button">Exportar CSV</button></div>
    </section>

    <section class="card annual-controls annual-controls-v5321 no-print">
      <label class="field"><span>Ano analisado</span><select data-annual-year>${years.map(item => `<option value="${item}" ${item === year ? 'selected' : ''}>${item}</option>`).join('')}</select></label>
      <label class="field annual-unit-picker"><span>Analisar apartamento</span><select data-annual-unit>${orderUnits(block.units).map(unit => `<option value="${unit.id}" ${unit.id === selectedUnit?.id ? 'selected' : ''}>Apto ${esc(unit.number)} · ${esc(unit.resident || 'Sem responsável')}</option>`).join('')}</select></label>
      <div class="annual-control-note"><strong>Comparação ativa:</strong><span>${esc(block.name)} × Apto ${esc(selectedUnit?.number || '—')}</span></div>
    </section>

    <section class="annual-section-title"><div><span class="annual-section-kicker">PRÉDIO</span><h3>Visão anual do prédio</h3></div><span class="pill info">${buildingRows.length} mês(es)</span></section>
    <section class="metrics annual-metrics annual-building-metrics">
      <article class="metric red"><span class="label">Consumo anual</span><strong>${fmtM3(buildingTotals.m3)} m³</strong><small>Média ${fmtM3(buildingAverage)} m³/mês</small></article>
      <article class="metric"><span class="label">Água rateada</span><strong>${money.format(buildingTotals.water)}</strong><small>Total do prédio no ano</small></article>
      <article class="metric"><span class="label">Cobrança total</span><strong>${money.format(buildingTotals.total)}</strong><small>Todos os lançamentos</small></article>
      <article class="metric"><span class="label">Pico do prédio</span><strong>${buildingMax ? monthLabel(buildingMax.month) : '—'}</strong><small>${buildingMax ? `${fmtM3(buildingMax.m3)} m³` : 'Sem histórico'}</small></article>
    </section>

    <section class="grid-2 annual-grid annual-building-grid">
      <article class="card"><div class="card-head"><div><h3>Consumo mensal do prédio</h3><span class="muted">Evolução consolidada</span></div></div>
        <div class="annual-bars">${buildingRows.length ? buildingRows.map(row => `<div class="annual-bar-row"><strong>${esc(monthLabel(row.month).slice(0,3))}</strong><div class="annual-bar"><i style="width:${Math.max(2,n(row.m3)/maxBuildingM3*100)}%"></i></div><b>${fmtM3(row.m3)} m³</b></div>`).join('') : '<p class="empty">Sem dados neste ano.</p>'}</div>
      </article>
      <article class="card"><div class="card-head"><h3>Resumo financeiro do prédio</h3></div>
        <dl class="annual-summary"><div><dt>Condomínio líquido</dt><dd>${money.format(buildingTotals.condo)}</dd></div><div><dt>Descontos</dt><dd>${money.format(buildingTotals.discount)}</dd></div><div><dt>Serviço</dt><dd>${money.format(buildingTotals.service)}</dd></div><div><dt>Multas / outros</dt><dd>${money.format(buildingTotals.fine)}</dd></div></dl>
      </article>
    </section>

    <section class="annual-section-title annual-unit-title"><div><span class="annual-section-kicker apt">APARTAMENTO</span><h3>Apto ${esc(selectedUnit?.number || '—')} · ${esc(selectedUnit?.resident || 'Sem responsável')}</h3></div><span class="pill ${trend.className}">${esc(trend.label)}</span></section>
    <section class="metrics annual-metrics annual-unit-metrics">
      <article class="metric red"><span class="label">Consumo do APT</span><strong>${fmtM3(unitTotals.m3)} m³</strong><small>Média ${fmtM3(unitAverage)} m³/mês</small></article>
      <article class="metric"><span class="label">Participação no prédio</span><strong>${annualShare.toFixed(1)}%</strong><small>Do consumo anual registrado</small></article>
      <article class="metric"><span class="label">Total cobrado</span><strong>${money.format(unitTotals.total)}</strong><small>Água + demais valores</small></article>
      <article class="metric"><span class="label">Posição em consumo</span><strong>${rank ? `${rank}º de ${ranking.length}` : '—'}</strong><small>Pico: ${unitPeak ? `${monthLabel(unitPeak.month)} · ${fmtM3(unitPeak.m3)} m³` : 'sem dados'}</small></article>
    </section>

    <section class="grid-2 annual-grid annual-unit-grid">
      <article class="card"><div class="card-head"><div><h3>Consumo mensal do apartamento</h3><span class="muted">Apto ${esc(selectedUnit?.number || '—')}</span></div></div>
        <div class="annual-bars annual-bars-unit">${unitRows.length ? unitRows.map(row => `<div class="annual-bar-row"><strong>${esc(monthLabel(row.month).slice(0,3))}</strong><div class="annual-bar"><i style="width:${Math.max(2,n(row.m3)/maxUnitM3*100)}%"></i></div><b>${fmtM3(row.m3)} m³</b></div>`).join('') : '<p class="empty">Este apartamento não possui registros neste ano.</p>'}</div>
      </article>
      <article class="card annual-comparison-card"><div class="card-head"><div><h3>APT × Prédio</h3><span class="muted">Participação mensal no consumo total</span></div></div>
        <div class="annual-share-list">${comparisonRows.length ? comparisonRows.map(row => `<div class="annual-share-row"><span>${esc(monthLabel(row.month).slice(0,3))}</span><div><strong>${fmtM3(row.m3)} m³</strong><small>de ${fmtM3(row.buildingM3)} m³</small></div><b>${row.share.toFixed(1)}%</b></div>`).join('') : '<p class="empty">Sem comparação disponível.</p>'}</div>
      </article>
    </section>

    <section class="card annual-table-card annual-unit-table-card"><div class="card-head"><div><h3>Demonstrativo anual do apartamento</h3><small class="muted">Leituras, consumo e valores mês a mês.</small></div></div>
      <div class="table-wrap"><table class="annual-table annual-unit-table"><thead><tr><th>Mês</th><th>Status</th><th>Anterior</th><th>Atual</th><th>Consumo</th><th>% prédio</th><th>Água</th><th>Adicionais</th><th>Multas/outros</th><th>Total</th></tr></thead>
      <tbody>${comparisonRows.map(row => `<tr><td><strong>${esc(monthLabel(row.month))}</strong></td><td><span class="pill ${row.source === 'em_aberto' ? 'warn' : 'ok'}">${esc(annualSourceV52(row.source))}</span></td><td>${row.previous === '' ? '—' : fmtM3(row.previous)}</td><td>${row.current === '' ? '—' : fmtM3(row.current)}</td><td><strong>${fmtM3(row.m3)} m³</strong></td><td>${row.share.toFixed(1)}%</td><td>${money.format(row.water)}</td><td>${money.format(row.extraCharge)}</td><td>${money.format(row.fine)}</td><td><strong>${money.format(row.total)}</strong></td></tr>`).join('') || '<tr><td colspan="10">Nenhum dado deste apartamento no ano selecionado.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="4">TOTAL DO APT</td><td>${fmtM3(unitTotals.m3)} m³</td><td>${annualShare.toFixed(1)}%</td><td>${money.format(unitTotals.water)}</td><td>${money.format(unitTotals.extraCharge)}</td><td>${money.format(unitTotals.fine)}</td><td>${money.format(unitTotals.total)}</td></tr></tfoot></table></div>
    </section>

    <section class="card annual-ranking-card"><div class="card-head"><div><h3>Ranking anual de consumo por apartamento</h3><span class="muted">Ajuda a identificar os maiores consumos do prédio no ano.</span></div><span class="pill info">${ranking.length} APT(s)</span></div>
      <div class="annual-ranking-list">${ranking.slice(0,10).map((item,index) => `<button type="button" class="annual-ranking-row ${item.unit.id === selectedUnit?.id ? 'active' : ''}" data-annual-unit-jump="${item.unit.id}"><span class="annual-rank-number">${index+1}º</span><div><strong>Apto ${esc(item.unit.number)}</strong><small>${esc(item.unit.resident || 'Sem responsável')}</small></div><b>${fmtM3(item.totals.m3)} m³</b><span>${buildingTotals.m3 ? (item.totals.m3/buildingTotals.m3*100).toFixed(1) : '0.0'}%</span></button>`).join('') || '<p class="empty">Sem dados para ranking.</p>'}</div>
    </section>`;
  }

  renderAnnualDashboardV52 = function(block) {
    return renderAnnualDashboardV5321(block);
  };

  const handleChangeV5321Base = handleChange;
  handleChange = function(event) {
    if (event.target.matches('[data-annual-unit]')) {
      const block = selected();
      if (block) annualUnitByBlockV5321.set(block.id, event.target.value);
      render();
      return;
    }
    return handleChangeV5321Base(event);
  };

  const handleClickV5321Base = handleClick;
  handleClick = async function(event) {
    const unitJump = event.target.closest('[data-annual-unit-jump]');
    if (unitJump) {
      const block = selected();
      if (block) annualUnitByBlockV5321.set(block.id, unitJump.dataset.annualUnitJump);
      render();
      return;
    }
    return handleClickV5321Base(event);
  };

  const exportAnnualCsvV5321Base = exportAnnualCsvV52;
  exportAnnualCsvV52 = function() {
    const block = selected(); if (!block) return;
    const year = annualYearV52 || yearOptionsV52(block)[0] || String(currentMonth()).slice(0,4);
    const buildingRows = annualRowsV52(block, year);
    const buildingTotals = annualTotalsV52(buildingRows);
    const unit = annualUnitSelectionV5321(block);
    const unitRows = annualUnitRowsV5321(block, year, unit);
    const unitTotals = annualUnitTotalsV5321(unitRows);
    const buildingByMonth = new Map(buildingRows.map(row => [row.month,row]));
    const csv = [
      ['DASHBOARD ANUAL KR2MELO'],
      ['Prédio', block.name],
      ['Ano', year],
      [],
      ['VISÃO DO PRÉDIO'],
      ['Competência','Status','Consumo m3','Água','Condomínio','Desconto','Serviço','Outros','Total'],
      ...buildingRows.map(row => [row.month,annualSourceV52(row.source),row.m3.toFixed(3),row.water.toFixed(2),row.condo.toFixed(2),row.discount.toFixed(2),row.service.toFixed(2),row.fine.toFixed(2),row.total.toFixed(2)]),
      ['TOTAL','',''+buildingTotals.m3.toFixed(3),buildingTotals.water.toFixed(2),buildingTotals.condo.toFixed(2),buildingTotals.discount.toFixed(2),buildingTotals.service.toFixed(2),buildingTotals.fine.toFixed(2),buildingTotals.total.toFixed(2)],
      [],
      ['ANÁLISE POR APARTAMENTO'],
      ['Apartamento', unit?.number || ''],
      ['Responsável', unit?.resident || ''],
      ['Competência','Anterior','Atual','Consumo m3','% do prédio','Água','Adicionais','Multas/Outros','Total'],
      ...unitRows.map(row => {
        const building = buildingByMonth.get(row.month);
        const share = n(building?.m3) ? row.m3 / building.m3 * 100 : 0;
        return [row.month,row.previous,row.current,row.m3.toFixed(3),share.toFixed(1)+'%',row.water.toFixed(2),row.extraCharge.toFixed(2),row.fine.toFixed(2),row.total.toFixed(2)];
      }),
      ['TOTAL','','',unitTotals.m3.toFixed(3),buildingTotals.m3 ? (unitTotals.m3/buildingTotals.m3*100).toFixed(1)+'%' : '0.0%',unitTotals.water.toFixed(2),unitTotals.extraCharge.toFixed(2),unitTotals.fine.toFixed(2),unitTotals.total.toFixed(2)]
    ];
    downloadBlob(new Blob(['\ufeff'+csv.map(row => row.map(csvValue).join(';')).join('\n')],{type:'text/csv;charset=utf-8'}),`dashboard-anual-${normalizedHeader(block.name)}-${year}-apt-${normalizedHeader(unit?.number || 'geral')}.csv`);
    toast('Dashboard anual do prédio e apartamento exportado');
  };


  // v5.3.23 — estabilizacao de integridade
  function unresolvedReadingV5320(unit) {
    return unit?.current === '' || unit?.current === null || unit?.current === undefined;
  }

  const closeChecksV5320Base = closeChecks;
  closeChecks = function(block) {
    let checks = closeChecksV5320Base(block);
    if (!block) return checks;
    checks = checks.filter(check => check.title !== 'Leituras pendentes');
    block.units.filter(unit => unresolvedReadingV5320(unit)).forEach(unit => {
      const semAcesso = unit.operationalStatus === 'sem_acesso';
      checks.push({
        type: 'danger',
        unit: unit.number,
        title: semAcesso ? 'Sem acesso ainda sem tratamento' : 'Leitura obrigatoria pendente',
        text: semAcesso
          ? 'Registre uma leitura real ou use a media dos 2 ultimos meses antes do fechamento.'
          : 'Informe a leitura atual antes do fechamento.'
      });
    });
    return checks;
  };

  const executeMonthlyCloseV5320Base = executeMonthlyClose;
  executeMonthlyClose = function(block) {
    if (!block) return;
    const unresolved = block.units.filter(unit => unresolvedReadingV5320(unit));
    if (unresolved.length) {
      const semAcesso = unresolved.filter(unit => unit.operationalStatus === 'sem_acesso').length;
      toast(`Fechamento bloqueado: ${unresolved.length} leitura(s) pendente(s)${semAcesso ? `, sendo ${semAcesso} sem acesso` : ''}. Use leitura real ou media antes de fechar.`, true);
      return;
    }
    return executeMonthlyCloseV5320Base(block);
  };

  const handleChangeV5320Base = handleChange;
  handleChange = function(event) {
    const target = event.target;
    const currentField = target?.closest?.('[data-reading-field="current"]');
    if (currentField) {
      const row = target.closest('[data-reading-row]');
      const block = selected();
      const unit = findUnit(block, row?.dataset.readingRow);
      if (!unit) return;
      const previousValue = unit.current;
      if (target.value === '') {
        unit.current = '';
        unit.mobileDone = false;
        unit.mobileReopened = false;
        recalculateUnit(unit, block);
        save('Leitura removida');
        render();
        return;
      }
      const normalized = normalizeMeterReadingV5320(target.value);
      if (normalized === null) {
        toast('Digite uma leitura valida.', true);
        render();
        return;
      }
      unit.current = normalized;
      recalculateUnit(unit, block);
      const issue = readingIssue(unit);
      if (issue && !confirm(`${issue.text}\n\nDeseja manter a leitura arredondada (${fmtM3(normalized)})?`)) {
        unit.current = previousValue;
        recalculateUnit(unit, block);
        render();
        return;
      }
      unit.readingType = 'real';
      unit.mobileDone = true;
      unit.mobileReopened = false;
      unit.mobileSavedAt = new Date().toISOString();
      if (unit.operationalStatus === 'sem_acesso' || unit.operationalStatus === 'estimada') unit.operationalStatus = 'ocupado';
      unit.estimatedReason = '';
      save(`Leitura salva como ${fmtM3(normalized)}`);
      render();
      return;
    }
    return handleChangeV5320Base(event);
  };


  // ===================== KR2MELO v5.3.23 — Pop-up de conferência do mês anterior =====================
  function previousClosedEntryV5322(block) {
    if (!block) return null;
    const current = String(block.month || '');
    const candidates = (block.history || [])
      .filter(entry => String(entry.month || '') < current)
      .sort((a,b) => String(b.month || '').localeCompare(String(a.month || '')) || n(b.version) - n(a.version));
    if (!candidates.length) return null;
    const latestMonth = candidates[0].month;
    return candidates
      .filter(entry => entry.month === latestMonth)
      .sort((a,b) => n(b.version) - n(a.version))[0] || null;
  }

  function previousMonthContextV5322(block) {
    const entry = previousClosedEntryV5322(block);
    if (!entry) return null;

    const previousUnits = entryUnits(entry);
    const charges = entryCharges(entry);
    const chargeById = new Map();
    charges.forEach(charge => {
      if (charge?.unitId) chargeById.set(String(charge.unitId), charge);
      if (charge?.number) chargeById.set(`number:${normalizedHeader(charge.number)}`, charge);
    });

    const rows = previousUnits.map(unit => {
      const saved = chargeById.get(String(unit.id)) || chargeById.get(`number:${normalizedHeader(unit.number)}`);
      const currentUnit = block.units.find(item => String(item.id) === String(unit.id))
        || block.units.find(item => normalizedHeader(item.number) === normalizedHeader(unit.number));
      const oldM3 = n(saved?.m3 ?? unit.m3);
      const currentM3 = n(currentUnit?.m3);
      const oldTotal = n(saved?.total);
      const currentCharges = currentUnit ? unitCharges(currentUnit, block) : null;
      const currentTotal = n(currentCharges?.total);
      return {
        number: String(saved?.number || unit.number || '—'),
        resident: String(saved?.resident || unit.resident || currentUnit?.resident || '—'),
        previousM3: oldM3,
        currentM3,
        deltaM3: currentM3 - oldM3,
        previousWater: n(saved?.water),
        previousExtra: n(saved?.extraCharge),
        previousFine: n(saved?.fine),
        previousTotal: oldTotal,
        currentTotal,
        deltaTotal: currentTotal - oldTotal
      };
    });

    const totals = rows.reduce((sum,row) => {
      sum.previousM3 += row.previousM3;
      sum.currentM3 += row.currentM3;
      sum.previousWater += row.previousWater;
      sum.previousExtra += row.previousExtra;
      sum.previousFine += row.previousFine;
      sum.previousTotal += row.previousTotal;
      sum.currentTotal += row.currentTotal;
      return sum;
    }, { previousM3:0,currentM3:0,previousWater:0,previousExtra:0,previousFine:0,previousTotal:0,currentTotal:0 });

    return { entry, rows, totals };
  }

  function previousMonthPopupMarkupV5322(block) {
    const context = previousMonthContextV5322(block);
    if (!context) return `<div class="previous-month-empty"><h3>Sem mês anterior fechado</h3><p>Ainda não existe uma competência anterior fechada para comparar com ${esc(monthLabel(block.month))}.</p></div>`;

    const { entry, rows, totals } = context;
    const currentReady = block.units.some(unit => unit.current !== '' && unit.current !== null && unit.current !== undefined);
    const consumptionDelta = totals.currentM3 - totals.previousM3;
    const totalDelta = totals.currentTotal - totals.previousTotal;

    return `<div class="previous-month-popup">
      <div class="previous-month-popup-head">
        <div>
          <p class="eyebrow">CONFERÊNCIA DO MÊS ANTERIOR</p>
          <h2>${esc(monthLabel(entry.month))}</h2>
          <p>${esc(block.name)} · comparação com <strong>${esc(monthLabel(block.month))}</strong></p>
        </div>
        <span class="pill ok">Fechado</span>
      </div>

      <section class="previous-month-metrics">
        <article><small>Consumo anterior</small><strong>${fmtM3(totals.previousM3)} m³</strong><span class="${consumptionDelta > 0 ? 'up' : consumptionDelta < 0 ? 'down' : ''}">${currentReady ? `${consumptionDelta >= 0 ? '+' : ''}${fmtM3(consumptionDelta)} m³ no atual` : 'Mês atual ainda sem leituras'}</span></article>
        <article><small>Água anterior</small><strong>${money.format(totals.previousWater)}</strong><span>Rateio do período fechado</span></article>
        <article><small>Multas / outros</small><strong>${money.format(totals.previousFine)}</strong><span>Valores do mês anterior</span></article>
        <article><small>Adicionais / abatimentos</small><strong>${money.format(totals.previousExtra)}</strong><span>Ajustes preservados</span></article>
        <article><small>Total anterior</small><strong>${money.format(totals.previousTotal)}</strong><span class="${totalDelta > 0 ? 'up' : totalDelta < 0 ? 'down' : ''}">${currentReady ? `${totalDelta >= 0 ? '+' : ''}${money.format(totalDelta)} no atual` : 'Aguardando mês atual'}</span></article>
      </section>

      <div class="previous-month-table-wrap">
        <table class="previous-month-table">
          <thead><tr><th>Apto</th><th>Responsável</th><th>Consumo anterior</th><th>Consumo atual</th><th>Diferença</th><th>Multas/outros</th><th>Adicionais</th><th>Total anterior</th><th>Total atual</th></tr></thead>
          <tbody>${rows.map(row => `<tr>
            <td><strong>${esc(row.number)}</strong></td>
            <td>${esc(row.resident)}</td>
            <td>${fmtM3(row.previousM3)} m³</td>
            <td>${currentReady ? `${fmtM3(row.currentM3)} m³` : '—'}</td>
            <td class="${row.deltaM3 > 0 ? 'prev-up' : row.deltaM3 < 0 ? 'prev-down' : ''}">${currentReady ? `${row.deltaM3 >= 0 ? '+' : ''}${fmtM3(row.deltaM3)} m³` : '—'}</td>
            <td>${money.format(row.previousFine)}</td>
            <td>${money.format(row.previousExtra)}</td>
            <td><strong>${money.format(row.previousTotal)}</strong></td>
            <td>${currentReady ? money.format(row.currentTotal) : '—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>

      <div class="previous-month-popup-foot">
        <small>Os valores de ${esc(monthLabel(entry.month))} vêm do fechamento preservado no histórico e não são recalculados.</small>
        <div class="button-row">
          <button class="secondary" type="button" data-open-previous-report>Ver relatório completo</button>
          <button class="primary" type="button" data-close-previous-month>Fechar</button>
        </div>
      </div>
    </div>`;
  }

  function ensurePreviousMonthLauncherV5322() {
    let launcher = document.getElementById('previousMonthLauncher');
    if (!launcher) {
      launcher = document.createElement('button');
      launcher.id = 'previousMonthLauncher';
      launcher.type = 'button';
      launcher.className = 'previous-month-launcher no-print';
      launcher.innerHTML = '<span>↶</span><div><small>Conferir gastos</small><strong>Mês anterior</strong></div>';
      document.body.appendChild(launcher);
    }
    const block = selected();
    const entry = previousClosedEntryV5322(block);
    launcher.hidden = !block || !entry || currentRoute() === 'ajuda';
    if (entry) launcher.title = `Comparar ${monthLabel(entry.month)} com ${monthLabel(block.month)}`;
  }

  function openPreviousMonthPopupV5322() {
    const block = selected();
    if (!block) return;
    const dialog = $('#modal'), form = $('#modalForm'), content = $('#modalContent');
    content.innerHTML = `<div class="modal-inner previous-month-modal-inner">${previousMonthPopupMarkupV5322(block)}</div>`;
    form.onsubmit = event => event.preventDefault();
    dialog.classList.add('previous-month-dialog');
    dialog.showModal();
  }

  function closePreviousMonthPopupV5322() {
    const dialog = $('#modal');
    dialog?.classList.remove('previous-month-dialog');
    if (dialog?.open) dialog.close();
  }

  const renderV5322Base = render;
  render = function() {
    renderV5322Base();
    ensurePreviousMonthLauncherV5322();
  };

  const handleClickV5322Base = handleClick;
  handleClick = async function(event) {
    const target = event.target;
    if (target.closest('#previousMonthLauncher')) { openPreviousMonthPopupV5322(); return; }
    if (target.closest('[data-close-previous-month]')) { closePreviousMonthPopupV5322(); return; }
    if (target.closest('[data-open-previous-report]')) {
      const block = selected();
      const entry = previousClosedEntryV5322(block);
      if (block && entry) {
        reportPeriodByBlockV521.set(block.id, entry.id);
        closePreviousMonthPopupV5322();
        setRoute('relatorios');
        render();
      }
      return;
    }
    return handleClickV5322Base(event);
  };


  // ===================== KR2MELO v5.3.23 — Rateio de mínimos 0 m³ + boletos 2 por A4 paisagem =====================

  function zeroMinimumRedistributionV5323(block) {
    if (!block?.billing?.redistributeZeroMinimum) {
      return { enabled:false, minimum:0, zeroUnits:[], recipientUnits:[], pool:0, share:0 };
    }
    const zeroUnits = block.units.filter(unit =>
      unit.current !== '' && unit.current !== null && unit.current !== undefined && n(unit.m3) === 0
    );
    const recipientUnits = block.units.filter(unit =>
      unit.current !== '' && unit.current !== null && unit.current !== undefined && n(unit.m3) > 0
    );
    const minimum = Math.max(0, waterCost(0, block.tariff));
    const pool = zeroUnits.length * minimum;
    const share = recipientUnits.length ? pool / recipientUnits.length : 0;
    return { enabled:true, minimum, zeroUnits, recipientUnits, pool, share };
  }

  const unitChargesV5323Base = unitCharges;
  unitCharges = function(unit, block, options = {}) {
    const c = unitChargesV5323Base(unit, block, options);
    if (options.disableZeroMinimumRedistribution || !block?.billing?.redistributeZeroMinimum) {
      c.zeroMinimumShare = 0;
      c.zeroMinimumTransferred = 0;
      return c;
    }
    const dist = zeroMinimumRedistributionV5323(block);
    if (!dist.enabled || !dist.zeroUnits.length || !dist.recipientUnits.length) {
      c.zeroMinimumShare = 0;
      c.zeroMinimumTransferred = 0;
      return c;
    }
    const isZero = dist.zeroUnits.some(item => item.id === unit.id);
    const isRecipient = dist.recipientUnits.some(item => item.id === unit.id);
    const oldWater = c.water;
    if (isZero) {
      c.water = 0;
      c.zeroMinimumTransferred = oldWater;
      c.zeroMinimumShare = 0;
      c.total -= oldWater;
    } else if (isRecipient) {
      c.water += dist.share;
      c.zeroMinimumShare = dist.share;
      c.zeroMinimumTransferred = 0;
      c.total += dist.share;
    } else {
      c.zeroMinimumShare = 0;
      c.zeroMinimumTransferred = 0;
    }
    return c;
  };

  function zeroMinimumCardV5323(block) {
    const zeroCount = block.units.filter(unit =>
      unit.current !== '' && unit.current !== null && unit.current !== undefined && n(unit.m3) === 0
    ).length;
    const positiveCount = block.units.filter(unit =>
      unit.current !== '' && unit.current !== null && unit.current !== undefined && n(unit.m3) > 0
    ).length;
    const minimum = Math.max(0, waterCost(0, block.tariff));
    const pool = zeroCount * minimum;
    const share = positiveCount ? pool / positiveCount : 0;
    return `<section class="card zero-minimum-card">
      <div class="card-head">
        <div>
          <h3>Rateio dos mínimos de apartamentos com 0 m³</h3>
          <span class="muted">Opcional: transfere a cobrança mínima dos APTs zerados para os apartamentos com consumo maior que 0 m³.</span>
        </div>
        <span class="pill ${block.billing?.redistributeZeroMinimum ? 'ok' : 'info'}">${block.billing?.redistributeZeroMinimum ? 'ATIVO' : 'DESATIVADO'}</span>
      </div>
      <label class="zero-minimum-toggle">
        <input type="checkbox" data-zero-minimum-toggle ${block.billing?.redistributeZeroMinimum ? 'checked' : ''} ${!zeroCount || !positiveCount ? 'disabled' : ''}>
        <span><strong>Ratear o mínimo dos 0 m³ entre os demais apartamentos</strong><small>Distribuição igual entre os APTs com consumo acima de 0 m³.</small></span>
      </label>
      <div class="zero-minimum-summary">
        <div><small>APTs em 0 m³</small><strong>${zeroCount}</strong></div>
        <div><small>Mínimo por APT</small><strong>${money.format(minimum)}</strong></div>
        <div><small>Total a ratear</small><strong>${money.format(pool)}</strong></div>
        <div><small>APTs que recebem</small><strong>${positiveCount}</strong></div>
        <div><small>Acréscimo por APT</small><strong>${positiveCount ? money.format(share) : '—'}</strong></div>
      </div>
      <div class="info-box"><strong>Como funciona:</strong> os apartamentos com leitura válida e consumo de 0 m³ ficam com Água = R$ 0,00. A soma dos mínimos desses apartamentos é dividida igualmente entre os apartamentos com consumo maior que 0 m³. O total de água do prédio é preservado.</div>
    </section>`;
  }

  const renderBillsV5323Base = renderBills;
  renderBills = function(block) {
    const html = renderBillsV5323Base(block);
    return html.replace('<form class="card form-grid" id="billingForm">', `${zeroMinimumCardV5323(block)}<form class="card form-grid" id="billingForm">`);
  };

  const handleChangeV5323Base = handleChange;
  handleChange = function(event) {
    if (event.target.matches('[data-zero-minimum-toggle]')) {
      const block = selected();
      if (!block) return;
      block.billing = block.billing || {};
      block.billing.redistributeZeroMinimum = Boolean(event.target.checked);
      save(block.billing.redistributeZeroMinimum ? 'Rateio dos mínimos 0 m³ ativado' : 'Rateio dos mínimos 0 m³ desativado');
      render();
      return;
    }
    return handleChangeV5323Base(event);
  };

  const saveBillingV5323Base = saveBilling;
  saveBilling = function(form) {
    const block = selected();
    const keepRedistribution = Boolean(block?.billing?.redistributeZeroMinimum);
    saveBillingV5323Base(form);
    const refreshed = selected();
    if (refreshed?.billing) {
      refreshed.billing.redistributeZeroMinimum = keepRedistribution;
      save();
      render();
    }
  };

  const billCopyV5323Base = billCopy;
  billCopy = function(unit, block, copy) {
    let markup = billCopyV5323Base(unit, block, copy);
    const c = unitCharges(unit, block);
    const baseWater = Math.max(0, c.water - n(c.zeroMinimumShare));
    markup = markup.replace(
      `<div class="bill-charge-line"><span>ÁGUA</span><b>${money.format(c.water)}</b></div>`,
      `<div class="bill-charge-line"><span>ÁGUA</span><b>${money.format(baseWater)}</b></div>`
    );
    if (c.zeroMinimumShare > 0) {
      const line = `<div class="bill-charge-line bill-zero-minimum-share"><span>RATEIO MÍNIMOS 0 m³</span><b>${money.format(c.zeroMinimumShare)}</b></div>`;
      markup = markup.replace('<div class="bill-charge-line bill-condo-net">', `${line}<div class="bill-charge-line bill-condo-net">`);
    }
    if (c.zeroMinimumTransferred > 0) {
      const line = `<div class="bill-charge-line bill-zero-minimum-transfer"><span>MÍNIMO TRANSFERIDO AOS DEMAIS</span><b>informativo · ${money.format(c.zeroMinimumTransferred)}</b></div>`;
      markup = markup.replace('<div class="bill-charge-line bill-condo-net">', `${line}<div class="bill-charge-line bill-condo-net">`);
    }
    if (copy === 'SÍNDICO') {
      markup = markup.replace(/<footer class="bill-signature">[\s\S]*?<\/footer>/, `<footer class="bill-signature bill-signature-resident"><div></div><small>ASSINATURA DO MORADOR</small></footer>`);
    } else {
      markup = markup.replace('</article>', '<div class="bill-bottom-caption">RECEBIDO POR / ASSINATURA DO MORADOR</div></article>');
    }
    return markup;
  };

  billPages = function(block, units, index) {
    const pages = [];
    for (let i = 0; i < units.length; i += 2) {
      const pair = units.slice(i, i + 2);
      const copies = [];
      pair.forEach(unit => {
        const blockLabel = `Bloco ${blockLetter(index)}`;
        const manager = billCopy(unit, block, 'SÍNDICO').replace('<header class="bill-head">', `<div class="bill-block-label">${esc(blockLabel)}</div><header class="bill-head">`);
        const resident = billCopy(unit, block, 'MORADOR').replace('<header class="bill-head">', `<div class="bill-block-label">${esc(blockLabel)}</div><header class="bill-head">`);
        copies.push(manager);
        copies.push(resident);
      });
      pages.push(`<section class="bill-page bill-page-with-cuts bill-page-v5323"><div class="bill-page-group-label">Bloco ${blockLetter(index)}</div><div class="bill-cut-guide bill-cut-guide-v" aria-hidden="true">✂ CORTE</div><div class="bill-cut-guide bill-cut-guide-h" aria-hidden="true">✂ CORTE</div>${copies.join('')}</section>`);
    }
    return pages.join('');
  };

  function printBillsLandscapeV5323(mode) {
    const block = selected();
    if (!block) return;
    const titles = { complete:'Bloco completo de boletos', cover:'Capas dos boletos', bills:'Boletos', back:'Contracapas dos boletos' };
    const html = billPrintContent(block, mode);
    const win = window.open('', '_blank');
    if (!win) return toast('Permita pop-ups para imprimir os boletos.', true);
    const cssUrl = new URL('styles.css', location.href).href;
    win.document.open();
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><base href="${esc(location.href)}"><title>${esc(titles[mode] || 'Boletos KR²MELO')}</title><link rel="stylesheet" href="${cssUrl}"><style>
      @page{size:A4 landscape;margin:8mm}
      html,body{margin:0;padding:0;background:#fff}
      .bill-print-toolbar{position:sticky;top:0;z-index:50;background:#111;color:#fff;padding:9px 14px;display:flex;align-items:center;justify-content:center;gap:12px;font-family:Arial,sans-serif}
      .bill-print-toolbar button{border:0;border-radius:8px;background:#ff1100;color:#fff;padding:9px 16px;font-weight:900;cursor:pointer}
      @media print{
        @page{size:A4 landscape;margin:8mm}
        .bill-print-toolbar,.no-print{display:none!important}
        body{width:281mm!important}
        .bill-page.bill-page-with-cuts{width:281mm!important;height:194mm!important;max-width:281mm!important;max-height:194mm!important;margin:0 auto!important;break-after:page!important;page-break-after:always!important}
        .bill-page.bill-page-with-cuts:last-child{break-after:auto!important;page-break-after:auto!important}
        .cover-sheet,.cover-back-only{width:281mm!important;height:194mm!important}
      }
    </style></head><body class="bills-print-document"><div class="bill-print-toolbar"><span>A4 PAISAGEM · 2 boletos por folha · Síndico à esquerda (estreita) / Morador à direita (ampliada)</span><button onclick="window.print()">Imprimir agora</button></div>${html}</body></html>`);
    win.document.close();
  }

  printBillsPart = function(mode) {
    printBillsLandscapeV5323(mode || 'bills');
  };


  // ===================== KR2MELO v5.3.27 — Gestão inteligente de competência e histórico =====================
  function recommendedReadingMonthV5327() {
    return shiftMonth(currentMonth(), -1);
  }

  function latestHistoryMonthBeforeV5327(block, targetMonth) {
    const months = [...new Set((block?.history || [])
      .map(entry => String(entry.month || ''))
      .filter(month => /^\d{4}-\d{2}$/.test(month) && month < targetMonth))]
      .sort();
    return months.at(-1) || '';
  }

  function missingHistoryMonthsV5327(block, targetMonth) {
    if (!block || !/^\d{4}-\d{2}$/.test(targetMonth || '')) return [];
    const months = [...new Set((block.history || []).map(entry => String(entry.month || '')).filter(month => /^\d{4}-\d{2}$/.test(month) && month < targetMonth))].sort();
    if (!months.length) return [];
    const existing = new Set(months);
    const missing = [];
    let month = months[0];
    let guard = 0;
    while (month < targetMonth && guard++ < 120) {
      if (!existing.has(month)) missing.push(month);
      month = shiftMonth(month, 1);
    }
    return missing;
  }

  function monthManagementCardV5327(block) {
    const recommended = recommendedReadingMonthV5327();
    const selectedMonth = /^\d{4}-\d{2}$/.test(block?.month || '') ? block.month : recommended;
    const latest = latestHistoryMonthBeforeV5327(block, selectedMonth);
    const missing = missingHistoryMonthsV5327(block, selectedMonth);
    const isRecommended = selectedMonth === recommended;
    const status = missing.length
      ? `<div class="month-gap-alert danger"><strong>⚠ Histórico incompleto</strong><span>Antes de ${esc(monthLabel(selectedMonth))}, falta registrar: <b>${missing.map(monthLabel).map(esc).join(', ')}</b>.</span></div>`
      : latest
        ? `<div class="month-gap-alert ok"><strong>✓ Sequência conferida</strong><span>Último mês anterior no histórico: <b>${esc(monthLabel(latest))}</b>. Não há lacunas até a competência selecionada.</span></div>`
        : `<div class="month-gap-alert info"><strong>Histórico inicial</strong><span>Ainda não existe mês anterior no histórico para conferir a sequência.</span></div>`;
    return `<section class="card reading-month-manager no-print"><div class="card-head"><div><h3>Competência da leitura</h3><p class="muted">O sistema usa como referência automática o mês anterior ao mês atual, mas você pode selecionar manualmente quando necessário.</p></div><span class="pill ${isRecommended ? 'ok' : 'warn'}">${isRecommended ? 'Automático correto' : 'Seleção manual'}</span></div><div class="reading-month-grid"><div><small>Mês atual do calendário</small><strong>${esc(monthLabel(currentMonth()))}</strong></div><div><small>Mês recomendado para leitura</small><strong>${esc(monthLabel(recommended))}</strong></div><label class="field"><span>Competência em uso</span><input data-reading-month-select type="month" value="${esc(selectedMonth)}" aria-label="Selecionar competência da leitura"></label><div class="reading-month-actions"><button class="secondary" data-use-recommended-month type="button" ${isRecommended ? 'disabled' : ''}>Usar ${esc(monthLabel(recommended))}</button></div></div>${status}</section>`;
  }

  function applyReadingMonthV5327(block, month, source = 'manual') {
    if (!block || !/^\d{4}-\d{2}$/.test(month || '')) return false;
    const oldMonth = block.month;
    if (oldMonth === month) return true;
    const hasCurrentReadings = block.units.some(unit => unit.current !== '');
    if (hasCurrentReadings && !confirm(`Existem leituras lançadas em ${monthLabel(oldMonth)}.\n\nDeseja alterar a competência para ${monthLabel(month)} sem apagar nenhuma leitura?`)) return false;
    createSnapshot(`Antes de alterar competência ${monthLabel(oldMonth)} → ${monthLabel(month)}`);
    block.month = month;
    const dueDay = dayOf(block.billing?.dueDate, 10);
    const currentReadDay = dayOf(block.billing?.currentReadDate, Number(today().slice(8,10)) || 1);
    const previousReadDay = dayOf(block.billing?.previousReadDate, currentReadDay);
    const nextReadDay = dayOf(block.billing?.nextReadDate, currentReadDay);
    block.billing = normalizeBilling({
      ...block.billing,
      dueDate: dateForMonth(month, dueDay),
      currentReadDate: dateForMonth(month, currentReadDay),
      previousReadDate: block.billing?.previousReadDate ? dateForMonth(shiftMonth(month, -1), previousReadDay) : '',
      nextReadDate: block.billing?.nextReadDate ? dateForMonth(shiftMonth(month, 1), nextReadDay) : ''
    }, month);
    block.tariff = typeof tariffForMonthV5311 === 'function' ? tariffForMonthV5311(block, month) : block.tariff;
    recalculateBlock(block);
    audit(block, 'Competência alterada', `${monthLabel(oldMonth)} → ${monthLabel(month)} (${source})`, { oldMonth, month, source });
    save(`Competência alterada para ${monthLabel(month)}`);
    render();
    return true;
  }

  const renderReadingsV5327Base = renderReadings;
  renderReadings = function(block) {
    return `${monthManagementCardV5327(block)}${renderReadingsV5327Base(block)}`;
  };

  function openEditHistoryV5327(entryId) {
    const block = selected();
    const entry = block?.history?.find(item => item.id === entryId);
    if (!block || !entry) return;
    const sourceUnits = entryUnits(entry);
    const rows = sourceUnits.map(unit => `<tr><td><strong>${esc(unit.number)}</strong><input type="hidden" name="id_${unit.id}" value="${esc(unit.id)}"><input type="hidden" name="number_${unit.id}" value="${esc(unit.number)}"></td><td><input name="resident_${unit.id}" value="${esc(unit.resident)}"></td><td><input name="previous_${unit.id}" type="number" min="0" step="0.001" value="${n(unit.previous)}"></td><td><input name="current_${unit.id}" type="number" min="0" step="0.001" value="${unit.current === '' ? '' : n(unit.current)}"></td></tr>`).join('');
    openModal(`<h2>Editar histórico de ${esc(monthLabel(entry.month))}</h2><div class="warning-box"><strong>Atenção:</strong> esta opção altera diretamente este registro histórico. Uma cópia local de segurança será criada antes de salvar.</div><div class="form-grid"><div class="field"><label>Competência</label><input name="month" type="month" value="${esc(entry.month)}" required></div><div class="field"><label>Motivo da edição</label><input name="reason" value="Correção manual de ${esc(monthLabel(entry.month))}" required></div></div><div class="table-wrap"><table><thead><tr><th>Apto</th><th>Responsável</th><th>Leitura anterior</th><th>Leitura atual</th></tr></thead><tbody>${rows}</tbody></table></div>`, 'Salvar edição', data => {
      const selectedMonth = String(data.month || '');
      if (!/^\d{4}-\d{2}$/.test(selectedMonth)) return toast('Informe uma competência válida.', true);
      const reason = String(data.reason || '').trim();
      if (!reason) return toast('Informe o motivo da edição.', true);
      createSnapshot(`Antes de editar histórico ${monthLabel(entry.month)}`);
      const records = sourceUnits.map(unit => ({ id: data[`id_${unit.id}`] || unit.id, number: data[`number_${unit.id}`] || unit.number, resident: data[`resident_${unit.id}`] || '', previous: n(data[`previous_${unit.id}`]), current: data[`current_${unit.id}`] === '' ? '' : n(data[`current_${unit.id}`]), note: reason, condoRule: unit.condoRule || {}, meter: unit.meter || {}, phone: unit.phone || '' }));
      const recalculated = monthSnapshot(block, selectedMonth, entry.source || 'manual', records, {});
      const originalMonth = entry.month;
      const edited = normalizeHistoryEntry({
        ...recalculated,
        id: entry.id,
        version: entry.version,
        closedAt: entry.closedAt,
        source: entry.source,
        status: entry.status,
        revisionOf: entry.revisionOf,
        importedAt: entry.importedAt,
        revisionReason: reason
      });
      const index = block.history.findIndex(item => item.id === entry.id);
      block.history[index] = edited;
      audit(block, 'Histórico editado', `${monthLabel(originalMonth)} → ${monthLabel(selectedMonth)} · ${reason}`, { entryId: entry.id, originalMonth, month: selectedMonth, reason });
      save('Histórico editado com cópia de segurança');
      render();
    });
  }

  const renderHistoryV5327Base = renderHistoryV51;
  renderHistoryV51 = function(block) {
    let html = renderHistoryV5327Base(block);
    html = html.replace(/<button class="secondary" data-revise-history="([^"]+)" type="button">Criar revisão<\/button>/g, '<button class="secondary" data-edit-history="$1" type="button">Editar</button><button class="secondary" data-revise-history="$1" type="button">Criar revisão</button><button class="danger" data-delete-history="$1" type="button">Excluir</button>');
    return html;
  };

  const handleClickV5327Base = handleClick;
  handleClick = function(event) {
    const target = event.target;
    const editHistory = target.closest('[data-edit-history]');
    if (editHistory) { openEditHistoryV5327(editHistory.dataset.editHistory); return; }
    const deleteHistory = target.closest('[data-delete-history]');
    if (deleteHistory) {
      const block = selected();
      const entry = block?.history?.find(item => item.id === deleteHistory.dataset.deleteHistory);
      if (!block || !entry) return;
      if (!confirm(`Excluir permanentemente o histórico de ${monthLabel(entry.month)}?\n\nUma cópia local de segurança será criada antes da exclusão.`)) return;
      createSnapshot(`Antes de excluir histórico ${monthLabel(entry.month)}`);
      block.history = block.history.filter(item => item.id !== entry.id);
      audit(block, 'Histórico excluído', `${monthLabel(entry.month)} · versão ${entry.version || 1}`, { entryId: entry.id, month: entry.month, version: entry.version || 1 });
      save('Histórico excluído com cópia de segurança');
      render();
      return;
    }
    if (target.closest('[data-use-recommended-month]')) { const block = selected(); if (block) applyReadingMonthV5327(block, recommendedReadingMonthV5327(), 'automático'); return; }
    return handleClickV5327Base(event);
  };

  const handleChangeV5327Base = handleChange;
  handleChange = function(event) {
    if (event.target.matches('[data-reading-month-select]')) {
      const block = selected();
      if (block) applyReadingMonthV5327(block, event.target.value, 'manual');
      return;
    }
    return handleChangeV5327Base(event);
  };


  // ===================== KR2MELO v5.3.28 — Ajustes simplificados por apartamento =====================
  const discountTargetLabelsV5328 = { condo: 'Condomínio', water: 'Água', total: 'Valor total da conta' };
  const discountModeLabelsV5328 = { normal: 'Sem desconto', desconto_fixo: 'Desconto em R$', desconto_percentual: 'Desconto em %', isento: 'Isenção total' };

  function ensureV5328(block) {
    if (!block) return;
    block.units.forEach(unit => {
      if (!['condo', 'water', 'total'].includes(unit.discountTarget)) unit.discountTarget = 'condo';
      if (unit.billingFine && !String(unit.billingFineLabel || '').trim()) unit.billingFineLabel = 'MULTAS / OUTROS';
      unit.billingFineNote = String(unit.billingFineNote || '');
      unit.billingNote = String(unit.billingNote || '');
    });
  }

  function discountAmountV5328(base, rule) {
    const safeBase = Math.max(0, n(base));
    if (!ruleActive(rule, selected()?.month || currentMonth()) && !ruleActive(rule, rule?.startsAt || currentMonth())) return 0;
    if (rule.mode === 'isento') return safeBase;
    if (rule.mode === 'desconto_fixo') return Math.min(safeBase, Math.max(0, n(rule.value)));
    if (rule.mode === 'desconto_percentual') return Math.min(safeBase, safeBase * Math.min(100, Math.max(0, n(rule.value))) / 100);
    return 0;
  }

  const unitChargesV5328Base = unitCharges;
  unitCharges = function(unit, block, options = {}) {
    const c = unitChargesV5328Base(unit, block, options);
    const target = ['condo', 'water', 'total'].includes(unit?.discountTarget) ? unit.discountTarget : 'condo';
    const rule = normalizeRule(options.rule || unit.condoRule);
    const month = options.month || block.month;
    c.discountTarget = target; c.waterDiscount = 0; c.totalDiscount = 0; c.discountTotal = c.condoDiscount || 0;
    if (target === 'condo' || !ruleActive(rule, month) || rule.mode === 'normal') return c;

    // O cálculo-base antigo sempre tratava a regra como desconto de condomínio.
    // Para água/total, devolvemos esse abatimento ao condomínio e o aplicamos ao alvo escolhido.
    if (c.condoDiscount) { c.condo += c.condoDiscount; c.total += c.condoDiscount; c.condoDiscount = 0; }
    if (target === 'water') {
      const grossWater = Math.max(0, c.water);
      const discount = rule.mode === 'isento' ? grossWater : rule.mode === 'desconto_fixo' ? Math.min(grossWater, Math.max(0, n(rule.value))) : rule.mode === 'desconto_percentual' ? Math.min(grossWater, grossWater * Math.min(100, Math.max(0, n(rule.value))) / 100) : 0;
      c.waterGross = grossWater; c.waterDiscount = discount; c.water = Math.max(0, grossWater - discount); c.total = Math.max(0, c.total - discount); c.discountTotal = discount;
    } else if (target === 'total') {
      const grossTotal = Math.max(0, c.total);
      const discount = rule.mode === 'isento' ? grossTotal : rule.mode === 'desconto_fixo' ? Math.min(grossTotal, Math.max(0, n(rule.value))) : rule.mode === 'desconto_percentual' ? Math.min(grossTotal, grossTotal * Math.min(100, Math.max(0, n(rule.value))) / 100) : 0;
      c.totalGross = grossTotal; c.totalDiscount = discount; c.total = Math.max(0, grossTotal - discount); c.discountTotal = discount;
    }
    return c;
  };

  const chargeTotalsV5328Base = chargeTotals;
  chargeTotals = function(block, options = {}) {
    const totals = chargeTotalsV5328Base(block, options);
    totals.waterDiscount = 0; totals.totalDiscount = 0;
    let correctedDiscount = 0;
    block.units.forEach(unit => { const c = unitCharges(unit, block, options); correctedDiscount += n(c.discountTotal); totals.waterDiscount += n(c.waterDiscount); totals.totalDiscount += n(c.totalDiscount); });
    totals.discount = correctedDiscount;
    return totals;
  };

  adjustmentText = function(charges) {
    if (!n(charges?.discountTotal)) return '';
    const rule = charges.rule || {};
    const target = charges.discountTarget || 'condo';
    const role = rule.role && rule.role !== 'normal' ? ` — ${roleLabels[rule.role] || rule.role}` : '';
    const reason = rule.reason ? ` · ${rule.reason}` : '';
    const action = rule.mode === 'isento' ? 'Isenção' : 'Desconto';
    return `${action} de ${String(discountTargetLabelsV5328[target] || 'condomínio').toLowerCase()}${role}${reason}`;
  };

  const historyTotalsV5328Base = historyTotals;
  historyTotals = function(entry) {
    const result = historyTotalsV5328Base(entry);
    if (entry.charges?.length) result.discount = entry.charges.reduce((sum, c) => sum + n(c.discountTotal || (n(c.condoDiscount) + n(c.waterDiscount) + n(c.totalDiscount))), 0);
    return result;
  };

  function adjustmentCenterV5328(block) {
    ensureV5328(block);
    const totals = chargeTotals(block);
    const active = block.units.filter(unit => ruleActive(unit.condoRule, block.month) && normalizeRule(unit.condoRule).mode !== 'normal').length;
    const fines = block.units.reduce((sum, unit) => sum + Math.max(0, n(unit.billingFine)), 0);
    const collapsed = adjustmentCenterCollapsedV5320(block);
    const cards = block.units.map(unit => {
      const r = normalizeRule(unit.condoRule), c = unitCharges(unit, block), target = unit.discountTarget || 'condo';
      const discountDetail = c.discountTotal ? `${adjustmentText(c)} · − ${money.format(c.discountTotal)}` : 'Sem desconto ativo';
      return `<article class="unit-adjustment-card" data-rule-row="${unit.id}">
        <header><div><span class="unit-adjustment-number">Apto ${esc(unit.number)}</span><strong>${esc(unit.resident || 'Sem responsável')}</strong></div><b>${money.format(c.total)}</b></header>
        <div class="unit-adjustment-grid">
          <section class="adjustment-box discount-box"><div class="adjustment-box-title"><span>1</span><div><strong>Desconto / Isenção</strong><small>${esc(discountDetail)}</small></div></div>
            <label>Aplicar em<select data-rule-field="discountTarget"><option value="total" ${target === 'total' ? 'selected' : ''}>Valor total da conta</option><option value="condo" ${target === 'condo' ? 'selected' : ''}>Condomínio</option><option value="water" ${target === 'water' ? 'selected' : ''}>Água</option></select></label>
            <div class="adjustment-inline"><label>Tipo<select data-rule-field="mode">${Object.entries(discountModeLabelsV5328).map(([value,label]) => `<option value="${value}" ${r.mode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Valor<input data-rule-field="value" type="number" min="0" step="0.01" value="${r.value || ''}" placeholder="${r.mode === 'isento' || r.mode === 'normal' ? 'Não se aplica' : 'R$ ou %'}" ${r.mode === 'isento' || r.mode === 'normal' ? 'disabled' : ''}></label></div>
            <label>Motivo / benefício<textarea data-rule-field="reason" rows="2" placeholder="Ex.: serviço prestado ao prédio; síndico; apto vazio">${esc(r.reason)}</textarea></label>
            <details><summary>Função, vigência e autorização</summary><div class="adjustment-details"><label>Função<select data-rule-field="role">${Object.entries(roleLabels).map(([value,label]) => `<option value="${value}" ${r.role === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Início<input data-rule-field="startsAt" type="month" value="${esc(r.startsAt)}"></label><label>Fim<input data-rule-field="endsAt" type="month" value="${esc(r.endsAt)}"></label><label>Autorizado por<input data-rule-field="authorizedBy" value="${esc(r.authorizedBy)}" placeholder="Síndico / ata"></label></div></details>
          </section>
          <section class="adjustment-box fine-box"><div class="adjustment-box-title"><span>2</span><div><strong>Multa / Outros</strong><small>${c.fine ? `${esc(unit.billingFineLabel || 'Multa/Outros')} · ${money.format(c.fine)}` : 'Nenhuma multa lançada'}</small></div></div>
            <label>Motivo / descrição<input data-rule-field="billingFineLabel" list="fineReasonOptionsV5328" value="${esc(unit.billingFineLabel || '')}" placeholder="Ex.: Barulho excessivo"></label>
            <label>Valor da multa / lançamento<input data-rule-field="billingFine" type="number" min="0" step="0.01" value="${unit.billingFine || ''}" placeholder="R$ 0,00"></label>
            <label>Por que foi aplicada?<textarea data-rule-field="billingFineNote" rows="3" placeholder="Esta explicação aparecerá no boleto do morador">${esc(unit.billingFineNote || '')}</textarea></label>
          </section>
          <section class="adjustment-box note-box"><div class="adjustment-box-title"><span>3</span><div><strong>Observação no boleto individual</strong><small>Recado exclusivo para este apartamento.</small></div></div>
            <label>Mensagem ao morador<textarea data-rule-field="billingNote" rows="4" placeholder="Ex.: Atenção ao consumo elevado. Verifique possível vazamento no apartamento.">${esc(unit.billingNote || '')}</textarea></label>
          </section>
          <section class="adjustment-box extra-box"><div class="adjustment-box-title"><span>+</span><div><strong>Outros ajustes</strong><small>Opcional — adicionais ou abatimentos avulsos.</small></div></div>
            <label>Um item por linha<textarea class="extra-charge-editor" data-rule-field="extraChargesText" rows="4" placeholder="2ª via; 10,00\nAbatimento; -15,00">${esc(extraChargesText(unit))}</textarea></label>
          </section>
        </div>
      </article>`;
    }).join('');
    return `<section class="card adjustment-center adjustment-center-v5328 adjustment-center-v5329 no-print ${collapsed ? 'is-collapsed' : ''}" data-adjustment-center><div class="card-head adjustment-center-head"><div><h3>Lançamentos e ajustes por apartamento</h3><span class="muted">Escolha claramente onde o desconto será aplicado, registre multas com motivo e mantenha recados individuais no boleto.</span></div><div class="adjustment-head-actions"><div class="button-row"><span class="pill info" data-adjustment-pill="discount-count">${active} desconto(s)</span><span class="pill warn" data-adjustment-pill="discount-total">${money.format(totals.discount)} abatido</span><span class="pill danger" data-adjustment-pill="fine-total">${money.format(fines)} multas/outros</span></div><button class="secondary adjustment-collapse-btn" type="button" data-toggle-adjustment-center aria-expanded="${collapsed ? 'false' : 'true'}"><span class="adjustment-collapse-icon">${collapsed ? '▾' : '▴'}</span>${collapsed ? 'Expandir' : 'Recolher'}</button></div></div><div class="adjustment-center-body" ${collapsed ? 'hidden' : ''}><div class="adjustment-guide"><strong>Descontos disponíveis:</strong><span><b>Total da conta</b> — serviço prestado ou outro abatimento geral.</span><span><b>Condomínio</b> — síndico, secretário ou membro da diretoria.</span><span><b>Água</b> — isenção/desconto parcial, como apartamento vazio.</span></div><datalist id="fineReasonOptionsV5328"><option value="PERTURBAÇÃO DA ORDEM"><option value="BARULHO EXCESSIVO"><option value="DESCUMPRIMENTO DE REGRA"><option value="DANOS À ÁREA COMUM"><option value="MULTAS / OUTROS"></datalist><div class="unit-adjustment-list">${cards}</div></div></section>`;
  }

  const renderReadingsV5328Base = renderReadings;
  renderReadings = function(block) {
    ensureV5328(block);
    let html = renderReadingsV5328Base(block);
    const oldCenter = /<section class="card adjustment-center no-print[\s\S]*?<\/section>(?=<section class="reading-bulk-actions)/;
    if (oldCenter.test(html)) html = html.replace(oldCenter, adjustmentCenterV5328(block));
    else {
      const start = html.indexOf('<section class="card adjustment-center');
      const endMarker = '<section class="reading-bulk-actions';
      const end = html.indexOf(endMarker, start);
      if (start >= 0 && end > start) html = html.slice(0, start) + adjustmentCenterV5328(block) + html.slice(end);
    }
    return html;
  };

  const billingNoteLinesV5328Base = billingNoteLines;
  billingNoteLines = function(unit, billing) {
    const global = cleanNoteLines(billing?.notes, 4);
    const fine = n(unit?.billingFine) > 0 ? cleanNoteLines(`${unit.billingFineLabel || 'Multa/Outros'}${unit.billingFineNote ? `: ${unit.billingFineNote}` : ''}`, 2) : [];
    const individual = cleanNoteLines(unit?.billingNote, 3);
    return [...global, ...fine, ...individual].slice(0, 7);
  };

  const billCopyV5328Base = billCopy;
  billCopy = function(unit, block, copy) {
    const c = unitCharges(unit, block);
    let markup = billCopyV5328Base(unit, block, copy);
    if (c.waterDiscount > 0) {
      const gross = Math.max(0, n(c.waterGross) - n(c.zeroMinimumShare));
      markup = markup.replace(/<div class="bill-charge-line"><span>ÁGUA<\/span><b>[^<]*<\/b><\/div>/, `<div class="bill-charge-line"><span>ÁGUA</span><b>${money.format(gross)}</b></div><div class="bill-charge-line bill-adjustment"><span>${esc(adjustmentText(c))}</span><b>− ${money.format(c.waterDiscount)}</b></div>`);
    }
    if (c.totalDiscount > 0) {
      const line = `<div class="bill-charge-line bill-adjustment bill-total-discount"><span>${esc(adjustmentText(c))}</span><b>− ${money.format(c.totalDiscount)}</b></div>`;
      markup = markup.replace('</section><div class="bill-total">', `${line}</section><div class="bill-total">`);
    }
    return markup;
  };

  const handleChangeV5328Base = handleChange;
  handleChange = function(event) {
    const target = event.target;
    const ruleField = target.closest('[data-rule-field]');
    if (ruleField && target.dataset.ruleField === 'discountTarget') {
      const row = target.closest('[data-rule-row]'), block = selected(), unit = findUnit(block, row?.dataset.ruleRow);
      if (!unit) return;
      unit.discountTarget = ['condo','water','total'].includes(target.value) ? target.value : 'condo';
      save('Destino do desconto atualizado'); render(); return;
    }
    return handleChangeV5328Base(event);
  };


  // ===================== KR2MELO v5.3.31 — Estabilidade dos ajustes sem re-render global =====================
  function adjustmentFieldLabelV5329(field) {
    return ({ discountTarget: 'Destino do desconto', mode: 'Tipo de desconto', value: 'Valor do desconto', reason: 'Motivo do desconto', role: 'Função', startsAt: 'Início da regra', endsAt: 'Fim da regra', authorizedBy: 'Autorização', billingFineLabel: 'Motivo da multa', billingFine: 'Valor da multa', billingFineNote: 'Observação da multa', billingNote: 'Observação do boleto', extraChargesText: 'Outros ajustes' })[field] || 'Lançamento';
  }

  function setDiscountValueStateV5329(card, mode) {
    const input = card?.querySelector('[data-rule-field="value"]');
    if (!input) return;
    const disabled = mode === 'normal' || mode === 'isento';
    input.disabled = disabled;
    input.placeholder = disabled ? 'Não se aplica' : 'R$ ou %';
    input.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  }

  function refreshAdjustmentUiV5329(block, unit, card) {
    if (!block || !unit || !card) return;
    const c = unitCharges(unit, block);
    const r = normalizeRule(unit.condoRule);
    setDiscountValueStateV5329(card, r.mode);

    const total = card.querySelector(':scope > header > b');
    if (total) total.textContent = money.format(c.total);

    const discountSummary = card.querySelector('.discount-box .adjustment-box-title small');
    if (discountSummary) discountSummary.textContent = c.discountTotal ? `${adjustmentText(c)} · − ${money.format(c.discountTotal)}` : 'Sem desconto ativo';

    const fineSummary = card.querySelector('.fine-box .adjustment-box-title small');
    if (fineSummary) fineSummary.textContent = c.fine ? `${unit.billingFineLabel || 'Multa/Outros'} · ${money.format(c.fine)}` : 'Nenhuma multa lançada';

    const center = card.closest('[data-adjustment-center]');
    if (!center) return;
    const active = block.units.filter(item => ruleActive(item.condoRule, block.month) && normalizeRule(item.condoRule).mode !== 'normal').length;
    const totals = chargeTotals(block);
    const fines = block.units.reduce((sum, item) => sum + Math.max(0, n(item.billingFine)), 0);
    const countPill = center.querySelector('[data-adjustment-pill="discount-count"]');
    const discountPill = center.querySelector('[data-adjustment-pill="discount-total"]');
    const finePill = center.querySelector('[data-adjustment-pill="fine-total"]');
    if (countPill) countPill.textContent = `${active} desconto(s)`;
    if (discountPill) discountPill.textContent = `${money.format(totals.discount)} abatido`;
    if (finePill) finePill.textContent = `${money.format(fines)} multas/outros`;
  }

  function applyAdjustmentFieldV5329(target) {
    const card = target.closest('.unit-adjustment-card');
    const row = target.closest('[data-rule-row]');
    const block = selected();
    const unit = findUnit(block, row?.dataset.ruleRow);
    if (!card || !block || !unit) return false;
    const field = target.dataset.ruleField;
    if (!field) return false;

    const oldValue = field === 'discountTarget' ? unit.discountTarget : field === 'extraChargesText' ? extraChargesText(unit) : (unit[field] ?? unit.condoRule?.[field] ?? '');

    if (field === 'discountTarget') {
      unit.discountTarget = ['condo', 'water', 'total'].includes(target.value) ? target.value : 'condo';
    } else if (field === 'extraChargesText') {
      unit.extraCharge = 0;
      unit.extraChargeLabel = 'VALOR ADICIONAL';
      unit.extraCharges = parseExtraCharges(target.value);
    } else if (field === 'billingFineLabel') {
      unit.billingFineLabel = String(target.value || '').trim() || 'MULTAS / OUTROS';
      target.value = unit.billingFineLabel;
    } else if (field === 'billingFine') {
      unit.billingFine = Math.max(0, n(target.value));
    } else if (field === 'billingFineNote') {
      unit.billingFineNote = String(target.value || '');
    } else if (field === 'billingNote') {
      unit.billingNote = String(target.value || '');
    } else {
      unit.condoRule = normalizeRule(unit.condoRule);
      unit.condoRule[field] = field === 'value' ? Math.max(0, n(target.value)) : target.value;
      unit.condoRule = normalizeRule(unit.condoRule);
    }

    const newValue = field === 'discountTarget' ? unit.discountTarget : field === 'extraChargesText' ? extraChargesText(unit) : (unit[field] ?? unit.condoRule?.[field] ?? '');
    if (typeof recordUnitChange === 'function' && String(oldValue) !== String(newValue)) {
      recordUnitChange(block, unit, 'Lançamento', adjustmentFieldLabelV5329(field), oldValue, newValue);
    }
    save(`${adjustmentFieldLabelV5329(field)} atualizado`);
    refreshAdjustmentUiV5329(block, unit, card);
    return true;
  }

  const handleChangeV5329Base = handleChange;
  handleChange = function(event) {
    const target = event.target;
    if (target?.matches?.('.adjustment-center-v5329 [data-rule-field]')) {
      // Não chama render(): preserva o select/textarea em foco e impede a tabela de saltar sobre o cartão.
      applyAdjustmentFieldV5329(target);
      return;
    }
    return handleChangeV5329Base(event);
  };


  // ===================== KR2MELO v5.3.31 — Correção estrutural dos lançamentos + reset seguro do navegador =====================
  // A v5.3.28 trocava o bloco antigo por expressão regular. Como o novo editor possui
  // <section> internas, navegadores/caches com combinações de versões podiam deixar
  // fragmentos do editor fora do contêiner. A partir daqui a tela Leituras é composta
  // diretamente, sem substituição de HTML por regex.
  function renderReadingsV5330(block) {
    ensureV537(block);
    ensureV5328(block);
    const totals = chargeTotals(block);
    const selectedIds = readingSelectionFor(block);
    const selectedCount = selectedIds.size;
    const readingsTable = `<section class="reading-bulk-actions card no-print"><div><strong><span data-reading-selection-count>${selectedCount}</span> selecionada(s)</strong><small>Use a caixa da primeira coluna para escolher leituras. “Limpar” preserva apartamento, leitura anterior e lançamentos financeiros.</small></div><div class="button-row"><button class="secondary" data-select-all-readings type="button">Selecionar todas</button><button class="secondary" data-clear-selected-readings type="button" ${selectedCount ? '' : 'disabled'}>Limpar selecionadas</button><button class="danger" data-clear-all-readings type="button">Limpar todas as leituras</button><button class="danger" data-remove-selected-units type="button" ${selectedCount ? '' : 'disabled'}>Excluir cadastros selecionados</button></div></section><div class="table-wrap readings-main-table"><table><thead><tr><th class="reading-check"><input type="checkbox" data-select-all-readings aria-label="Selecionar todas as leituras"></th><th>Apto / Hidrômetro</th><th>Responsável</th><th>Anterior</th><th>Atual</th><th>Consumo</th><th>Status</th><th>Água</th><th>Observação operacional</th><th></th></tr></thead><tbody>${block.units.map(unit => { const issue = readingIssue(unit), checked = selectedIds.has(unit.id); return `<tr data-reading-row="${unit.id}" class="${issue ? `reading-issue ${issue.type}` : ''}"><td class="reading-check"><input data-reading-select type="checkbox" value="${unit.id}" ${checked ? 'checked' : ''} aria-label="Selecionar apartamento ${esc(unit.number)}"></td><td><input data-reading-field="number" value="${esc(unit.number)}" aria-label="Apartamento"></td><td><input data-reading-field="resident" value="${esc(unit.resident)}" placeholder="Nome"></td><td><input data-reading-field="previous" type="number" min="0" step="0.001" value="${unit.previous}"></td><td><input data-reading-field="current" type="number" min="0" step="1" value="${unit.current}"></td><td class="value">${fmtM3(unit.m3)} m³</td><td>${readingBadge(unit)}</td><td class="value">${money.format(unit.value)}</td><td><input data-reading-field="note" value="${esc(unit.note)}" placeholder="Observação da leitura"></td><td><div class="row-actions"><button class="danger" data-remove-unit title="Excluir cadastro do apartamento" type="button">×</button></div></td></tr>`; }).join('')}</tbody><tfoot><tr><td></td><td colspan="4">TOTAL DE ÁGUA</td><td>${fmtM3(totals.m3)} m³</td><td></td><td>${money.format(totals.water)}</td><td colspan="2"></td></tr></tfoot></table></div>`;
    const heading = `<div class="section-actions"><div><h2>${monthLabel(block.month)}</h2><span class="muted">Digite a leitura atual e ajuste multas, descontos, adicionais e observações no mesmo bloco de trabalho.</span></div><div class="button-row"><button class="secondary" data-import-readings type="button">⇧ Importar Excel/CSV</button><button class="secondary" data-export-readings type="button">⇩ Planilha Excel (.csv)</button><button class="secondary" data-export-readings-xlsx type="button">⇩ Modelo .xlsx</button><button class="secondary" data-add-unit type="button">+ Unidade</button><button class="primary" data-go="fechamento" type="button">Fechamento mensal</button></div></div>`;
    return `${monthManagementCardV5327(block)}${waterCoverageCard(block)}${heading}${adjustmentCenterV5328(block)}${readingsTable}`;
  }
  renderReadings = renderReadingsV5330;

  // BKP ampliado usado pelo reset seguro. Inclui o estado principal e as chaves locais
  // do KR2MELO para permitir diagnóstico/restauração de preferências e snapshots.
  function fullBrowserBackupPayloadV5330() {
    const local = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      try { local[key] = localStorage.getItem(key); } catch {}
    }
    return {
      kind: 'KR2MELO_FULL_BROWSER_BACKUP',
      schema: 1,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      location: { origin: location.origin, pathname: location.pathname },
      state: deepClone(state),
      localStorage: local
    };
  }

  function downloadFullBrowserBackupV5330() {
    const payload = fullBrowserBackupPayloadV5330();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BKP-TOTAL-KR2MELO-v${APP_VERSION}-${today()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    localStorage.setItem(`${KEY}.lastBackupAt.v5317`, new Date().toISOString());
    return payload;
  }

  async function clearKr2BrowserRuntimeV5330() {
    // Preserva os dados operacionais. O objetivo deste botão é eliminar código/cache
    // antigo que possa misturar versões da interface.
    try { sessionStorage.clear(); } catch {}
    try {
      const registrations = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
      await Promise.all(registrations.map(reg => reg.unregister().catch(() => false)));
    } catch {}
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith('kr2melo-')).map(name => caches.delete(name)));
      }
    } catch {}
    // Remove somente preferências efêmeras de interface/versão; estado, histórico,
    // snapshots e configuração de nuvem permanecem intactos.
    const disposable = [
      `${KEY}.adjustmentCenterCollapsed`,
      `${KEY}.appVersionSeen`,
      'kr2melo.mobileFilter.v5317'
    ];
    disposable.forEach(key => { try { localStorage.removeItem(key); } catch {} });
  }

  function requestBrowserResetV5330() {
    openModal(`<h2>BKP total + reset seguro do navegador</h2><p>Use esta opção quando a interface ficar sobreposta, carregar uma versão antiga ou apresentar comportamento estranho.</p><div class="info-box"><strong>1.</strong> Primeiro será baixado automaticamente um <b>BKP total</b> do KR²MELO.</div><div class="info-box"><strong>2.</strong> Depois serão apagados somente cache, Service Worker e preferências temporárias da interface.</div><div class="info-box"><strong>3.</strong> Condomínios, leituras, histórico mensal, boletos, recibos e configurações principais permanecem no sistema.</div><div class="warning-box"><strong>Importante:</strong> sites não têm permissão para apagar o histórico geral de navegação do Chrome/Edge. Este botão reseta o armazenamento técnico do KR²MELO que pode manter arquivos antigos.</div><div class="field full"><label>Digite <strong>RESETAR NAVEGADOR</strong> para confirmar</label><input name="confirmation" autocomplete="off" required></div>`, 'Gerar BKP e resetar', async data => {
      if (String(data.confirmation || '').trim().toUpperCase() !== 'RESETAR NAVEGADOR') return toast('Confirmação incorreta. Nada foi alterado.', true);
      downloadFullBrowserBackupV5330();
      toast('BKP total baixado. Limpando cache do KR²MELO...');
      await new Promise(resolve => setTimeout(resolve, 900));
      await clearKr2BrowserRuntimeV5330();
      const base = `${location.pathname}${location.search ? location.search.replace(/([?&])kr2reset=\d+(&|$)/, '$1').replace(/[?&]$/, '') : ''}`;
      const separator = base.includes('?') ? '&' : '?';
      location.replace(`${base}${separator}kr2reset=${Date.now()}#leituras`);
    });
  }

  const renderSettingsV5330Base = renderSettings;
  renderSettings = function(block) {
    const base = renderSettingsV5330Base(block);
    const card = `<section class="settings settings-v5330"><article class="card browser-reset-card"><div class="card-head"><div><h3>Reset seguro do navegador</h3><span class="muted">Corrige cache antigo e mistura de versões sem apagar os dados operacionais.</span></div><span class="pill warn">BKP obrigatório</span></div><p>O botão gera primeiro um <strong>BKP total</strong> e, em seguida, limpa o cache técnico do KR²MELO, Service Worker e preferências temporárias.</p><div class="button-row"><button class="danger" data-browser-reset-safe type="button">BKP total + Resetar navegador</button></div></article></section>`;
    return `${base}${card}`;
  };

  const handleClickV5330Base = handleClick;
  handleClick = function(event) {
    if (event.target.closest('[data-browser-reset-safe]')) { requestBrowserResetV5330(); return; }
    return handleClickV5330Base(event);
  };


  // ===================== KR2MELO v5.3.31 — Integridade Leituras do mês ↔ Leitura in loco =====================
  const READING_SIGNAL_KEY_V5331 = `${KEY}.readingSignal.v5331`;
  const READING_JOURNAL_KEY_V5331 = `${KEY}.mobileJournal.v5331`;
  const READING_FIELDS_V5331 = ['current','m3','value','note','mobileDone','mobileSavedAt','mobileReopened','readingType','operationalStatus','estimatedReason','changeLog'];

  function rawPersistedStateV5331() {
    try { const parsed = JSON.parse(localStorage.getItem(KEY)); return parsed && Array.isArray(parsed.blocks) ? parsed : null; }
    catch { return null; }
  }
  function timestampV5331(value) { const time = Date.parse(value || ''); return Number.isFinite(time) ? time : 0; }
  function recoverJournalIntoDesktopV5331() {
    let journal = [];
    try { const parsed = JSON.parse(localStorage.getItem(READING_JOURNAL_KEY_V5331)); journal = Array.isArray(parsed) ? parsed : []; } catch {}
    let recovered = 0;
    journal.forEach(entry => {
      const block = state.blocks.find(item => String(item.id) === String(entry.blockId) && String(item.month) === String(entry.month));
      const unit = block?.units?.find(item => String(item.id) === String(entry.unitId));
      if (!unit) return;
      if (timestampV5331(entry.at) <= timestampV5331(unit.mobileSavedAt)) return;
      READING_FIELDS_V5331.forEach(field => { if (field in (entry.fields || {})) unit[field] = deepClone(entry.fields[field]); });
      recalculateUnit(unit, block); recovered++;
    });
    return recovered;
  }
  function reconcileNewerInLocoReadingsV5331() {
    recoverJournalIntoDesktopV5331();
    const persisted = rawPersistedStateV5331();
    if (!persisted) return 0;
    let merged = 0;
    if (!state.mobileAdminPinHash && persisted.mobileAdminPinHash) state.mobileAdminPinHash = String(persisted.mobileAdminPinHash);
    state.blocks.forEach(block => {
      const remoteBlock = persisted.blocks.find(item => String(item.id) === String(block.id));
      if (!remoteBlock) return;
      block.units.forEach(unit => {
        const remoteUnit = (remoteBlock.units || []).find(item => String(item.id) === String(unit.id));
        if (!remoteUnit) return;
        if (timestampV5331(remoteUnit.mobileSavedAt) > timestampV5331(unit.mobileSavedAt)) {
          READING_FIELDS_V5331.forEach(field => { if (field in remoteUnit) unit[field] = deepClone(remoteUnit[field]); });
          recalculateUnit(unit, block);
          merged++;
        }
      });
    });
    return merged;
  }
  const saveV5331DesktopBase = save;
  save = function(message = '') {
    // Antes de qualquer gravação do painel, incorpora leituras mais novas feitas no mobile.
    reconcileNewerInLocoReadingsV5331();
    const ok = saveV5331DesktopBase(message);
    if (ok) {
      try { localStorage.setItem(READING_SIGNAL_KEY_V5331, JSON.stringify({ at: new Date().toISOString(), source: 'desktop' })); } catch {}
    }
    return ok;
  };

  function refreshReadingsFromStorageV5331(showMessage = true) {
    const persisted = rawPersistedStateV5331();
    if (!persisted) return false;
    const incoming = normalizeState(persisted);
    incoming.mobileAdminPinHash = String(persisted.mobileAdminPinHash || state.mobileAdminPinHash || '');
    const selectedId = state.selected;
    state = incoming;
    state.selected = state.blocks.some(block => block.id === selectedId) ? selectedId : (state.selected || state.blocks[0]?.id || null);
    recoverJournalIntoDesktopV5331();
    if (showMessage) toast('Leituras in loco sincronizadas com o painel.');
    return true;
  }

  function readingBridgeCardV5331(block) {
    const completed = block.units.filter(unit => unit.mobileDone).length;
    const withReading = block.units.filter(unit => unit.current !== '' && unit.current !== null && unit.current !== undefined).length;
    const last = block.units.map(unit => unit.mobileSavedAt).filter(Boolean).sort().pop();
    const lastText = last ? auditDate(last) : 'nenhuma leitura salva ainda';
    return `<section class="card reading-bridge-v5331 no-print"><div class="reading-bridge-main"><div><p class="eyebrow">PONTE DE DADOS</p><h3>Leituras do mês ↔ Leitura in loco</h3><p>Os dois módulos usam o mesmo banco local. Leituras mais novas são mescladas antes de qualquer gravação para evitar que uma tela sobrescreva a outra.</p></div><span class="pill ok">Proteção ativa</span></div><div class="reading-bridge-stats"><div><small>Leituras registradas</small><strong>${withReading}/${block.units.length}</strong></div><div><small>Conferidas no mobile</small><strong>${completed}</strong></div><div><small>Último salvamento in loco</small><strong>${esc(lastText)}</strong></div></div><div class="button-row"><a class="secondary" href="./mobile.html" style="text-decoration:none;display:inline-flex;align-items:center">📱 Abrir Leitura in loco</a><button class="secondary" type="button" data-refresh-inloco>↻ Atualizar dados in loco</button></div></section>`;
  }
  const renderReadingsV5331Base = renderReadings;
  renderReadings = function(block) { return `${readingBridgeCardV5331(block)}${renderReadingsV5331Base(block)}`; };

  const handleClickV5331Base = handleClick;
  handleClick = function(event) {
    if (event.target.closest('[data-refresh-inloco]')) {
      refreshReadingsFromStorageV5331(false);
      render();
      toast('Dados recarregados do armazenamento seguro.');
      return;
    }
    return handleClickV5331Base(event);
  };

  const handleChangeV5331Base = handleChange;
  handleChange = function(event) {
    const readingField = event.target?.closest?.('[data-reading-field]');
    if (readingField) {
      const row = readingField.closest('[data-reading-row]');
      const block = selected();
      const unit = findUnit(block, row?.dataset.readingRow);
      if (unit && ['current','note','previous'].includes(readingField.dataset.readingField)) unit.mobileSavedAt = new Date().toISOString();
    }
    return handleChangeV5331Base(event);
  };

  const executeMonthlyCloseV5331Base = executeMonthlyClose;
  executeMonthlyClose = function(block) {
    // Última barreira contra fechar o mês com uma leitura que acabou de ser salva em outra aba.
    refreshReadingsFromStorageV5331(false);
    return executeMonthlyCloseV5331Base(selected() || block);
  };

  window.addEventListener('storage', event => {
    if (event.key !== KEY || !event.newValue) return;
    const route = currentRoute();
    const active = document.activeElement;
    const editing = active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
    refreshReadingsFromStorageV5331(false);
    if (route === 'leituras' && !editing) render();
    toast(editing ? 'Nova leitura in loco recebida. Ela foi preservada e será exibida ao sair do campo atual.' : 'Nova leitura in loco recebida.');
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentRoute() === 'leituras') {
      refreshReadingsFromStorageV5331(false);
      render();
    }
  });

  setTimeout(bootstrapCloudV52, 250);

  maybeWeeklySnapshot();

  bindStatic();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();

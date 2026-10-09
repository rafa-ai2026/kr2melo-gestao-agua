(() => {
  'use strict';
  const groups = [
    ['Rotina do mês', ['dashboard', 'leituras', 'boletos', 'financeiro', 'fechamento']],
    ['Cadastros e regras', ['unidades', 'excecoes', 'regras', 'configuracoes']],
    ['Consulta e documentos', ['historico', 'relatorios', 'anual', 'recibos', 'proposta']],
    ['Dados e suporte', ['sincronizacao', 'ajuda']]
  ];
  const nav = document.querySelector('.sidebar nav');
  if (nav) {
    const links = Array.from(nav.querySelectorAll('a'));
    const used = new Set();
    groups.forEach(([title, routes]) => {
      const found = routes.map(route => links.find(a => a.dataset.route === route)).filter(Boolean);
      if (!found.length) return;
      const label = document.createElement('div');
      label.className = 'preview-group'; label.textContent = title;
      nav.append(label);
      found.forEach(a => {nav.append(a); used.add(a);});
    });
    links.filter(a => !used.has(a)).forEach(a => nav.append(a));
  }
  const main = document.querySelector('.main-area');
  const banner = document.createElement('div');
  banner.className = 'preview-banner';
  banner.textContent = 'BKP de sincronização disponível em Fechamento. Guarde o arquivo e confira a importação no celular.';
  main?.prepend(banner);
  const app = document.getElementById('app');
  const addQuick = () => {
    if (!app || app.querySelector('.preview-quick')) return;
    if (!['', '#dashboard', '#boletos', '#configuracoes'].includes(location.hash)) return;
    const quick = document.createElement('nav');
    quick.className = 'preview-quick'; quick.setAttribute('aria-label', 'Atalhos para conferir os valores');
    const title = document.createElement('span');title.className = 'preview-quick-title';title.textContent = 'Valores do prédio selecionado';quick.append(title);
    [['#configuracoes','Tarifa e configuração'],['#excecoes','Descontos, isenções e ajustes'],['#boletos','Conferir cobrança'],['#fechamento','Fechar mês']].forEach(([href,label]) => {const a=document.createElement('a');a.href=href;a.textContent=label;quick.append(a);});
    app.prepend(quick);
  };
  const refineForms = () => {
    const tariff = app?.querySelector('#tariffForm');
    if (tariff && !tariff.dataset.previewRefined) {
      tariff.dataset.previewRefined = 'true';
      const selector = tariff.querySelector('[name="calculationMode"]');
      if (selector) {
        const note = document.createElement('p');
        note.className = 'preview-model-note field full';
        note.setAttribute('aria-live', 'polite');
        selector.closest('.field')?.after(note);
        const sheetNames = ['sheetMinimum', 'sheetAllowance', 'sheetExcess'];
        const tierNames = ['minimum', 'minimumM3', 'tier1', 'tier1Limit', 'tier2', 'tier2Limit'];
        const refresh = () => {
          const isSheet = selector.value === 'spreadsheet_1938';
          const isOfficial = selector.value === 'sabesp_itapetininga_2026';
          note.textContent = 'Modelo selecionado: ' + (selector.selectedOptions[0]?.textContent || selector.value) + '. Confira a vigência antes de salvar.';
          [...sheetNames, ...tierNames].forEach(name => {
            const input = tariff.querySelector('[name="' + name + '"]');
            const field = input?.closest('.field');
            if (field) field.hidden = isOfficial || (sheetNames.includes(name) ? !isSheet : isSheet);
          });
          tariff.querySelectorAll('h4').forEach(h => {
            const field = h.closest('.field');
            if (field && /Modelo Planilha|Modelo por faixas|Modelo alternativo/i.test(h.textContent)) field.hidden = isOfficial || (/Planilha|alternativo/.test(h.textContent) ? !isSheet : isSheet);
          });
        };
        selector.addEventListener('change', refresh);
        refresh();
      }
    }
    const billing = app?.querySelector('#billingForm');
    if (billing && !billing.dataset.previewRefined) {
      billing.dataset.previewRefined = 'true';
      const names = ['previousReadDate', 'currentReadDate', 'nextReadDate', 'serviceLabel', 'notes'];
      const fields = names.map(name => billing.querySelector('[name="' + name + '"]')?.closest('.field')).filter(Boolean);
      const footer = billing.querySelector('.form-foot');
      if (fields.length && footer) {
        const details = document.createElement('details');
        details.className = 'preview-billing-details field full';
        const summary = document.createElement('summary');
        summary.textContent = 'Datas de leitura, descrição do serviço e observações';
        const content = document.createElement('div');content.className = 'form-grid';
        fields.forEach(field => content.append(field));
        details.append(summary, content);
        footer.before(details);
        billing.addEventListener('invalid', event => {
          if (details.contains(event.target)) details.open = true;
        }, true);
      }
    }
  };
  const update = () => { addQuick(); refineForms(); };
  if (app) new MutationObserver(update).observe(app, {childList:true});
  update();
})();

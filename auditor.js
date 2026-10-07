/* Conferência independente: não utiliza KR2Money, waterCost ou unitCharges.
   Referência fixa: ARSESP 1749/2025, tabela 5, residencial comum, OP, vigência 01/2026. */
(function(root){
  'use strict';
  const VERSION='1.0';
  const labels={water:'água/esgoto',grossCondo:'condomínio bruto',condoDiscount:'desconto de condomínio',condo:'condomínio líquido',service:'serviço de leitura',extraCharge:'adicionais e créditos',fine:'multas',total:'total',waterDiscount:'desconto de água',totalDiscount:'desconto do total',discountTotal:'soma dos descontos',zeroMinimumShare:'cota de rateio',zeroMinimumTransferred:'mínimo transferido',condoFee:'valor do condomínio',serviceFee:'valor do serviço',minimum:'mínimo mensal',minimumM3:'franquia mínima',tier1:'tarifa da segunda faixa',tier1Limit:'limite da segunda faixa',tier2:'tarifa da terceira faixa',sheetMinimum:'mínimo do modelo de planilha',sheetAllowance:'franquia do modelo de planilha',sheetExcess:'excedente do modelo de planilha'};
  function rational(value){
    const text=String(value??0).trim();
    const m=/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
    if(!m || !Number.isFinite(Number(text)))throw Error('Valor numérico inválido');
    const decimals=(m[3]||'').length-Number(m[4]||0);
    if(Math.abs(decimals)>20)throw Error('Precisão numérica fora do limite');
    let numerator=BigInt(m[2]+(m[3]||''))*(m[1]==='-'?-1n:1n),denominator=1n;
    if(decimals>=0)denominator=10n**BigInt(decimals);else numerator*=10n**BigInt(-decimals);
    return {n:numerator,d:denominator};
  }
  const add=(a,b)=>({n:a.n*b.d+b.n*a.d,d:a.d*b.d});
  const multiply=(a,b)=>({n:a.n*b.n,d:a.d*b.d});
  function rounded(a){const sign=a.n<0n?-1n:1n,n=a.n*sign;return Number(sign*((n+a.d/2n)/a.d));}
  const cents=value=>rounded(multiply(rational(value),rational(100)));
  const numeric=(value,fallback=0)=>value==null||value===''?fallback:Number(value);
  const nonnegative=(value,fallback)=>Math.max(0,numeric(value,fallback));
  function moneyInput(value){
    if(typeof value==='number')return value;
    let text=String(value??'').replace(/[^\d,.-]/g,'');
    if(text.includes(','))text=text.replace(/\./g,'').replace(',','.');
    else text=text.replace(/\.(?=\d{3}(\D|$))/g,'');
    return Number(text)||0;
  }
  function printedCents(text){
    const cleaned=String(text??'').replace(/−/g,'-').replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.');
    if(!/^-?\d+(\.\d{1,2})?$/.test(cleaned))throw Error('Valor impresso ausente ou inválido');
    return cents(cleaned);
  }
  function tariffFor(block){
    const periods=(block.tariffPeriods||[]).filter(p=>/^\d{4}-\d{2}$/.test(p.effectiveMonth||'') && p.effectiveMonth<=block.month).slice().sort((a,b)=>a.effectiveMonth.localeCompare(b.effectiveMonth));
    return periods.at(-1)?.tariff||block.tariff||{};
  }
  function water(use,tariff){
    const t=tariff||{},mode=t.calculationMode||t.mode||'tiered',steps=[];
    function component(name,minimum,bands){
      let amount=rational(minimum);steps.push({label:name+' — mínimo',quantity:null,rate:minimum,cents:cents(minimum)});
      for(const band of bands){const quantity=Math.max(0,Math.min(use,band.to)-band.from);if(quantity){const part=multiply(rational(quantity),rational(band.rate));amount=add(amount,part);steps.push({label:name+' — '+band.label,quantity,rate:band.rate,cents:rounded(multiply(part,rational(100)))});}}
      return rounded(multiply(amount,rational(100)));
    }
    if(mode==='sabesp_itapetininga_2026'){
      const water=component('Água',40.42,[{from:10,to:20,rate:5.69,label:'11–20 m³'},{from:20,to:50,rate:8.74,label:'21–50 m³'},{from:50,to:Infinity,rate:10.46,label:'acima de 50 m³'}]);
      const sewer=component('Esgoto',32.42,[{from:10,to:20,rate:4.49,label:'11–20 m³'},{from:20,to:50,rate:6.99,label:'21–50 m³'},{from:50,to:Infinity,rate:8.33,label:'acima de 50 m³'}]);
      return {cents:water+sewer,steps,water,sewer,mode};
    }
    if(mode==='spreadsheet_1938'){const min=nonnegative(t.sheetMinimum,80.84),allowance=nonnegative(t.sheetAllowance,10),rate=nonnegative(t.sheetExcess,8.37);return {cents:component('Água',min,[{from:allowance,to:Infinity,rate,label:'excedente único'}]),steps,mode};}
    if(mode!=='tiered')throw Error('Modelo tarifário não reconhecido');
    const minimum=nonnegative(t.minimum,80.84),start=nonnegative(t.minimumM3,10),limit=Math.max(start,nonnegative(t.tier1Limit,20));
    return {cents:component('Água',minimum,[{from:start,to:limit,rate:nonnegative(t.tier1,8.37),label:`${start}–${limit} m³`},{from:limit,to:Infinity,rate:nonnegative(t.tier2,10.87),label:`acima de ${limit} m³`}]),steps,mode};
  }
  function expected(unit,block){
    const t=tariffFor(block),b=block.billing||{},month=block.month;
    const current=unit.current!=='' && unit.current!=null?Number(unit.current):null,previous=Number(unit.previous);
    const hasReading=current!==null && Number.isFinite(current) && Number.isFinite(previous) && current>=previous;
    const m3=hasReading?current-previous:null,base=hasReading?water(m3,t):{cents:0,steps:[],mode:t.calculationMode||'tiered'};
    let waterCents=base.cents,share=0,transferred=0;
    if(b.redistributeZeroMinimum && hasReading){
      const consumption=u=>u.current!=='' && u.current!=null && Number.isFinite(Number(u.current))&&Number(u.current)>=Number(u.previous)?Number(u.current)-Number(u.previous):null;
      const zeros=(block.units||[]).filter(u=>consumption(u)===0),recipients=(block.units||[]).filter(u=>consumption(u)>0).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
      if(zeros.length&&recipients.length){const pool=zeros.length*water(0,t).cents;if(m3===0){transferred=waterCents;waterCents=0;}else{const index=recipients.findIndex(u=>u.id===unit.id),q=Math.floor(pool/recipients.length),r=pool%recipients.length;if(index>=0)share=q+(index<r?1:0);waterCents+=share;}}
    }
    const grossCondo=cents(Math.max(0,numeric(b.condoFee))),service=b.chargeService!==false&&String(b.serviceLabel||'').trim()?cents(Math.max(0,numeric(b.serviceFee))):0;
    const extraItems=[];if(moneyInput(unit.extraCharge)!==0)extraItems.push({label:unit.extraChargeLabel||'VALOR ADICIONAL',value:moneyInput(unit.extraCharge)});
    for(const item of unit.extraCharges||[])if(moneyInput(item.value)!==0)extraItems.push({label:item.label||'AJUSTE AVULSO',value:moneyInput(item.value)});
    const extra=extraItems.reduce((s,item)=>s+cents(item.value),0),fine=cents(Math.max(0,numeric(unit.billingFine)));
    const rule=unit.condoRule||{},target=['water','total'].includes(unit.discountTarget)?unit.discountTarget:'condo';
    const active=(!rule.startsAt||String(rule.startsAt).slice(0,7)<=month)&&(!rule.endsAt||String(rule.endsAt).slice(0,7)>=month);
    function discount(base){if(!active)return 0;if(rule.mode==='isento')return base;if(rule.mode==='desconto_fixo')return Math.min(base,cents(Math.max(0,numeric(rule.value))));if(rule.mode==='desconto_percentual')return Math.min(base,rounded(multiply(rational(base/100),rational(Math.max(0,Math.min(100,numeric(rule.value)))))));return 0;}
    const waterGross=waterCents,condoDiscount=target==='condo'?discount(grossCondo):0,waterDiscount=target==='water'?discount(waterCents):0;
    const condo=grossCondo-condoDiscount;waterCents-=waterDiscount;
    const grossTotal=waterCents+condo+service+extra+fine,totalDiscount=target==='total'?discount(Math.max(0,grossTotal)):0;
    const fields={water:waterCents,grossCondo,condoDiscount,condo,service,extraCharge:extra,fine,total:grossTotal-totalDiscount,waterDiscount,totalDiscount,discountTotal:condoDiscount+waterDiscount+totalDiscount,zeroMinimumShare:share,zeroMinimumTransferred:transferred};
    return {m3,current,previous,fields,steps:base.steps,mode:base.mode,waterSubtotal:base.water,sewerSubtotal:base.sewer,extraItems,target,rule,waterGross};
  }
  function inspect(block,actualFor,printedFor){
    const units=[],globalErrors=[],ids=new Set(),numbers=new Set();
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(block.month||''))globalErrors.push('Competência inválida.');
    if(!(block.units||[]).length)globalErrors.push('Não há unidades para conferir.');
    const tariff=tariffFor(block),official=tariff.calculationMode==='sabesp_itapetininga_2026';
    if(official&&block.month<'2026-01')globalErrors.push('Tabela SABESP 2026 aplicada antes da vigência.');
    for(const unit of block.units||[]){
      const errors=[],warnings=[],checks=[];let result=null,actual=null,printed=null;
      if(ids.has(String(unit.id)))errors.push('Identificador de unidade duplicado.');ids.add(String(unit.id));
      if(numbers.has(String(unit.number).trim()))errors.push('Número de apartamento duplicado.');numbers.add(String(unit.number).trim());
      if(!unit.number)errors.push('Número da unidade não informado.');
      if(unit.current===''||unit.current==null)errors.push('Leitura atual não registrada.');
      else if(!Number.isFinite(Number(unit.current))||Number(unit.current)<0)errors.push('Leitura atual inválida.');
      if(!Number.isFinite(Number(unit.previous))||Number(unit.previous)<0)errors.push('Leitura anterior inválida.');
      if(unit.current!==''&&unit.current!=null&&Number(unit.current)<Number(unit.previous))errors.push('Leitura atual menor que a anterior.');
      if(unit.mobileSyncStatus==='conflict')errors.push('Há conflito de leitura não resolvido.');
      if(['local','pending','syncing'].includes(unit.mobileSyncStatus))warnings.push('Leitura com transferência/sincronização ainda pendente.');
      if(unit.readingType==='estimated')warnings.push('Leitura estimada: confira o motivo e a autorização.');
      if(Number(unit.current)-Number(unit.previous)>30)warnings.push('Consumo elevado: confira a leitura e eventual vazamento.');
      if(!official)warnings.push('Tarifa personalizada: a conferência valida o cadastro, sem atestar correspondência à tabela SABESP.');
      const b=block.billing||{};
      for(const key of ['condoFee','serviceFee'])if(b[key]!=null && (!Number.isFinite(Number(b[key]))||Number(b[key])<0))errors.push('Valor inválido: '+(labels[key]||key)+'.');
      if(numeric(b.serviceFee)>0&&b.chargeService!==false&&!String(b.serviceLabel||'').trim())warnings.push('Serviço com valor cadastrado, mas sem descrição: não está sendo cobrado.');
      if(b.redistributeZeroMinimum)warnings.push('Rateio de mínimos ativado: regra interna altera a cobrança mínima individual.');
      if(numeric(unit.billingFine)>0&&!String(unit.billingFineNote||'').trim())warnings.push('Multa sem justificativa detalhada.');
      const r=unit.condoRule||{};
      if(r.value!=null&&(!Number.isFinite(Number(r.value))||Number(r.value)<0))errors.push('Valor do desconto inválido.');
      if(unit.billingFine!=null&&(!Number.isFinite(Number(unit.billingFine))||Number(unit.billingFine)<0))errors.push('Multa inválida.');
      if(r.mode && !['normal','isento','desconto_fixo','desconto_percentual'].includes(r.mode))errors.push('Regra de desconto desconhecida.');
      for(const date of [r.startsAt,r.endsAt])if(date&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(date))errors.push('Competência de desconto inválida.');
      if(r.startsAt&&r.endsAt&&r.startsAt>r.endsAt)errors.push('Vigência do desconto invertida.');
      if(r.mode==='desconto_percentual'&&numeric(r.value)>100)warnings.push('Desconto percentual acima de 100%: limitado a 100%.');
      if(r.mode && r.mode!=='normal'&&!String(r.reason||'').trim())warnings.push('Desconto/isenção sem motivo registrado.');
      for(const key of ['minimum','minimumM3','tier1','tier1Limit','tier2','sheetMinimum','sheetAllowance','sheetExcess'])if(tariff[key]!=null && (!Number.isFinite(Number(tariff[key]))||Number(tariff[key])<0))errors.push('Tarifa inválida: '+(labels[key]||key)+'.');
      if((tariff.calculationMode||'tiered')==='tiered'&&tariff.tier1Limit!=null&&numeric(tariff.tier1Limit)<nonnegative(tariff.minimumM3,10))errors.push('Limite da segunda faixa menor que a franquia mínima.');
      try{
        result=expected(unit,block);actual=actualFor(unit);printed=printedFor(unit);
        for(const [key,expectedCents] of Object.entries(result.fields)){const actualCents=cents(actual[key]??0);checks.push({key,expected:expectedCents,actual:actualCents,ok:expectedCents===actualCents});if(expectedCents!==actualCents)errors.push(`Divergência em ${labels[key]||key}: cálculo independente e plataforma diferem.`);}
        const printedTotal=printedCents(printed.totalText),printedSum=printed.rows.reduce((sum,row)=>sum+printedCents(row.text),0);
        if(printedTotal!==result.fields.total)errors.push('Total impresso diferente do cálculo independente.');
        if(printedSum!==printedTotal)errors.push('A soma dos itens impressos não fecha com o total.');
        if(result.m3!==null && Number(printed.m3)!==result.m3)errors.push('Consumo impresso diferente das leituras.');
        if(Number(printed.previous)!==result.previous || (result.current!==null&&Number(printed.current)!==result.current))errors.push('Leituras impressas diferentes do cadastro.');
        if(String(printed.number)!==String(unit.number))errors.push('Identificação impressa diferente da unidade.');
        if(result.fields.total<0)errors.push('Crédito excedente produz valor a pagar negativo.');
        const actualRows=printed.rows.map(row=>printedCents(row.text)),expectedRows=[result.waterGross-result.fields.zeroMinimumShare];
        if(result.fields.zeroMinimumShare)expectedRows.push(result.fields.zeroMinimumShare);
        if(result.fields.waterDiscount)expectedRows.push(-result.fields.waterDiscount);
        expectedRows.push(result.fields.grossCondo);
        if(result.fields.condoDiscount)expectedRows.push(-result.fields.condoDiscount);
        if(result.fields.service)expectedRows.push(result.fields.service);
        for(const item of result.extraItems)expectedRows.push(cents(item.value));
        if(result.fields.fine)expectedRows.push(result.fields.fine);
        if(result.fields.totalDiscount)expectedRows.push(-result.fields.totalDiscount);
        if(JSON.stringify(actualRows)!==JSON.stringify(expectedRows))errors.push('Composição dos itens impressos diferente dos lançamentos.');
        checks.push({key:'somaImpressa',expected:result.fields.total,actual:printedSum,ok:printedSum===result.fields.total});
      }catch(error){errors.push('Não foi possível conferir: '+error.message);}
      units.push({id:unit.id,number:unit.number,resident:unit.resident||'',errors,warnings,checks,result,printed});
    }
    const errorCount=globalErrors.length+units.reduce((s,u)=>s+u.errors.length,0),warningCount=units.reduce((s,u)=>s+u.warnings.length,0);
    const totalCents=units.reduce((s,u)=>s+(u.result?.fields.total||0),0);
    return {auditVersion:VERSION,month:block.month,blockName:block.name,official,globalErrors,units,errorCount,warningCount,totalCents,ok:errorCount===0,scope:official?'SABESP Itapetininga 2026: residencial comum, uma economia por apartamento, água + esgoto; demais itens conforme cadastro.':'Cálculos conforme tarifa e regras personalizadas cadastradas.'};
  }
  root.KR2Audit=Object.freeze({VERSION,inspect,expected,water,cents,printedCents});
})(typeof window==='object'?window:globalThis);

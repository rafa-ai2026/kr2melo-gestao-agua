/* Valores monetários em centavos; referência SABESP ARSESP 1749/2025, tabela 5. */
(function(root) {
  'use strict';
  function cents(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return 0;
    const sign = v < 0 ? -1 : 1;
    const s = Math.abs(v).toFixed(10);
    const parts = s.split('.');
    return sign * (Number(parts[0]) * 100 + Number(parts[1].slice(0, 2)) + (Number(parts[1][2]) >= 5 ? 1 : 0));
  }
  const amount = value => cents(value) / 100;
  const num = (v, fallback) => v === '' || v == null ? fallback : Math.max(0, Number(v) || 0);
  function water(use, raw) {
    use = Math.max(0, Number(use) || 0);
    const t = raw || {};
    const mode = t.calculationMode || t.mode;
    if (mode === 'sabesp_itapetininga_2026') {
      // Água e esgoto arredondados separadamente, antes de somar.
      const component = (minimum, r1, r2, r3) => amount(minimum + Math.min(10, Math.max(0,use-10))*r1 + Math.min(30,Math.max(0,use-20))*r2 + Math.max(0,use-50)*r3);
      return (cents(component(40.42,5.69,8.74,10.46)) + cents(component(32.42,4.49,6.99,8.33))) / 100;
    }
    if (mode === 'spreadsheet_1938') return amount(num(t.sheetMinimum,80.84) + Math.max(0,use-num(t.sheetAllowance,10))*num(t.sheetExcess,8.37));
    const min = num(t.minimumM3,10), limit = Math.max(min,num(t.tier1Limit,20));
    return amount(num(t.minimum,80.84) + Math.min(Math.max(0,use-min),limit-min)*num(t.tier1,8.37) + Math.max(0,use-limit)*num(t.tier2,10.87));
  }
  function split(total, count) {
    if (!count) return [];
    const c = cents(total), base = Math.floor(c/count), remainder = c-base*count;
    return Array.from({length:count},(_,i)=>(base+(i<remainder?1:0))/100);
  }
  root.KR2Money = Object.freeze({cents,amount,water,split});
})(typeof window === 'object' ? window : globalThis);

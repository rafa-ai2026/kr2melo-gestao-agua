import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../sync.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mobile = readFileSync(new URL('../mobile.html', import.meta.url), 'utf8');
const manifest = readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

assert.match(app, /const APP_VERSION = '5\.3\.4'/, 'APP_VERSION deve estar em v5.3.4');
for (const file of [html, mobile, manifest, sw]) {
  assert.match(file, /5\.3\.4/, 'todos os arquivos publicados devem carregar a versao nova');
}

assert.match(app, /billingNote_/, 'boletos devem salvar observacao individual por unidade');
assert.match(app, /billingNoteLines/, 'boletos devem combinar observacoes gerais e individuais');
assert.match(app, /extraChargeLabel/, 'deve existir descricao para valor adicional individual');
assert.match(app, /extraCharge/, 'deve existir valor adicional individual');
assert.match(app, /total: water \+ condo \+ service \+ extraCharge \+ fine/, 'valor adicional deve somar no total');
assert.match(app, /\$\{serviceLine\}\$\{extraLine\}/, 'boleto deve mostrar valor adicional separado de multas e outros');
assert.match(app, /amountToWordsV53/, 'recibo deve gerar valor por extenso automaticamente');
assert.match(app, /receipt-preview-branded/, 'recibo deve usar layout com marca');
assert.match(sync, /async function remoteInfo/, 'sincronizacao deve consultar data remota');
assert.match(app, /A copia na nuvem|A cópia na nuvem/, 'app deve avisar conflito antes de sobrescrever nuvem');
assert.match(css, /grid-template-columns:repeat\(2,50%\)!important/, 'boletos devem usar grade 2x2 igual');
assert.match(css, /bill-notes p\{[\s\S]*font-size:6\.9px/, 'observacoes dos boletos devem ter fonte maior em tela');
assert.match(app, /cover-simple-kv/, 'capa frontal deve usar informacoes simplificadas');
assert.match(app, /cover-back-inverted/, 'contracapa deve ser invertida');
assert.doesNotMatch(app, /coverSheet\(block, units, index\)\$\{summarySheet\(block, units, index\)\}/, 'ficha tecnica do bloco nao deve entrar na impressao dos boletos');
assert.match(css, /cover-front\{[\s\S]*align-content:start!important/, 'capa frontal deve ficar compacta no topo para nao cortar a proxima leitura');
assert.match(css, /\.bill-copy-manager\{padding-left:8\.5mm!important\}/, 'via do sindico deve ter area maior para grampear');
assert.match(css, /\.bill-copy-resident:before,[\s\S]*\.bill-copy-resident:after[\s\S]*content:none!important/, 'via do morador nao deve receber marca de grampo');
assert.match(mobile, /Leitura in loco/, 'mobile deve ser dedicado a leitura in loco');
assert.doesNotMatch(mobile, /syncMobile|photoBtn|gpsBtn|exportMobile/, 'mobile simplificado nao deve mostrar sincronizacao, fotos, GPS ou backup');

console.log('Smoke tests KR2MELO v5.3.4: OK');

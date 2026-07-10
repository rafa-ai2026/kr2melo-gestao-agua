# KR²MELO — Gestão de Água

> **Manual completo de operação, impressão, histórico, sincronização e segurança**  
> Versão do sistema: **v5.3.8**

O KR²MELO é um sistema para administrar leituras individuais de hidrômetros, rateio de água, cobranças, boletos, recibos, histórico mensal e controle financeiro de condomínios ou blocos residenciais.

Ele pode ser usado no computador, no celular e, quando configurado com Supabase, pode sincronizar os dados entre aparelhos usando a mesma conta.

---

## Sumário

1. [O que o sistema faz](#o-que-o-sistema-faz)
2. [Conceitos importantes](#conceitos-importantes)
3. [Estrutura dos dados](#estrutura-dos-dados)
4. [Primeiro acesso e cadastro inicial](#primeiro-acesso-e-cadastro-inicial)
5. [Fluxo mensal recomendado](#fluxo-mensal-recomendado)
6. [Visão geral](#viso-geral)
7. [Leituras do mês](#leituras-do-ms)
8. [Rateio da conta global de água](#rateio-da-conta-global-de-gua)
9. [Lançamentos, isenções, descontos e outros ajustes](#lanamentos-isenes-descontos-e-outros-ajustes)
10. [Unidades, moradores e hidrômetros](#unidades-moradores-e-hidrmetros)
11. [Exceções do mês](#excees-do-ms)
12. [Fechamento mensal](#fechamento-mensal)
13. [Histórico mensal e auditoria](#histrico-mensal-e-auditoria)
14. [Relatórios por período](#relatrios-por-perodo)
15. [Dashboard anual](#dashboard-anual)
16. [Financeiro](#financeiro)
17. [Recibos](#recibos)
18. [Boletos](#boletos)
19. [Configurações, backup e reset total](#configuraes-backup-e-reset-total)
20. [Sincronização com Supabase](#sincronizao-com-supabase)
21. [Modo leiturista no celular](#modo-leiturista-no-celular)
22. [Impressão correta](#impresso-correta)
23. [Publicação no GitHub Pages](#publicao-no-github-pages)
24. [Segurança e privacidade](#segurana-e-privacidade)
25. [Solução de problemas](#soluo-de-problemas)
26. [Estrutura de arquivos](#estrutura-de-arquivos)

---

## O que o sistema faz

O KR²MELO foi criado para centralizar todo o ciclo mensal de cobrança de água por apartamento:

- cadastrar condomínios, blocos, apartamentos e responsáveis;
- registrar leitura anterior e leitura atual de cada hidrômetro;
- calcular consumo em metros cúbicos (`m³`);
- calcular a cobrança individual de água por faixas de consumo;
- adicionar condomínio, serviço de leitura, multas e outros valores;
- aplicar isenções e descontos somente sobre o condomínio;
- conferir se a soma do rateio de água cobre a conta global do bloco;
- emitir boletos em layout para impressão;
- registrar pagamentos, acordos e pendências;
- emitir recibos de serviço e recibos de pagamento;
- fechar o mês e preservar um retrato imutável da competência;
- consultar, corrigir e importar histórico de meses anteriores;
- acompanhar consumo e arrecadação no dashboard anual;
- sincronizar leituras e cadastros entre computador e celular, quando configurado com Supabase;
- manter backup local e permitir reset seguro do sistema.

---

## Conceitos importantes

### Condomínio / bloco

No sistema, cada cadastro principal representa um **condomínio ou bloco**. Um cadastro possui seu próprio conjunto de apartamentos, leituras, tarifas, boletos, histórico e dados financeiros.

Exemplo:

```text
Condomínio Vitória — Bloco A
Condomínio Vitória — Bloco B
Condomínio Jardim Azul — Torre 1
```

Use o seletor no topo da tela para alternar entre os blocos cadastrados.

### Apartamento / unidade

É cada imóvel que possui hidrômetro e cobrança individual. A unidade pode conter:

- identificação do apartamento;
- responsável;
- telefone/WhatsApp;
- leitura anterior e atual;
- cadastro técnico do hidrômetro;
- situação operacional;
- regras de desconto ou isenção;
- lançamento de multas e outros valores;
- dados de pagamento;
- histórico de consumo.

### Competência

É o mês que está sendo administrado, por exemplo:

```text
2026-07 = julho de 2026
```

Ao fechar uma competência, o sistema arquiva o mês e prepara automaticamente a competência seguinte.

### Leitura anterior, leitura atual e consumo

A fórmula principal é:

```text
Consumo = Leitura Atual − Leitura Anterior
```

Exemplo:

```text
Leitura anterior: 1.168
Leitura atual:    1.183
Consumo:             15 m³
```

### Histórico fechado

É o retrato preservado de um mês já encerrado. Ele contém as leituras, tarifas, regras, descontos, valores cobrados e dados de pagamento existentes naquele momento.

O histórico evita que uma alteração futura em tarifa ou desconto modifique um relatório antigo.

---

## Estrutura dos dados

O sistema possui três camadas principais de armazenamento.

| Local | O que guarda | Observação |
|---|---|---|
| Navegador do aparelho | Dados atuais do sistema | Funciona mesmo sem internet enquanto o navegador mantém os dados. |
| Backup `.json` | Cópia manual dos dados | Deve ser guardado em local seguro. |
| Supabase, quando configurado | Cópia sincronizada do estado do sistema | Permite levar cadastros e leituras para outro aparelho. |

### Atenção sobre fotos

Fotos de hidrômetros feitas no **Modo leiturista** são armazenadas no aparelho onde foram capturadas. Elas não são transferidas automaticamente entre computador e celular pela sincronização atual.

Por isso, guarde as fotos no próprio aparelho de campo e faça backup periódico das leituras.

---

# Primeiro acesso e cadastro inicial

## 1. Conferir arquivos do sistema

Para que o sistema funcione corretamente, os arquivos devem permanecer juntos. Em especial, a pasta `assets/` precisa existir e conter os arquivos de imagem:

```text
assets/logo.png
assets/assinatura.png
```

Sem esses arquivos, a logo e a assinatura não aparecerão em telas, relatórios, boletos ou recibos.

## 2. Criar o primeiro condomínio ou bloco

No canto superior direito, clique em:

```text
+ Novo condomínio
```

Preencha os dados básicos solicitados, como nome do bloco, endereço e responsável/síndico quando aplicável.

Em seguida, cadastre os apartamentos manualmente ou importe uma planilha inicial.

## 3. Importar a planilha inicial do bloco

O modelo inicial possui estas colunas:

```text
Apt | Leitura Anterior | Leitura Atual | Responsável
```

Exemplo:

| Apt | Leitura Anterior | Leitura Atual | Responsável |
|---|---:|---:|---|
| 01A | 1168 |  | Marcos Vinicios |
| 02A | 1603 |  | Paulo Calixto |

### Regras da planilha inicial

- `Apt` é obrigatório.
- `Leitura Anterior` deve representar a última leitura conhecida.
- `Leitura Atual` pode ficar vazia no primeiro cadastro.
- `Responsável` deve conter o nome do morador, proprietário ou responsável pelo pagamento.
- Não altere os nomes das quatro colunas.
- O formato mais seguro para Excel no Brasil é **CSV UTF-8 separado por ponto e vírgula**.

### CSV ou XLSX?

O sistema aceita os dois formatos, mas o CSV costuma ser mais confiável para importação no Excel brasileiro:

```text
CSV recomendado: .csv
Formato alternativo: .xlsx
```

---

# Fluxo mensal recomendado

Use esta sequência todos os meses para reduzir erros:

1. **Baixar da nuvem**, se usar sincronização.
2. Conferir o bloco selecionado e a competência atual.
3. Registrar ou importar as leituras atuais.
4. Conferir alertas de consumo e leituras pendentes.
5. Ajustar regras, descontos, isenções, serviço e outros lançamentos.
6. Informar a conta global de água e conferir a cobertura do rateio.
7. Configurar vencimento, datas de leitura e valores complementares dos boletos.
8. Revisar o relatório mensal.
9. Imprimir boletos e, quando necessário, recibos.
10. Registrar pagamentos no Financeiro.
11. Executar o fechamento somente depois da conferência final.
12. Enviar a cópia atualizada para a nuvem, se a sincronização estiver ativada.

> **Regra prática:** não feche o mês antes de terminar a distribuição ou conferência dos boletos. O fechamento prepara a competência seguinte e limpa as leituras atuais para o próximo ciclo.

---

# Visão geral

A tela **Visão geral** é o painel de acompanhamento rápido do bloco selecionado.

Ela mostra informações como:

- consumo total do mês;
- quantidade de unidades cadastradas;
- cobrança total do período;
- cobertura da conta global de água;
- descontos aplicados;
- quantidade de leituras concluídas;
- alertas que exigem atenção;
- resumo recente de histórico.

Use o painel como ponto de partida para identificar pendências antes de emitir ou fechar o mês.

---

# Leituras do mês

A tela **Leituras** é a área principal de operação mensal.

## Campos disponíveis

| Campo | Uso |
|---|---|
| Apto / Hidrômetro | Identificação da unidade. |
| Responsável | Nome do responsável pelo imóvel ou pagamento. |
| Anterior | Leitura usada como base do consumo. |
| Atual | Leitura registrada no mês. |
| Consumo | Calculado automaticamente em `m³`. |
| Status | Indica leitura normal, pendente, estimada ou alerta. |
| Água | Valor de água calculado pelo sistema. |
| Observação | Anotação livre da unidade. |

## Inserir leituras manualmente

1. Abra **Leituras**.
2. Localize o apartamento.
3. Digite a leitura no campo **Atual**.
4. O consumo e a cobrança de água serão recalculados automaticamente.

## Importar leituras

Use o botão:

```text
⇧ Importar Excel/CSV
```

A importação serve para atualizar várias unidades de uma vez. O mais comum é importar uma planilha com:

```text
Apt | Leitura Atual
```

O sistema localiza a unidade pelo número do apartamento e aplica a leitura atual correspondente.

## Exportar modelo para a próxima leitura

Use:

```text
⇩ Planilha Excel (.csv)
```

ou:

```text
⇩ Modelo .xlsx
```

O arquivo pode ser levado para campo, preenchido e importado depois.

## Seleção em massa

A primeira coluna possui caixas de seleção. Elas permitem operar várias unidades de uma vez.

### Limpar selecionadas

Remove somente os dados do ciclo atual das unidades selecionadas, como:

- leitura atual;
- consumo;
- valor de água;
- foto/GPS relacionados à leitura atual;
- marcação de leitura concluída;
- leitura estimada do mês.

Mantém:

- apartamento;
- responsável;
- leitura anterior;
- histórico;
- regras de desconto;
- cadastro técnico;
- dados antigos de cobrança.

### Limpar todas as leituras

Executa a mesma limpeza em todas as unidades do bloco atual.

### Excluir cadastros selecionados

Remove os apartamentos selecionados **somente da competência atual**. O histórico já fechado não é apagado.

> Use exclusão de cadastro apenas quando a unidade realmente não deve mais fazer parte do bloco atual.

## Alertas de leitura

O sistema chama atenção para situações como:

- leitura atual menor que a anterior;
- leitura pendente;
- consumo elevado;
- consumo muito acima do padrão;
- responsável não cadastrado;
- hidrômetro marcado como parado ou sem acesso.

Esses alertas não impedem a operação, mas devem ser conferidos antes da emissão e do fechamento.

---

# Rateio da conta global de água

No topo da tela de Leituras existe a conferência do **Rateio da conta global de água**.

Informe o valor da conta geral do bloco no campo:

```text
Valor da conta global de água
```

O sistema compara:

```text
Conta global de água
versus
Soma dos valores de água cobrados dos apartamentos
```

## O que entra nessa conferência

Entra somente:

```text
Água individual dos apartamentos
```

Não entram:

- condomínio;
- desconto de condomínio;
- serviço de leitura;
- multas;
- outros lançamentos;
- recibos;
- pagamentos recebidos.

## Como interpretar

| Resultado | Significado |
|---|---|
| Cobriu a conta | A soma da água dos apartamentos é igual ou maior que a conta global. |
| Falta | A soma da água dos apartamentos está abaixo da conta global. |
| Sem conta informada | Ainda não foi informado o valor da fatura geral. |

Use essa conferência antes de emitir os boletos. Ela ajuda a verificar se a tarifa e as leituras estão coerentes.

---

# Lançamentos, isenções, descontos e outros ajustes

O bloco **Lançamentos e ajustes por apartamento**, dentro da tela **Leituras**, serve para aplicar regras por apartamento e reunir multas, descontos, adicionais, abatimentos e observações em um único lugar.

## Função do morador

A unidade pode ser identificada como:

- sem função;
- síndico;
- tesoureiro;
- indicado pelo síndico.

A função é informativa e ajuda na conferência administrativa.

## Tipos de cobrança de condomínio

| Regra | Efeito |
|---|---|
| Cobrança normal | Cobra o condomínio integral. |
| Isento de condomínio | Zera a cobrança de condomínio da unidade. |
| Desconto fixo | Reduz um valor em reais. |
| Desconto percentual | Reduz um percentual do condomínio. |

### Importante

Descontos e isenções afetam **somente o condomínio**. O valor de água continua sendo calculado normalmente.

## Motivo e vigência

Para cada regra, preencha sempre que possível:

- motivo ou benefício;
- início;
- fim;
- pessoa que autorizou.

Exemplo:

```text
Regra: Desconto fixo
Valor: R$ 70,00
Motivo: Internet das câmeras do condomínio
Autorizado por: Síndico / Ata de reunião
```

## Multas e outros valores

Também é possível lançar valores extras por apartamento, com descrição própria.

Exemplos:

```text
Multa por atraso
Religação de água
Dano em hidrômetro
Taxa extraordinária
```

Esses valores entram no total do apartamento, mas não entram na conferência da conta global de água.

---

# Unidades, moradores e hidrômetros

A tela **Unidades e hidrômetros** guarda o cadastro técnico de cada ponto de leitura.

## Informações disponíveis

- responsável;
- WhatsApp;
- situação do imóvel ou hidrômetro;
- serial do hidrômetro;
- localização do equipamento;
- data de instalação;
- data de troca;
- leitura inicial;
- tipo de leitura: real ou estimada;
- motivo ou observação.

## Situação operacional

A unidade pode ser classificada conforme a condição real do imóvel ou equipamento, por exemplo:

- ocupado;
- vago;
- alugado;
- em reforma;
- sem acesso;
- parado;
- trocado;
- estimada.

Essa informação alimenta o painel de exceções e ajuda a explicar leituras não realizadas.

## Leitura estimada

Use a leitura estimada somente quando não for possível obter uma leitura real.

O sistema usa a média dos últimos períodos disponíveis para sugerir uma estimativa. Ao registrar, ele:

- marca a leitura como estimada;
- mantém um motivo;
- registra a informação no histórico;
- permite revisão futura quando houver leitura real.

> Não use leitura estimada apenas para acelerar a operação. Ela deve representar uma exceção justificada.

---

# Exceções do mês

A tela **Exceções do mês** reúne itens que precisam de atenção antes do fechamento.

Pode incluir:

- leitura pendente;
- leitura menor que a anterior;
- consumo muito alto;
- possível vazamento;
- cadastro sem responsável;
- hidrômetro sem serial;
- hidrômetro parado;
- imóvel sem acesso;
- desconto vencido;
- cobrança vencida ou em aberto.

Use o botão **Abrir** ao lado de cada item para ir diretamente à área onde a correção deve ser feita.

---

# Fechamento mensal

A tela **Fechamento** prepara o encerramento do mês.

## O que conferir antes de fechar

1. Todas as leituras atuais foram informadas?
2. Há leitura menor que a anterior?
3. Há consumo elevado que precisa ser confirmado?
4. Todos os responsáveis estão identificados?
5. Descontos e isenções estão corretos?
6. Conta global de água foi conferida?
7. Vencimento e datas das leituras estão corretos?
8. Boletos e relatório foram revisados?

Use o botão:

```text
↻ Atualizar
```

para recalcular a conferência depois de alterar leituras, responsáveis ou regras.

## O que acontece ao executar o fechamento

Ao clicar em **Executar fechamento**, o sistema:

1. cria um retrato completo do mês no Histórico;
2. preserva leituras, tarifas, regras, valores de água, condomínio, descontos, serviço, multas e total;
3. arquiva a situação das unidades e os dados de pagamento existentes;
4. passa a leitura atual para leitura anterior nas unidades efetivamente lidas;
5. limpa a leitura atual para o novo mês;
6. limpa consumo e valor do ciclo seguinte;
7. limpa marcações de leitura móvel, GPS e fotos vinculadas ao ciclo atual;
8. avança a competência para o próximo mês;
9. ajusta datas de vencimento e leituras para a nova competência.

## Depois do fechamento

Abra **Boletos** e confira novamente:

- vencimento;
- data da leitura anterior;
- data da leitura atual;
- próxima leitura;
- condomínio;
- serviço de leitura;
- observações.

O sistema prepara as datas automaticamente, mas a conferência humana continua essencial.

---

# Histórico mensal e auditoria

A tela **Histórico e auditoria** guarda os períodos já encerrados e permite analisar meses anteriores sem misturá-los com a competência atual.

## Consultar histórico

Cada registro apresenta:

- competência;
- versão;
- origem;
- quantidade de unidades;
- consumo total;
- total de água;
- total geral;
- data de fechamento ou registro;
- motivo de revisão, quando houver.

Use **Detalhes** para abrir a visão completa de um período.

## Origem dos registros

| Origem | Significado |
|---|---|
| Fechado | Mês criado pelo fechamento normal. |
| Importado | Mês criado pela importação de planilha histórica. |
| Manual | Mês incluído manualmente no sistema. |
| Revisado | Nova versão criada para corrigir um período antigo. |

## Revisar um mês antigo

Meses fechados não devem ser alterados diretamente. Ao usar **Criar revisão**, o sistema preserva a versão antiga e cria outra versão rastreável.

Isso permite corrigir informações sem apagar a prova de como o período estava antes.

## Importar meses passados

Use a aba **Importar meses passados** para trazer leituras antigas ao sistema.

O modelo exige estas colunas:

```text
Competência | Apt | Responsável | Leitura Anterior | Leitura Atual
```

A competência aceita formatos como:

```text
2025-01
01/2025
2025-01-31
```

A importação:

- não altera a competência atual;
- cria registros históricos bloqueados;
- permite montar análises e dashboard anual com meses anteriores;
- guarda a origem como importado.

## Análise por apartamento

Escolha uma unidade para visualizar:

- quantidade de meses com histórico;
- consumo médio;
- consumo acumulado;
- último consumo;
- gráfico de consumo;
- tabela com leituras e valores por competência.

## Auditoria

A aba **Auditoria** registra ações relevantes no bloco, como:

- importação de histórico;
- criação de revisão;
- remoção de cadastros;
- leitura estimada;
- preparação de mensagem WhatsApp;
- outras operações administrativas.

Use **Exportar CSV** para guardar a trilha de auditoria fora do sistema.

---

# Relatórios por período

A tela **Relatórios** permite emitir relatório da competência atual ou de qualquer período salvo no Histórico mensal.

## Escolher o período

No campo:

```text
Período do relatório
```

selecione:

- **Competência atual**; ou
- **Histórico · mês/ano**.

Quando um histórico é selecionado, o sistema mostra a indicação:

```text
Relatório do histórico mensal
```

## Diferença entre relatório atual e histórico

| Relatório | Fonte dos dados |
|---|---|
| Competência atual | Dados que estão sendo trabalhados agora. |
| Histórico mensal | Retrato preservado no fechamento daquele mês. |

O relatório histórico não recalcula os valores usando a tarifa atual. Ele usa os valores salvos na competência escolhida.

## Conteúdo do relatório

O relatório mostra, entre outros itens:

- bloco e competência;
- datas de leitura e vencimento;
- conferência da conta global de água;
- água;
- condomínio bruto para conferência administrativa;
- isenções e descontos;
- condomínio líquido;
- serviço e outros valores;
- total mensal;
- consumo e total por apartamento;
- situação de pagamento do período.

> O campo **Condomínio bruto** pode aparecer no relatório administrativo, pois ele ajuda o síndico a conferir descontos. Nos boletos entregues aos moradores, esse campo não é exibido para evitar interpretação de cobrança duplicada.

## Exportar CSV

Clique em:

```text
Exportar CSV
```

O arquivo pode ser aberto no Excel e contém os valores por unidade, os totais e a origem do período.

## Imprimir relatório

Clique em:

```text
Imprimir A4 retrato
```

O relatório é preparado para A4 em orientação retrato.

---

# Dashboard anual

A tela **Dashboard anual** consolida a operação do bloco por ano.

## O que é incluído

O dashboard reúne:

- competências fechadas;
- meses importados;
- meses criados manualmente;
- revisões históricas;
- competência atual, identificada como **Em aberto** enquanto ainda não foi fechada.

## Indicadores principais

- consumo anual;
- média mensal de consumo;
- total de água;
- cobrança total;
- descontos concedidos;
- condomínio líquido;
- serviço de leitura;
- multas e outros;
- quantidade de meses registrados.

## Gráfico de consumo

O gráfico mostra o consumo de cada competência do ano selecionado. Ele facilita identificar meses de maior consumo ou alterações fora do padrão.

## Exportar e imprimir

Use:

```text
Exportar CSV
Imprimir A4 retrato
```

O CSV pode ser usado para conferência em Excel. A impressão foi preparada para caber em uma página A4 retrato, dentro dos limites do layout padrão.

---

# Financeiro

A tela **Financeiro** acompanha a situação de pagamento de cada apartamento.

## Situações de cobrança

O sistema pode trabalhar com estados como:

- pendente;
- pago;
- parcial;
- negociado;
- vencido;
- isento ou baixado.

## Campos financeiros

Por unidade, é possível registrar:

- status;
- valor recebido;
- data do pagamento;
- forma de pagamento;
- ID Pix, TXID ou referência;
- observação de acordo ou comprovante;
- total cobrado;
- saldo em aberto.

## WhatsApp

O botão **WhatsApp** prepara uma mensagem com:

- apartamento;
- competência;
- água;
- condomínio;
- desconto, quando aplicável;
- total;
- vencimento;
- status e saldo aberto.

O sistema abre o WhatsApp com a mensagem pronta. O envio final é feito pelo usuário.

Para funcionar, o telefone deve estar cadastrado em **Unidades e hidrômetros**, preferencialmente com código do país:

```text
5511999999999
```

## Recibo de pagamento

O botão de recibo na linha da unidade gera um recibo de pagamento com a assinatura cadastrada.

---

# Recibos

A tela **Recibos** é destinada aos recibos de serviço e pagamentos administrativos.

## Recibo de serviço

Preencha os campos do formulário, como:

- quem pagou;
- valor;
- serviço ou referência;
- data;
- cidade;
- nome do emissor;
- telefone;
- observação opcional.

Depois use:

```text
Salvar recibo
```

O registro ficará disponível na lista de recibos recentes.

## Imprimir recibo

Use o botão:

```text
Imprimir meia A4 retrato
```

O recibo foi preparado para ocupar metade de uma folha A4 em orientação retrato, com assinatura centralizada.

---

# Boletos

A tela **Boletos** configura e imprime os documentos destinados aos moradores e ao síndico.

## Dados configuráveis

Antes de imprimir, revise:

- vencimento;
- data da leitura anterior;
- data da leitura atual;
- data da próxima leitura;
- valor do serviço de leitura;
- valor do condomínio;
- cobrança do serviço de leitura;
- descrição do serviço;
- observações gerais.

## O que aparece no boleto do morador

O boleto contém informações como:

- apartamento;
- responsável;
- referência do mês;
- vencimento;
- leitura anterior;
- leitura atual;
- consumo;
- água;
- condomínio a pagar;
- desconto ou isenção, quando houver;
- serviço;
- multas e outros;
- total final;
- observações e orientações.

### Sobre o condomínio

O boleto mostra apenas:

```text
CONDOMÍNIO A PAGAR
```

A linha **CONDOMÍNIO BRUTO** foi removida da via do morador para evitar a impressão de que o condomínio está sendo cobrado duas vezes.

## Organização da impressão

Cada folha de boletos é organizada para impressão em:

```text
A4 · Paisagem · Escala 100%
```

Ela possui duas unidades por folha e duas vias por unidade:

- via do síndico;
- via do morador.

As linhas serrilhadas e os marcadores de corte devem aparecer na impressão.

## Cores e contraste

O perfil de impressão usa texto, bordas e valores reforçados para evitar resultado apagado.

Na janela de impressão, habilite **Gráficos de plano de fundo** quando essa opção existir.

---

# Configurações, backup e reset total

A tela **Configurações** concentra ajustes gerais do bloco e ações de segurança.

## Backup manual

No topo do sistema, use o botão de download para gerar um backup `.json`.

Esse arquivo contém a cópia dos dados salvos pelo sistema e deve ser guardado em local seguro, por exemplo:

- Google Drive;
- OneDrive;
- pendrive;
- computador de administração;
- pasta com backups mensais.

### Sugestão de rotina

Faça backup:

- antes de importar planilhas;
- antes de fechar o mês;
- antes de aplicar atualizações;
- antes do reset total;
- depois de concluir a cobrança mensal.

## Restaurar backup

Use o botão:

```text
Importar backup
```

A restauração substitui os dados atuais do navegador pelo conteúdo do arquivo selecionado.

> Antes de restaurar, faça um backup do estado atual, pois a restauração substitui a base local.

## Cópias locais de segurança

O sistema também pode manter cópias locais pontuais para recuperação rápida. Elas funcionam apenas no mesmo navegador/aparelho.

## Reset total do sistema

O reset total está em **Configurações** e serve para reiniciar completamente o sistema no aparelho atual.

Antes de apagar, o sistema:

1. gera e baixa um backup automático;
2. mostra quantos condomínios, unidades, históricos, recibos e fotos serão removidos;
3. exige a frase exata:

```text
RESETAR TODOS OS DADOS
```

4. pode oferecer a opção de apagar também a cópia da nuvem, se houver uma conta conectada.

O reset apaga do navegador:

- condomínios;
- apartamentos;
- leituras;
- histórico;
- recibos;
- regras;
- configurações;
- fotos locais do modo leiturista;
- credenciais locais de sincronização.

> Use reset total somente quando desejar começar do zero naquele aparelho.

---

# Sincronização com Supabase

A sincronização permite usar o mesmo sistema no computador e no celular.

## O que é sincronizado

A sincronização envia a cópia de dados operacionais, incluindo:

- condomínios e blocos;
- apartamentos;
- responsáveis;
- leituras;
- regras e descontos;
- cadastro técnico;
- histórico;
- boletos e configurações;
- financeiro;
- recibos;
- auditoria.

## O que não é sincronizado automaticamente

Fotos feitas pelo Modo leiturista permanecem no aparelho onde foram capturadas.

## Configuração inicial no Supabase

### 1. Criar o projeto

Crie um projeto no Supabase e mantenha o login por e-mail habilitado.

### 2. Configurar o retorno para seu site

No Supabase, em **Authentication → URL Configuration**, informe o endereço publicado do sistema.

Exemplo:

```text
https://SEU-USUARIO.github.io/SEU-REPOSITORIO/
```

Adicione esse mesmo endereço também nas URLs de redirecionamento.

### 3. Criar a tabela e as regras de segurança

Abra:

```text
Supabase → SQL Editor → New query
```

Copie e execute o conteúdo do arquivo:

```text
supabase-setup.sql
```

O script cria a tabela de sincronização e aplica regras para que cada usuário só possa acessar a própria cópia.

### 4. Copiar a URL e a chave pública

No Supabase, obtenha:

```text
Project URL
Publishable key ou anon key
```

Nunca use no site:

```text
service_role
secret key
JWT secret
password de banco de dados
connection string
```

### 5. Configurar o KR²MELO

Abra o módulo:

```text
☁ Sincronização
```

Informe:

- URL do projeto;
- chave pública anon/publishable;
- e-mail;
- senha.

Clique em **Criar conta**, confirme o e-mail e depois use **Entrar**.

## Primeiro envio: computador principal

No computador que possui os dados corretos:

1. Entre na mesma conta do Supabase.
2. Clique em:

```text
☁ Enviar para nuvem
```

3. Confira a data em **Último envio**.

Esse deve ser o aparelho de origem para a primeira sincronização.

## Primeiro uso no celular

No celular:

1. Abra o mesmo site publicado.
2. Abra **Sincronização** ou volte ao painel administrativo pelo Modo leiturista.
3. Informe a mesma URL e chave pública.
4. Entre com o mesmo e-mail e senha.
5. Clique em:

```text
⇩ Baixar da nuvem
```

Faça isso antes de começar novas leituras no celular.

## Uso diário seguro

Antes de iniciar trabalho em qualquer aparelho:

```text
Baixar da nuvem
```

Depois de terminar alterações:

```text
Enviar para nuvem
```

Você pode ativar:

```text
Sincronizar automaticamente após salvar uma alteração
```

Mesmo com essa opção ativada, é recomendável fazer um envio manual no fim de cada rodada de leituras.

### Conflito entre aparelhos

A sincronização atual trabalha com uma cópia completa do sistema. Se dois aparelhos alterarem o mesmo conteúdo ao mesmo tempo, a última versão enviada poderá substituir a anterior.

Para evitar conflito:

1. baixe antes de começar;
2. trabalhe em apenas um aparelho por vez para o mesmo bloco;
3. envie ao terminar;
4. baixe no outro aparelho antes de continuar.

## Apagar cópia na nuvem

O módulo de sincronização possui o botão:

```text
Apagar cópia na nuvem
```

Ele remove a cópia remota da conta conectada, mas não apaga automaticamente os dados locais do aparelho.

---

# Modo leiturista no celular

Abra:

```text
mobile.html
```

ou use o botão **Modo leiturista** no sistema.

Esse modo foi desenhado para uso em campo.

## O que o leiturista pode fazer

- selecionar o condomínio;
- navegar entre apartamentos;
- conferir leitura anterior;
- digitar leitura atual;
- receber alertas de leitura fora do padrão;
- fotografar o hidrômetro;
- capturar GPS;
- salvar e avançar para o próximo apartamento;
- ver quais unidades já foram concluídas;
- exportar backup de leituras;
- voltar ao painel administrativo para sincronizar.

## Alertas no celular

O sistema alerta quando:

- a leitura atual é menor que a anterior;
- o consumo passa de 15 m³;
- o consumo passa de 20 m³;
- o consumo passa de 30 m³.

O leiturista pode confirmar uma leitura fora do padrão, mas deve registrar somente depois de conferir o hidrômetro.

## Fotos e GPS

- A foto é compactada antes de ser salva para ocupar menos espaço.
- O GPS depende de autorização do navegador e do aparelho.
- As fotos ficam vinculadas ao aparelho que realizou a leitura.

---

# Impressão correta

## Boletos

Use estas configurações:

```text
Papel: A4
Orientação: Paisagem
Escala: 100%
Margens: padrão ou mínimas, conforme a impressora
Gráficos de plano de fundo: ativado, quando disponível
```

## Relatórios e dashboard anual

Use:

```text
Papel: A4
Orientação: Retrato
Escala: 100%
```

## Recibos

Use:

```text
Papel: A4
Orientação: Retrato
Escala: 100%
```

O recibo é montado para meia folha A4.

## Antes de imprimir

Sempre revise a pré-visualização e confira:

- logo;
- assinatura;
- datas;
- vencimento;
- responsável;
- leituras;
- total;
- corte pontilhado dos boletos;
- orientação do papel.

Se a logo ou a assinatura não aparecerem, confirme que existem os arquivos:

```text
assets/logo.png
assets/assinatura.png
```

---

# Publicação no GitHub Pages

O KR²MELO é um site estático e pode ser hospedado no GitHub Pages.

## Estrutura esperada no repositório

```text
kr2melo-gestao-agua/
├── index.html
├── mobile.html
├── app.js
├── mobile.js
├── sync.js
├── styles.css
├── mobile.css
├── sw.js
├── manifest.webmanifest
├── supabase-setup.sql
├── README.md
└── assets/
    ├── logo.png
    └── assinatura.png
```

## Como atualizar a versão online

1. Extraia a versão nova no computador.
2. Abra o repositório no GitHub.
3. Envie os arquivos internos da pasta extraída para a raiz do repositório.
4. Mantenha `index.html` na raiz.
5. Preserve a pasta `assets/`.
6. Faça o commit.
7. Aguarde o GitHub Pages publicar a atualização.
8. Atualize o navegador com `Ctrl + F5` no computador.
9. No celular, feche e abra novamente o site ou aplicativo instalado.

## Cache do PWA

O sistema usa cache para funcionar melhor como aplicativo. Depois de uma atualização, o navegador pode manter arquivos antigos por alguns instantes.

Se uma atualização não aparecer:

1. atualize com `Ctrl + F5` no computador;
2. feche todas as abas do sistema;
3. abra novamente o link;
4. no celular, feche o navegador ou PWA e abra de novo;
5. se ainda persistir, limpe os dados do site no navegador.

---

# Segurança e privacidade

O sistema pode guardar dados pessoais e financeiros, como nomes, telefones, leituras e valores cobrados.

## Recomendações

- não publique backups `.json` em repositórios públicos;
- não envie planilhas preenchidas para um GitHub público;
- não compartilhe chaves secretas do Supabase;
- use senha forte para a conta de sincronização;
- faça backup antes de importações e fechamentos;
- mantenha o computador principal protegido;
- limite o acesso ao painel administrativo;
- verifique o destinatário antes de enviar mensagens por WhatsApp.

## Chaves do Supabase

Pode ser usada no site:

```text
Publishable key
anon key
```

Nunca pode ser exposta no site:

```text
service_role
secret key
JWT secret
senha do banco de dados
connection string
```

---

# Solução de problemas

## A logo ou assinatura não aparece

Verifique se os arquivos existem com nomes exatos:

```text
assets/logo.png
assets/assinatura.png
```

Em servidores como GitHub Pages, letras maiúsculas e minúsculas fazem diferença.

## Menu Ajuda ou Leiturista não aparece no celular

Role o menu lateral ou use os atalhos móveis no topo. Se a versão antiga persistir, atualize o site e limpe o cache do navegador.

## O botão Atualizar do fechamento não parece mudar nada

O botão recalcula leituras, consumo, descontos, valores e pendências. Use-o depois de editar dados e observe a hora da última atualização da conferência.

## O boleto corta informações na impressão

Confira:

```text
A4 · Paisagem · Escala 100%
```

Evite usar “Ajustar à página” quando ele reduzir ou ampliar demais o conteúdo. Ative a impressão de gráficos de plano de fundo quando disponível.

## O relatório não mostra o mês antigo

Confirme se o mês foi fechado ou importado no módulo **Histórico e auditoria**. Depois volte a **Relatórios** e escolha o período no seletor.

## O celular não possui os mesmos dados do computador

Entre na mesma conta no módulo **Sincronização** e use:

```text
⇩ Baixar da nuvem
```

antes de cadastrar ou ler novas unidades.

## Erro de permissão no Supabase

Confirme se o arquivo `supabase-setup.sql` foi executado por completo no SQL Editor. Depois confira URL, chave pública, e-mail e senha.

## Erro de chave no Supabase

Use a chave `anon` ou `publishable`. Não use `service_role`, `secret`, `JWT` nem a senha do banco.

## A importação do Excel falha

Use o CSV exportado pelo próprio sistema. Abra no Excel, preencha sem mudar os cabeçalhos, salve como CSV UTF-8 separado por ponto e vírgula e tente novamente.

## O backup não restaura

Confirme que o arquivo é um backup `.json` gerado pelo KR²MELO. A restauração substitui a base atual, então faça backup antes de testar.

---

# Estrutura de arquivos

| Arquivo ou pasta | Função |
|---|---|
| `index.html` | Painel administrativo principal. |
| `mobile.html` | Tela móvel do leiturista. |
| `app.js` | Lógica do painel administrativo. |
| `mobile.js` | Lógica do modo leiturista. |
| `sync.js` | Integração de sincronização com Supabase. |
| `styles.css` | Estilos do painel e documentos impressos. |
| `mobile.css` | Estilos do modo leiturista. |
| `sw.js` | Cache do aplicativo/PWA. |
| `manifest.webmanifest` | Configuração para instalação como aplicativo. |
| `supabase-setup.sql` | Script para criar a tabela e as regras de sincronização. |
| `assets/logo.png` | Logo exibida no sistema e nas impressões. |
| `assets/assinatura.png` | Assinatura exibida nos recibos. |
| `modelo-cadastro-inicial-bloco.csv` | Modelo de cadastro inicial do bloco. |
| `modelo-proxima-leitura-excel.csv` | Modelo para atualização de leituras. |

---

# Checklist de fim de mês

Use esta lista antes de executar o fechamento:

```text
[ ] Baixei a cópia mais recente da nuvem, se uso sincronização.
[ ] Todas as leituras foram registradas ou justificadas.
[ ] Leituras menores e consumos altos foram conferidos.
[ ] Responsáveis e telefones estão corretos.
[ ] Hidrômetros sem acesso, parados ou trocados estão identificados.
[ ] Isenções e descontos foram revisados.
[ ] Multas e outros lançamentos foram revisados.
[ ] A conta global de água foi informada e conferida.
[ ] Vencimento e datas de leitura estão corretos.
[ ] Boletos foram conferidos antes de imprimir.
[ ] Relatório mensal foi conferido.
[ ] Backup JSON foi baixado.
[ ] Fechamento foi executado.
[ ] Dados atualizados foram enviados para a nuvem.
```

---

## Observação final

O KR²MELO foi pensado para reduzir erros operacionais, mas a conferência humana continua indispensável. Antes de distribuir boletos, fechar meses ou apagar dados, confirme leituras, valores, descontos e documentos impressos.

Mantenha backups atualizados e use a sincronização com disciplina: **baixar antes de começar, enviar depois de terminar**.


---

## Atualização v5.2.2 — Seleção visível de relatórios do Histórico

Na página **Relatórios**, há uma caixa destacada chamada **“Relatórios salvos do bloco”**, acima do relatório.

1. Escolha a competência no campo **Período do relatório**; ou
2. Clique diretamente em um cartão de período: **ATUAL** ou **HISTÓRICO**.

Todo mês encerrado em **Fechamento** aparece como um cartão de histórico. Ao selecionar um deles, o sistema abre os valores preservados no fechamento, sem recalcular com as tarifas ou regras atuais.

Quando nenhum mês foi encerrado, a caixa informa que ainda não há histórico disponível. Nesse caso, conclua o fechamento mensal primeiro.

---

## Atualização v5.3.0 — Boletos, recibos, versão e sincronização

- Versão centralizada em `v5.3.0` nos arquivos do aplicativo, manifesto e cache PWA.
- Boletos com observações gerais em mais linhas e observações individuais por apartamento.
- Ajuste da grade de impressão dos boletos para quatro partes iguais ao cortar nas linhas tracejadas.
- Recibo com logo, cores da plataforma e valor por extenso automático.
- Aviso de possível conflito antes de sobrescrever uma cópia mais recente na nuvem.
- Pasta `tests/` com smoke test e checklist de impressão.

---

## Atualização v5.3.1 — Capas e margem para grampear

- Boletos com área visual maior à esquerda para grampear os blocos.
- Capa frontal simplificada com apenas condomínio, vencimento e próxima leitura.
- Contracapa invertida em 180° para ficar voltada para fora no bloco impresso.

---

## Atualização v5.3.2 — Grampo por via e leitura in loco simplificada

- Área de grampo aplicada somente na via do Síndico.
- Via do Morador mantida no tamanho normal.
- Tela do celular simplificada para uso exclusivo de leitura in loco.
- Remoção dos atalhos de foto, GPS, backup, ajuda, admin e sincronização manual da tela móvel.

---

## Atualização v5.3.3 — Capa frontal e fichas técnicas

- Capa frontal mais compacta para a próxima leitura não ficar escondida na impressão.
- Remoção das páginas de ficha técnica do bloco no conjunto dos boletos.

---

## Atualização v5.3.4 — Valor adicional individual

- Novo campo de valor adicional por apartamento, separado de multas/outros.
- Valor adicional aparece como linha própria no boleto e soma no total.

---

## Atualização v5.3.5 — Impressão, leitura em campo e relatórios

- Conferência guiada de impressão dos boletos.
- Geração do bloco por partes: capa, boletos e contracapa.
- Valores adicionais múltiplos por apartamento.
- Mobile com Enter para salvar, Sem acesso e pendentes primeiro.
- Backup automático antes do fechamento mensal.
- Relatório do síndico com resumo limpo.
- Remoção da tela Financeiro do menu principal.

---

## Atualização v5.3.8 - Mobile de leitura em campo

- Busca rápida por apartamento ou morador na tela do celular.
- Resumo da rota com pendentes, leituras feitas, sem acesso e alertas.
- Botão para ir direto ao próximo apartamento pendente.
- Observação da leitura preenchida diretamente no celular.
- Motivo do sem acesso selecionável em campo.
- Opção de reabrir leitura salva para corrigir imediatamente.

---

## Atualização v5.3.8 — Central de lançamentos na tela Leituras

Nesta versão, os lançamentos individuais por apartamento foram reunidos na tela **Leituras**, no bloco **Lançamentos e ajustes por apartamento**.

Agora ficam no mesmo lugar:

- multas/outros e valor da multa;
- observação específica da multa/outros;
- descontos, isenções, motivo, vigência e autorização;
- valores adicionais;
- abatimentos avulsos com valor negativo;
- observação individual que aparece no boleto do morador.

A tela **Regras e descontos** foi removida do menu para reduzir duplicidade. A tela **Boletos** ficou concentrada apenas na configuração geral do vencimento, datas, valor do condomínio, serviço de leitura, observações gerais e impressão.

Para lançar adicionais ou abatimentos, use uma linha por item:

```text
2ª via; 10,00
Abatimento combinado; -15,00
```

## Atualização v5.3.8 — modelo de cálculo da planilha

A tela **Configurações → Tarifa da água** agora permite escolher entre dois modelos:

1. **Faixas do site / SABESP simplificado**: mantém o cálculo anterior por faixas de consumo.
2. **Planilha Bloco 1938 · mínimo + excedente**: cobra um valor mínimo até a franquia e, acima dela, soma o valor por m³ excedente. O padrão vem configurado como **R$ 70,00 até 10 m³ + R$ 7,00 por m³ excedente**, igual ao cálculo identificado na planilha.

Ao salvar o modelo, o sistema recalcula automaticamente a água nas leituras, boletos, relatórios, fechamento mensal e modo leiturista.

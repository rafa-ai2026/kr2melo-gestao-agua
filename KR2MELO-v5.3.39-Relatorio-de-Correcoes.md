# Análise e correções — KR²MELO v5.3.39

Data: 7 de outubro de 2026. Base analisada: KR2MELO-v5.3.32-Sistema-Atualizado.zip.

## Resultado

Versão corrigida: `KR2MELO-v5.3.39-Sistema-Corrigido.zip`, com 23 arquivos. O ZIP passou de 6,616,383 para 439,979 bytes (redução de 93.4%). O original foi preservado.

## Problemas encontrados e correções

| Área | Problema | Correção |
|---|---|---|
| Envio móvel | Envio manual e gravações móveis podiam enviar a base inteira desatualizada. | O celular usa a fila de leituras por unidade; não substitui pagamentos e cadastros da nuvem. |
| Fila | Unidade/competência ausente na nuvem podia ser marcada como enviada sem aplicar a leitura. | A operação vira conflito e permanece preservada; não recria unidade removida nem aplica leitura em outro mês. |
| Repetição | Várias operações do mesmo apartamento eram enviadas juntas e podiam produzir falsos conflitos. | A última operação é selecionada; as anteriores ficam arquivadas como substituídas. |
| Confirmação | Sucesso HTTP era tratado como confirmação suficiente. | O retorno da nuvem é lido e comparado com a operação antes de marcar sucesso. |
| Conflitos | Leituras diferentes com o mesmo horário não eram protegidas. | Horário igual também exige revisão quando os campos divergem. Leitura anterior alterada no site também bloqueia envio. |
| Recuperação | A fila IndexedDB não era incorporada ao estado na inicialização. | Operações pendentes recuperam leituras locais mais antigas; registros antigos sem fila são protegidos quando possível. |
| Contas | Uma fila podia ser reenviada após trocar de conta. | Novas operações registram a conta; o envio bloqueia a fila de outra conta. Operações antigas sem identificação são associadas na primeira sincronização. |
| Downloads/restauração móvel | Troca do estado antes de confirmar armazenamento e substituição de leituras locais. | Cópia anterior preservada, gravação antes da troca de memória e proteção das pendências. |
| Botões móveis | Controles inseridos por uma camada posterior de renderização não recebiam os eventos de clique. | Os eventos são ligados após inserir os controles, com proteção para tela sem cadastro. |
| Rascunhos | Falhas de gravação podiam limpar o rascunho de uma leitura. | O rascunho é mantido quando o salvamento falha. Mudança de competência informa o erro e conserva o registro de recuperação. |
| Abas do painel | Reconciliação local procurava somente o ID do prédio, sem validar a competência. | Leituras só são reconciliadas dentro do mesmo prédio e mês. |
| Concorrência de nuvem | Uma aba antiga podia usar a revisão compartilhada de outra aba; um envio agendado podia usar revisão obtida depois. | A revisão fica vinculada à aba e à conta; o envio agendado captura revisão, conta e cópia do estado. Atualização condicional continua sendo exigida. |
| Importar BKP móvel | Importar o JSON do celular restaurava a base inteira e podia perder pagamentos e configurações recentes. | Importação móvel mescla apenas leituras; incompatibilidades são listadas. Recebimento no painel via BKP é registrado separadamente da nuvem. |
| Impressão | CSS continha sequências literais de quebra de linha e regras sobrepostas; faltavam limites horizontais uniformes. | CSS reparado; topo, meio e rodapé alinhados em capas, contracapas e boletos; altura de 97 mm por peça. |
| Botão de gastos | Já era fixo, mas não podia ser reposicionado. | Continua flutuante e agora pode ser arrastado, mantendo a posição salva e separando arraste de clique. |
| Iniciador Windows (v5.3.39) | Aviso genérico de porta ocupada, inclusive para bloqueio do Windows; servidor anterior continuava em segundo plano. | Identifica a versão pelo serviço de saúde e o processo proprietário da porta, permite encerrar somente o KR2MELO reconhecido com confirmação, reutiliza a versão atual e diferencia os erros 10048 e 10013. |
| Distribuição | Dois executáveis antigos, cópia inteira do site e históricos estavam no pacote. | Um iniciador Windows atualizado usa os mesmos arquivos corrigidos do site; duplicatas e arquivos de versões anteriores foram retirados. |

## Verificação realizada

- 15 cenários de integridade móvel, 5 de concorrência de nuvem e 7 de transferência por BKP aprovados: **27 cenários comportamentais**.
- Smoke tests existentes aprovados, com atualização da versão esperada e reparo de um extrator de teste que falhava por formatação do código.
- JavaScript conferido quanto à sintaxe.
- Chrome: botão flutuante arrastado e aberto; controles da fila ligados; leitura salva em localStorage e IndexedDB; valor compartilhado com o painel; importação real de JSON móvel recebeu leitura preservando a conta global; tela móvel sem cadastro abriu sem erro.
- Medidas em impressão: folhas 281 × 194 mm, linha central em 50%, metades de 97 mm. PDF gerado com três páginas A4 paisagem e revisado visualmente, incluindo folha com um único boleto.
- Iniciador Windows compilado. Seis novos checks do autoteste validam reconhecimento da versão antiga, resposta de aplicativo desconhecido, identificação do executável KR2MELO, rejeição de outro executável e mensagens distintas para erros 10013/10048. Autoteste verificou resolução dos arquivos, rejeição de caminhos fora da pasta, bloqueio de acesso ao executável pelo servidor, arquivos com parâmetros e formato da resposta HTTP.
- Recursos do cache offline e ícones do manifesto conferidos no ZIP; arquivo ZIP validado por CRC.

## Limites e pontos de uso

Não houve conexão ao seu Supabase real, alteração de dados de produção, publicação no site, teste físico no celular ou impressão em equipamento. As falhas de rede, confirmações e concorrência foram simuladas. Isso valida os caminhos corrigidos, sem constituir garantia absoluta contra qualquer perda de dados do navegador/aparelho. O BKP continua necessário.

A revisão automática de aprovação bloqueou o ensaio de iniciar o servidor Windows e consultá-lo por HTTP, porque essa ação exigia uma autorização indisponível para aquela categoria do ambiente. A compilação, o autoteste sem servidor e os testes do site no navegador foram concluídos; o funcionamento do servidor Windows em execução não foi validado aqui.

O novo iniciador mantém o endereço local anterior para preservar a origem dos dados do navegador. Ele precisa ficar junto dos arquivos extraídos e usa .NET Framework 4.5 ou superior. Feche a versão antiga antes de abrir a nova.

No celular, use o endereço HTTPS do site publicado. Dados locais do computador não ficam acessíveis no celular pelo endereço 127.0.0.1. Contas, origem do navegador e competência devem corresponder. Conflitos são preservados para revisão e não tratados automaticamente como transferência concluída.

Os testes e o código do iniciador foram mantidos fora do ZIP de operação. A versão corrigida deve substituir os arquivos do site existente seguindo o README. A hospedagem não foi modificada nesta análise.

## Integridade do pacote

SHA-256 do ZIP: `e625adb0f577183e6e7ca013e00255d2e4e35175f3526113664ffb785c45ce45`.

## Auditoria financeira e correções da v5.3.35

Referência confirmada pelo usuário: Itapetininga/SP; residencial comum; água e esgoto; ligação individual por apartamento. Pesquisa realizada em 7 de outubro de 2026. A tabela 5 da ARSESP 1749/2025 vigora desde 1º de janeiro de 2026:

| Faixa | Água | Esgoto | Soma |
|---|---:|---:|---:|
| Até 10 m³, mínimo mensal | 40,42 | 32,42 | 72,84 |
| 11–20 m³, por m³ excedente da faixa | 5,69 | 4,49 | 10,18 |
| 21–50 m³, por m³ da faixa | 8,74 | 6,99 | 15,73 |
| Acima de 50 m³, por m³ da faixa | 10,46 | 8,33 | 18,79 |

Fontes oficiais:
- [Tabela e vigência — Deliberação ARSESP 1749/2025](https://www.arsesp.sp.gov.br/LegislacaoArquivos/1749.pdf)
- [Nota técnica e tabelas de aplicação 2026](https://www.arsesp.sp.gov.br/Documentosgerais/NT%201%C2%BA%20REAJUSTE%20TARIF%C3%81RIO%20DA%20SABESP-%20Tarifa%20Aplica%C3%A7%C3%A3o%20-%20URAE1%20v2%20-%20Errata%20-%20Assinada.pdf)
- [SABESP: Itapetininga pertence à OP — Alto Paranapanema](https://www.sabesp.com.br/assets/pdf/servicos/para-voce/comunicado-sabesp-1-24.pdf). Este documento anterior foi usado somente para identificar a unidade, não para obter preços atuais.

### Como aplicar no sistema

1. Baixe um BKP antes de atualizar. Extraia todo o ZIP e abra o executável v5.3.35.
2. Em cada condomínio, abra **Configurações → Tarifa da água**.
3. Escolha **SABESP Itapetininga 2026 — residencial, água + esgoto**.
4. Informe a vigência correspondente ao mês que deseja recalcular, a partir de janeiro de 2026, e salve. Confira a competência atual.
5. Na tela Boletos, confira a nova seção **Conferência dos valores**. Salve mudanças nos campos antes de imprimir.

A tabela oficial é uma opção fixa, com quatro faixas; campos das tarifas personalizadas ficam desabilitados quando ela é selecionada. A atualização não troca automaticamente as tarifas cadastradas, nem recalcula os valores já armazenados nos fechamentos. Os modelos anteriores continuam disponíveis. No modelo antigo de três faixas, o campo de referência da terceira faixa é informativo: a última taxa continua aplicada a todo o excedente. Para representar a SABESP com quatro faixas, use a opção própria.

O mínimo de R$ 72,84 corresponde a uma economia residencial com água e esgoto. Como as ligações são individuais, mantenha desativado o rateio dos mínimos de apartamentos com consumo zero se a intenção for reproduzir a cobrança mínima por apartamento da SABESP. A função de rateio anterior foi preservada para quem a utiliza como regra interna.

### Erros reproduzidos e corrigidos

- **Desconto duplicado nos itens do boleto:** a versão anterior mostrava condomínio já líquido e outra linha descontando novamente. Agora mostra condomínio bruto e um único abatimento; a soma impressa fecha com o total.
- **Centavos não conservados no rateio:** R$ 80,84 divididos por três apareciam como R$ 26,95 em todos, somando R$ 80,85. Agora a divisão é R$ 26,95 + R$ 26,95 + R$ 26,94; ordem estável por identificador.
- **Arredondamentos incompatíveis:** descontos percentuais e parcelas agora são arredondados individualmente em centavos, e o total soma essas mesmas parcelas. Exemplo: 33,33% de R$ 50,00 = desconto R$ 16,67 e líquido R$ 33,33.
- **Valor numérico convertido incorretamente:** um adicional importado como número 1.005 podia virar 1005 ao passar pelo leitor de valores brasileiros. Números permanecem números; texto brasileiro continua aceito. Na cobrança, 1.005 arredonda para R$ 1,01.
- **Histórico de tarifas perdido ao carregar:** períodos tarifários agora são preservados na normalização e aplicados conforme a competência.
- **Tarifa antiga substituída sem solicitação:** retirada a conversão automática da combinação explícita 64,60 / 8,94 / 13,82 para novos valores.
- **Diferença entre móvel e painel:** ambos usam o arquivo compartilhado `financial.js`; valores zero explícitos deixam de ser trocados por limites padrão no celular.
- **Consumo armazenado desatualizado:** a cobrança atual usa leitura atual menos anterior, em vez de confiar no campo de consumo em cache.
- **Impressão com campos não salvos:** bloqueada com orientação para salvar; cada apartamento passa por conferência dos itens impressos antes de abrir o lote. Crédito excedente que torna o total negativo exige revisão, em vez de ser impresso como valor a pagar.

### Evidência e limites

Passaram 149 verificações financeiras no Chrome usando as funções finais do aplicativo, mais ensaios de salvar/recarregar a tabela, preservar fechamento, bloquear impressão não salva e crédito excedente, e nove comparações de valores móvel/painel. Os exemplos de 10/20/22/50/51 m³ resultaram respectivamente em R$ 72,84 / 174,64 / 206,10 / 646,54 / 665,33 para água e esgoto.

Também passaram os 27 cenários anteriores de transferência/concorrência, verificações de sintaxe, smoke tests e ensaios no Chrome para botão flutuante, salvamento móvel real no armazenamento de teste, importação de BKP e cortes de impressão. O iniciador v5.3.35 foi compilado e passou no autoteste. O PDF de teste manteve duas peças de 97 mm e linhas de corte uniformes.

A tabela calcula água e esgoto; não inclui automaticamente TRCF, multas, juros, débitos anteriores ou outros serviços da fatura SABESP. Esses itens precisam ser conferidos e lançados separadamente quando aplicáveis. Para comparar uma fatura real, confira também categoria, quantidade de economias, período de leitura e itens adicionais. Não houve teste na conta de produção, no Supabase real ou em impressora/aparelho físico. Esta auditoria cobre os fluxos e casos descritos, não constitui garantia de ausência de qualquer defeito no sistema.

## Atualizações da v5.3.36 — proposta e relatório por unidade

### Proposta

O texto de apresentação foi reescrito de forma sucinta em português brasileiro, com acentuação e concordância revisadas. Apresenta leitura mensal dos hidrômetros, conferência do consumo, cálculo pelas regras cadastradas, boletos discriminados, relatórios, histórico, recibos e cópias de segurança. O sistema é apresentado como apoio à execução do serviço, e as condições comerciais permanecem a definir conforme o condomínio.

A palavra “CONTRATADA” foi removida do cabeçalho, da assinatura e do texto preparado para e-mail. A assinatura existente foi centralizada na tela e na impressão. O logotipo e a assinatura usam endereços completos na janela de impressão para evitar imagens ausentes. A proposta foi conferida visualmente em PDF A4 de uma página, com fundo branco. A função de preparar e-mail foi preservada; nenhum e-mail foi enviado.

### Relatório por apartamento

Em **Unidades, moradores e hidrômetros**, clique no número, no responsável ou em uma área da linha fora dos campos editáveis. Também é possível selecionar a linha com Tab e abrir com Enter ou Espaço. Uma janela apresenta:

- Unidade, responsável atual, serial do hidrômetro e situação cadastral.
- Consumo atual, média dos períodos com leitura, variação entre as duas últimas leituras disponíveis e total atual da cobrança.
- Gráfico de consumo em m³ e gráfico do total da cobrança em reais, com até 12 competências registradas.
- Tabela com todos os períodos disponíveis, leituras anterior e atual, consumo, água, total, data registrada e observações.

A competência em andamento utiliza as leituras atuais e o mesmo cálculo financeiro dos boletos. Os períodos fechados usam os valores registrados nos fechamentos, sem recalcular tarifas antigas. Havendo revisões do mesmo mês, o relatório seleciona a versão mais recente. Leituras estimadas têm identificação e cor própria; períodos sem dados aparecem como “—”, sem inventar consumos, valores ou datas. Históricos antigos sem total registrado não recebem um valor retroativo calculado.

A média inclui os períodos disponíveis com consumo informado, inclusive estimativas identificadas. A variação compara as duas últimas competências com consumo disponível, mostradas no próprio indicador; quando não há base suficiente ou a base é zero, não apresenta um percentual artificial.

O relatório atualiza quando chegam mudanças pelo armazenamento compartilhado entre abas, quando a janela volta ao foco e quando o aplicativo redesenha os dados após suas operações. Isso exibe os dados locais disponíveis; a sincronização com a nuvem continua pelos controles existentes. Não foi criada uma consulta automática a contas ou faturas da SABESP.

Os campos de telefone, situação e cadastro do hidrômetro continuam editáveis; clicar neles não abre o relatório. A janela se adapta a telas menores e permite rolagem dos gráficos e da tabela. Nenhum exemplo fictício foi incluído na distribuição: os gráficos são preenchidos pelos registros do usuário.

### Verificação

O ensaio no Chrome validou seleção da revisão mais recente, exclusão de outras unidades, preservação dos valores fechados, cálculo da competência atual, dados ausentes, estimativas, dois gráficos, tabela, clique, teclado, campos editáveis, atualização entre abas e visualização no celular. A proposta teve alinhamento conferido na tela, logotipo e assinatura carregados na impressão, ausência de “CONTRATADA” e revisão visual do PDF A4.

Passaram novamente os 149 checks financeiros, os 27 cenários de transferência/sincronização e os smoke tests. O executável v5.3.36 foi compilado e passou no autoteste. A atualização preserva as correções anteriores de transferência móvel, tarifas, boletos, cortes e botão flutuante. O uso no site publicado, Supabase de produção e equipamentos físicos não foi ensaiado.

### Instalação

Baixe um BKP antes de atualizar. Extraia todo o ZIP, mantenha o executável junto dos arquivos e abra **KR2MELO-v5.3.36-Windows.exe**. No site existente, publique os arquivos atualizados no mesmo endereço, incluindo **financial.js**, e atualize a página. Confira a versão 5.3.36.

## Atualização 5.3.37 — relatórios e conferência independente

Em Unidades, abra o apartamento e use PDF / imprimir, Baixar imagem ou Compartilhar imagem. O PDF inclui todo o histórico disponível; a imagem PNG contém as últimas 12 competências e pode ser anexada ao WhatsApp. O compartilhamento direto depende do navegador e do aparelho.

Em Boletos, use Conferir boletos para visualizar uma segunda apuração, independente do cálculo principal. Ela verifica leituras, consumo, faixas tarifárias, água e esgoto, condomínio, serviços, descontos, ajustes, multas, arredondamentos e rateios. Compara os resultados com os valores realmente apresentados nas vias do morador e do síndico. Divergências bloqueiam a impressão; avisos exigem revisão e qualquer alteração nos dados invalida essa revisão. Também existe proteção da impressão pelo atalho do navegador. Salve as alterações da tela antes de conferir.

O comprovante em PDF inclui memória dos cálculos por unidade e um identificador SHA-256. A opção Baixar dados conferidos gera o JSON correspondente. O identificador relaciona os dados ao comprovante; não é assinatura digital.

Validação: 432 combinações financeiras e 149 verificações complementares aprovadas. Erros provocados de um centavo, alteração apenas na impressão e alteração na via do síndico foram detectados. Leituras ausentes, conflitos, duplicidade de unidades, preservação dos centavos no rateio e invalidação da revisão foram verificados. PDF e PNG foram gerados e revisados visualmente. O navegador de ensaio cancelou o salvamento nativo dos downloads; os arquivos gerados foram recuperados e conferidos, mas o salvamento e o compartilhamento no aparelho real ainda precisam de teste.

A conferência dá evidência verificável de que os cálculos e a impressão correspondem aos dados registrados. A leitura física, a autorização dos descontos e a classificação contratual da SABESP dependem de conferência humana. Não houve publicação nem alteração dos dados de produção. Faça um BKP antes de substituir a versão e mantenha os arquivos juntos.

## Atualização 5.3.38 — próximo ciclo no celular

Foram identificadas falhas que explicam o sintoma: o BKP automático do fechamento era exportado antes de preparar o próximo mês; o celular com cadastro existente não buscava a competência atual ao abrir; e o bloqueio de restauração rejeitava operações locais já recebidas e arquivadas no fechamento. Sem nuvem ou importação de BKP, aparelhos distintos não compartilham o mês automaticamente. A imagem recebida mostra setembro com 32 leituras e nuvem desconectada; ela não permite confirmar qual arquivo foi usado no aparelho real.

O fechamento agora gera o arquivo `proxima-leitura-AAAA-MM-KR2MELO.json` após avançar a competência. O resultado do fechamento e a tela Fechamento mensal também oferecem botão para baixar o cadastro atual, caso o navegador bloqueie o download automático. O histórico preserva o mês encerrado. A leitura atual vira anterior e os campos da nova leitura são reiniciados, inclusive marcações transitórias de sem acesso, estimativa e reabertura.

Com nuvem conectada, o celular tenta atualizar o cadastro ao abrir, conectar a conta ou recuperar internet. Com BKP, importe o arquivo posterior ao fechamento. Operações antigas só são arquivadas como recebidas se seus dados coincidirem integralmente com a unidade da competência ou com a versão mais recente do fechamento; a leitura anterior também é conferida. A operação continua guardada no IndexedDB. Diferenças, histórico insuficiente, conta diferente ou falta de espaço bloqueiam a troca de dados. Um BKP antigo não pode retornar o celular a uma competência anterior. Edições durante atualização e rascunhos de outro mês são protegidos.

Antes de sair: faça um BKP do celular, atualize o sistema, baixe no painel o cadastro do mês preparado e importe no celular; ou atualize pela nuvem conectada. Confira o mês no cabeçalho, leituras anteriores, campo atual vazio e contagem de pendentes. Se a importação indicar diferença, leve o BKP móvel ao painel para revisão; não limpe os dados do navegador.

Validação: 19 cenários de integridade móvel, 5 de concorrência e 7 de transferência aprovados. O ensaio no Chrome executou um fechamento real, verificou que o arquivo gerado contém outubro, importou no celular com setembro pendente e confirmou anterior 403, atual vazia, 0/1 leitura e histórico preservado. Também verificou a limpeza de sem acesso e a rejeição do BKP antigo. Diferenças no histórico, revisão posterior divergente e falta de espaço conservaram o mês anterior e as operações pendentes. O aparelho e os dados reais do usuário não foram alterados.

## Atualização 5.3.39 — ajustes mensais e atualização por código

No Fechamento mensal, depois de arquivar o retrato do mês, todos os lançamentos e ajustes individuais são limpos: descontos/isenções e sua função, alvo, valor, motivo, vigência e autorização; adicionais e abatimentos detalhados; multa, motivo e observação; observação individual do boleto e campos legados de desconto. As configurações gerais de tarifa, condomínio e serviço permanecem. Os ajustes do mês encerrado e seus valores financeiros ficam no histórico. Regras de benefício precisam ser lançadas novamente a cada mês, conforme solicitado.

O bloco Lançamentos e ajustes por apartamento tem o botão Resetar lançamentos. Ele solicita confirmação, preserva uma cópia local antes de limpar todos os apartamentos e mantém leituras, cadastro e histórico. Se a cópia anterior não puder ser salva, cancela a operação. A nova conferência dos boletos usa os valores atualizados.

Alternativa à nuvem e ao arquivo BKP: no resultado do fechamento ou em Fechamento mensal, use Gerar código para o celular / Gerar código do cadastro atual. Copie o código e, no mobile do navegador desejado, abra Atualizar cadastro / preparar próximo mês → Colar código do painel → Aplicar código. O mobile continua oferecendo nuvem e importação de BKP. A entrada por código usa as mesmas verificações da importação: não avança descartando leituras pendentes que não constem no cadastro/histórico recebido e não aceita retornar a mês anterior.

Cada navegador e aparelho guarda seu próprio cadastro local. A atualização de arquivos do site não substitui esse cadastro. Sem nuvem conectada, ele precisa receber o mês preparado por BKP ou código; o código permite essa transferência sem baixar um arquivo. Confira a competência no cabeçalho antes de iniciar a leitura em campo. A confirmação da troca de cadastro continua necessária para evitar perda de dados.

Validação no Chrome: fechamento com desconto, adicional, multa e observações; novo mês limpo e histórico preservado; transferência do código real gerado no painel para mobile com mês antigo e fila pendente; rejeição de arquivo antigo; reset manual preservando leitura anterior e histórico. Os testes de integridade e financeiros das versões anteriores foram executados novamente. Não houve alteração ou publicação em produção nem teste no celular físico.

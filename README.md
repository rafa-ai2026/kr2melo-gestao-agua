# KR²MELO v5.3.38 — instruções

## Atualizar no Windows

Nesta versão, o iniciador identifica o processo dono da porta. Se reconhecer um servidor KR2MELO anterior, pede confirmação para encerrá-lo e abrir a versão atual no mesmo endereço. Salve as leituras em edição antes de confirmar. Um aplicativo diferente nunca é encerrado. Fechar uma aba do navegador não encerra o servidor antigo.

1. No programa anterior, baixe um BKP antes de atualizar.
2. Feche o programa anterior e extraia TODO o ZIP em uma pasta.
3. Abra `KR2MELO-v5.3.38-Windows.exe`. Mantenha o executável junto dos demais arquivos.
4. O iniciador abre `http://127.0.0.1:38427/index.html`, o mesmo endereço usado pela versão anterior. Use o mesmo navegador e perfil para continuar acessando os dados locais.
5. Confira condomínios, competência, apartamentos e leituras. Se necessário, restaure o BKP no painel.

O iniciador usa o .NET Framework do Windows (4.5 ou superior), serve somente arquivos do sistema e aceita conexões apenas do próprio computador. Não exige Node, Python ou Go. Se houver aviso de porta ocupada, encerre o programa anterior antes de abrir esta versão. Não execute diretamente de dentro do ZIP.

## Publicar no site existente

Substitua os arquivos HTML, JavaScript, CSS, manifesto, a pasta `assets/` e os modelos no mesmo endereço do site anterior. O executável e este manual não são necessários para hospedagem. Mantenha HTTPS para o funcionamento do app móvel e do armazenamento offline. O cache passa a ser v5.3.38; atualize a página e confira a versão no celular.

O SQL foi mantido para instalações novas do Supabase. Esta atualização não exige alterar a tabela existente. Preserve a mesma conta de sincronização.

## Leitura móvel e transferência

- Abra `mobile.html` pelo site publicado para usar no celular. O endereço 127.0.0.1 do Windows funciona somente no próprio computador.
- Baixe o cadastro da nuvem antes de iniciar a rota e confira a competência.
- Salve cada leitura pelo botão Salvar ou Enter. Leituras offline ficam no aparelho, com diário e fila IndexedDB.
- **Enviar nuvem** e **Sincronizar agora** enviam as leituras por unidade, preservando configurações e pagamentos do site.
- **Baixar nuvem** preserva leituras pendentes. Uma competência/unidade ausente ou leitura anterior incompatível bloqueia a substituição e exige revisão.
- Confirmação de nuvem significa que a operação retornou com a leitura esperada. Conflitos não são apagados ou tratados como sucesso.
- Para transferir sem nuvem: no celular, use **Baixar BKP**; no site, use **Importar backup** com esse JSON. O arquivo de origem móvel é reconhecido e apenas suas leituras são recebidas. Cadastros, pagamentos e configuração financeira permanecem no site.
- Guarde o BKP até conferir o recebimento. Leituras incompatíveis são listadas para revisão e continuam no arquivo original. O painel registra uma cópia local anterior à importação.
- No mesmo navegador, uma leitura já compartilhada também pode ser confirmada como recebida pelo painel via BKP. Essa confirmação é distinta da confirmação de nuvem.
- Após reabrir o painel com sincronização automática, baixe a nuvem antes de editar para estabelecer a revisão de dados desta aba. Uma aba sem essa revisão não pode substituir silenciosamente a nuvem.
- Um BKP completo do painel continua sendo uma restauração completa e pede confirmação.

## Boletos e capas

Imprima em **A4, paisagem, escala 100%, margens de 8 mm**, sem cabeçalhos/rodapés automáticos do navegador. As linhas horizontais do topo, meio e rodapé são iguais nas capas, contracapas e boletos. A área útil da folha é 281 × 194 mm; cada peça completa tem 281 × 97 mm. A divisória vertical para destacar a via do síndico foi preservada.

A impressão somente de contracapa ocupa uma metade da folha, com os mesmos limites de corte. Faça uma folha de conferência antes de imprimir o lote, pois a impressora pode aplicar escala própria.

## Conferir gastos do mês anterior

O botão permanece flutuante durante a rolagem. Arraste para reposicionar; a posição é lembrada no navegador. Um clique abre a comparação. Ele aparece quando o prédio tem um mês anterior fechado no histórico e fica oculto na impressão.

## O que foi retirado do ZIP

Executáveis antigos, versões/textos históricos, relatórios antigos, patches, fixtures, testes e a cópia duplicada `desktop-launcher/web`. Foram mantidos os arquivos de funcionamento, imagens utilizadas, modelos de importação, SQL de configuração e este manual. Os testes e o código do novo iniciador permanecem na área de trabalho desta análise, fora do pacote de uso.

## Correção específica da porta

O aviso antigo era exibido para qualquer falha ao abrir a porta. Agora o erro 10048 indica uso por outro processo e o erro 10013 indica bloqueio/reserva do Windows. Uma versão atual já aberta é reutilizada. Uma versão antiga identificada pode ser substituída após confirmação, mantendo a porta 38427 e a origem dos dados. Não foi adotada troca automática de porta.

## Alcance da verificação

27 cenários automatizados de integridade/transferência/concorrência aprovados; verificações no Chrome para salvar leituras, importar BKP, operar botões e medir cortes; inspeção visual do PDF de impressão; compilação e autoteste do iniciador Windows aprovados. O Supabase real, os aparelhos físicos e a impressora não foram acessados. O ambiente bloqueou o ensaio do servidor Windows via HTTP, portanto a abertura local completa deve ser conferida ao usar o pacote.

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

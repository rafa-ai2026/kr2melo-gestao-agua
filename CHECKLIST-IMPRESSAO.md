# Checklist de teste - KR2MELO v5.3.8

## Boletos

- Abrir `index.html#boletos`.
- Clicar em `Conferir impressão`.
- Testar os botões de impressão: capa, boletos, contracapa e bloco completo.
- Em `Regras por apartamento`, preencher um Valor adicional em um apartamento.
- Conferir se o valor adicional aparece separado no boleto e soma no total.
- Preencher observacoes gerais com 3 a 5 linhas, incluindo uma linha nova criada com Enter.
- Preencher uma observacao individual em pelo menos 1 apartamento.
- Clicar em `Salvar e atualizar boletos`.
- Conferir se a via do morador mostra as observacoes gerais e a observacao individual.
- Clicar em `Imprimir conjunto`.
- Na previa de impressao, usar A4, paisagem, escala 100%.
- Conferir se as linhas tracejadas dividem a folha em quatro partes iguais.
- Conferir se os textos de observacao ficam legiveis.
- Conferir se somente a via do Sindico tem uma area maior no lado esquerdo para grampear.
- Conferir se a via do Morador continua no tamanho normal.
- Conferir se a capa frontal mostra apenas Condominio, Vencimento e Proxima leitura.
- Conferir se a Proxima leitura aparece inteira, sem ficar escondida pela linha de corte.
- Conferir se a contracapa esta invertida para ficar com a impressao voltada para fora no bloco.
- Conferir se nao aparecem paginas de Ficha tecnica do bloco no conjunto dos boletos.

## Recibos

- Abrir `index.html#recibos`.
- Digitar um valor com centavos.
- Conferir se `Valor por extenso automatico` muda sozinho.
- Conferir se a previa mostra logo, faixa vermelha e assinatura.
- Imprimir em A4 retrato e conferir se o recibo ocupa meia folha.

## Sincronizacao

- Em um aparelho com nuvem configurada, enviar dados.
- Em outro aparelho, baixar e alterar uma leitura.
- Voltar ao primeiro aparelho e tentar enviar sem baixar antes.
- Conferir se o aviso de possivel sobrescrita da nuvem aparece.

## Leitura in loco no celular

- Abrir `mobile.html` no celular.
- Conferir se a tela mostra somente a rotina de leitura in loco.
- Conferir se nao aparecem botoes de foto, GPS, backup, ajuda, admin ou sincronizacao manual.
- Registrar uma leitura, salvar e conferir se o sistema avanca para a proxima unidade pendente.
- Conferir se Enter salva a leitura.
- Conferir se o botao Sem acesso marca a unidade como feita.

## Versao

- Conferir `index.html`, `mobile.html`, manifesto e cache mostrando `v5.3.8`.

## Leituras e lançamentos — v5.3.8

- Abrir `index.html#leituras`.
- Conferir que existe o bloco `Lançamentos e ajustes por apartamento` logo junto das leituras.
- Em um apartamento, preencher desconto/isenção, motivo, multa/outros, observação da multa, observação individual do boleto e adicionais.
- Testar um adicional positivo no formato `2ª via; 10,00`.
- Testar um abatimento negativo no formato `Abatimento combinado; -15,00`.
- Abrir `index.html#boletos` e conferir que os lançamentos individuais aparecem no boleto e que a tela Boletos não duplica esses campos.
- Conferir que o menu lateral não mostra mais `Regras e descontos`.

## Cálculo de água

- Abrir `index.html#configuracoes`.
- Em `Tarifa da água`, escolher `Planilha Bloco 1938 · mínimo + excedente`.
- Conferir os valores padrão: mínimo R$ 70,00, franquia 10 m³ e excedente R$ 7,00.
- Salvar e voltar para `Leituras`.
- Testar um apartamento com 8 m³: deve cobrar R$ 70,00.
- Testar um apartamento com 12 m³: deve cobrar R$ 84,00.
- Testar um apartamento com 20 m³: deve cobrar R$ 140,00.
- Conferir se o mesmo valor aparece no boleto e no modo leiturista.

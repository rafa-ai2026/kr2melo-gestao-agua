# KR²MELO Gestão de Água v5.1.5

## Prioridade: impressão segura dos boletos

Esta atualização mantém a mesma base de dados local (`kr2melo.hidrometro.v1`). Faça backup antes da substituição.

### Correção aplicada

- A folha de boletos continua em **A4 paisagem, quatro vias por página**.
- A grade de duas colunas por duas linhas agora usa alturas fixas, evitando que a linha inferior ultrapasse a A4.
- O conteúdo de cada via foi compactado com reserva de espaço para observações e assinatura.
- As guias serrilhadas vertical e horizontal foram preservadas e ficam sobre as divisões centrais.
- A área imprimível segue margens de 8 mm, reduzindo o risco de corte físico pela impressora.

### Como atualizar

1. Faça backup pelo botão de download do sistema.
2. Substitua todos os arquivos da versão anterior pela pasta desta versão.
3. Feche as abas abertas do sistema e pressione `Ctrl + F5`.
4. Em impressão, mantenha **A4 · Paisagem · Escala 100%**. Não escolha “Ajustar à página” caso o navegador ofereça essa opção.

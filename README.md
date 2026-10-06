# KR²MELO v5.3.34 — instruções

## Atualizar no Windows

Nesta versão, o iniciador identifica o processo dono da porta. Se reconhecer um servidor KR2MELO anterior, pede confirmação para encerrá-lo e abrir a versão atual no mesmo endereço. Salve as leituras em edição antes de confirmar. Um aplicativo diferente nunca é encerrado. Fechar uma aba do navegador não encerra o servidor antigo.

1. No programa anterior, baixe um BKP antes de atualizar.
2. Feche o programa anterior e extraia TODO o ZIP em uma pasta.
3. Abra `KR2MELO-v5.3.34-Windows.exe`. Mantenha o executável junto dos demais arquivos.
4. O iniciador abre `http://127.0.0.1:38427/index.html`, o mesmo endereço usado pela versão anterior. Use o mesmo navegador e perfil para continuar acessando os dados locais.
5. Confira condomínios, competência, apartamentos e leituras. Se necessário, restaure o BKP no painel.

O iniciador usa o .NET Framework do Windows (4.5 ou superior), serve somente arquivos do sistema e aceita conexões apenas do próprio computador. Não exige Node, Python ou Go. Se houver aviso de porta ocupada, encerre o programa anterior antes de abrir esta versão. Não execute diretamente de dentro do ZIP.

## Publicar no site existente

Substitua os arquivos HTML, JavaScript, CSS, manifesto, a pasta `assets/` e os modelos no mesmo endereço do site anterior. O executável e este manual não são necessários para hospedagem. Mantenha HTTPS para o funcionamento do app móvel e do armazenamento offline. O cache passa a ser v5.3.34; atualize a página e confira a versão no celular.

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

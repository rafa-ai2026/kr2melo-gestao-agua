# KR²MELO v5.2 — Reset seguro, sincronização e dashboard anual

## Novidades

- **Reset total seguro:** baixa um backup JSON antes de apagar dados locais, fotos, históricos, recibos, regras e condomínios. A confirmação exige a frase `RESETAR TODOS OS DADOS`.
- **Dashboard anual:** consolida consumo, água, condomínio, descontos, serviço, outros e cobrança total por competência; inclui gráfico, tabela, CSV e impressão A4 retrato.
- **Sincronização real entre computador e celular:** integrada a Supabase, com login por e-mail, cópia remota protegida por RLS e sincronização automática opcional.

## Ativar sincronização

1. Crie um projeto Supabase.
2. Ative o provedor de autenticação por e-mail.
3. Abra **SQL Editor** e execute o conteúdo de `supabase-setup.sql`.
4. No site, abra **Sincronização** e informe a URL do projeto e a chave **anon/publishable**.
5. Crie uma conta e entre com o mesmo e-mail/senha no computador e no celular.
6. No aparelho que contém os dados atuais, clique **Enviar para nuvem**.
7. No segundo aparelho, clique **Baixar da nuvem** antes de fazer qualquer alteração.

### Segurança

- Nunca informe a chave `service_role` no sistema.
- A cópia na nuvem contém leituras, moradores, valores, regras e históricos. Use uma senha forte.
- Fotos tiradas pelo modo leiturista permanecem armazenadas apenas no aparelho que as capturou.
- Quando dois dispositivos alteram os mesmos dados sem baixar a versão mais recente, prevalece a última gravação enviada. Para reduzir risco, use **Baixar da nuvem** antes de iniciar uma nova rodada de leituras em outro aparelho.

## Atualização no GitHub Pages

Envie todos os arquivos internos desta pasta para a raiz do repositório, incluindo `sync.js`, `supabase-setup.sql` e a pasta `assets`.

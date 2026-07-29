## Não, não está certo

O log mostra o problema exato na linha 13-14:

```text
[WRN] ❌ [FlexAmbiental] Erro ao consultar checksums de clientes: Unauthorized
[INF] ✅ [FlexAmbiental] 0 checksums carregados para comparação de clientes
```

Sem checksums carregados, o integrador considera **todos** os clientes como "novos/alterados" e reenvia a base inteira a cada execução (~1,3s por cliente). Como a tarefa das caçambas roda a cada 5 min, ela nunca termina um ciclo completo — só avança do 00000004 até ~00001032 e é descartada.

### Causa confirmada

`ClubeFlex.Integrador/Services/ProjectSyncLogService.cs` (linha 267) consulta a tabela `sync_logs` **direto via PostgREST** usando a chave anon:

```text
GET {baseUrl}/rest/v1/sync_logs?event_type=eq.cliente&status=eq.success...
```

No ClubeFlex isso ainda funciona, mas no projeto FlexAmbiental a tabela `sync_logs` não dá acesso de leitura ao papel anon (RLS/GRANT), então a resposta é 401 Unauthorized. O código só loga um warning e segue com dicionário vazio — falha silenciosa que vira reenvio total.

## O que fazer

1. **Trocar a leitura de checksums de PostgREST para Edge Function.** Estender `supabase/functions/sync-log/index.ts` para aceitar `action: "checksums"` com `event_type` e paginação, retornando `[{event_id, checksum}]` usando a service role (que ignora RLS). Edge Functions aceitam a chave anon no header, então funciona nos dois projetos.

2. **Ajustar `ProjectSyncLogService.GetChecksumsAsync`** para chamar `POST {functionsUrl}/sync-log` com essa ação, mantendo a paginação de 1000 em 1000 e a sentinela `__no_checksum__`.

3. **Falhar alto em vez de reenviar tudo.** Se a consulta de checksums retornar erro, abortar a sincronização daquele tipo de evento com log `[ERROR]` em vez de assumir "0 checksums = tudo novo". Um erro de rede jamais deve disparar reenvio total da base.

4. **Replicar a Edge Function no projeto FlexAmbiental** (Supabase separado). Vou entregar o código pronto para colar lá — sem isso, o FlexAmbiental continua sem checksums.

### Detalhes técnicos

- Arquivos alterados aqui: `supabase/functions/sync-log/index.ts`, `ClubeFlex.Integrador/Services/ProjectSyncLogService.cs`, `ClubeFlex.Integrador/Services/SyncService.cs` (tratar o novo retorno de falha).
- As duas linhas `EXEC_FlexAmbiental_...` no log são esperadas: uma é o log local do projeto, outra o log central no ClubeFlex.
- Depois disso será necessário recompilar (`dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true`) e substituir o `.exe` no servidor.

### Resultado esperado

Primeira execução após o deploy ainda envia o que estiver realmente pendente; a partir daí cada ciclo de 5 min envia apenas clientes com checksum diferente — normalmente dezenas, não milhares.


# Plano: tratar títulos cancelados (caso Ipeuna 000151664)

## Como o sistema reconhece um cancelamento (já implementado)

O integrador já lê o campo `FLAGCANCELADA` da tabela `CONTARECEBER` e mapeia:

- `FLAGCANCELADA = 'S'` → envia o título com `status = 'C'`
- `FLAGPAGO = 'S'` → envia com `status = 'P'`
- caso contrário → `status = 'A'` (aberto)

A query de busca de títulos (`GetReceivablesAsync`) **inclui cancelados** quando o vencimento é a partir de 01/02/2026 — que é o caso do título 000151664 (venc. 27/04/2026). E a edge function `titulo-criado` faz upsert do campo `status` na tabela `receivables`.

Em teoria, basta o integrador rodar uma vez após o cancelamento no Cplus que o status no Financeiro vira `C`. **Mas há dois problemas reais que precisamos resolver:**

## Problemas identificados

### 1. O painel do Financeiro não enxerga títulos cancelados como "removidos"

Hoje a tabela `receivables` recebe `status = 'C'`, mas o frontend do painel financeiro não filtra/oculta esses títulos. Eles continuam aparecendo na lista de dívidas, soma de saldo, régua de cobrança etc.

### 2. Sem visibilidade de quando um título foi cancelado

Não existe `cancelled_at` nem log explícito. Se um título mudar de `A` para `C` e voltar para `A` (o que pode acontecer se o operador desmarcar no ERP), perdemos o histórico.

### 3. O bug de checksum descoberto na investigação anterior pode bloquear o reenvio

Se o último envio do título 000151664 ficou com `status='error'` no `sync_logs`, o checksum salvo bloqueia novos envios — mesmo que o status no ERP tenha mudado.

## O que vamos fazer

### Passo 1 — Diagnóstico imediato do título 000151664

Rodar duas consultas (uma no Firebird do servidor Cplus, outra no Supabase do Financeiro) para confirmar o estado atual:

**No Cplus (Firebird):**
```sql
SELECT CODCR, CODCLI, VALOR, DATVENC, FLAGPAGO, FLAGCANCELADA, OBS
FROM CONTARECEBER
WHERE CODCR = 151664;
```
Esperado: `FLAGCANCELADA = 'S'`.

**No Supabase do Financeiro:**
```sql
SELECT receivable_id_ext, status, balance, updated_at
FROM receivables
WHERE receivable_id_ext = '000151664';

SELECT event_id, status, error_message, payload, created_at, updated_at
FROM sync_logs
WHERE event_id = 'TIT_000151664'
ORDER BY created_at DESC LIMIT 5;
```

A partir do resultado, decidimos:
- Se `sync_logs.status = 'error'` para esse título → **deletar a linha** para destravar o checksum, e rodar o integrador.
- Se nunca foi reenviado após o cancelamento → o próximo `run-sync.bat` resolve sozinho.

### Passo 2 — Criar uma migração para adicionar visibilidade

Adicionar à tabela `receivables` no projeto **Financeiro** (Supabase `njjybkxugplmsexvqqtu`):

- Coluna `cancelled_at TIMESTAMPTZ` — preenchida automaticamente quando `status` muda para `C`.
- Trigger `BEFORE UPDATE` que registra o timestamp na primeira vez que `status='C'` aparecer.

### Passo 3 — Filtrar cancelados nas telas e métricas

No painel admin do Financeiro:
- Lista de títulos: por padrão, ocultar `status='C'`. Adicionar toggle "Mostrar cancelados" e badge cinza "Cancelado" quando exibidos.
- Soma de saldo devedor: excluir `status IN ('C','P')`.
- Régua de cobrança: nunca disparar para cancelados.

### Passo 4 — Tratar o bug de checksum (escopo desta correção)

Modificar o método `GetReceivableChecksumsAsync` (e o equivalente para pagamentos) no integrador para **só reaproveitar checksum quando o último envio foi `success`**. Se o último envio foi `error`, o registro entra de novo na fila normalmente.

Isso impede que erros transitórios (ex: edge function fora do ar por 30s) deixem títulos travados sem reenvio futuro.

### Passo 5 — Procedimento manual para o título 000151664 (se Passo 1 mostrar que está travado)

```sql
-- No Supabase do Financeiro
DELETE FROM sync_logs WHERE event_id = 'TIT_000151664';
```

Depois rodar `run-sync.bat` no servidor Windows. O título será reenviado, agora com `status='C'`, e a edge function fará o upsert.

## Detalhes técnicos

### Arquivos que serão alterados

- `ClubeFlex.Integrador/Services/ProjectSyncLogService.cs` — passar a retornar `(checksum, status)` em vez de só `checksum`; expor método novo `GetReceivableChecksumsAsync` que ignora linhas com `status='error'`.
- `ClubeFlex.Integrador/Services/DatabaseService.cs` — ajustar `GetReceivablesAsync` e `GetReceivablePaymentsAsync` para usar a nova estrutura (continua compatível: dicionário ainda é `Dictionary<string,string>`, mas só populado com checksums de envios bem-sucedidos).
- Migração SQL no projeto Financeiro: adicionar `cancelled_at` em `receivables` + trigger.
- Frontend do Financeiro: filtros de status na listagem e nas métricas.

### Onde o status é gravado hoje

```text
Firebird CONTARECEBER.FLAGCANCELADA='S'
        │
        ▼
DatabaseService.cs L877  →  payload.Status = "C"
        │
        ▼
edge function titulo-criado  →  receivables.status = 'C' (upsert)
```

A pipeline está correta. O que falta é (a) garantir que o reenvio aconteça quando o flag mudar e (b) o painel respeitar o status.

### O que não vamos fazer

- Não deletar fisicamente o título da tabela `receivables`. Manter o registro com `status='C'` é importante para auditoria e para reverter caso o operador descancele no ERP.
- Não mexer no Cplus / Firebird — toda a fonte de verdade continua sendo o ERP.

## Próximos passos após aprovação

1. Você roda as duas consultas do Passo 1 e me passa o resultado.
2. Eu aplico a correção de checksum + a migração `cancelled_at` + os filtros no painel.
3. Você roda o `run-sync.bat` (ou eu te ajudo a destravar via `DELETE FROM sync_logs` se for o caso).
4. Validamos no painel que o 000151664 desapareceu da lista de dívidas em aberto.

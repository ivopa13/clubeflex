# Tratamento de títulos cancelados no Financeiro

Este documento explica como cancelamentos no ERP Cplus chegam ao painel
Financeiro (Supabase `njjybkxugplmsexvqqtu`) e o que fazer para destravar
casos específicos como o **título 000151664 (Ipeuna Negócios)**.

---

## 1. Como o cancelamento flui hoje

```
ERP Cplus (Firebird)                         Integrador C#                              Supabase Financeiro
-------------------------                    -------------------------                  -------------------------
CONTARECEBER.FLAGCANCELADA = 'S'  ───►       GetReceivablesAsync                ───►    edge: titulo-criado
                                             status = "C"                               receivables.status = 'C'
                                             checksum recalculado (status entra
                                             no MD5: amount|paid|balance|status|venc)
```

Pontos importantes:

- O integrador **só captura cancelamentos para títulos com `DATVENC >= 2026-02-01`**
  (filtro `SyncReceivablesFullFromDate` no `appsettings.json` do projeto Financeiro).
  Títulos antigos só viajam se ainda estiverem em aberto.
- O integrador roda a cada 5 minutos via Agendador de Tarefas do Windows
  (`run-sync.bat`). Após o operador cancelar no Cplus, leva no máximo
  ~10 minutos para o status virar `C` no Financeiro.
- A edge function `titulo-criado` faz **upsert por `receivable_id_ext`**, então
  rodar de novo é seguro: idempotente.

---

## 2. SQL da migração para o projeto Financeiro

Execute este SQL **no projeto Supabase do Financeiro** (`njjybkxugplmsexvqqtu`),
não no ClubeFlex. Ele adiciona `cancelled_at` e um trigger que preenche o
timestamp automaticamente quando o status vira `C`.

```sql
-- 1) Adicionar coluna
ALTER TABLE public.receivables
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- 2) Trigger function
CREATE OR REPLACE FUNCTION public.set_receivable_cancelled_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Marcar quando passa para cancelado
  IF NEW.status = 'C' AND (OLD.status IS DISTINCT FROM 'C') THEN
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, NOW());
  END IF;

  -- Limpar quando volta para aberto/pago (operador descancelou no ERP)
  IF NEW.status <> 'C' AND OLD.status = 'C' THEN
    NEW.cancelled_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Trigger
DROP TRIGGER IF EXISTS trg_receivables_cancelled_at ON public.receivables;
CREATE TRIGGER trg_receivables_cancelled_at
BEFORE UPDATE OF status ON public.receivables
FOR EACH ROW
EXECUTE FUNCTION public.set_receivable_cancelled_at();

-- 4) Backfill: para títulos já cancelados, gravar cancelled_at = updated_at
UPDATE public.receivables
SET cancelled_at = updated_at
WHERE status = 'C' AND cancelled_at IS NULL;

-- 5) Índice para consultas rápidas (régua de cobrança ignora cancelados)
CREATE INDEX IF NOT EXISTS idx_receivables_status_balance
ON public.receivables (status, balance)
WHERE status NOT IN ('C', 'P');
```

---

## 3. Filtros recomendados no painel Financeiro

No frontend do projeto Financeiro:

- **Lista de títulos a receber**: por padrão, filtrar `status NOT IN ('C')`.
  Adicionar toggle "Mostrar cancelados" exibindo badge cinza "Cancelado em
  DD/MM/YYYY" usando `cancelled_at`.
- **Soma de saldo devedor (KPI)**: filtrar `status NOT IN ('C', 'P')`.
- **Régua de cobrança**: nunca disparar para títulos com `status = 'C'`.

---

## 4. Procedimento para o título 000151664

### Passo A — Confirmar que foi cancelado no ERP

No Cplus, na máquina servidor (Firebird), rodar:

```sql
SELECT CODCR, CODCLI, VALOR, DATVENC, FLAGPAGO, FLAGCANCELADA, OBS
FROM CONTARECEBER
WHERE CODCR = 151664;
```

Esperado: `FLAGCANCELADA = 'S'`.

### Passo B — Conferir o estado atual no Financeiro

No SQL do Supabase do Financeiro:

```sql
SELECT receivable_id_ext, status, balance, cancelled_at, updated_at
FROM receivables
WHERE receivable_id_ext = '000151664';

SELECT event_id, status, error_message,
       payload->>'status' AS payload_status,
       payload->>'checksum' AS payload_checksum,
       created_at, updated_at
FROM sync_logs
WHERE event_id = 'TIT_000151664'
ORDER BY created_at DESC LIMIT 5;
```

Possíveis resultados e ações:

| `receivables.status` | Último `sync_logs.payload_status` | Ação |
|----------------------|-----------------------------------|------|
| `C`                  | `C`                               | Já está OK. Frontend que precisa filtrar. |
| `A`                  | `A` (sucesso)                     | Integrador ainda não rodou após cancelamento. Rodar `run-sync.bat`. |
| `A`                  | `C` (erro)                        | Edge function rejeitou. Olhar `error_message`. |
| `A`                  | (nenhum log recente após cancelamento) | Forçar reenvio: ver Passo C. |

### Passo C — Forçar reenvio se o checksum estiver "preso"

O integrador pula reenvios quando o checksum não muda. Como o `status` faz
parte do checksum (`amount|paid|balance|status|due_date`), uma mudança de
`A` para `C` **deve** disparar reenvio automaticamente. Se mesmo assim não
estiver acontecendo (caso raro), apague o log para destravar:

```sql
DELETE FROM sync_logs WHERE event_id = 'TIT_000151664';
```

E rode `run-sync.bat` no servidor Windows. O título será reenviado, agora
com `status = 'C'`, e o trigger preencherá `cancelled_at` automaticamente.

### Passo D — Validar

```sql
SELECT receivable_id_ext, status, cancelled_at, updated_at
FROM receivables
WHERE receivable_id_ext = '000151664';
```

Esperado: `status = 'C'`, `cancelled_at` preenchido.

---

## 5. Observações de segurança

- **Nunca** apagar a linha de `receivables`. Manter com `status = 'C'` é
  importante para auditoria e para reverter caso o operador descancele no
  ERP (o integrador trataria isso automaticamente: `FLAGCANCELADA` voltaria
  para nulo, status voltaria para `A`, trigger limparia `cancelled_at`).
- **Nunca** mexer no Cplus / Firebird. A fonte de verdade é sempre o ERP.
- O integrador só lê do Firebird (somente-leitura, garantido por código).

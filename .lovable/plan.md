

## Plano: Limpeza ClubeFlex + Filtro Inteligente Financeiro

Duas ações distintas:

---

### 1. ClubeFlex — Deletar dados anteriores a 2026

Executar limpeza no banco de dados deste projeto, removendo registros com `created_at < '2026-01-01'` nas seguintes tabelas (respeitando a ordem de dependências):

```text
Ordem de deleção (por foreign keys):
1. whatsapp_notifications  (ref invoices)
2. redemption_items        (ref redemptions)
3. redemptions             (ref customers/specifiers)
4. points_ledger           (ref invoices)
5. payments                (ref invoices)
6. invoices                (ref customers)
7. sync_logs               (onde created_at < 2026)
8. integrator_executions   (onde created_at < 2026)
9. validation_errors       (onde created_at < 2026)
10. webhook_events         (onde processed_at < 2026)
```

Isso será feito via migration SQL com DELETEs em cascata.

---

### 2. Financeiro (Integrador) — Filtro por período

Modificar a query `GetReceivablesAsync` no `DatabaseService.cs` para aplicar lógica condicional:

- **Títulos com vencimento antes de 01/02/2026**: sincronizar apenas os **em aberto** (não pagos, não cancelados) — são as dívidas atrasadas do histórico
- **Títulos com vencimento a partir de 01/02/2026**: sincronizar **todos** (abertos, pagos, cancelados)

Alteração na query SQL do Firebird:

```sql
-- Adicionar ao WHERE existente:
AND (
  cr.DATVENC >= '2026-02-01'                          -- Fev/2026+: tudo
  OR (
    (cr.FLAGPAGO IS NULL OR cr.FLAGPAGO <> 'S')       -- OU: apenas abertos
    AND (cr.FLAGCANCELADA IS NULL OR cr.FLAGCANCELADA <> 'S')
  )
)
```

Para os pagamentos de títulos (`GetReceivablePaymentsAsync`): sincronizar apenas pagamentos com data a partir de 01/02/2026, pois pagamentos antigos de títulos já quitados não serão enviados.

Adicionar ao `ProjectConfig` uma propriedade opcional `SyncReceivablesFullFromDate` (default: null) para tornar o corte configurável via `appsettings.json`, sem hard-code.

**Configuração no appsettings.json:**
```json
{
  "Name": "Financeiro",
  "SyncReceivablesFullFromDate": "2026-02-01",
  ...
}
```

---

### Resumo do comportamento final

| Projeto | Dados sincronizados |
|---------|-------------------|
| ClubeFlex | Apenas faturas e pagamentos de 2026 em diante |
| Financeiro | Títulos abertos/atrasados de todo histórico + tudo a partir de Fev/2026 |

### Arquivos modificados

| Arquivo | Alteração |
|---------|----------|
| Migration SQL (novo) | DELETEs de dados pré-2026 no ClubeFlex |
| `DatabaseService.cs` | Filtro condicional por status + data na query de títulos |
| `ProjectConfig.cs` | Nova propriedade `SyncReceivablesFullFromDate` |
| `appsettings.json` | Configuração `SyncReceivablesFullFromDate: "2026-02-01"` no projeto Financeiro |


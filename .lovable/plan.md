

# Plano: Sincronização Contínua de Títulos (com Atualizações)

## Problema Identificado

O integrador atual **pula** títulos já sincronizados usando o `event_id`:
```csharp
if (syncedEventIds.Contains(eventId))
{
    Log.Debug($"⏭️ Pulando título {receivableId} - já sincronizado");
    continue;  // ❌ PROBLEMA: Título pode ter mudado!
}
```

Mas títulos podem mudar de status:
- **Pagamento parcial**: TOTPAGO aumenta, balance diminui
- **Pagamento total**: FLAGPAGO = 'S' (sai da query)
- **Cancelamento**: FLAGCANCELADA = 'S' (sai da query)

## Solução Proposta

### Estratégia: "Full Sync" para Títulos em Aberto

Em vez de "sincronizar uma vez e nunca mais", o integrador deve:

1. **Sempre enviar todos os títulos em aberto** - A Edge Function usa UPSERT, então atualiza automaticamente
2. **Remover o filtro de "já sincronizado"** - Para títulos, queremos reprocessar
3. **Controlar por timestamp** - Usar `updated_at` no Supabase para saber quando atualizou

### Mudanças no Integrador C#

**Arquivo:** `DatabaseService.cs`

Remover o skip por syncedEventIds para receivables:

```csharp
// ANTES (problemático):
if (syncedEventIds != null && syncedEventIds.Contains(eventId))
{
    continue;  // Pula mesmo se título mudou!
}

// DEPOIS (correto):
// Para receivables, SEMPRE processar - a Edge Function faz UPSERT
// O filtro já é: WHERE FLAGPAGO = 'N' AND FLAGCANCELADA = 'N'
// Títulos pagos/cancelados simplesmente não aparecem mais
```

**Arquivo:** `SyncService.cs`

Não consultar `syncedEventIds` para receivables:

```csharp
// ANTES:
var syncedReceivables = await syncLogService.GetSuccessfulEventIdsAsync("titulo");
var receivables = await _databaseService.GetReceivablesAsync(limit, _syncFromDate, syncedReceivables, ignoreFromDate);

// DEPOIS:
// Para régua de cobrança, precisamos atualizar títulos existentes
// Não passar syncedEventIds - sempre reprocessar títulos em aberto
var receivables = await _databaseService.GetReceivablesAsync(limit, _syncFromDate, null, ignoreFromDate);
```

### Mudança no sync_log

Atualizar o status do log para refletir "atualização":

```csharp
// No SyncService, ao enviar título:
var logStatus = "success";  // ou "updated" se quisermos diferenciar
```

---

## Fluxo Após Implementação

```text
Execução 1:
  ERP: 1000 títulos em aberto
  → Integrador envia todos 1000
  → Supabase: INSERT 1000 novos

Execução 2 (1 hora depois):
  ERP: 980 títulos em aberto (20 foram pagos)
  → Integrador envia 980
  → Supabase: UPSERT = UPDATE 980 existentes
  → Os 20 pagos NÃO aparecem mais na query do ERP (FLAGPAGO = 'S')

Execução 3 (dia seguinte):
  ERP: 1050 títulos em aberto (70 novos, 50 pagos)
  → Integrador envia 1050
  → Supabase: INSERT 70 novos + UPDATE 980 existentes
```

---

## Tratamento de Títulos Pagos no Supabase

Títulos pagos no ERP não são mais retornados pela query (FLAGPAGO = 'S'). No Supabase, temos duas opções:

### Opção A: Marcar como Pago via `titulo-pago` (Atual)
- O integrador chama a Edge Function `titulo-pago` separadamente
- Atualiza status para 'P' no Supabase

### Opção B: Atualização Automática (Recomendada)
- Criar um job diário que verifica títulos "órfãos" no Supabase
- Se título está no Supabase mas não foi atualizado há X horas, verificar status
- Ou adicionar lógica no integrador para sincronizar pagamentos

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `DatabaseService.cs` | Remover skip por syncedEventIds em GetReceivablesAsync |
| `SyncService.cs` | Passar null em vez de syncedReceivables |

---

## Considerações de Performance

Com a remoção do skip, **todas** as execuções enviarão todos os títulos em aberto. Para otimizar:

1. **Aumentar BatchSize** para 500 ou 1000
2. **A Edge Function usa UPSERT** - não há duplicação, só atualização
3. **Volume estimado**: Se você tem ~1000 títulos em aberto, cada execução envia ~1000 requests
4. **Alternativa futura**: Comparar checksum/hash do título para enviar apenas os que realmente mudaram

---

## Benefícios

1. **Dados sempre atualizados**: Saldo, dias de atraso recalculados a cada sync
2. **Régua de cobrança precisa**: Estágio do cliente reflete situação real
3. **Títulos pagos "somem"**: Não são mais enviados pelo ERP
4. **Simples de implementar**: Apenas remover o skip


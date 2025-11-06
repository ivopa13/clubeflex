# 🧪 Guia de Testes do Integrador Clube Flex

## 📋 Configuração para Testes

### 1️⃣ Teste com 10 Registros Mais Recentes

Edite o `appsettings.json`:

```json
{
  "SyncSettings": {
    "BatchSize": 100,
    "RetryAttempts": 3,
    "RetryDelaySeconds": 30,
    "TestMode": true,          // ✅ Ativar modo teste
    "TestModeLimit": 10,        // ✅ Limitar a 10 registros
    "SyncFromDate": null        // ❌ Não filtrar por data
  }
}
```

**O que acontece:**
- ✅ Sincroniza apenas os **10 registros mais recentes** (faturas e pagamentos)
- ✅ Perfeito para validar se a integração está funcionando
- ✅ Não sobrecarrega o sistema

---

### 2️⃣ Sincronizar Apenas Registros a Partir de Hoje

Edite o `appsettings.json`:

```json
{
  "SyncSettings": {
    "BatchSize": 100,
    "RetryAttempts": 3,
    "RetryDelaySeconds": 30,
    "TestMode": false,              // ❌ Desativar modo teste
    "TestModeLimit": 10,
    "SyncFromDate": "2025-01-15"    // ✅ Data de hoje (YYYY-MM-DD)
  }
}
```

**O que acontece:**
- ✅ Ignora todo o histórico antigo
- ✅ Sincroniza apenas faturas/pagamentos criados **a partir de 15/01/2025**
- ✅ Ideal para começar "do zero" sem processar histórico

---

### 3️⃣ Produção Normal (Sem Limites)

Edite o `appsettings.json`:

```json
{
  "SyncSettings": {
    "BatchSize": 100,
    "RetryAttempts": 3,
    "RetryDelaySeconds": 30,
    "TestMode": false,      // ❌ Desativar modo teste
    "TestModeLimit": 10,
    "SyncFromDate": null    // ❌ Não filtrar por data
  }
}
```

**O que acontece:**
- ✅ Sincroniza **todos os registros** não enviados
- ✅ Processa histórico completo (100 por vez)
- ✅ Modo produção padrão

---

## 🚀 Passo a Passo de Teste Recomendado

### Fase 1: Teste Inicial (10 registros)
```json
"TestMode": true,
"TestModeLimit": 10,
"SyncFromDate": null
```

1. Execute: `ClubeFlex.Integrador.exe`
2. Verifique nos logs se os 10 registros foram enviados com sucesso
3. Acesse o portal admin e confirme que os dados apareceram

---

### Fase 2: Sincronização a Partir de Hoje
```json
"TestMode": false,
"TestModeLimit": 10,
"SyncFromDate": "2025-01-15"  // Data de hoje
```

1. Execute novamente
2. Agora ele vai sincronizar todos os registros **a partir de hoje**
3. Histórico antigo será ignorado

---

### Fase 3: Produção (histórico completo)
```json
"TestMode": false,
"TestModeLimit": 10,
"SyncFromDate": null
```

1. Execute e deixe processar todo o histórico
2. Configure o agendador para rodar automaticamente
3. Monitore os logs de sincronização

---

## 📊 Como Interpretar os Logs

### ✅ Modo Teste Ativado
```
⚠️ MODO TESTE ATIVADO - Sincronizando apenas 10 registros mais recentes
```

### 📅 Filtro de Data Ativado
```
📅 Sincronizando apenas registros a partir de 15/01/2025
```

### ✓ Sucesso
```
✓ Fatura FAT_12345 enviada com sucesso
Faturas processadas: 10 sucesso, 0 erros
```

### ✗ Erro
```
✗ Erro ao enviar fatura FAT_12345: 400 - Bad Request
Faturas processadas: 8 sucesso, 2 erros
```

---

## 🔍 Verificação no Banco de Dados

Consulte a tabela `sync_log` para ver o histórico:

```sql
-- Ver últimas 20 sincronizações
SELECT 
    event_type,
    event_id,
    status,
    attempts,
    created_at,
    error_message
FROM sync_log
ORDER BY created_at DESC
FETCH FIRST 20 ROWS ONLY;

-- Contar sucessos e erros
SELECT 
    status,
    COUNT(*) as quantidade
FROM sync_log
GROUP BY status;
```

---

## ⚙️ Dicas Importantes

1. **Sempre teste primeiro com `TestMode: true`** antes de processar todo o histórico
2. **Use `SyncFromDate`** se não quiser processar faturas antigas
3. **Monitore os logs** durante a primeira execução completa
4. **Verifique a tabela `sync_log`** para identificar erros
5. **Ajuste `BatchSize`** se precisar processar mais/menos registros por vez

---

## 🆘 Troubleshooting

### Problema: "Nenhuma fatura nova para sincronizar"
- Verifique se há registros na tabela `MOVENDA` do Firebird
- Confirme que a tabela `sync_log` foi criada corretamente
- Teste com `TestMode: true` para ver os 10 mais recentes

### Problema: "Erro 400 - Bad Request"
- Verifique se os dados no Firebird estão completos (CPF/CNPJ, nome, etc.)
- Confira os logs da edge function para ver o erro específico
- Valide o formato da data (deve ser YYYY-MM-DD)

### Problema: "Timeout na API"
- Reduza o `BatchSize` para processar menos registros por vez
- Aumente o `RetryDelaySeconds` para dar mais tempo entre tentativas

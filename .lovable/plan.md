# Integrador Multi-Projeto - Implementação Concluída ✅

## Status: IMPLEMENTADO

O integrador C# (`ClubeFlex.Integrador`) foi atualizado para v2.0 com suporte a múltiplos projetos Lovable simultaneamente.

---

## Arquivos Criados

| Arquivo | Descrição |
|---------|-----------|
| `Models/ProjectConfig.cs` | Configuração por projeto (Name, BaseUrl, ApiKey, flags de sync) |
| `Models/TituloPayload.cs` | Payload para títulos a receber (CONTARECEBER) |
| `Services/ProjectApiService.cs` | Serviço de API genérico por projeto |
| `Services/ProjectSyncLogService.cs` | Serviço de logs por projeto |

## Arquivos Modificados

| Arquivo | Mudanças |
|---------|----------|
| `appsettings.json` | Novo formato com array `Projects[]` |
| `Services/DatabaseService.cs` | Adicionado `GetReceivablesAsync()` para CONTARECEBER |
| `Services/SyncService.cs` | Refatorado completamente para multi-projeto |
| `Program.cs` | Atualizado para v2.0 |
| `README.md` | Documentação atualizada |

---

## Como Funciona

### Configuração Multi-Projeto

```json
{
  "Projects": [
    {
      "Name": "ClubeFlex",
      "BaseUrl": "https://xxx.supabase.co/functions/v1",
      "ApiKey": "...",
      "SyncInvoices": true,
      "SyncPayments": true,
      "SyncReceivables": false
    },
    {
      "Name": "SistemaCobrancas",
      "BaseUrl": "https://yyy.supabase.co/functions/v1",
      "ApiKey": "...",
      "SyncInvoices": false,
      "SyncPayments": false,
      "SyncReceivables": true
    }
  ]
}
```

### Opções de Sincronização

| Flag | Descrição | Tabelas CPlus |
|------|-----------|---------------|
| `SyncInvoices` | Faturas/vendas | MOVENDA, CLIENTE, TRANSPORTADORA |
| `SyncPayments` | Pagamentos | CONTARECEBERREC, MOVENDAREC, CHEQUES |
| `SyncReceivables` | Títulos a receber | CONTARECEBER, CLIENTE |

### Fluxo de Execução

```
1. Carrega configurações
2. Para cada projeto válido:
   a. Testa conectividade com API
   b. Inicia rastreamento de execução
   c. Se SyncInvoices → sincroniza MOVENDA
   d. Se SyncPayments → sincroniza CONTARECEBERREC + MOVENDAREC + CHEQUES
   e. Se SyncReceivables → sincroniza CONTARECEBER
   f. Finaliza execução com estatísticas
3. Gera logs consolidados
```

---

## Próximos Passos para Novo Projeto

1. **Criar novo projeto Lovable** para Sistema de Cobranças
2. **Configurar tabelas** no novo projeto:
   - `customers` (mesma estrutura)
   - `receivables` (títulos a receber)
   - `receivable_payments` (pagamentos de títulos)
3. **Criar Edge Functions** no novo projeto:
   - `titulo-criado` - Recebe títulos do ERP
   - `titulo-pago` - Recebe confirmação de pagamento
   - `sync-log` - Logs de sincronização
   - `integrator-execution` - Rastreamento de execuções
4. **Atualizar appsettings.json** com os dados do novo projeto
5. **Testar sincronização** em paralelo

---

## Estrutura do Payload de Títulos (TituloPayload)

```json
{
  "event_id": "TIT_98765",
  "source": "erp_windows",
  "receivable_id_ext": "98765",
  "invoice_id_ext": "12345",
  "amount": 500.00,
  "paid_amount": 0.00,
  "balance": 500.00,
  "due_date": "2025-02-15",
  "issued_at": "2025-01-15",
  "installment_number": 1,
  "total_installments": 3,
  "status": "A",
  "days_overdue": 0,
  "is_overdue": false,
  "customer": {
    "id_ext": "C001",
    "name": "João Silva",
    "cpf": "12345678900",
    "phone": "(19) 99999-9999"
  }
}
```

---

## Compatibilidade

O integrador mantém compatibilidade com a configuração legada:

```json
{
  "ClubeFlexApi": {
    "BaseUrl": "...",
    "ApiKey": "..."
  }
}
```

Se não houver `Projects[]`, o sistema usa `ClubeFlexApi` como projeto único com `SyncInvoices=true` e `SyncPayments=true`.

---

## Estrutura de Tabelas para Novo Projeto

```text
+------------------+     +----------------------+
|    customers     |     |     receivables      |
+------------------+     +----------------------+
| id (uuid)        |<----| customer_id (uuid)   |
| customer_id_ext  |     | receivable_id_ext    |
| name             |     | invoice_id_ext       |
| doc (cpf/cnpj)   |     | amount               |
| phone            |     | paid_amount          |
| email            |     | balance              |
+------------------+     | due_date             |
                         | issued_at            |
                         | installment_number   |
                         | total_installments   |
                         | status               |
                         | days_overdue         |
                         | is_overdue           |
                         | created_at           |
                         +----------------------+
                                  |
                                  v
                    +------------------------+
                    |  receivable_payments   |
                    +------------------------+
                    | receivable_id (uuid)   |
                    | paid_amount            |
                    | paid_at                |
                    | payment_type           |
                    +------------------------+
```

---

## ✅ Implementação Concluída

O integrador está pronto para receber a configuração do novo projeto quando ele for criado no Lovable.

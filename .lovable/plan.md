
# Analise: Compartilhar Integrador entre Projetos

## Contexto Atual

O integrador C# (`ClubeFlex.Integrador`) atualmente:

1. **Le do banco Firebird (CPlus)** - Tabelas: MOVENDA, CLIENTE, TRANSPORTADORA, CONTARECEBERREC, MOVENDAREC, CHEQUES
2. **Envia para Lovable Cloud** - Edge Functions: `fatura-criada`, `pagamento-confirmado`, `sync-log`, `integrator-execution`
3. **Configuracao fixa** - `appsettings.json` aponta para um unico projeto Supabase

---

## Opcoes de Arquitetura

### Opcao A: Integrador Unico com Multiplos Destinos (RECOMENDADA)

Modificar o integrador para enviar dados para multiplos projetos Lovable simultaneamente.

**Vantagens:**
- Uma unica instalacao no servidor Windows
- Compartilha a conexao com o banco Firebird
- Cada projeto recebe apenas os dados relevantes

**Estrutura proposta no `appsettings.json`:**

```json
{
  "ConnectionStrings": {
    "LocalDatabase": "DataSource=localhost;Database=..."
  },
  "Projects": [
    {
      "Name": "ClubeFlex",
      "BaseUrl": "https://skhljdaqfzweshjrlcnn.supabase.co/functions/v1",
      "ApiKey": "...",
      "SyncInvoices": true,
      "SyncPayments": true,
      "SyncReceivables": false
    },
    {
      "Name": "SistemaCobrancas",
      "BaseUrl": "https://NOVO_PROJETO.supabase.co/functions/v1",
      "ApiKey": "...",
      "SyncInvoices": false,
      "SyncPayments": false,
      "SyncReceivables": true
    }
  ]
}
```

---

### Opcao B: Integradores Separados

Duplicar o projeto do integrador para cada sistema.

**Desvantagens:**
- Multiplas conexoes ao mesmo banco Firebird
- Manutencao duplicada
- Maior consumo de recursos

---

## Tabela CONTARECEBER - Estrutura Tipica no CPlus

A tabela `CONTARECEBER` armazena titulos a receber (contas pendentes). Estrutura comum:

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| CODCR | INTEGER | ID unico do titulo |
| CODMOVENDA | INTEGER | FK para MOVENDA (venda que gerou) |
| CODCLI | INTEGER | FK para CLIENTE |
| VALOR | DECIMAL | Valor do titulo |
| VENCIMENTO | DATE | Data de vencimento |
| DATAPAGTO | DATE | Data de pagamento (se pago) |
| SITUACAO | CHAR | Situacao (A=Aberto, P=Pago, C=Cancelado) |
| PARCELA | INTEGER | Numero da parcela |
| TOTALPARCELAS | INTEGER | Total de parcelas |

**Ja usamos `CONTARECEBERREC`** (que sao os recebimentos/baixas de CONTARECEBER) para pagamentos a prazo.

---

## Plano de Implementacao

### Fase 1: Novo Projeto Lovable (Sistema de Cobrancas)

1. Criar novo projeto no Lovable
2. Configurar tabelas especificas:
   - `receivables` (contas a receber)
   - `receivable_payments` (pagamentos)
   - `customers` (pode compartilhar estrutura)
   
3. Criar Edge Functions:
   - `titulo-criado` - Recebe novos titulos
   - `titulo-pago` - Recebe confirmacao de pagamento
   - `titulo-vencido` - Recebe notificacao de vencimento

### Fase 2: Adaptar Integrador

Adicionar no `DatabaseService.cs`:

```csharp
// Nova consulta para CONTARECEBER
public async Task<List<TituloPayload>> GetReceivablesAsync(...)
{
    var query = @"
        SELECT 
            cr.CODCR as receivable_id,
            cr.CODMOVENDA as invoice_id,
            cr.CODCLI as customer_id,
            c.NOMECLI as customer_name,
            c.CPF as customer_cpf,
            c.CNPJ as customer_cnpj,
            c.TELEFONE as customer_phone,
            cr.VALOR as amount,
            cr.VENCIMENTO as due_date,
            cr.PARCELA as installment_number,
            cr.TOTALPARCELAS as total_installments,
            cr.SITUACAO as status
        FROM CONTARECEBER cr
        INNER JOIN CLIENTE c ON cr.CODCLI = c.CODCLI
        WHERE cr.SITUACAO = 'A'
        AND cr.VENCIMENTO >= '{fromDate:yyyy-MM-dd}'
        ORDER BY cr.VENCIMENTO ASC";
    // ...
}
```

### Fase 3: Estrutura Multi-Projeto

1. Criar interface `IProjectSync` para abstrair envio
2. Modificar `SyncService` para iterar projetos configurados
3. Cada projeto recebe apenas os eventos que precisa

---

## Decisoes Necessarias

Antes de comecar, precisamos definir:

1. **Nome do novo projeto** - Ex: "Cobranca Flex", "Contas a Receber"

2. **Dados de CONTARECEBER a sincronizar:**
   - Titulos em aberto?
   - Titulos vencidos?
   - Historico de pagamentos parciais?
   - Renegociacoes?

3. **Notificacoes desejadas:**
   - WhatsApp para vencimentos?
   - Email para PJ?
   - Lembretes antecipados?

4. **Integracao com ClubeFlex:**
   - Deve compartilhar cadastro de clientes?
   - Pontos devem considerar pagamentos de titulos?

---

## Secao Tecnica

### Arquivos a Criar/Modificar no Integrador

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `Models/TituloPayload.cs` | Criar | Payload para titulos a receber |
| `Models/ProjectConfig.cs` | Criar | Configuracao por projeto |
| `Services/DatabaseService.cs` | Modificar | Adicionar GetReceivablesAsync() |
| `Services/SyncService.cs` | Modificar | Suportar multiplos projetos |
| `appsettings.json` | Modificar | Array de projetos |

### Novo Projeto Lovable - Estrutura de Tabelas

```text
+------------------+     +----------------------+
|    customers     |     |     receivables      |
+------------------+     +----------------------+
| id (uuid)        |<----| customer_id (uuid)   |
| customer_id_ext  |     | receivable_id_ext    |
| name             |     | invoice_id_ext       |
| doc (cpf/cnpj)   |     | amount               |
| phone            |     | due_date             |
| email            |     | installment_number   |
+------------------+     | total_installments   |
                         | status               |
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

### Edge Functions Necessarias

1. **titulo-criado** - Recebe titulo do ERP
2. **sync-log** - Pode reutilizar a mesma logica
3. **notificar-vencimento** - Enviar lembretes

---

## Proximos Passos

1. Criar o novo projeto Lovable para Cobrancas
2. Definir estrutura de tabelas e RLS
3. Criar Edge Functions de recepcao
4. Modificar integrador para suportar multiplos destinos
5. Testar sincronizacao em paralelo


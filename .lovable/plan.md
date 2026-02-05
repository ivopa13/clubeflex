
# Plano: Integrador Financeiro com Régua de Cobrança por Cliente

## Objetivo
Ajustar o integrador para capturar **todas** as dívidas em aberto (passadas e futuras) e estruturar os dados no projeto Financeiro de forma a permitir uma régua de cobrança **por cliente**, evitando múltiplas comunicações individuais.

---

## Arquitetura Proposta

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ERP (Firebird)                                    │
│  CONTARECEBER → Títulos em aberto (FLAGPAGO = 'N')                          │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Integrador C# (Ajustado)                                 │
│  - SyncReceivablesIgnoreDate: true                                          │
│  - Busca TODOS os títulos em aberto (sem filtro de data)                    │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Projeto Financeiro (Supabase)                            │
│                                                                             │
│  ┌─────────────┐    1:N    ┌─────────────┐                                  │
│  │  customers  │◄──────────│ receivables │                                  │
│  │             │           │             │                                  │
│  │ - id        │           │ - id        │                                  │
│  │ - doc (CPF) │           │ - customer_id                                  │
│  │ - name      │           │ - amount    │                                  │
│  │ - phone     │           │ - balance   │                                  │
│  │ - email     │           │ - due_date  │                                  │
│  │ - status    │           │ - is_overdue│                                  │
│  └─────────────┘           └─────────────┘                                  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │               customer_debt_summary (VIEW)                    │          │
│  │  - customer_id                                                │          │
│  │  - total_debt (soma de todos os saldos)                       │          │
│  │  - receivables_count (qtd de títulos)                         │          │
│  │  - oldest_due_date (título mais antigo)                       │          │
│  │  - max_days_overdue (maior atraso)                            │          │
│  │  - debt_status (em dia / vencido / crítico)                   │          │
│  └───────────────────────────────────────────────────────────────┘          │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │              collection_queue (Fila de Cobrança)              │          │
│  │  - customer_id                                                │          │
│  │  - collection_stage (reminder / first_notice / formal / etc)  │          │
│  │  - next_action_at (quando disparar próxima comunicação)       │          │
│  │  - last_contacted_at                                          │          │
│  └───────────────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Parte 1: Alterações no Integrador C#

### 1.1 Novo Parâmetro de Configuração

**Arquivo:** `ClubeFlex.Integrador/Models/ProjectConfig.cs`

```csharp
public class ProjectConfig
{
    // ... campos existentes ...
    
    /// <summary>
    /// Se true, busca TODOS os títulos em aberto independente da data de vencimento.
    /// Necessário para régua de cobrança que precisa considerar dívidas antigas.
    /// Default: true para SyncReceivables
    /// </summary>
    public bool SyncReceivablesIgnoreDate { get; set; } = true;
}
```

### 1.2 Alteração na Query de Receivables

**Arquivo:** `ClubeFlex.Integrador/Services/DatabaseService.cs`

```csharp
public async Task<List<TituloPayload>> GetReceivablesAsync(
    int? limit = null, 
    DateTime? fromDate = null, 
    HashSet<string>? syncedEventIds = null,
    bool ignoreFromDate = false)  // NOVO PARÂMETRO
{
    var batchSize = limit ?? 100;
    
    // Se ignoreFromDate = true, não aplica filtro de data
    // Isso permite buscar TODAS as dívidas em aberto, inclusive vencidas
    var dateFilter = (fromDate.HasValue && !ignoreFromDate) 
        ? $"AND cr.DATVENC >= '{fromDate.Value:yyyy-MM-dd}'" 
        : "";
    
    // ... resto do código igual ...
}
```

### 1.3 Passagem do Parâmetro no SyncService

**Arquivo:** `ClubeFlex.Integrador/Services/SyncService.cs`

```csharp
// Ao sincronizar receivables, verificar configuração do projeto
var receivables = await _databaseService.GetReceivablesAsync(
    batchSize, 
    _syncFromDate, 
    syncedReceivables,
    ignoreFromDate: project.SyncReceivablesIgnoreDate  // Usa config do projeto
);
```

### 1.4 Configuração Recomendada

**Arquivo:** `ClubeFlex.Integrador/appsettings.json`

```json
{
  "Projects": [
    {
      "Name": "Financeiro",
      "BaseUrl": "https://njjybkxugplmsexvqqtu.supabase.co/functions/v1",
      "ApiKey": "...",
      "SyncInvoices": false,
      "SyncPayments": false,
      "SyncReceivables": true,
      "SyncReceivablesIgnoreDate": true
    }
  ],
  "SyncSettings": {
    "BatchSize": 500,
    "SyncFromDate": "TODAY"
  }
}
```

---

## Parte 2: Estrutura do Banco de Dados (Projeto Financeiro)

### 2.1 Tabela `customers`

```sql
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id_ext TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  doc TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_customers_doc ON public.customers(doc);
CREATE INDEX idx_customers_status ON public.customers(status);
```

### 2.2 Tabela `receivables`

```sql
CREATE TABLE public.receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id_ext TEXT NOT NULL UNIQUE,
  invoice_id_ext TEXT,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  amount DECIMAL(15,2) NOT NULL,
  paid_amount DECIMAL(15,2) DEFAULT 0,
  balance DECIMAL(15,2) NOT NULL,
  due_date DATE NOT NULL,
  issued_at DATE,
  installment_number INTEGER DEFAULT 1,
  total_installments INTEGER DEFAULT 1,
  status TEXT DEFAULT 'A',
  days_overdue INTEGER DEFAULT 0,
  is_overdue BOOLEAN DEFAULT false,
  document_number TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_receivables_customer ON public.receivables(customer_id);
CREATE INDEX idx_receivables_status ON public.receivables(status);
CREATE INDEX idx_receivables_due_date ON public.receivables(due_date);
CREATE INDEX idx_receivables_is_overdue ON public.receivables(is_overdue);
```

### 2.3 VIEW `customer_debt_summary` (Concentração por Cliente)

```sql
CREATE VIEW public.customer_debt_summary AS
SELECT 
  c.id as customer_id,
  c.customer_id_ext,
  c.name,
  c.doc,
  c.phone,
  c.email,
  
  -- Totais de dívida
  COUNT(r.id) as total_receivables,
  COUNT(r.id) FILTER (WHERE r.status = 'A') as open_receivables,
  COUNT(r.id) FILTER (WHERE r.is_overdue = true) as overdue_receivables,
  
  -- Valores
  COALESCE(SUM(r.balance) FILTER (WHERE r.status = 'A'), 0) as total_debt,
  COALESCE(SUM(r.balance) FILTER (WHERE r.is_overdue = true), 0) as overdue_debt,
  
  -- Datas críticas
  MIN(r.due_date) FILTER (WHERE r.status = 'A') as oldest_due_date,
  MAX(r.days_overdue) FILTER (WHERE r.is_overdue = true) as max_days_overdue,
  
  -- Status consolidado
  CASE 
    WHEN MAX(r.days_overdue) >= 30 THEN 'critical'
    WHEN MAX(r.days_overdue) >= 1 THEN 'overdue'
    ELSE 'current'
  END as debt_status,
  
  -- Faixa de atraso (para régua de cobrança)
  CASE 
    WHEN MAX(r.days_overdue) >= 60 THEN 'D+60'
    WHEN MAX(r.days_overdue) >= 30 THEN 'D+30'
    WHEN MAX(r.days_overdue) >= 15 THEN 'D+15'
    WHEN MAX(r.days_overdue) >= 7 THEN 'D+7'
    WHEN MAX(r.days_overdue) >= 3 THEN 'D+3'
    WHEN MAX(r.days_overdue) >= 1 THEN 'D+1'
    ELSE 'current'
  END as collection_stage

FROM public.customers c
LEFT JOIN public.receivables r ON r.customer_id = c.id
GROUP BY c.id, c.customer_id_ext, c.name, c.doc, c.phone, c.email;
```

### 2.4 Tabela `collection_queue` (Fila de Cobrança)

```sql
CREATE TABLE public.collection_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) UNIQUE,
  
  -- Estágio atual na régua
  collection_stage TEXT NOT NULL DEFAULT 'pending',
  -- Valores: pending, reminder, first_notice, second_notice, formal, legal
  
  -- Controle de comunicações
  last_contacted_at TIMESTAMP WITH TIME ZONE,
  next_action_at TIMESTAMP WITH TIME ZONE,
  contact_attempts INTEGER DEFAULT 0,
  
  -- Metadados
  total_debt DECIMAL(15,2),
  oldest_due_date DATE,
  max_days_overdue INTEGER,
  
  -- Status da fila
  status TEXT DEFAULT 'active',
  -- Valores: active, paused, resolved, excluded
  
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_collection_queue_stage ON public.collection_queue(collection_stage);
CREATE INDEX idx_collection_queue_next_action ON public.collection_queue(next_action_at);
CREATE INDEX idx_collection_queue_status ON public.collection_queue(status);
```

### 2.5 Tabela `collection_history` (Histórico de Comunicações)

```sql
CREATE TABLE public.collection_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  collection_queue_id UUID REFERENCES public.collection_queue(id),
  
  -- Tipo de comunicação
  action_type TEXT NOT NULL,
  -- Valores: whatsapp, email, sms, phone_call, letter
  
  -- Detalhes
  stage_at_action TEXT,
  total_debt_at_action DECIMAL(15,2),
  message_template TEXT,
  message_sent TEXT,
  
  -- Resultado
  status TEXT DEFAULT 'sent',
  -- Valores: sent, delivered, read, failed, responded
  
  response TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_collection_history_customer ON public.collection_history(customer_id);
CREATE INDEX idx_collection_history_created ON public.collection_history(created_at);
```

---

## Parte 3: Régua de Cobrança Automática

### 3.1 Configuração dos Estágios

| Estágio | Dias de Atraso | Ação | Canal |
|---------|---------------|------|-------|
| `reminder` | D+0 (vencimento) | Lembrete amigável | WhatsApp |
| `first_notice` | D+3 | Primeiro aviso | WhatsApp |
| `second_notice` | D+7 | Segundo aviso | WhatsApp + Email |
| `formal` | D+15 | Notificação formal | WhatsApp + Email |
| `pre_legal` | D+30 | Aviso de negativação | WhatsApp + Email + SMS |
| `legal` | D+60 | Encaminhamento jurídico | Todos |

### 3.2 Edge Function para Processar Fila

```typescript
// supabase/functions/process-collection-queue/index.ts

// Esta função será executada periodicamente (CRON) para:
// 1. Atualizar customer_debt_summary (recalcular dias de atraso)
// 2. Mover clientes para próximo estágio da régua
// 3. Disparar comunicações agendadas
// 4. Registrar histórico
```

### 3.3 Exemplo de Mensagem Consolidada

Em vez de enviar 5 mensagens para 5 títulos:

```text
❌ ERRADO (por título):
- "Título 001 vencido há 3 dias - R$ 500"
- "Título 002 vencido há 3 dias - R$ 300"
- "Título 003 vencido há 3 dias - R$ 200"
- "Título 004 vencido há 3 dias - R$ 150"
- "Título 005 vencido há 3 dias - R$ 100"
```

Envia 1 mensagem consolidada por cliente:

```text
✅ CORRETO (por cliente):

Olá João!

Identificamos 5 títulos em aberto no seu nome:

📋 Resumo da sua situação:
• Total em aberto: R$ 1.250,00
• Títulos vencidos: 5
• Maior atraso: 3 dias

📄 Detalhes:
1. NF 001 - R$ 500,00 (venc. 02/02)
2. NF 002 - R$ 300,00 (venc. 02/02)
3. NF 003 - R$ 200,00 (venc. 02/02)
4. NF 004 - R$ 150,00 (venc. 02/02)
5. NF 005 - R$ 100,00 (venc. 02/02)

Entre em contato para regularizar sua situação.
```

---

## Parte 4: RLS Policies

```sql
-- Customers: apenas admin pode ver
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do everything with customers"
  ON public.customers FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Receivables: apenas admin pode ver
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do everything with receivables"
  ON public.receivables FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Collection queue: apenas admin
ALTER TABLE public.collection_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage collection queue"
  ON public.collection_queue FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');
```

---

## Resumo das Alterações

### Integrador C# (4 arquivos)
| Arquivo | Alteração |
|---------|-----------|
| `ProjectConfig.cs` | Adicionar `SyncReceivablesIgnoreDate` |
| `DatabaseService.cs` | Adicionar parâmetro `ignoreFromDate` |
| `SyncService.cs` | Passar configuração ao buscar receivables |
| `appsettings.json` | Configurar `SyncReceivablesIgnoreDate: true` |

### Projeto Financeiro (Banco de Dados)
| Objeto | Propósito |
|--------|-----------|
| `customers` | Cadastro de clientes devedores |
| `receivables` | Títulos a receber |
| `customer_debt_summary` | VIEW agregada por cliente |
| `collection_queue` | Fila da régua de cobrança |
| `collection_history` | Histórico de comunicações |

### Projeto Financeiro (Edge Functions)
| Função | Propósito |
|--------|-----------|
| `titulo-criado` | Recebe títulos do integrador |
| `titulo-pago` | Atualiza pagamentos |
| `process-collection-queue` | Processa régua automaticamente |

---

## Benefícios

1. **Sem spam**: Cliente recebe UMA comunicação com TODOS os títulos
2. **Visão consolidada**: Dashboard mostra situação por cliente, não por título
3. **Régua inteligente**: Avança estágios baseado no maior atraso
4. **Histórico completo**: Registro de todas as tentativas de contato
5. **Escalável**: Funciona igual para 10 ou 10.000 clientes

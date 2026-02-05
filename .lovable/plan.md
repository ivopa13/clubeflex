
# Atualizar Integrador com Credenciais do Projeto Financeiro

## Objetivo

Atualizar o arquivo `appsettings.json` do integrador C# com as credenciais do novo projeto **Financeiro** para habilitar a sincronização de títulos a receber (CONTARECEBER).

## Credenciais Recebidas

| Campo | Valor |
|-------|-------|
| Project ID | `njjybkxugplmsexvqqtu` |
| Anon Key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qanlia3h1Z3BsbXNleHZxcXR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNzI0NTAsImV4cCI6MjA4NTg0ODQ1MH0.FFXM7302I48-TuOTw9zIqflGmjrr1U7Oz7fLsUQjVps` |
| Base URL | `https://njjybkxugplmsexvqqtu.supabase.co/functions/v1` |

## Alteracao

Atualizar o arquivo `ClubeFlex.Integrador/appsettings.json`:

```json
{
  "ConnectionStrings": {
    "LocalDatabase": "DataSource=localhost;Database=C:\\CPlus\\CPlus.fdb;User=SYSDBA;Password=masterkey;Charset=NONE;ServerType=0;"
  },
  "Projects": [
    {
      "Name": "ClubeFlex",
      "BaseUrl": "https://skhljdaqfzweshjrlcnn.supabase.co/functions/v1",
      "ApiKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "SyncInvoices": true,
      "SyncPayments": true,
      "SyncReceivables": false
    },
    {
      "Name": "Financeiro",
      "BaseUrl": "https://njjybkxugplmsexvqqtu.supabase.co/functions/v1",
      "ApiKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "SyncInvoices": false,
      "SyncPayments": false,
      "SyncReceivables": true
    }
  ],
  "SyncSettings": { ... }
}
```

## Secao Tecnica

### Arquivo Modificado

| Arquivo | Alteracao |
|---------|-----------|
| `ClubeFlex.Integrador/appsettings.json` | Atualizar projeto "SistemaCobrancas" para "Financeiro" com credenciais reais |

### Configuracao Final

O projeto **Financeiro** ficara configurado para:

- `SyncInvoices: false` - Nao sincroniza faturas (isso e do ClubeFlex)
- `SyncPayments: false` - Nao sincroniza pagamentos de pontos
- `SyncReceivables: true` - Sincroniza titulos a receber (CONTARECEBER)

### Proximos Passos Apos Aprovacao

1. Atualizar o `appsettings.json` com as credenciais
2. Garantir que o projeto Financeiro tenha as Edge Functions:
   - `titulo-criado` - Para receber novos titulos
   - `titulo-pago` - Para confirmacao de pagamentos
   - `sync-log` - Para monitoramento
   - `integrator-execution` - Para logs de execucao
3. Testar a sincronizacao com o novo projeto

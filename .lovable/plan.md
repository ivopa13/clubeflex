

## Plano: Limpeza ClubeFlex + Filtro Inteligente Financeiro — ✅ EXECUTADO

### 1. ClubeFlex — Dados pré-2026 deletados ✅

Registros com `created_at < '2026-01-01'` removidos de todas as tabelas (respeitando FKs).

### 2. Financeiro (Integrador) — Filtro inteligente implementado ✅

- `ProjectConfig.cs`: adicionada propriedade `SyncReceivablesFullFromDate`
- `DatabaseService.cs`: filtro condicional nas queries `GetReceivablesAsync` e `GetReceivablePaymentsAsync`
- `SyncService.cs`: passa `fullFromDate` do config para as queries
- `appsettings.json`: `"SyncReceivablesFullFromDate": "2026-02-01"` no projeto Financeiro

### Comportamento final

| Projeto | Dados sincronizados |
|---------|-------------------|
| ClubeFlex | Apenas faturas e pagamentos de 2026 em diante |
| Financeiro | Títulos abertos/atrasados de todo histórico + tudo a partir de Fev/2026 |

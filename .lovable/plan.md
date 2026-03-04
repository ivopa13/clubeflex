

## Plano: Exibir nome do projeto em cada execucao nos logs

### Situacao atual

A tabela `integrator_executions` nao tem coluna `project_name`. Porem, o `execution_id` ja contem o nome do projeto no formato `EXEC_ClubeFlex_20260304_HHmmss_xxxx`. Temos duas opcoes:

1. **Extrair do execution_id no frontend** (rapido, sem mudanca no backend)
2. **Adicionar coluna `project_name`** (mais robusto, permite filtros e queries)

Recomendo a **opcao 2** por ser mais limpa e permitir filtros futuros.

### Alteracoes

**1. Database** -- adicionar coluna `project_name` na tabela `integrator_executions`
```sql
ALTER TABLE public.integrator_executions 
ADD COLUMN project_name text DEFAULT 'ClubeFlex';
-- Preencher dados existentes extraindo do execution_id
UPDATE public.integrator_executions 
SET project_name = split_part(execution_id, '_', 2)
WHERE execution_id LIKE 'EXEC_%';
```

**2. Edge function `integrator-execution`** -- receber e salvar `project_name` no `start`
- Aceitar campo `project_name` no body
- Inserir na tabela junto com os demais campos

**3. Integrador C# `ProjectSyncLogService.cs`** -- enviar `project_name` no payload de start
- Adicionar `project_name = _projectName` no objeto enviado ao endpoint

**4. Frontend `AdminSyncLogs.tsx`** -- agrupar ou indicar projeto
- Exibir badge com nome do projeto em cada execucao no accordion
- Adicionar filtro por projeto (botoes como os de data)

### UI esperada

Cada item do accordion mostrara um badge colorido (ex: "ClubeFlex" em laranja, "Financeiro" em azul) ao lado da data/hora. Filtros por projeto aparecerao abaixo dos filtros de data.


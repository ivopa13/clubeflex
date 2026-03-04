

## Diagnostico: Por que o integrador re-sincroniza tudo toda vez

### Causa raiz

A tabela `sync_logs` tem **RLS (Row Level Security)** ativo com apenas uma policy de SELECT que exige `has_role(auth.uid(), 'admin')`. O integrador C# usa a **anon key** (sem autenticacao), entao quando tenta carregar os checksums existentes via PostgREST (`/rest/v1/sync_logs?...`), recebe **zero resultados**. Resultado: o integrador acha que nenhum registro foi sincronizado antes e re-envia tudo.

Numeros do problema:
- 5193 faturas no sync_logs, mas o integrador nao ve nenhuma
- ~2500 faturas + ~950 pagamentos re-enviados a cada execucao (~3400 eventos)
- 83.543 linhas de log em um unico dia (5+ execucoes)
- Cada execucao leva ~1h30 quando deveria levar segundos (apenas novos registros)

### Solucao

Adicionar uma **policy de SELECT para `anon`** na tabela `sync_logs`, permitindo leitura publica (os dados sao apenas logs de sincronizacao, sem informacao sensivel):

```sql
CREATE POLICY "Allow anon to read sync logs"
ON public.sync_logs
FOR SELECT
TO anon
USING (true);
```

### Resultado esperado

Apos aplicar a policy:
- O integrador carrega os ~5000+ checksums existentes
- Compara com os dados do ERP
- Envia **apenas registros novos ou alterados** (provavelmente <50 por execucao)
- Tempo de execucao cai de ~1h30 para **poucos minutos**
- Logs ficam concisos e uteis

### Verificacao adicional

A tabela `integrator_executions` pode ter o mesmo problema de RLS. Verificarei e corrigirei junto.


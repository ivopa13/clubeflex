
## Plano: Aumentar BatchSize para 500 no appsettings.json

### Objetivo
Aumentar o `BatchSize` de 100 para 500 para recuperar e sincronizar mais registros por execução, acelerando a sincronização inicial dos títulos em aberto.

### Mudança a Fazer

**Arquivo:** `ClubeFlex.Integrador/appsettings.json`

**Local:** Linha 25 na seção `SyncSettings`

**Alteração:**
```json
"BatchSize": 100  // ANTES
↓
"BatchSize": 500  // DEPOIS
```

### Impacto

| Aspecto | Antes | Depois | Benefício |
|---------|-------|--------|-----------|
| Registros por execução | 100 | 500 | 5x mais dados |
| Tempo de sincronização inicial | ~10 execuções (1000 títulos) | ~2 execuções | Muito mais rápido |
| Memória do integrador | Menor | Um pouco maior | Aceitável |
| Pressão na API | Menor | Maior (500 requests sequenciais) | Controlada pelo integrador |

### Como Funciona

1. **Primeira execução**: O integrador busca até 500 títulos do ERP em uma única query
2. **Processamento**: Itera por cada um, calcula checksum, e envia para Supabase
3. **Segunda execução**: Se houver mais de 500 títulos, busca os próximos 500
4. **Com checksum**: Apenas novos ou alterados são enviados (otimização já implementada)

### Considerações

- **Rate limiting**: A Edge Function do Supabase suporta bem esse volume. Os 500 requests ainda são sequenciais (um por um), então não haverá pico de requisições simultâneas.
- **Segurança**: Aumentar BatchSize não afeta segurança ou RLS.
- **Flexibilidade**: Pode ser ajustado novamente se necessário (1000, 250, etc.).

### Próximos Passos

1. Fazer a alteração no appsettings.json
2. Recompilar o integrador
3. Executar a sincronização e monitorar os logs para ver a diferença no tempo de processamento
4. Se houver timeout, pode reduzir para 250 ou 300

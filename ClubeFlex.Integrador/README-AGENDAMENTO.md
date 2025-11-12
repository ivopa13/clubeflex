# ⏰ Guia de Agendamento Automático - Clube Flex

## 📋 Configuração Recomendada para Produção

### Intervalo de Sincronização

Para o sistema de pontos funcionar corretamente em produção, recomendamos:

#### ✅ **Configuração Ideal: A cada 10 minutos**

**Por quê?**
- ✅ Clientes veem seus pontos em até 10 minutos após a compra
- ✅ Não sobrecarrega o servidor com requisições excessivas
- ✅ Baixo impacto no banco de dados Firebird
- ✅ Garante que pagamentos sejam processados rapidamente

#### Outras opções:

| Intervalo | Quando usar | Prós | Contras |
|-----------|-------------|------|---------|
| **5 min** | Volume médio de vendas (< 500/dia) | Quase tempo real | Mais carga no servidor |
| **10 min** | ✅ **RECOMENDADO** | Equilibrado | - |
| **15 min** | Volume alto (> 1000/dia) | Menos carga | Mais tempo de espera |
| **30 min** | Volume muito alto ou baixo | Performance | Muito tempo de espera |

---

## 🚀 Como Configurar o Agendamento

### Passo 1: Configurar Filtro de Data

Edite o arquivo `appsettings.json`:

```json
{
  "SyncSettings": {
    "TestMode": false,
    "SyncFromDate": "TODAY"
  }
}
```

**Importante:**
- `"SyncFromDate": "TODAY"` → Sincroniza apenas faturas e pagamentos **de hoje em diante**
- `"SyncFromDate": "2025-01-15"` → Sincroniza a partir de uma data específica
- `"SyncFromDate": null` → Sincroniza tudo (não recomendado após testes)

### Passo 2: Instalar Tarefa Agendada

1. Abra o **Prompt de Comando como Administrador**
2. Navegue até a pasta do integrador:
   ```bash
   cd C:\caminho\do\integrador
   ```
3. Execute o instalador:
   ```bash
   install-scheduler.bat
   ```
4. Quando perguntado, digite o intervalo (recomendamos **10**):
   ```
   Digite o intervalo de sincronizacao em minutos (padrao: 5): 10
   ```

---

## 🔧 Gerenciar Tarefa Agendada

### Ver Status da Tarefa

Abra o **Agendador de Tarefas do Windows**:
- Pressione `Win + R`
- Digite `taskschd.msc`
- Procure por **ClubeFlexSync**

### Comandos Úteis (como Administrador)

```bash
# Executar manualmente agora
schtasks /Run /TN "ClubeFlexSync"

# Desabilitar temporariamente
schtasks /Change /TN "ClubeFlexSync" /DISABLE

# Habilitar novamente
schtasks /Change /TN "ClubeFlexSync" /ENABLE

# Remover completamente
schtasks /Delete /TN "ClubeFlexSync" /F
```

### Alterar Intervalo

Para mudar o intervalo de sincronização:
1. Remova a tarefa antiga: `schtasks /Delete /TN "ClubeFlexSync" /F`
2. Execute novamente: `install-scheduler.bat`
3. Digite o novo intervalo

---

## 📊 Monitoramento

### Logs de Sincronização

Os logs são salvos em:
```
C:\caminho\do\integrador\logs\sync-AAAA-MM-DD.txt
```

### O que monitorar:

✅ **Sinais saudáveis:**
```
=== Iniciando Teste de Conectividade ===
✅ Conexão com banco local: OK
✅ Conexão com API Clube Flex: OK
=== Sincronizando Faturas Criadas ===
📤 Enviando fatura INV-12345...
✅ Fatura INV-12345 sincronizada
=== Sincronização Finalizada ===
```

⚠️ **Sinais de problema:**
```
❌ Erro ao conectar com banco de dados
❌ Falha ao enviar fatura após 3 tentativas
⚠️ API retornou erro 500
```

---

## 🔄 Fluxo de Funcionamento

```
┌─────────────────────────────────────────────────┐
│ 1. Tarefa Agendada dispara (ex: a cada 10 min) │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│ 2. Integrador conecta no Firebird (CPlus)      │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│ 3. Busca faturas novas (não sincronizadas)     │
│    - Filtradas por data (se SyncFromDate)      │
│    - Que não estão em sync_log com sucesso     │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│ 4. Para cada fatura:                            │
│    - Envia para API do Clube Flex               │
│    - Registra em sync_log (local)               │
│    - Registra em sync_logs (cloud)              │
│    - Retry automático se falhar                 │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│ 5. Busca pagamentos novos                       │
│    - Filtrados por data                         │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│ 6. Para cada pagamento:                         │
│    - Envia para API                             │
│    - Registra nos logs                          │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│ 7. Aguarda próxima execução (10 min)           │
└─────────────────────────────────────────────────┘
```

---

## ⚠️ Troubleshooting

### Tarefa não está executando

1. Verifique se está habilitada:
   ```bash
   schtasks /Query /TN "ClubeFlexSync"
   ```
2. Teste execução manual:
   ```bash
   schtasks /Run /TN "ClubeFlexSync"
   ```
3. Veja o histórico no Agendador de Tarefas

### Logs não aparecem

- Certifique-se que a pasta `logs/` existe
- Verifique permissões de escrita
- Execute manualmente para testar: `ClubeFlex.Integrador.exe`

### Sincronização muito lenta

- Reduza o `BatchSize` em `appsettings.json`
- Aumente o intervalo de sincronização
- Verifique performance do banco Firebird

---

## 📝 Checklist de Go-Live

Antes de colocar em produção:

- [ ] `TestMode = false` no `appsettings.json`
- [ ] `SyncFromDate = "TODAY"` configurado
- [ ] Tarefa agendada instalada (10 minutos)
- [ ] Executado teste manual com sucesso
- [ ] Logs sendo gerados corretamente
- [ ] Monitoramento ativo nas primeiras horas
- [ ] Backup do banco local feito

---

## 🆘 Suporte

Em caso de dúvidas:
1. Verifique os logs em `logs/sync-AAAA-MM-DD.txt`
2. Execute manualmente para debug: `ClubeFlex.Integrador.exe`
3. Consulte o README principal

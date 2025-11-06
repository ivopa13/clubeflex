# Clube Flex - Integrador Windows

Console Application para sincronizar dados do seu sistema local com o Clube Flex.

## 📋 Pré-requisitos

- Windows Server ou Windows 10/11
- .NET 6.0 Runtime ou SDK ([Download](https://dotnet.microsoft.com/download/dotnet/6.0))
- SQL Server (local ou remoto)
- Acesso ao banco de dados com permissões de leitura

## 🚀 Instalação

### 1. Configurar Banco de Dados Local

Execute o script SQL no seu banco de dados:

```bash
Scripts/create-sync-log.sql
```

Isso criará a tabela `sync_log` necessária para controle de sincronização.

### 2. Configurar appsettings.json

Edite o arquivo `appsettings.json` com suas configurações:

```json
{
  "ConnectionStrings": {
    "LocalDatabase": "Server=SEU_SERVIDOR;Database=SEU_BANCO;User Id=SEU_USUARIO;Password=SUA_SENHA;TrustServerCertificate=True;"
  },
  "ClubeFlexApi": {
    "BaseUrl": "https://skhljdaqfzweshjrlcnn.supabase.co/functions/v1",
    "ApiKey": "sua_api_key_aqui"
  },
  "SyncSettings": {
    "BatchSize": 100,
    "RetryAttempts": 3,
    "RetryDelaySeconds": 30
  }
}
```

### 3. Adaptar Queries do Banco de Dados

**IMPORTANTE**: Edite os arquivos abaixo para corresponder à estrutura do seu banco:

#### Services/DatabaseService.cs

**Método `GetNewInvoicesAsync()`** - Linha 30:
- Ajuste os nomes das tabelas (`faturas`, `clientes`, `especificadores`)
- Ajuste os nomes das colunas conforme seu banco
- Ajuste as condições WHERE conforme sua regra de negócio

**Método `GetNewPaymentsAsync()`** - Linha 95:
- Ajuste os nomes das tabelas e colunas
- Ajuste a condição de status do pagamento

### 4. Compilar o Projeto

#### Opção A - Com Visual Studio:
1. Abra `ClubeFlex.Integrador.sln`
2. Clique com botão direito no projeto → Publicar
3. Escolha "Pasta" como destino
4. Configure para `win-x64` e `Self-contained`
5. Clique em "Publicar"

#### Opção B - Com .NET CLI:
```bash
dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true
```

O executável será gerado em:
```
bin/Release/net6.0/win-x64/publish/ClubeFlex.Integrador.exe
```

## ▶️ Executando

### Teste Manual

```bash
cd bin/Release/net6.0/win-x64/publish
ClubeFlex.Integrador.exe
```

Verifique os logs em:
- Console: Saída imediata
- Arquivo: `logs/sync-AAAA-MM-DD.txt`

### Agendar Execução Automática

Execute como **Administrador**:

```bash
install-scheduler.bat
```

Isso criará uma tarefa agendada no Windows que executará a sincronização automaticamente.

**Gerenciar tarefa criada:**
```bash
# Executar manualmente
schtasks /Run /TN "ClubeFlexSync"

# Desabilitar
schtasks /Change /TN "ClubeFlexSync" /DISABLE

# Habilitar
schtasks /Change /TN "ClubeFlexSync" /ENABLE

# Remover
schtasks /Delete /TN "ClubeFlexSync" /F
```

## 📊 Estrutura de Dados

### Fatura Criada (fatura-criada)

```json
{
  "event_id": "INV-12345-123456789",
  "source": "erp_windows",
  "invoice_id_ext": "12345",
  "total_amount": 1500.00,
  "issued_at": "2025-01-15T10:30:00Z",
  "customer": {
    "id_ext": "C001",
    "name": "João Silva",
    "doc": "12345678900",
    "email": "joao@email.com",
    "phone": "11999999999"
  },
  "specifier": {
    "id_ext": "E001",
    "name": "Maria Pereira",
    "doc": "98765432100",
    "email": "maria@email.com",
    "phone": "11988888888",
    "role": "profissional"
  }
}
```

### Pagamento Confirmado (pagamento-confirmado)

```json
{
  "event_id": "PAY-67890-123456789",
  "invoice_id_ext": "12345",
  "paid_amount": 1500.00,
  "paid_at": "2025-01-20T14:00:00Z"
}
```

## 🔧 Troubleshooting

### Erro de Conexão com Banco de Dados

**Erro**: `A network-related or instance-specific error...`

**Solução**:
1. Verifique se o SQL Server está rodando
2. Verifique a connection string no `appsettings.json`
3. Teste conexão: `sqlcmd -S servidor -U usuario -P senha`

### Erro de Permissão (HTTP 401/403)

**Erro**: `Unauthorized` ou `Forbidden`

**Solução**:
1. Verifique se a `ApiKey` em `appsettings.json` está correta
2. Confirme que a API key tem permissões necessárias

### Tabela sync_log não existe

**Erro**: `Invalid object name 'sync_log'`

**Solução**:
Execute o script `Scripts/create-sync-log.sql` no seu banco de dados

### Logs não aparecem

**Solução**:
- Certifique-se que a pasta `logs/` existe ou será criada automaticamente
- Verifique permissões de escrita na pasta do executável

## 📁 Estrutura de Pastas

```
ClubeFlex.Integrador/
├── ClubeFlex.Integrador.exe    # Executável principal
├── appsettings.json             # Configurações (EDITAR)
├── logs/                        # Logs de execução (criado automaticamente)
│   └── sync-2025-01-15.txt
└── Scripts/
    └── create-sync-log.sql      # Script de criação da tabela
```

## 🔒 Segurança

- **Nunca commite** `appsettings.json` com senhas reais
- Use usuário de banco com **permissões mínimas** (apenas SELECT nas tabelas necessárias)
- A `ApiKey` do Clube Flex é pública (anon key) mas ainda assim proteja

## 📞 Suporte

Em caso de dúvidas ou problemas:
1. Verifique os logs em `logs/sync-AAAA-MM-DD.txt`
2. Execute em modo manual para debug
3. Consulte a documentação do Clube Flex

## 📝 Checklist de Implementação

- [ ] Executar script `create-sync-log.sql` no banco local
- [ ] Editar `appsettings.json` com connection string correta
- [ ] Adaptar queries em `DatabaseService.cs` conforme estrutura do seu banco
- [ ] Compilar o projeto (`dotnet publish`)
- [ ] Testar execução manual
- [ ] Verificar logs gerados
- [ ] Instalar tarefa agendada (`install-scheduler.bat`)
- [ ] Monitorar primeiras sincronizações
- [ ] Documentar particularidades do seu ambiente

## 🔄 Fluxo de Sincronização

```
1. Aplicação inicia
2. Testa conectividade (Banco + API)
3. Busca faturas novas (não em sync_log com status='success')
4. Para cada fatura:
   - Envia para Clube Flex
   - Registra em sync_log
   - Retry automático se falhar
5. Busca pagamentos novos
6. Para cada pagamento:
   - Envia para Clube Flex
   - Registra em sync_log
   - Retry automático se falhar
7. Finaliza e gera logs
```

## ⚙️ Configurações Avançadas

### Alterar Intervalo de Sincronização

Edite a tarefa agendada ou reinstale com `install-scheduler.bat`

### Aumentar Batch Size

Em `appsettings.json`:
```json
"SyncSettings": {
  "BatchSize": 500  // Processar até 500 registros por vez
}
```

### Ajustar Retry

```json
"SyncSettings": {
  "RetryAttempts": 5,      // Tentar até 5 vezes
  "RetryDelaySeconds": 60  // Aguardar 60s entre tentativas
}
```

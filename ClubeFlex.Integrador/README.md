# Clube Flex - Integrador Windows v2.0 (Multi-Projeto)

Console Application para sincronizar dados do **CPlus 4.10** com **múltiplos projetos Lovable/Supabase**.

## 🆕 Novidades v2.0

- **Multi-projeto**: Sincronize dados para múltiplos destinos simultaneamente
- **Títulos a Receber**: Suporte para CONTARECEBER (Sistema de Cobranças)
- **Configuração flexível**: Cada projeto escolhe quais dados sincronizar
- **Compatibilidade**: Formato legado (ClubeFlexApi) ainda suportado

## 📋 Pré-requisitos

- Windows Server ou Windows 10/11
- .NET 6.0 Runtime ou SDK ([Download](https://dotnet.microsoft.com/download/dotnet/6.0))
- **CPlus 4.10** com banco de dados **Firebird**
- Acesso ao banco de dados com permissões de leitura
- Ferramenta para executar SQL no Firebird: [FlameRobin](https://flamerobin.org/) ou IBExpert

## 🚀 Instalação

### 1. Configurar appsettings.json

Edite o arquivo `appsettings.json` com suas configurações:

#### Configuração Multi-Projeto (RECOMENDADA)

```json
{
  "ConnectionStrings": {
    "LocalDatabase": "DataSource=localhost;Database=C:\\CPlus\\CPlus.fdb;User=SYSDBA;Password=masterkey;Charset=NONE;ServerType=0;"
  },
  "Projects": [
    {
      "Name": "ClubeFlex",
      "BaseUrl": "https://skhljdaqfzweshjrlcnn.supabase.co/functions/v1",
      "ApiKey": "SUA_API_KEY_CLUBEFLEX",
      "SyncInvoices": true,
      "SyncPayments": true,
      "SyncReceivables": false
    },
    {
      "Name": "SistemaCobrancas",
      "BaseUrl": "https://OUTRO_PROJETO.supabase.co/functions/v1",
      "ApiKey": "SUA_API_KEY_COBRANCAS",
      "SyncInvoices": false,
      "SyncPayments": false,
      "SyncReceivables": true
    }
  ],
  "SyncSettings": {
    "BatchSize": 100,
    "RetryAttempts": 3,
    "RetryDelaySeconds": 30,
    "SyncFromDate": "TODAY"
  }
}
```

### 2. Opções de Sincronização por Projeto

| Opção | Descrição | Tabelas CPlus |
|-------|-----------|---------------|
| `SyncInvoices` | Sincroniza faturas/vendas | MOVENDA, CLIENTE, TRANSPORTADORA |
| `SyncPayments` | Sincroniza pagamentos | CONTARECEBERREC, MOVENDAREC, CHEQUES |
| `SyncReceivables` | Sincroniza títulos a receber | CONTARECEBER, CLIENTE |

### 3. Mapeamento CPlus → Lovable Cloud

O código já está **pré-configurado** para o CPlus 4.10 com a seguinte estrutura:

#### Tabelas Utilizadas:
| Tabela CPlus | Usado Para | Colunas Principais |
|---|---|---|
| **MOVENDA** | Faturas/Vendas | NUMPED, VALORTOTALNOTA, DATA, CODCLI, CODTRANS |
| **CLIENTE** | Clientes | CODCLI, NOMECLI, CPF, CNPJ, EMAIL, TELEFONE |
| **TRANSPORTADORA** | Especificadores | CODTRANS, NOMETRANS, CNPJ, EMAIL, TELEFONE, CATEGORIA |
| **CONTARECEBERREC** | Pagamentos a prazo | CODREC, ID, VALOR, DATA, CODCLI |
| **MOVENDAREC** | Pagamentos à vista | CODMOVENDA, VALOR, CODREC |
| **CHEQUES** | Cheques compensados | CODMOVENDA, VALOR, DEPOSITO, NUMCHEQUE |
| **CONTARECEBER** | Títulos a receber | CODCR, VALOR, VENCIMENTO, SITUACAO, PARCELA |

**✅ Não precisa alterar nada se sua estrutura do CPlus for padrão!**

Se você usa campos customizados ou tabelas diferentes, edite:
- `Services/DatabaseService.cs` → Métodos `GetNewInvoicesAsync()`, `GetNewPaymentsAsync()`, `GetReceivablesAsync()`

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
  "event_id": "FAT_12345",
  "source": "erp_windows",
  "invoice_id_ext": "12345",
  "total_amount": 1500.00,
  "issued_at": "2025-01-15",
  "movement_type": "produto",
  "customer": {
    "id_ext": "C001",
    "name": "João Silva",
    "cpf": "12345678900",
    "email": "joao@email.com",
    "phone": "(19) 99999-9999"
  },
  "specifier": {
    "id_ext": "E001",
    "name": "Maria Pereira",
    "role": "profissional"
  }
}
```

### Pagamento Confirmado (pagamento-confirmado)

```json
{
  "event_id": "PAG_67890",
  "invoice_id_ext": "12345",
  "paid_amount": 1500.00,
  "paid_at": "2025-01-20",
  "payment_type": "pix"
}
```

### Título a Receber (titulo-criado)

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
  "document_number": "NF 12345",
  "description": null,
  "customer": {
    "id_ext": "C001",
    "name": "João Silva",
    "cpf": "12345678900",
    "phone": "(19) 99999-9999"
  },
  "execution_id": "EXEC_Financeiro_20260211_100000_abc12345",
  "checksum": "a1b2c3d4e5f6..."
}
```

### Pagamento de Título (titulo-pago)

```json
{
  "event_id": "TPAG_98765_001",
  "source": "erp_windows",
  "receivable_id_ext": "98765",
  "paid_amount": 500.00,
  "paid_at": "2026-02-10",
  "payment_type": "pix",
  "execution_id": "EXEC_Financeiro_20260211_100000_abc12345",
  "checksum": "f6e5d4c3b2a1..."
}
```

## 🔧 Troubleshooting

### Erro de Conexão com Firebird

**Erro**: `Unable to complete network request` ou `Connection refused`

**Solução**:
1. Verifique se o **Firebird Server** está rodando (Serviços Windows → `FirebirdServerDefaultInstance`)
2. Confirme o caminho do arquivo `.FDB` no `appsettings.json`
3. Teste com FlameRobin se consegue conectar com as mesmas credenciais
4. Verifique se o arquivo `.FDB` não está bloqueado por outro processo

### Erro de Permissão (HTTP 401/403)

**Erro**: `Unauthorized` ou `Forbidden`

**Solução**:
1. Verifique se a `ApiKey` em `appsettings.json` está correta
2. Confirme que a API key tem permissões necessárias

### Tabela sync_log não existe

**Erro**: `Table unknown: SYNC_LOG`

**Solução**:
Execute o script `Scripts/create-sync-log.sql` no FlameRobin ou IBExpert

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

### Configurar Data Inicial de Sincronização

Em `appsettings.json`, ajuste o `SyncFromDate`:

```json
"SyncSettings": {
  "SyncFromDate": "TODAY"  // Sincroniza apenas dados de hoje em diante
  // ou
  "SyncFromDate": "2025-01-15"  // Data específica no formato YYYY-MM-DD
  // ou
  "SyncFromDate": null  // Sincroniza tudo (sem filtro de data)
}
```

**⏰ Intervalo Recomendado de Sincronização:**

Para um sistema de pontos em produção, recomendamos:

- **5 a 15 minutos**: Ideal para a maioria dos casos
  - Garante que pontos apareçam rapidamente após faturamento
  - Balanceia performance do servidor com atualização quase em tempo real
  - Evita sobrecarga no banco de dados

- **30 minutos**: Se o volume de transações for muito alto (>1000 faturas/dia)

- **1 hora**: Apenas se a imediatismo não for crítico

**Para configurar:**
Execute `install-scheduler.bat` e digite o intervalo em minutos quando solicitado.

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

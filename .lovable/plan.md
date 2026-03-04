

## Plano: Sincronização de Clientes para o Projeto Flex Ambiental

### Contexto

O integrador C# já suporta múltiplos projetos via array em `appsettings.json`. Atualmente sincroniza: faturas, pagamentos e títulos a receber. Cada tipo de dado já inclui os dados do cliente embutidos no payload (CustomerData). O que precisamos é adicionar uma **sincronização dedicada de clientes** — enviar apenas a base de clientes (tabela CLIENTES do Firebird) para o novo projeto, sem faturas/pagamentos.

### O que será feito

**1. Novo flag no ProjectConfig: `SyncCustomers`**
- Adicionar `SyncCustomers` (bool, default false) em `ProjectConfig.cs`
- Atualizar `GetSyncDescription()` para incluir "clientes"

**2. Novo modelo `ClientePayload`**
- Criar `Models/ClientePayload.cs` com campos: event_id, source, customer_id_ext, name, cpf, cnpj, email, phone, status, checksum
- Reutilizar a estrutura de `CustomerData` já existente, mas com checksum próprio

**3. Novo método no DatabaseService: `GetCustomersAsync`**
- Query SQL na tabela CLIENTES do Firebird: `SELECT CODCLI, NOMECLI, CPF, CNPJ, EMAIL, TELEFONE FROM CLIENTES`
- Com suporte a paginação (limit/offset), checksum para evitar reenvio, e filtro opcional por data

**4. Novo endpoint no ProjectApiService: `SendCustomerAsync`**
- POST para `/cliente-sync` (ou nome equivalente que o novo projeto terá)

**5. Orquestração no SyncService**
- Adicionar `SyncCustomersForProjectAsync` seguindo o mesmo padrão de paginação dos outros tipos
- Chamá-lo em `SyncForProjectAsync` quando `project.SyncCustomers == true`

**6. Configuração no appsettings.json**
- Adicionar entrada para "Flex Ambiental" quando o projeto for criado:
```json
{
  "Name": "FlexAmbiental",
  "BaseUrl": "https://<projeto>.supabase.co/functions/v1",
  "ApiKey": "<anon-key>",
  "SyncInvoices": false,
  "SyncPayments": false,
  "SyncReceivables": false,
  "SyncCustomers": true
}
```

### Pré-requisito

O projeto **Flex Ambiental** precisa ser criado primeiro no Lovable para que tenhamos:
- A URL base (BaseUrl) das edge functions
- A anon key (ApiKey)
- Uma edge function `/cliente-sync` para receber os dados

### Próximos passos sugeridos

1. **Criar o projeto Flex Ambiental** no Lovable
2. Nele, criar a tabela `customers` e a edge function `/cliente-sync`
3. Voltar aqui para implementar as mudanças no integrador (itens 1-6 acima)

Quer que eu já implemente os itens 1-5 no integrador (preparando tudo para quando o projeto estiver pronto)?


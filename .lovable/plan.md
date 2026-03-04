

## Plano: Adicionar campos de endereco na sincronizacao de clientes

### Alteracoes necessarias

**1. Database -- adicionar colunas de endereco na tabela `customers`**

```sql
ALTER TABLE public.customers
  ADD COLUMN address_street text,
  ADD COLUMN address_number text,
  ADD COLUMN address_complement text,
  ADD COLUMN address_neighborhood text,
  ADD COLUMN address_city text,
  ADD COLUMN address_state text,
  ADD COLUMN address_zip text;
```

**2. Edge Function `cliente-sync` -- criar (nao existe ainda neste projeto)**

Criar `supabase/functions/cliente-sync/index.ts` com:
- CORS headers
- Recebe payload com campos basicos + endereco
- UPSERT por `customer_id_ext`
- Campo `doc` = CPF ou CNPJ (o que nao for nulo)
- Salva campos de endereco
- Registra em `sync_logs`
- Adicionar ao `config.toml` com `verify_jwt = false`

**3. Integrador C# `ClientePayload.cs` -- adicionar campos de endereco**

Novos campos: `Street`, `Number`, `Complement`, `Neighborhood`, `City`, `State`, `ZipCode`. Incluir no calculo do checksum para detectar alteracoes de endereco.

**4. Integrador C# `DatabaseService.cs` -- mapear colunas do Firebird**

Adicionar na query SQL os campos da tabela CLIENTE do Firebird. Campos tipicos:
- `ENDERECO` → street
- `NUMERO` → number  
- `COMPLEMENTO` → complement
- `BAIRRO` → neighborhood
- `CIDADE` → city
- `UF` → state
- `CEP` → zip

> **Nota:** Os nomes exatos das colunas no Firebird precisam ser confirmados. Usarei os nomes mais comuns em sistemas ERP brasileiros. Se forem diferentes, basta ajustar.

**5. Integrador C# `DatabaseService.cs` -- popular payload com endereco**

Mapear os novos campos lidos do Firebird para o `ClientePayload`.


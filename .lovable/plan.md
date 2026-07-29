## Diagnóstico

Na última rodada de mudanças (regra do DATCAD para não notificar clientes antigos), aplicamos **duas alterações que só afetam o projeto ClubeFlex**:

1. Migration criando a coluna `customers.created_at_ext` + atualização do trigger `notify_new_customer`.
2. Nova versão da edge function `cliente-sync` que grava `created_at_ext` no `upsert`.

Ao mesmo tempo, o integrador C# passou a **enviar o campo `created_at_ext` no payload** para todos os projetos (`ClientePayload.cs` / `DatabaseService.GetCustomersAsync`).

O projeto **FlexAmbiental** é um Supabase separado (`ksfdrhkiefwwbpjpbvqu`) e não recebeu nem a migration nem a nova edge function. Resultado provável: o `upsert` na tabela `customers` do FlexAmbiental está falhando (coluna inexistente ou edge function antiga rejeitando o payload), e por isso os clientes pararam de atualizar de lá.

Preciso primeiro **confirmar a causa com evidência** e, se confirmada, replicar as duas alterações no projeto FlexAmbiental.

## Passos

### 1. Verificar sync_logs do FlexAmbiental (evidência)
Consultar `sync_logs` do projeto `ksfdrhkiefwwbpjpbvqu` filtrando `event_type = 'cliente'` nas últimas 24-48h para ver:
- Se há requisições chegando (confirma que o integrador está postando).
- Qual `error_message` está sendo gravado (confirma se é `column "created_at_ext" does not exist` ou similar).

Isso descarta hipóteses alternativas (integrador parado, checksum bloqueando tudo, config errada) antes de mexer no schema.

### 2. Se confirmado: aplicar as mesmas mudanças no projeto FlexAmbiental
Peço ao usuário para abrir o chat do projeto FlexAmbiental e colar o prompt abaixo, que replica exatamente o que já rodou aqui:

- **Migration** adicionando `customers.created_at_ext TIMESTAMPTZ` (nullable, sem default).
- Se o FlexAmbiental também dispara e-mail de novo cliente: ajustar o trigger `notify_new_customer` para usar `NEW.created_at_ext` com cutoff `2026-05-28`.
- **Edge function `cliente-sync`**: substituir pela versão atual deste repo (`supabase/functions/cliente-sync/index.ts`), que aceita `created_at_ext` no body e grava no upsert.

### 3. Fallback defensivo (opcional, do lado do integrador)
Nada a mudar no C# se aplicarmos o passo 2. Só considerar se o usuário preferir tornar o integrador tolerante a edge functions antigas — mas isso seria mascarar o problema; recomendo não fazer.

## Detalhes técnicos

**Arquivos relevantes aqui neste repo (referência para o FlexAmbiental)**
- `supabase/functions/cliente-sync/index.ts` — versão atual, aceita `created_at_ext`.
- Coluna `public.customers.created_at_ext timestamptz` — adicionada por migration prévia.
- Trigger `notify_new_customer` — compara `NEW.created_at_ext` contra `2026-05-28`.

**Arquivos do integrador que já enviam o campo (sem mudanças necessárias)**
- `ClubeFlex.Integrador/Models/ClientePayload.cs` (campo `CreatedAtExt` com `[JsonProperty("created_at_ext")]`).
- `ClubeFlex.Integrador/Services/DatabaseService.cs` linhas 1187 e 1252-1254 (lê `c.DATCAD` do Firebird).

**O que NÃO vou tocar**
- `appsettings.json` do integrador — FlexAmbiental já está com `SyncCustomers: true` e apontando para o Supabase correto.
- Nenhum código C#: o payload já está correto; o problema é no destino.

## Entrega

1. Resultado da consulta ao `sync_logs` do FlexAmbiental com a mensagem de erro real.
2. Um bloco de texto pronto para você colar no chat do projeto FlexAmbiental descrevendo a migration + substituição da edge function (com o SQL e o conteúdo do `index.ts` prontos).

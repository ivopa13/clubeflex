
## Correção do Mapeamento de CODTIPOMOVIMENTO no Integrador

### Problema Identificado

O campo `CODTIPOMOVIMENTO` na tabela `MOVENDA` do Firebird é armazenado com zeros à esquerda (formato `000000007`, `000000018`, `000000073`). O código atual compara com `"064"` sem zeros — essa comparação **nunca** retorna verdadeiro.

Além disso, a lógica atual aceita qualquer movimento que não seja "064" como produto, incluindo movimentos que **não são vendas** (devoluções, transferências, compras de mercadoria, etc.), o que polui os dados de faturamento.

### Regra de Negócio Definida

Conforme as tabelas enviadas:

| CODIGO | NOMETIPOMOVIMENTO | Classificação |
|--------|-------------------|---------------|
| 007    | PRE VENDA         | produto       |
| 018    | ORÇAMENTO         | produto       |
| 064    | VENDA DE SERVIÇOS | servico       |
| qualquer outro | — | **ignorar** (não sincronizar) |

### Mudanças no `DatabaseService.cs`

**Linha 171–175** — Substituir a lógica atual por:

```csharp
// Normaliza removendo zeros à esquerda (000000007 → 7)
var movementTypeCode = reader.IsDBNull(reader.GetOrdinal("movement_type_code"))
    ? null
    : reader["movement_type_code"].ToString()?.Trim().TrimStart('0');

// Apenas códigos 7 (Pré Venda) e 18 (Orçamento) = produto
// Código 64 (Venda de Serviços) = servico
// Qualquer outro código: ignorar (não é uma venda válida)
string movementType;
if (movementTypeCode == "7" || movementTypeCode == "18")
    movementType = "produto";
else if (movementTypeCode == "64")
    movementType = "servico";
else
{
    Log.Debug($"⏭️ Fatura {invoiceId} ignorada: tipo de movimento {movementTypeCode} não é venda");
    continue;
}
```

### Impacto nos Dados Históricos

Faturas já sincronizadas no banco de dados estão classificadas incorretamente:
- Faturas com código `007` e `018` → provavelmente já estão como `produto` (OK)
- Faturas com código `064` → estão como `produto` (ERRADO — deveriam ser `servico`)
- Faturas com outros códigos (devoluções, transferências etc.) → já estão no banco como `produto` (ERRADO — não deveriam estar)

Para os dados históricos, será necessário rodar a edge function `update-invoice-types` que já existe no projeto, ou executar uma query SQL no banco para reclassificar os registros baseando-se no `invoice_id_ext` mapeado.

### Arquivos a Modificar

- **`ClubeFlex.Integrador/Services/DatabaseService.cs`** — linhas 171–175: substituir lógica de classificação pelo novo mapeamento com `TrimStart('0')` e filtro explícito dos três códigos válidos.

### Observação Técnica

O filtro na query SQL (`WHERE m.VALORTOTALNOTA > 0`) já elimina parte dos movimentos indesejados, mas não todos — devoluções e outros movimentos com valor positivo passariam sem o filtro por tipo. Com a mudança, o `continue` no loop C# garante que apenas faturas com código 007, 018 ou 064 sejam enviadas ao ClubeFlex.

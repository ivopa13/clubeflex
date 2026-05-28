// ⚠️ ATENÇÃO - SEGURANÇA DO BANCO CPLUS ⚠️
// 
// ESTE SERVIÇO É SOMENTE-LEITURA (READ-ONLY)
// NÃO MODIFICA O BANCO DE DADOS DO CPLUS EM NENHUMA CIRCUNSTÂNCIA
// 
// Operações permitidas: SELECT (leitura de faturas e pagamentos)
// Operações PROIBIDAS: INSERT, UPDATE, DELETE, ALTER, DROP, CREATE
//
// Logs de sincronização são enviados para Lovable Cloud via API
// NUNCA são salvos no banco local do CPlus

using System.Globalization;
using ClubeFlex.Integrador.Models;
using FirebirdSql.Data.FirebirdClient;
using Serilog;

namespace ClubeFlex.Integrador.Services;

public class DatabaseService
{
    private readonly string _connectionString;

    public class BatchResult<T>
    {
        public List<T> Items { get; set; } = new();
        public int RawRowsRead { get; set; }
        public int SkippedByChecksum { get; set; }
        public bool HasMoreRows { get; set; }
    }

    // Alias for backwards compatibility
    public class CustomerBatchResult : BatchResult<ClientePayload> { }

    public DatabaseService(string connectionString)
    {
        _connectionString = connectionString;
    }

    /// <summary>
    /// Converte data do Firebird de forma segura, evitando interpretações incorretas
    /// </summary>
    private DateTime? SafeParseDateFromFirebird(object? rawValue, string fieldName, string context)
    {
        if (rawValue == null || rawValue == DBNull.Value)
        {
            Log.Debug($"[{context}] Campo {fieldName} é nulo");
            return null;
        }

        // Se já é DateTime, usa direto
        if (rawValue is DateTime dt)
        {
            Log.Debug($"[{context}] {fieldName} já é DateTime: {dt:yyyy-MM-dd}");
            return dt;
        }

        var rawString = rawValue.ToString();
        Log.Debug($"[{context}] Tentando converter {fieldName}: '{rawString}' (Tipo: {rawValue.GetType().Name})");

        // Tenta vários formatos de parsing
        string[] formats = {
            "yyyy-MM-dd",
            "dd/MM/yyyy",
            "yyyy-MM-dd HH:mm:ss",
            "dd/MM/yyyy HH:mm:ss",
            "MM/dd/yyyy",
            "MM/dd/yyyy HH:mm:ss"
        };

        if (DateTime.TryParseExact(rawString, formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate))
        {
            // Validação de sanidade: ano deve estar entre 2000 e 2100
            if (parsedDate.Year >= 2000 && parsedDate.Year <= 2100)
            {
                Log.Debug($"[{context}] {fieldName} convertido com sucesso: {parsedDate:yyyy-MM-dd}");
                return parsedDate;
            }
            else
            {
                Log.Warning($"[{context}] ⚠️ {fieldName} ano inválido após parse: {parsedDate.Year} (valor original: '{rawString}')");
            }
        }

        // Fallback: tenta parse padrão
        if (DateTime.TryParse(rawString, out var fallbackDate))
        {
            // Validação de sanidade
            if (fallbackDate.Year >= 2000 && fallbackDate.Year <= 2100)
            {
                Log.Debug($"[{context}] {fieldName} convertido via fallback: {fallbackDate:yyyy-MM-dd}");
                return fallbackDate;
            }
            else
            {
                Log.Warning($"[{context}] ⚠️ {fieldName} ano inválido no fallback: {fallbackDate.Year} (valor original: '{rawString}')");
            }
        }

        Log.Error($"[{context}] ❌ Não foi possível converter {fieldName}: '{rawString}'");
        return null;
    }

    /// <summary>
    /// Busca novas faturas que ainda não foram sincronizadas com sucesso
    /// Usa checksum para detectar alterações e evitar sincronização desnecessária
    /// </summary>
    public async Task<List<FaturaCriadaPayload>> GetNewInvoicesAsync(int? limit = null, DateTime? fromDate = null, Dictionary<string, string>? existingChecksums = null, int offset = 0)
    {
        var invoices = new List<FaturaCriadaPayload>();

        var batchSize = limit ?? 500;
        var dateFilter = fromDate.HasValue ? $"AND m.DATA >= '{fromDate.Value:yyyy-MM-dd}'" : "";

        // IMPORTANTE:
        // Já tivemos casos onde filtrar por tipo de movimento (CODTIPOMOVIMENTO / TIPOMOV)
        // zerava o retorno dependendo da configuração do CPlus.
        // Para NÃO perder faturas, a regra aqui é simples:
        // - somente vendas com valor > 0
        // - respeitando o recorte por data (fromDate)
        // - e a filtragem por checksum (se já sincronizado e inalterado)

        var query = $@"
            SELECT FIRST {batchSize} SKIP {offset}
                m.CODMOVENDA as invoice_id,
                m.NUMPED as order_number,
                m.VALORTOTALNOTA as total_amount,
                m.DATA as issued_at,
                m.CODCLI as customer_id,
                m.CODTRANS as specifier_id,
                m.CODTIPOMOVIMENTO as movement_type_code,
                c.NOMECLI as customer_name,
                c.CPF as customer_cpf,
                c.CNPJ as customer_cnpj,
                c.EMAIL as customer_email,
                c.TELEFONE as customer_phone,
                t.NOMETRANS as specifier_name,
                t.CATEGORIA as specifier_category
            FROM MOVENDA m
            INNER JOIN CLIENTE c ON m.CODCLI = c.CODCLI
            LEFT JOIN TRANSPORTADORA t ON m.CODTRANS = t.CODTRANS
            WHERE m.CODCLI <> 3005
            AND m.VALORTOTALNOTA > 0
            AND TRIM(m.CODTIPOMOVIMENTO) IN ('000000007', '000000018', '000000064', '007', '018', '064', '7', '18', '64')
            {dateFilter}
            ORDER BY m.DATA ASC, m.CODMOVENDA ASC";

        int skippedByChecksum = 0;

        try
        {
            using var connection = new FbConnection(_connectionString);
            await connection.OpenAsync();

            using var command = new FbCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var invoiceId = reader["invoice_id"].ToString() ?? "";
                var eventId = $"FAT_{invoiceId}";

                var orderNumber = reader.IsDBNull(reader.GetOrdinal("order_number")) 
                    ? null 
                    : reader["order_number"].ToString();

                // Obter CPF e CNPJ do cliente (envia ambos, mesmo que sejam "N")
                var customerCpf = reader.IsDBNull(reader.GetOrdinal("customer_cpf")) 
                    ? null 
                    : reader["customer_cpf"].ToString()?.Trim();
                
                var customerCnpj = reader.IsDBNull(reader.GetOrdinal("customer_cnpj")) 
                    ? null 
                    : reader["customer_cnpj"].ToString()?.Trim();

                // Usar conversão segura de data
                var issuedAt = SafeParseDateFromFirebird(reader["issued_at"], "issued_at", $"Fatura {invoiceId}");
                if (!issuedAt.HasValue)
                {
                    Log.Warning($"⚠️ Fatura {invoiceId} ignorada por data inválida");
                    continue;
                }

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


                var payload = new FaturaCriadaPayload
                {
                    EventId = eventId,
                    InvoiceIdExt = invoiceId,
                    OrderNumber = orderNumber,
                    TotalAmount = Convert.ToDecimal(reader["total_amount"]),
                    IssuedAt = issuedAt.Value.ToString("yyyy-MM-dd"),
                    MovementType = movementType,
                    Customer = new CustomerData
                    {
                        IdExt = reader["customer_id"].ToString()!,
                        Name = reader["customer_name"].ToString()!,
                        Cpf = customerCpf,
                        Cnpj = customerCnpj,
                        Email = reader.IsDBNull(reader.GetOrdinal("customer_email")) 
                            ? null 
                            : reader["customer_email"].ToString(),
                        Phone = reader.IsDBNull(reader.GetOrdinal("customer_phone")) 
                            ? null 
                            : reader["customer_phone"].ToString()
                    }
                };

                // Se houver especificador (transportadora), adiciona ao payload
                if (!reader.IsDBNull(reader.GetOrdinal("specifier_id")))
                {
                    var specifierName = reader.IsDBNull(reader.GetOrdinal("specifier_name")) 
                        ? string.Empty 
                        : reader["specifier_name"].ToString()!;
                    
                    var specifierCategory = reader.IsDBNull(reader.GetOrdinal("specifier_category")) 
                        ? "profissional" 
                        : reader["specifier_category"].ToString()!;

                    // Especificadores não têm CPF/CNPJ na tabela TRANSPORTADORA
                    // Enviamos null para que a validação não seja aplicada
                    payload.Specifier = new SpecifierData
                    {
                        IdExt = reader["specifier_id"].ToString()!,
                        Name = specifierName,
                        Cpf = null,
                        Cnpj = null,
                        Email = null,
                        Phone = null,
                        Role = specifierCategory
                    };
                }

                // Calcular checksum
                payload.CalculateChecksum();

                // Comparar com checksum existente - se igual, pular
                if (existingChecksums != null && existingChecksums.TryGetValue(eventId, out var existingChecksum))
                {
                    if (existingChecksum == "__no_checksum__" || existingChecksum == payload.Checksum)
                    {
                        Log.Debug($"⏭️ Fatura {invoiceId} sem alterações (checksum igual)");
                        skippedByChecksum++;
                        continue;
                    }
                    else
                    {
                        Log.Debug($"🔄 Fatura {invoiceId} alterada - checksum anterior: {existingChecksum}, novo: {payload.Checksum}");
                    }
                }

                invoices.Add(payload);
            }

            Log.Information($"📋 Encontradas {invoices.Count} faturas novas/alteradas para sincronizar");
            
            if (skippedByChecksum > 0)
            {
                Log.Information($"⏭️ {skippedByChecksum} faturas puladas (sem alterações - checksum igual)");
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao buscar faturas do banco de dados");
            throw;
        }

        return invoices;
    }

    /// <summary>
    /// Mapeia código de recebimento (CODREC) para tipo de pagamento
    /// Baseado na tabela RECEBIMENTO do CPlus - mapeado em 27/11/2025
    /// </summary>
    private string MapPaymentTypeCode(string? codrec)
    {
        var trimmedCode = codrec?.Trim();
        
        var mappedType = trimmedCode switch
        {
            // Formas de pagamento básicas
            "001" => "cash",              // Dinheiro
            "002" => "check",             // Cheque
            "007" => "voucher",           // Vale
            "008" => "installment",       // Carnê
            "009" => "credit",            // A Prazo (carteira)
            "010" => "boleto",            // Cobrança Bancária
            "025" => "pix",               // PIX
            "033" => "promissory",        // Promissória
            "039" => "transfer",          // TED
            
            // Cartões de Crédito - Cielo
            "003" => "credit_card",       // Cartão Visa
            "004" => "credit_card",       // Cartão MasterCard
            "005" => "credit_card",       // Cartão Amex
            "006" => "credit_card",       // Cartão Hipercard
            "011" => "credit_card",       // CARTAO DE CREDITO CIELO
            
            // Cartões de Débito - Cielo
            "013" => "debit_card",        // CARTAO DE DEBITO CIELO
            
            // Cartões de Crédito - Getnet
            "015" => "credit_card",       // CARTAO DE CREDITO GETNET
            
            // Cartões de Débito - Getnet
            "017" => "debit_card",        // CARTAO DE DEBITO GETNET
            
            // Cartões de Crédito - Stone
            "019" => "credit_card",       // CARTÃO STONE VISA/MASTERCARD CREDITO
            "022" => "credit_card",       // CARTÃO STONE ELO CREDITO
            "024" => "credit_card",       // CARTÃO STONE HIPERCARD/AMEX
            
            // Cartões de Débito - Stone
            "021" => "debit_card",        // CARTÃO STONE VISA/MASTERCARD DEBITO
            "023" => "debit_card",        // CARTÃO STONE ELO DEBITO
            
            // Cartões de Crédito - Caixa
            "029" => "credit_card",       // CARTÃO CAIXA VISA/MASTERCARD CREDITO
            "030" => "credit_card",       // CARTÃO CAIXA HIPERCARD/ELO/AMEX CREDITO
            
            // Cartões de Débito - Caixa
            "031" => "debit_card",        // CARTÃO CAIXA VISA/MASTERCARD DEBITO
            "032" => "debit_card",        // CARTÃO CAIXA ELO DEBITO
            
            // Formatos alternativos (sem zero à esquerda)
            "1" or "01" => "cash",
            "2" or "02" => "check",
            "7" or "07" => "voucher",
            "8" or "08" => "installment",
            "9" or "09" => "credit",
            
            _ => "unknown"
        };

        // Log para códigos não mapeados (ajuda a descobrir novos códigos)
        if (mappedType == "unknown" && !string.IsNullOrEmpty(trimmedCode))
        {
            Log.Warning($"⚠️ Código de pagamento não mapeado: '{trimmedCode}' - Considere adicionar ao MapPaymentTypeCode()");
        }

        return mappedType;
    }

    /// <summary>
    /// Busca novos pagamentos confirmados que ainda não foram sincronizados
    /// Inclui o CODREC para identificar o tipo real de pagamento
    /// Usa checksum para detectar alterações
    /// </summary>
    public async Task<List<PagamentoPayload>> GetNewPaymentsAsync(int? limit = null, DateTime? fromDate = null, Dictionary<string, string>? existingChecksums = null, int offset = 0)
    {
        var payments = new List<PagamentoPayload>();

        var batchSize = limit ?? 500;
        var dateFilter = fromDate.HasValue ? $"AND crr.DATA >= '{fromDate.Value:yyyy-MM-dd}'" : "";
        var invoiceDateFilter = fromDate.HasValue ? $"AND m.DATA >= '{fromDate.Value:yyyy-MM-dd}'" : "";

        var query = $@"
            SELECT FIRST {batchSize} SKIP {offset}
                crr.ID as payment_id,
                m.CODMOVENDA as invoice_id,
                crr.VALOR as paid_amount,
                crr.DATA as paid_at,
                TRIM(crr.CODREC) as payment_type_code
            FROM CONTARECEBERREC crr
            INNER JOIN CONTARECEBER cr ON crr.CODCR = cr.CODCR
            INNER JOIN MOVENDA m ON cr.CODMOVENDA = m.CODMOVENDA
            WHERE crr.VALOR > 0
            {dateFilter}
            {invoiceDateFilter}
            AND m.CODCLI <> 3005
            AND TRIM(m.CODTIPOMOVIMENTO) IN ('000000007', '000000018', '000000064', '007', '018', '064', '7', '18', '64')
            ORDER BY crr.DATA ASC, crr.ID ASC";

        int skippedByChecksum = 0;

        try
        {
            using var connection = new FbConnection(_connectionString);
            await connection.OpenAsync();

            using var command = new FbCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var paymentId = reader["payment_id"].ToString() ?? "";
                var eventId = $"PAG_{paymentId}";

                var paymentTypeCode = reader["payment_type_code"]?.ToString();
                var mappedType = MapPaymentTypeCode(paymentTypeCode);

                // Usar conversão segura de data
                var paidAt = SafeParseDateFromFirebird(reader["paid_at"], "paid_at", $"Pagamento {paymentId}");
                if (!paidAt.HasValue)
                {
                    Log.Warning($"⚠️ Pagamento {paymentId} ignorado por data inválida");
                    continue;
                }

                var payload = new PagamentoPayload
                {
                    EventId = eventId,
                    InvoiceIdExt = reader["invoice_id"].ToString()!,
                    PaidAmount = Convert.ToDecimal(reader["paid_amount"]),
                    PaidAt = paidAt.Value.ToString("yyyy-MM-dd"),
                    PaymentType = mappedType
                };

                // Calcular checksum
                payload.CalculateChecksum();

                // Comparar com checksum existente - se igual, pular
                if (existingChecksums != null && existingChecksums.TryGetValue(eventId, out var existingChecksum))
                {
                    if (existingChecksum == "__no_checksum__" || existingChecksum == payload.Checksum)
                    {
                        Log.Debug($"⏭️ Pagamento {paymentId} sem alterações (checksum igual)");
                        skippedByChecksum++;
                        continue;
                    }
                }

                payments.Add(payload);
                
                Log.Debug($"Pagamento encontrado: {eventId} - Código: {paymentTypeCode} -> Tipo: {mappedType} - Valor: {payload.PaidAmount}");
            }

            Log.Information($"📋 Encontrados {payments.Count} pagamentos novos/alterados para sincronizar");
            
            if (skippedByChecksum > 0)
            {
                Log.Information($"⏭️ {skippedByChecksum} pagamentos pulados (sem alterações - checksum igual)");
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao buscar pagamentos do banco de dados");
            throw;
        }

        return payments;
    }

    /// <summary>
    /// Busca pagamentos à vista (MOVENDAREC) que foram quitados imediatamente
    /// Exclui apenas: Carnê, A Prazo (carteira) e Promissória (serão tratados separadamente)
    /// Usa checksum para detectar alterações
    /// </summary>
    public async Task<List<PagamentoPayload>> GetCashPaymentsAsync(int? limit = null, DateTime? fromDate = null, Dictionary<string, string>? existingChecksums = null, int offset = 0)
    {
        var payments = new List<PagamentoPayload>();

        var batchSize = limit ?? 500;
        var dateFilter = fromDate.HasValue ? $"AND m.DATA >= '{fromDate.Value:yyyy-MM-dd}'" : "";

        // Códigos de recebimento que devem ser EXCLUÍDOS:
        // 008 = Carnê (tratado em CONTARECEBERREC quando pago)
        // 009 = A Prazo/Carteira (tratado em CONTARECEBERREC quando pago)
        // 033 = Promissória (tratado em CONTARECEBERREC quando pago)
        // 002 = Cheque (tratado em GetClearedChecksAsync)
        var excludedCodes = "'002', '008', '009', '033'";

        var query = $@"
            SELECT FIRST {batchSize} SKIP {offset}
                TRIM(m.CODMOVENDA) as invoice_id,
                mr.VALOR as paid_amount,
                m.DATA as paid_at,
                TRIM(r.CODREC) as payment_code,
                TRIM(r.RECEBIMENTO) as payment_type
            FROM MOVENDAREC mr
            INNER JOIN MOVENDA m ON mr.CODMOVENDA = m.CODMOVENDA
            INNER JOIN RECEBIMENTO r ON mr.CODREC = r.CODREC
            WHERE mr.VALOR > 0
            AND m.CODCLI <> 3005
            {dateFilter}
            AND TRIM(r.CODREC) NOT IN ({excludedCodes})
            ORDER BY m.DATA ASC, m.CODMOVENDA ASC";

        int skippedByChecksum = 0;

        try
        {
            using var connection = new FbConnection(_connectionString);
            await connection.OpenAsync();

            using var command = new FbCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var invoiceId = reader["invoice_id"].ToString() ?? "";
                var paymentCode = reader["payment_code"].ToString() ?? "";
                var eventId = $"PAG_VISTA_{invoiceId}_{paymentCode}";
                var paymentTypeName = reader["payment_type"].ToString() ?? "";

                // Usar o método centralizado de mapeamento
                var mappedType = MapPaymentTypeCode(paymentCode);

                // Usar conversão segura de data
                var paidAt = SafeParseDateFromFirebird(reader["paid_at"], "paid_at", $"PagVista {invoiceId}");
                if (!paidAt.HasValue)
                {
                    Log.Warning($"⚠️ Pagamento à vista {eventId} ignorado por data inválida");
                    continue;
                }

                var payload = new PagamentoPayload
                {
                    EventId = eventId,
                    InvoiceIdExt = invoiceId,
                    PaidAmount = Convert.ToDecimal(reader["paid_amount"]),
                    PaidAt = paidAt.Value.ToString("yyyy-MM-dd"),
                    PaymentType = mappedType
                };

                // Calcular checksum
                payload.CalculateChecksum();

                // Comparar com checksum existente - se igual, pular
                if (existingChecksums != null && existingChecksums.TryGetValue(eventId, out var existingChecksum))
                {
                    if (existingChecksum == "__no_checksum__" || existingChecksum == payload.Checksum)
                    {
                        Log.Debug($"⏭️ Pagamento à vista {eventId} sem alterações (checksum igual)");
                        skippedByChecksum++;
                        continue;
                    }
                }

                payments.Add(payload);
                
                Log.Debug($"Pagamento à vista encontrado: {eventId} - Tipo: {paymentTypeName} (Código: {paymentCode} -> {mappedType}) - Fatura: {invoiceId} - Valor: {payload.PaidAmount}");
            }

            Log.Information($"📋 Encontrados {payments.Count} pagamentos à vista novos/alterados para sincronizar");
            
            if (skippedByChecksum > 0)
            {
                Log.Information($"⏭️ {skippedByChecksum} pagamentos à vista pulados (sem alterações - checksum igual)");
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao buscar pagamentos à vista do banco de dados");
            throw;
        }

        return payments;
    }

    /// <summary>
    /// Busca cheques compensados (depositados e não devolvidos)
    /// Usa checksum para detectar alterações
    /// </summary>
    public async Task<List<PagamentoPayload>> GetClearedChecksAsync(int? limit = null, DateTime? fromDate = null, Dictionary<string, string>? existingChecksums = null, int offset = 0)
    {
        var checks = new List<PagamentoPayload>();

        var batchSize = limit ?? 500;
        var dateFilter = fromDate.HasValue ? $"AND c.DEPOSITO >= '{fromDate.Value:yyyy-MM-dd}'" : "";
        var invoiceDateFilter = fromDate.HasValue ? $"AND m.DATA >= '{fromDate.Value:yyyy-MM-dd}'" : "";

        var query = $@"
            SELECT FIRST {batchSize} SKIP {offset}
                TRIM(c.CODMOVENDA) as invoice_id,
                c.VALOR as paid_amount,
                c.DEPOSITO as paid_at,
                TRIM(c.NUMCHEQUE) as check_number,
                TRIM(c.BANCO) as bank,
                TRIM(c.CODCHEQUE) as check_code
            FROM CHEQUES c
            INNER JOIN MOVENDA m ON c.CODMOVENDA = m.CODMOVENDA
            WHERE c.DEPOSITO IS NOT NULL
                AND (c.RETORNOU IS NULL OR c.RETORNOU <> 'S')
                AND c.VALOR > 0
                AND m.CODCLI <> 3005
                {invoiceDateFilter}
                AND TRIM(m.CODTIPOMOVIMENTO) IN ('000000007', '000000018', '000000064', '007', '018', '064', '7', '18', '64')
                {dateFilter}
            ORDER BY c.DEPOSITO ASC";

        int skippedByChecksum = 0;

        try
        {
            using var connection = new FbConnection(_connectionString);
            await connection.OpenAsync();

            using var command = new FbCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var invoiceId = reader["invoice_id"].ToString() ?? "";
                var checkNumber = reader["check_number"].ToString() ?? "";
                var bank = reader["bank"].ToString() ?? "";
                var eventId = $"CHQ_{invoiceId}_{checkNumber}";

                // Usar conversão segura de data - CRÍTICO para cheques
                var rawDate = reader["paid_at"];
                Log.Debug($"[Cheque {checkNumber}] Valor bruto DEPOSITO: '{rawDate}' (Tipo: {rawDate?.GetType().Name ?? "null"})");
                
                var paidAt = SafeParseDateFromFirebird(rawDate, "DEPOSITO", $"Cheque {checkNumber}");
                if (!paidAt.HasValue)
                {
                    Log.Warning($"⚠️ Cheque {eventId} ignorado por data de depósito inválida (valor bruto: '{rawDate}')");
                    continue;
                }

                var payload = new PagamentoPayload
                {
                    EventId = eventId,
                    InvoiceIdExt = invoiceId,
                    PaidAmount = Convert.ToDecimal(reader["paid_amount"]),
                    PaidAt = paidAt.Value.ToString("yyyy-MM-dd"),
                    PaymentType = "check" // Cheques compensados
                };

                // Calcular checksum
                payload.CalculateChecksum();

                // Comparar com checksum existente - se igual, pular
                if (existingChecksums != null && existingChecksums.TryGetValue(eventId, out var existingChecksum))
                {
                    if (existingChecksum == "__no_checksum__" || existingChecksum == payload.Checksum)
                    {
                        Log.Debug($"⏭️ Cheque {eventId} sem alterações (checksum igual)");
                        skippedByChecksum++;
                        continue;
                    }
                }

                checks.Add(payload);
                
                Log.Debug($"✅ Cheque compensado: {eventId} - Banco: {bank} - Fatura: {invoiceId} - Valor: {payload.PaidAmount:C} - Data: {paidAt.Value:yyyy-MM-dd}");
            }

            Log.Information($"📋 Encontrados {checks.Count} cheques compensados novos/alterados para sincronizar");
            
            if (skippedByChecksum > 0)
            {
                Log.Information($"⏭️ {skippedByChecksum} cheques pulados (sem alterações - checksum igual)");
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao buscar cheques compensados do banco de dados");
            throw;
        }

        return checks;
    }

    /// <summary>
    /// Busca todas as faturas com seus tipos de movimento para atualização em batch
    /// Considera apenas operações 007, 018 (produto) e 064 (serviço)
    /// </summary>
    public async Task<List<(string InvoiceIdExt, string MovementType)>> GetAllInvoiceTypesAsync()
    {
        var results = new List<(string InvoiceIdExt, string MovementType)>();

        try
        {
            using var connection = new FbConnection(_connectionString);
            await connection.OpenAsync();

            var sql = @"
                SELECT 
                    CAST(m.CODMOVENDA AS VARCHAR(20)) AS CODMOVENDA,
                    m.CODTIPOMOVIMENTO
                FROM MOVENDA m
                WHERE m.CODTIPOMOVIMENTO IN ('007', '018', '064')
                  AND m.CODMOVENDA IS NOT NULL
                ORDER BY m.DATA DESC";

            using var command = new FbCommand(sql, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var invoiceId = reader["CODMOVENDA"]?.ToString()?.Trim();
                var tipoMovimento = reader["CODTIPOMOVIMENTO"]?.ToString()?.Trim();

                if (string.IsNullOrEmpty(invoiceId))
                    continue;

                // Mapear tipo de movimento: 007, 018 = produto, 064 = serviço
                var movementType = tipoMovimento == "064" ? "servico" : "produto";

                results.Add((invoiceId.PadLeft(9, '0'), movementType));
            }

            Log.Information($"Encontradas {results.Count} faturas para classificação de tipo");
            
            var produtos = results.Count(r => r.MovementType == "produto");
            var servicos = results.Count(r => r.MovementType == "servico");
            Log.Information($"   - Produtos (007, 018): {produtos}");
            Log.Information($"   - Serviços (064): {servicos}");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao buscar tipos de movimento das faturas");
            throw;
        }

        return results;
    }

    /// <summary>
    /// Busca títulos a receber (CONTARECEBER) para o sistema de cobranças
    /// Inclui títulos em aberto E pagos/baixados (para que os pagamentos possam ser vinculados)
    /// Exclui apenas títulos cancelados
    /// Calcula checksum para detectar alterações e evitar sincronização desnecessária
    /// </summary>
    /// <param name="limit">Limite de registros por batch</param>
    /// <param name="fromDate">Data mínima de vencimento (ignorada se ignoreFromDate = true)</param>
    /// <param name="existingChecksums">Checksums existentes para comparar e evitar reenvio de dados inalterados</param>
    /// <param name="ignoreFromDate">Se true, ignora o filtro de data e busca TODOS os títulos em aberto (para régua de cobrança)</param>
    public async Task<BatchResult<TituloPayload>> GetReceivablesAsync(int? limit = null, DateTime? fromDate = null, Dictionary<string, string>? existingChecksums = null, bool ignoreFromDate = false, int offset = 0, DateTime? fullFromDate = null, DateTime? untilDate = null)
    {
        var batchResult = new BatchResult<TituloPayload>();

        var batchSize = limit ?? 500;

        // Janela explícita (--from/--to ou --month) tem PRIORIDADE sobre demais filtros.
        var windowedMode = fromDate.HasValue && untilDate.HasValue;

        string dateFilter;
        string statusDateFilter = "";

        if (windowedMode)
        {
            dateFilter = $"AND cr.DATVENC >= '{fromDate!.Value:yyyy-MM-dd}' AND cr.DATVENC <= '{untilDate!.Value:yyyy-MM-dd}'";
            if (offset == 0)
                Log.Information($"📋 Janela ativa: títulos com DATVENC entre {fromDate.Value:dd/MM/yyyy} e {untilDate.Value:dd/MM/yyyy}");
        }
        else
        {
            dateFilter = (fromDate.HasValue && !ignoreFromDate)
                ? $"AND cr.DATVENC >= '{fromDate.Value:yyyy-MM-dd}'"
                : "";

            if (fullFromDate.HasValue)
            {
                statusDateFilter = $@"
                AND (
                    cr.DATVENC >= '{fullFromDate.Value:yyyy-MM-dd}'
                    OR cr.FLAGCANCELADA = 'S'
                    OR (
                        (cr.FLAGPAGO IS NULL OR cr.FLAGPAGO <> 'S')
                        AND (cr.FLAGCANCELADA IS NULL OR cr.FLAGCANCELADA <> 'S')
                    )
                )";

                if (offset == 0)
                    Log.Information($"📋 Filtro inteligente ativo: antes de {fullFromDate.Value:dd/MM/yyyy} apenas abertos+cancelados, a partir dessa data tudo");
            }

            if (ignoreFromDate && offset == 0 && !fullFromDate.HasValue)
                Log.Information("📋 Buscando TODOS os títulos (abertos, pagos e cancelados, sem filtro de data)");
        }

        var query = $@"
            SELECT FIRST {batchSize} SKIP {offset}
                cr.CODCR as receivable_id,
                cr.CODMOVENDA as invoice_id,
                cr.CODCLI as customer_id,
                c.NOMECLI as customer_name,
                c.CPF as customer_cpf,
                c.CNPJ as customer_cnpj,
                c.EMAIL as customer_email,
                c.TELEFONE as customer_phone,
                cr.VALOR as amount,
                COALESCE(cr.TOTPAGO, 0) as paid_amount,
                cr.DATVENC as due_date,
                cr.DATENTR as issued_at,
                cr.DATCANCEL as cancelled_at,
                cr.PARCELA as installment_number,
                cr.NUMDOC as document_number,
                cr.OBS as description,
                cr.FLAGPAGO as flag_pago,
                cr.FLAGCANCELADA as flag_cancelada
            FROM CONTARECEBER cr
            INNER JOIN CLIENTE c ON cr.CODCLI = c.CODCLI
            WHERE cr.VALOR > 0
            {dateFilter}
            {statusDateFilter}
            ORDER BY cr.DATVENC ASC, cr.CODCR ASC";

        int skippedByChecksum = 0;
        int rawRowsRead = 0;

        try
        {
            using var connection = new FbConnection(_connectionString);
            await connection.OpenAsync();

            using var command = new FbCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                rawRowsRead++;
                var receivableId = reader["receivable_id"].ToString() ?? "";
                var eventId = $"TIT_{receivableId}";

                // Conversão segura de datas
                var dueDate = SafeParseDateFromFirebird(reader["due_date"], "due_date", $"Título {receivableId}");
                if (!dueDate.HasValue)
                {
                    Log.Warning($"⚠️ Título {receivableId} ignorado por data de vencimento inválida");
                    continue;
                }

                var issuedAt = SafeParseDateFromFirebird(reader["issued_at"], "issued_at", $"Título {receivableId}");

                // Data de cancelamento (DATCANCEL) — usada para emitir /titulo-cancelado quando FLAGCANCELADA='S'
                DateTime? cancelledAt = null;
                var cancelOrd = reader.GetOrdinal("cancelled_at");
                if (!reader.IsDBNull(cancelOrd))
                {
                    cancelledAt = SafeParseDateFromFirebird(reader["cancelled_at"], "cancelled_at", $"Título {receivableId}");
                }

                // Calcular valores
                var amount = Convert.ToDecimal(reader["amount"]);
                var paidAmount = reader.IsDBNull(reader.GetOrdinal("paid_amount")) 
                    ? 0m 
                    : Convert.ToDecimal(reader["paid_amount"]);
                var balance = amount - paidAmount;

                // Calcular atraso
                var today = DateTime.Today;
                var daysOverdue = dueDate.Value < today ? (today - dueDate.Value).Days : 0;
                var isOverdue = daysOverdue > 0;

                // CPF/CNPJ do cliente — normalizar: string vazia ou só zeros = null
                var customerCpfRaw = reader.IsDBNull(reader.GetOrdinal("customer_cpf")) 
                    ? null 
                    : reader["customer_cpf"].ToString()?.Trim();
                var customerCpf = string.IsNullOrWhiteSpace(customerCpfRaw) || customerCpfRaw.All(c => c == '0' || c == '.' || c == '-')
                    ? null
                    : customerCpfRaw;
                
                var customerCnpjRaw = reader.IsDBNull(reader.GetOrdinal("customer_cnpj")) 
                    ? null 
                    : reader["customer_cnpj"].ToString()?.Trim();
                var customerCnpj = string.IsNullOrWhiteSpace(customerCnpjRaw) || customerCnpjRaw.All(c => c == '0' || c == '.' || c == '-' || c == '/')
                    ? null
                    : customerCnpjRaw;

                // Parcela (não temos TOTALPARCELAS, usar 1 como default)
                var installmentNumber = 1;
                if (!reader.IsDBNull(reader.GetOrdinal("installment_number")))
                {
                    var parcelaValue = reader["installment_number"].ToString()?.Trim();
                    if (!string.IsNullOrEmpty(parcelaValue) && int.TryParse(parcelaValue, out int parcela))
                    {
                        installmentNumber = parcela;
                    }
                }
                var totalInstallments = 1; // Campo não existe na tabela, usar 1

                var payload = new TituloPayload
                {
                    EventId = eventId,
                    ReceivableIdExt = receivableId,
                    InvoiceIdExt = reader.IsDBNull(reader.GetOrdinal("invoice_id")) 
                        ? null 
                        : reader["invoice_id"].ToString(),
                    Amount = amount,
                    PaidAmount = paidAmount,
                    Balance = balance,
                    DueDate = dueDate.Value.ToString("yyyy-MM-dd"),
                    IssuedAt = issuedAt?.ToString("yyyy-MM-dd") ?? dueDate.Value.ToString("yyyy-MM-dd"),
                    InstallmentNumber = installmentNumber,
                    TotalInstallments = totalInstallments,
                    Status = (reader["flag_cancelada"]?.ToString()?.Trim().ToUpper() == "S") ? "C"
                           : (reader["flag_pago"]?.ToString()?.Trim().ToUpper() == "S") ? "P" : "A",
                    DaysOverdue = daysOverdue,
                    IsOverdue = isOverdue,
                    DocumentNumber = reader.IsDBNull(reader.GetOrdinal("document_number")) 
                        ? null 
                        : reader["document_number"].ToString()?.Trim(),
                    Description = reader.IsDBNull(reader.GetOrdinal("description")) 
                        ? null 
                        : reader["description"].ToString()?.Trim(),
                    Customer = new CustomerData
                    {
                        IdExt = reader["customer_id"].ToString()!,
                        Name = reader["customer_name"].ToString()!,
                        Cpf = customerCpf,
                        Cnpj = customerCnpj,
                        Email = reader.IsDBNull(reader.GetOrdinal("customer_email")) 
                            ? null 
                            : reader["customer_email"].ToString(),
                        Phone = reader.IsDBNull(reader.GetOrdinal("customer_phone")) 
                            ? null 
                            : reader["customer_phone"].ToString()
                    }
                };

                payload.CancelledAt = cancelledAt;


                // Calcular checksum
                payload.CalculateChecksum();

                // Comparar com checksum existente - se igual, pular
                if (existingChecksums != null && existingChecksums.TryGetValue(eventId, out var existingChecksum))
                {
                    if (existingChecksum == "__no_checksum__" || existingChecksum == payload.Checksum)
                    {
                        Log.Debug($"⏭️ Título {receivableId} sem alterações (checksum igual)");
                        skippedByChecksum++;
                        continue;
                    }
                    else
                    {
                        Log.Debug($"🔄 Título {receivableId} alterado - checksum anterior: {existingChecksum}, novo: {payload.Checksum}");
                    }
                }

                batchResult.Items.Add(payload);

                var overdueLabel = isOverdue ? $" ⚠️ VENCIDO há {daysOverdue} dias" : "";
                Log.Debug($"Título encontrado: {eventId} - Valor: {amount:C} - Venc: {dueDate.Value:dd/MM/yyyy}{overdueLabel}");
            }

            batchResult.RawRowsRead = rawRowsRead;
            batchResult.SkippedByChecksum = skippedByChecksum;
            batchResult.HasMoreRows = rawRowsRead >= batchSize;

            Log.Information($"📋 Encontrados {batchResult.Items.Count} títulos a receber para sincronizar (lidos: {rawRowsRead})");
            
            if (skippedByChecksum > 0)
            {
                Log.Information($"⏭️ {skippedByChecksum} títulos pulados (sem alterações - checksum igual)");
            }
            
            var overdueCount = batchResult.Items.Count(r => r.IsOverdue);
            if (overdueCount > 0)
            {
                Log.Warning($"⚠️ {overdueCount} títulos estão vencidos!");
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao buscar títulos a receber do banco de dados");
            throw;
        }

        return batchResult;
    }

    /// <summary>
    /// Busca pagamentos de títulos a receber (CONTARECEBERREC) para sincronização
    /// Usado pelo sistema de cobranças (Financeiro)
    /// </summary>
    public async Task<BatchResult<TituloPagamentoPayload>> GetReceivablePaymentsAsync(int? limit = null, DateTime? fromDate = null, Dictionary<string, string>? existingChecksums = null, bool ignoreFromDate = false, int offset = 0, DateTime? fullFromDate = null, DateTime? untilDate = null)
    {
        var batchResult = new BatchResult<TituloPagamentoPayload>();

        var batchSize = limit ?? 500;

        var windowedMode = fromDate.HasValue && untilDate.HasValue;

        string dateFilter;
        string statusDateFilter = "";

        if (windowedMode)
        {
            dateFilter = $"AND crr.DATA >= '{fromDate!.Value:yyyy-MM-dd}' AND crr.DATA <= '{untilDate!.Value:yyyy-MM-dd}'";
            if (offset == 0)
                Log.Information($"📋 Janela ativa: pagamentos de títulos entre {fromDate.Value:dd/MM/yyyy} e {untilDate.Value:dd/MM/yyyy}");
        }
        else if (fullFromDate.HasValue)
        {
            dateFilter = $"AND crr.DATA >= '{fullFromDate.Value:yyyy-MM-dd}'";
            if (offset == 0)
                Log.Information($"📋 Pagamentos de títulos: apenas a partir de {fullFromDate.Value:dd/MM/yyyy}");

            statusDateFilter = $@"
            AND (
                cr.DATVENC >= '{fullFromDate.Value:yyyy-MM-dd}'
                OR (
                    (cr.FLAGPAGO IS NULL OR cr.FLAGPAGO <> 'S')
                    AND (cr.FLAGCANCELADA IS NULL OR cr.FLAGCANCELADA <> 'S')
                )
            )";

            if (offset == 0)
                Log.Information($"📋 Pagamentos de títulos: apenas para títulos elegíveis (filtro de status antes de {fullFromDate.Value:dd/MM/yyyy})");
        }
        else
        {
            dateFilter = (fromDate.HasValue && !ignoreFromDate)
                ? $"AND crr.DATA >= '{fromDate.Value:yyyy-MM-dd}'"
                : "";
        }

        var query = $@"
            SELECT FIRST {batchSize} SKIP {offset}
                crr.ID as payment_id,
                cr.CODCR as receivable_id,
                crr.VALOR as paid_amount,
                crr.DATA as paid_at,
                TRIM(crr.CODREC) as payment_type_code,
                cr.VALOR as receivable_amount,
                COALESCE(cr.TOTPAGO, 0) as receivable_total_paid,
                cr.FLAGPAGO as flag_pago,
                cr.FLAGCANCELADA as flag_cancelada,
                c.CPF as customer_cpf,
                c.CNPJ as customer_cnpj
            FROM CONTARECEBERREC crr
            INNER JOIN CONTARECEBER cr ON crr.CODCR = cr.CODCR
            INNER JOIN CLIENTE c ON cr.CODCLI = c.CODCLI
            WHERE crr.VALOR > 0
            {dateFilter}
            {statusDateFilter}
            ORDER BY crr.DATA DESC, crr.ID DESC";

        int skippedByChecksum = 0;
        int rawRowsRead = 0;

        try
        {
            using var connection = new FbConnection(_connectionString);
            await connection.OpenAsync();

            using var command = new FbCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                rawRowsRead++;
                var paymentId = reader["payment_id"].ToString() ?? "";
                var receivableId = reader["receivable_id"].ToString() ?? "";
                var eventId = $"TPAG_{receivableId}_{paymentId}";

                var paymentTypeCode = reader["payment_type_code"]?.ToString();
                var mappedType = MapPaymentTypeCode(paymentTypeCode);

                var paidAt = SafeParseDateFromFirebird(reader["paid_at"], "paid_at", $"PagTítulo {paymentId}");
                if (!paidAt.HasValue)
                {
                    Log.Warning($"⚠️ Pagamento de título {eventId} ignorado por data inválida");
                    continue;
                }

                // Detectar se o título está quitado/baixado para enviar status='P' explícito
                // Evita o bug de "balance=0 + status='A'" no Cloud
                var flagPago = reader.IsDBNull(reader.GetOrdinal("flag_pago"))
                    ? null
                    : reader["flag_pago"].ToString()?.Trim().ToUpper();
                var flagCancelada = reader.IsDBNull(reader.GetOrdinal("flag_cancelada"))
                    ? null
                    : reader["flag_cancelada"].ToString()?.Trim().ToUpper();
                var receivableAmount = reader.IsDBNull(reader.GetOrdinal("receivable_amount"))
                    ? 0m
                    : Convert.ToDecimal(reader["receivable_amount"]);
                var receivableTotalPaid = reader.IsDBNull(reader.GetOrdinal("receivable_total_paid"))
                    ? 0m
                    : Convert.ToDecimal(reader["receivable_total_paid"]);
                var receivableBalance = receivableAmount - receivableTotalPaid;

                string? statusOverride = null;
                if (flagPago == "S" || receivableBalance <= 0m)
                    statusOverride = "P";

                var customerCpf = reader.IsDBNull(reader.GetOrdinal("customer_cpf"))
                    ? null
                    : reader["customer_cpf"].ToString();
                var customerCnpj = reader.IsDBNull(reader.GetOrdinal("customer_cnpj"))
                    ? null
                    : reader["customer_cnpj"].ToString();

                var payload = new TituloPagamentoPayload
                {
                    EventId = eventId,
                    ReceivableIdExt = receivableId,
                    PaidAmount = Convert.ToDecimal(reader["paid_amount"]),
                    PaidAt = paidAt.Value.ToString("yyyy-MM-dd"),
                    PaymentType = mappedType,
                    PaymentEventId = eventId,
                    Status = statusOverride,
                    CustomerCpf = customerCpf,
                    CustomerCnpj = customerCnpj
                };

                payload.CalculateChecksum();

                if (existingChecksums != null && existingChecksums.TryGetValue(eventId, out var existingChecksum))
                {
                    if (existingChecksum == "__no_checksum__" || existingChecksum == payload.Checksum)
                    {
                        Log.Debug($"⏭️ Pagamento de título {eventId} sem alterações (checksum igual)");
                        skippedByChecksum++;
                        continue;
                    }
                }

                batchResult.Items.Add(payload);
                Log.Debug($"Pagamento de título encontrado: {eventId} - Valor: {payload.PaidAmount} - Data: {paidAt.Value:yyyy-MM-dd}");
            }

            batchResult.RawRowsRead = rawRowsRead;
            batchResult.SkippedByChecksum = skippedByChecksum;
            batchResult.HasMoreRows = rawRowsRead >= batchSize;

            Log.Information($"📋 Encontrados {batchResult.Items.Count} pagamentos de títulos novos/alterados (lidos: {rawRowsRead})");
            
            if (skippedByChecksum > 0)
            {
                Log.Information($"⏭️ {skippedByChecksum} pagamentos de títulos pulados (sem alterações - checksum igual)");
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao buscar pagamentos de títulos do banco de dados");
            throw;
        }

        return batchResult;
    }

    /// <summary>
    /// Testa a conexão com o banco de dados (somente leitura)
    /// </summary>
    public async Task<bool> TestConnectionAsync()
    {
        try
        {
            using var connection = new FbConnection(_connectionString);
            await connection.OpenAsync();
            Log.Information("✅ Conexão com Firebird estabelecida com sucesso!");
            return true;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "❌ Erro ao conectar no banco de dados Firebird");
            return false;
        }
    }

    /// <summary>
    /// Busca clientes da tabela CLIENTE do Firebird para sincronização dedicada
    /// Usa checksum para evitar reenvio de dados não alterados
    /// </summary>
    public async Task<CustomerBatchResult> GetCustomersAsync(int? limit = null, Dictionary<string, string>? existingChecksums = null, int offset = 0)
    {
        var result = new CustomerBatchResult();
        var batchSize = limit ?? 500;

        var query = $@"
            SELECT FIRST {batchSize} SKIP {offset}
                c.CODCLI as customer_id,
                c.NOMECLI as customer_name,
                c.CPF as customer_cpf,
                c.CNPJ as customer_cnpj,
                c.EMAIL as customer_email,
                c.TELEFONE as customer_phone,
                c.ENDERECO as customer_street,
                c.NUMEROLOGRADOURO as customer_number,
                c.COMPLEMENTOLOGRADOURO as customer_complement,
                c.BAIRRO as customer_neighborhood,
                c.CIDADE as customer_city,
                c.ESTADO as customer_state,
                c.CEP as customer_zip,
                c.DATCAD as customer_datcad
            FROM CLIENTE c
            WHERE c.CODCLI <> 3005
            ORDER BY c.CODCLI ASC";

        int skippedByChecksum = 0;
        int rawRowsRead = 0;

        try
        {
            using var connection = new FbConnection(_connectionString);
            await connection.OpenAsync();

            using var command = new FbCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                rawRowsRead++;
                var customerId = reader["customer_id"].ToString() ?? "";
                var eventId = $"CLI_{customerId}";

                var cpf = reader.IsDBNull(reader.GetOrdinal("customer_cpf"))
                    ? null
                    : reader["customer_cpf"].ToString()?.Trim();

                var cnpj = reader.IsDBNull(reader.GetOrdinal("customer_cnpj"))
                    ? null
                    : reader["customer_cnpj"].ToString()?.Trim();

                var payload = new ClientePayload
                {
                    EventId = eventId,
                    CustomerIdExt = customerId,
                    Name = reader["customer_name"].ToString() ?? "",
                    Cpf = cpf,
                    Cnpj = cnpj,
                    Email = reader.IsDBNull(reader.GetOrdinal("customer_email"))
                        ? null
                        : reader["customer_email"].ToString(),
                    Phone = reader.IsDBNull(reader.GetOrdinal("customer_phone"))
                        ? null
                        : reader["customer_phone"].ToString(),
                    Status = "active",
                    Street = reader.IsDBNull(reader.GetOrdinal("customer_street"))
                        ? null
                        : reader["customer_street"].ToString()?.Trim(),
                    Number = reader.IsDBNull(reader.GetOrdinal("customer_number"))
                        ? null
                        : reader["customer_number"].ToString()?.Trim(),
                    Complement = reader.IsDBNull(reader.GetOrdinal("customer_complement"))
                        ? null
                        : reader["customer_complement"].ToString()?.Trim(),
                    Neighborhood = reader.IsDBNull(reader.GetOrdinal("customer_neighborhood"))
                        ? null
                        : reader["customer_neighborhood"].ToString()?.Trim(),
                    City = reader.IsDBNull(reader.GetOrdinal("customer_city"))
                        ? null
                        : reader["customer_city"].ToString()?.Trim(),
                    State = reader.IsDBNull(reader.GetOrdinal("customer_state"))
                        ? null
                        : reader["customer_state"].ToString()?.Trim(),
                    ZipCode = reader.IsDBNull(reader.GetOrdinal("customer_zip"))
                        ? null
                        : reader["customer_zip"].ToString()?.Trim()
                };

                payload.CalculateChecksum();

                // Comparar com checksum existente
                if (existingChecksums != null && existingChecksums.TryGetValue(eventId, out var existingChecksum))
                {
                    if (existingChecksum == payload.Checksum)
                    {
                        Log.Debug($"⏭️ Cliente {customerId} sem alterações (checksum igual)");
                        skippedByChecksum++;
                        continue;
                    }
                    else
                    {
                        Log.Debug($"🔄 Cliente {customerId} alterado - checksum anterior: {existingChecksum}, novo: {payload.Checksum}");
                    }
                }

                result.Items.Add(payload);
            }

            result.RawRowsRead = rawRowsRead;
            result.SkippedByChecksum = skippedByChecksum;
            result.HasMoreRows = rawRowsRead >= batchSize;

            Log.Information($"📋 Encontrados {result.Items.Count} clientes novos/alterados para sincronizar");

            if (skippedByChecksum > 0)
                Log.Information($"⏭️ {skippedByChecksum} clientes pulados (sem alterações - checksum igual)");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao buscar clientes do banco de dados");
            throw;
        }

        return result;
    }
}

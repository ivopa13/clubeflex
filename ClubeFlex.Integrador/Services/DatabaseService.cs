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

using ClubeFlex.Integrador.Models;
using FirebirdSql.Data.FirebirdClient;
using Serilog;

namespace ClubeFlex.Integrador.Services;

public class DatabaseService
{
    private readonly string _connectionString;

    public DatabaseService(string connectionString)
    {
        _connectionString = connectionString;
    }

    /// <summary>
    /// Busca novas faturas que ainda não foram sincronizadas com sucesso
    /// </summary>
    public async Task<List<FaturaCriadaPayload>> GetNewInvoicesAsync(int? limit = null, DateTime? fromDate = null, HashSet<string>? syncedEventIds = null)
    {
        var invoices = new List<FaturaCriadaPayload>();

        var batchSize = limit ?? 100;
        var dateFilter = fromDate.HasValue ? $"AND m.DATA >= '{fromDate.Value:yyyy-MM-dd}'" : "";

        var query = $@"
            SELECT FIRST {batchSize}
                m.CODMOVENDA as invoice_id,
                m.NUMPED as order_number,
                m.VALORTOTALNOTA as total_amount,
                m.DATA as issued_at,
                m.CODCLI as customer_id,
                m.CODTRANS as specifier_id,
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
            {dateFilter}
            ORDER BY m.DATA DESC, m.CODMOVENDA DESC";

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

                // Pular se já foi sincronizado
                if (syncedEventIds != null && syncedEventIds.Contains(eventId))
                {
                    Log.Debug($"⏭️  Pulando fatura {invoiceId} - já sincronizada");
                    continue;
                }

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

                var payload = new FaturaCriadaPayload
                {
                    EventId = eventId,
                    InvoiceIdExt = invoiceId,
                    OrderNumber = orderNumber,
                    TotalAmount = Convert.ToDecimal(reader["total_amount"]),
                    IssuedAt = Convert.ToDateTime(reader["issued_at"]).ToString("yyyy-MM-dd"),
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

                invoices.Add(payload);
            }

            Log.Information($"Encontradas {invoices.Count} novas faturas para sincronizar");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao buscar faturas do banco de dados");
            throw;
        }

        return invoices;
    }

    /// <summary>
    /// Busca novos pagamentos confirmados que ainda não foram sincronizados
    /// </summary>
    public async Task<List<PagamentoPayload>> GetNewPaymentsAsync(int? limit = null, DateTime? fromDate = null, HashSet<string>? syncedEventIds = null)
    {
        var payments = new List<PagamentoPayload>();

        var batchSize = limit ?? 100;
        var dateFilter = fromDate.HasValue ? $"AND crr.DATA >= '{fromDate.Value:yyyy-MM-dd}'" : "";

        var query = $@"
            SELECT FIRST {batchSize}
                crr.ID as payment_id,
                m.CODMOVENDA as invoice_id,
                crr.VALOR as paid_amount,
                crr.DATA as paid_at
            FROM CONTARECEBERREC crr
            INNER JOIN CONTARECEBER cr ON crr.CODCR = cr.CODCR
            INNER JOIN MOVENDA m ON cr.CODMOVENDA = m.CODMOVENDA
            WHERE crr.VALOR > 0
            {dateFilter}
            ORDER BY crr.DATA DESC, crr.ID DESC";

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

                // Pular se já foi sincronizado
                if (syncedEventIds != null && syncedEventIds.Contains(eventId))
                {
                    Log.Debug($"⏭️  Pulando pagamento {paymentId} - já sincronizado");
                    continue;
                }

                var payload = new PagamentoPayload
                {
                    EventId = eventId,
                    InvoiceIdExt = reader["invoice_id"].ToString()!,
                    PaidAmount = Convert.ToDecimal(reader["paid_amount"]),
                    PaidAt = Convert.ToDateTime(reader["paid_at"]).ToString("yyyy-MM-dd")
                };

                payments.Add(payload);
            }

            Log.Information($"Encontrados {payments.Count} novos pagamentos para sincronizar");
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
    /// Exclui: Vale, Carnê, A Prazo, Promissória, Cheque e Boleto
    /// </summary>
    public async Task<List<PagamentoPayload>> GetCashPaymentsAsync(int? limit = null, DateTime? fromDate = null, HashSet<string>? syncedEventIds = null)
    {
        var payments = new List<PagamentoPayload>();

        var batchSize = limit ?? 100;
        var dateFilter = fromDate.HasValue ? $"AND m.DATA >= '{fromDate.Value:yyyy-MM-dd}'" : "";

        // Códigos de recebimento que devem ser EXCLUÍDOS:
        // 007 = Vale
        // 008 = Carnê
        // 009 = A Prazo
        // 033 = Promissória
        // 002 = Cheque (deixar para implementação futura)
        // 010 = Cobrança Bancária/Boleto (deixar para implementação futura)
        var excludedCodes = "'002', '008', '009', '010', '033'";

        var query = $@"
            SELECT FIRST {batchSize}
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
            ORDER BY m.DATA DESC, m.CODMOVENDA DESC";

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
                var paymentType = reader["payment_type"].ToString() ?? "";

                // Pular se já foi sincronizado
                if (syncedEventIds != null && syncedEventIds.Contains(eventId))
                {
                    Log.Debug($"⏭️  Pulando pagamento à vista {eventId} - já sincronizado");
                    continue;
                }

                var payload = new PagamentoPayload
                {
                    EventId = eventId,
                    InvoiceIdExt = invoiceId,
                    PaidAmount = Convert.ToDecimal(reader["paid_amount"]),
                    PaidAt = Convert.ToDateTime(reader["paid_at"]).ToString("yyyy-MM-dd")
                };

                payments.Add(payload);
                
                Log.Debug($"Pagamento à vista encontrado: {eventId} - Tipo: {paymentType} (Código: {paymentCode}) - Fatura: {invoiceId} - Valor: {payload.PaidAmount}");
            }

            Log.Information($"Encontrados {payments.Count} novos pagamentos à vista para sincronizar");
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
    /// </summary>
    public async Task<List<PagamentoPayload>> GetClearedChecksAsync(int? limit = null, DateTime? fromDate = null, HashSet<string>? syncedEventIds = null)
    {
        var checks = new List<PagamentoPayload>();

        var batchSize = limit ?? 100;
        var dateFilter = fromDate.HasValue ? $"AND c.DEPOSITO >= '{fromDate.Value:yyyy-MM-dd}'" : "";

        var query = $@"
            SELECT FIRST {batchSize}
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
                {dateFilter}
            ORDER BY c.DEPOSITO DESC";

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

                // Pular se já foi sincronizado
                if (syncedEventIds != null && syncedEventIds.Contains(eventId))
                {
                    Log.Debug($"⏭️  Pulando cheque {eventId} - já sincronizado");
                    continue;
                }

                var payload = new PagamentoPayload
                {
                    EventId = eventId,
                    InvoiceIdExt = invoiceId,
                    PaidAmount = Convert.ToDecimal(reader["paid_amount"]),
                    PaidAt = Convert.ToDateTime(reader["paid_at"]).ToString("yyyy-MM-dd")
                };

                checks.Add(payload);
                
                Log.Debug($"✅ Cheque compensado: {eventId} - Banco: {bank} - Fatura: {invoiceId} - Valor: {payload.PaidAmount:C}");
            }

            Log.Information($"Encontrados {checks.Count} cheques compensados para sincronizar");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao buscar cheques compensados do banco de dados");
            throw;
        }

        return checks;
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
}

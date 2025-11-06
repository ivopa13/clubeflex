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
    public async Task<List<FaturaCriadaPayload>> GetNewInvoicesAsync(int? limit = null, DateTime? fromDate = null)
    {
        var invoices = new List<FaturaCriadaPayload>();

        var batchSize = limit ?? 100;
        var dateFilter = fromDate.HasValue ? $"AND m.DATA >= '{fromDate.Value:yyyy-MM-dd}'" : "";

        var query = $@"
            SELECT FIRST {batchSize}
                m.NUMPED as invoice_id,
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
                t.CNPJ as specifier_cnpj,
                t.EMAIL as specifier_email,
                t.TELEFONE as specifier_phone,
                t.CATEGORIA as specifier_role
            FROM MOVENDA m
            INNER JOIN CLIENTE c ON m.CODCLI = c.CODCLI
            LEFT JOIN TRANSPORTADORA t ON m.CODTRANS = t.CODETRANS
            WHERE 1=1
            {dateFilter}
            AND NOT EXISTS (
                SELECT 1 FROM sync_log sl
                WHERE sl.event_id = 'FAT_' || CAST(m.NUMPED AS VARCHAR(50))
                AND sl.event_type = 'fatura-criada'
                AND sl.status = 'success'
            )
            ORDER BY m.DATA DESC";

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

                // Determina qual documento usar (CPF ou CNPJ)
                var customerDoc = !reader.IsDBNull(reader.GetOrdinal("customer_cpf")) && 
                                  !string.IsNullOrWhiteSpace(reader["customer_cpf"].ToString())
                    ? reader["customer_cpf"].ToString()!.Trim()
                    : reader["customer_cnpj"].ToString()!.Trim();

                var payload = new FaturaCriadaPayload
                {
                    EventId = eventId,
                    InvoiceIdExt = invoiceId,
                    TotalAmount = Convert.ToDecimal(reader["total_amount"]),
                    IssuedAt = Convert.ToDateTime(reader["issued_at"]).ToString("yyyy-MM-dd"),
                    Customer = new CustomerData
                    {
                        IdExt = reader["customer_id"].ToString()!,
                        Name = reader["customer_name"].ToString()!,
                        Doc = customerDoc,
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
                    payload.Specifier = new SpecifierData
                    {
                        IdExt = reader["specifier_id"].ToString()!,
                        Name = reader["specifier_name"].ToString()!,
                        Doc = reader["specifier_cnpj"].ToString()!.Trim(),
                        Email = reader.IsDBNull(reader.GetOrdinal("specifier_email")) 
                            ? null 
                            : reader["specifier_email"].ToString(),
                        Phone = reader.IsDBNull(reader.GetOrdinal("specifier_phone")) 
                            ? null 
                            : reader["specifier_phone"].ToString(),
                        Role = reader.IsDBNull(reader.GetOrdinal("specifier_role")) 
                            ? "profissional" 
                            : reader["specifier_role"].ToString()!
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
    public async Task<List<PagamentoPayload>> GetNewPaymentsAsync(int? limit = null, DateTime? fromDate = null)
    {
        var payments = new List<PagamentoPayload>();

        var batchSize = limit ?? 100;
        var dateFilter = fromDate.HasValue ? $"AND cr.DATA >= '{fromDate.Value:yyyy-MM-dd}'" : "";

        var query = $@"
            SELECT FIRST {batchSize}
                cr.CODREC as payment_id,
                cr.ID as invoice_id,
                cr.VALOR as paid_amount,
                cr.DATA as paid_at
            FROM CONTARECEBERREC cr
            WHERE cr.VALOR > 0
            {dateFilter}
            AND NOT EXISTS (
                SELECT 1 FROM sync_log sl
                WHERE sl.event_id = 'PAG_' || CAST(cr.CODREC AS VARCHAR(50))
                AND sl.event_type = 'pagamento-confirmado'
                AND sl.status = 'success'
            )
            ORDER BY cr.DATA DESC";

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
    /// Salva ou atualiza um registro de log de sincronização
    /// </summary>
    public async Task SaveSyncLogAsync(SyncLog log)
    {
        var query = @"
            UPDATE OR INSERT INTO sync_log (event_id, event_type, status, payload, error_message, attempts, created_at, updated_at)
            VALUES (@event_id, @event_type, @status, @payload, @error_message, @attempts, @created_at, @updated_at)
            MATCHING (event_id, event_type)";

        try
        {
            using var connection = new FbConnection(_connectionString);
            await connection.OpenAsync();

            using var command = new FbCommand(query, connection);
            command.Parameters.AddWithValue("@event_id", log.EventId);
            command.Parameters.AddWithValue("@event_type", log.EventType);
            command.Parameters.AddWithValue("@status", log.Status);
            command.Parameters.AddWithValue("@payload", log.Payload ?? (object)DBNull.Value);
            command.Parameters.AddWithValue("@error_message", log.ErrorMessage ?? (object)DBNull.Value);
            command.Parameters.AddWithValue("@attempts", log.Attempts);
            command.Parameters.AddWithValue("@created_at", log.CreatedAt);
            command.Parameters.AddWithValue("@updated_at", DateTime.Now);

            await command.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"Erro ao salvar log de sincronização para evento {log.EventId}");
        }
    }

    /// <summary>
    /// Testa a conexão com o banco de dados
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

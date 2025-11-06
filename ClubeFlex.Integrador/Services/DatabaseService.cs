using Microsoft.Data.SqlClient;
using Serilog;
using ClubeFlex.Integrador.Models;

namespace ClubeFlex.Integrador.Services;

public class DatabaseService
{
    private readonly string _connectionString;

    public DatabaseService(string connectionString)
    {
        _connectionString = connectionString;
    }

    /// <summary>
    /// Busca faturas criadas que ainda não foram sincronizadas
    /// ADAPTE esta query conforme a estrutura do seu banco de dados
    /// </summary>
    public async Task<List<FaturaCriadaPayload>> GetNewInvoicesAsync()
    {
        var invoices = new List<FaturaCriadaPayload>();

        try
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            // QUERY GENÉRICA - ADAPTE CONFORME SEU BANCO
            var query = @"
                SELECT TOP 100
                    f.id AS invoice_id,
                    f.total AS total_amount,
                    f.data_emissao AS issued_at,
                    c.id AS customer_id,
                    c.nome AS customer_name,
                    c.cpf_cnpj AS customer_doc,
                    c.email AS customer_email,
                    c.telefone AS customer_phone,
                    e.id AS specifier_id,
                    e.nome AS specifier_name,
                    e.cpf_cnpj AS specifier_doc,
                    e.email AS specifier_email,
                    e.telefone AS specifier_phone,
                    e.cargo AS specifier_role
                FROM faturas f
                INNER JOIN clientes c ON f.cliente_id = c.id
                LEFT JOIN especificadores e ON f.especificador_id = e.id
                WHERE f.id NOT IN (
                    SELECT event_id FROM sync_log 
                    WHERE event_type = 'fatura-criada' 
                    AND status = 'success'
                )
                AND f.data_emissao >= DATEADD(DAY, -30, GETDATE())
                ORDER BY f.data_emissao DESC";

            using var command = new SqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var invoice = new FaturaCriadaPayload
                {
                    EventId = $"INV-{reader["invoice_id"]}-{DateTime.UtcNow.Ticks}",
                    InvoiceIdExt = reader["invoice_id"].ToString() ?? string.Empty,
                    TotalAmount = Convert.ToDecimal(reader["total_amount"]),
                    IssuedAt = Convert.ToDateTime(reader["issued_at"]).ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    Customer = new CustomerData
                    {
                        IdExt = reader["customer_id"].ToString() ?? string.Empty,
                        Name = reader["customer_name"].ToString() ?? string.Empty,
                        Doc = reader["customer_doc"].ToString() ?? string.Empty,
                        Email = reader["customer_email"] as string,
                        Phone = reader["customer_phone"] as string
                    }
                };

                // Adicionar especificador se existir
                if (reader["specifier_id"] != DBNull.Value)
                {
                    invoice.Specifier = new SpecifierData
                    {
                        IdExt = reader["specifier_id"].ToString() ?? string.Empty,
                        Name = reader["specifier_name"].ToString() ?? string.Empty,
                        Doc = reader["specifier_doc"].ToString() ?? string.Empty,
                        Email = reader["specifier_email"] as string,
                        Phone = reader["specifier_phone"] as string,
                        Role = reader["specifier_role"]?.ToString() ?? "profissional"
                    };
                }

                invoices.Add(invoice);
            }

            Log.Information($"Encontradas {invoices.Count} faturas novas para sincronizar");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao buscar faturas do banco local");
            throw;
        }

        return invoices;
    }

    /// <summary>
    /// Busca pagamentos confirmados que ainda não foram sincronizados
    /// ADAPTE esta query conforme a estrutura do seu banco de dados
    /// </summary>
    public async Task<List<PagamentoPayload>> GetNewPaymentsAsync()
    {
        var payments = new List<PagamentoPayload>();

        try
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            // QUERY GENÉRICA - ADAPTE CONFORME SEU BANCO
            var query = @"
                SELECT TOP 100
                    p.id AS payment_id,
                    p.fatura_id AS invoice_id,
                    p.valor_pago AS paid_amount,
                    p.data_pagamento AS paid_at
                FROM pagamentos p
                WHERE p.id NOT IN (
                    SELECT event_id FROM sync_log 
                    WHERE event_type = 'pagamento-confirmado' 
                    AND status = 'success'
                )
                AND p.status = 'confirmado'
                AND p.data_pagamento >= DATEADD(DAY, -30, GETDATE())
                ORDER BY p.data_pagamento DESC";

            using var command = new SqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var payment = new PagamentoPayload
                {
                    EventId = $"PAY-{reader["payment_id"]}-{DateTime.UtcNow.Ticks}",
                    InvoiceIdExt = reader["invoice_id"].ToString() ?? string.Empty,
                    PaidAmount = Convert.ToDecimal(reader["paid_amount"]),
                    PaidAt = Convert.ToDateTime(reader["paid_at"]).ToString("yyyy-MM-ddTHH:mm:ssZ")
                };

                payments.Add(payment);
            }

            Log.Information($"Encontrados {payments.Count} pagamentos novos para sincronizar");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao buscar pagamentos do banco local");
            throw;
        }

        return payments;
    }

    /// <summary>
    /// Registra evento no log de sincronização
    /// </summary>
    public async Task SaveSyncLogAsync(SyncLog log)
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"
                IF EXISTS (SELECT 1 FROM sync_log WHERE event_id = @EventId)
                BEGIN
                    UPDATE sync_log 
                    SET status = @Status,
                        error_message = @ErrorMessage,
                        attempts = attempts + 1,
                        updated_at = GETDATE()
                    WHERE event_id = @EventId
                END
                ELSE
                BEGIN
                    INSERT INTO sync_log (event_id, event_type, status, payload, error_message, attempts)
                    VALUES (@EventId, @EventType, @Status, @Payload, @ErrorMessage, @Attempts)
                END";

            using var command = new SqlCommand(query, connection);
            command.Parameters.AddWithValue("@EventId", log.EventId);
            command.Parameters.AddWithValue("@EventType", log.EventType);
            command.Parameters.AddWithValue("@Status", log.Status);
            command.Parameters.AddWithValue("@Payload", (object?)log.Payload ?? DBNull.Value);
            command.Parameters.AddWithValue("@ErrorMessage", (object?)log.ErrorMessage ?? DBNull.Value);
            command.Parameters.AddWithValue("@Attempts", log.Attempts);

            await command.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"Erro ao salvar log de sincronização para event_id: {log.EventId}");
        }
    }

    /// <summary>
    /// Testa conexão com o banco de dados
    /// </summary>
    public async Task<bool> TestConnectionAsync()
    {
        try
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            Log.Information("✓ Conexão com banco de dados local estabelecida");
            return true;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "✗ Falha ao conectar com banco de dados local");
            return false;
        }
    }
}

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
                c.TELEFONE as customer_phone
            FROM MOVENDA m
            INNER JOIN CLIENTE c ON m.CODCLI = c.CODCLI
            WHERE 1=1
            {dateFilter}
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
                    // Dados de transportadora são opcionais. Se não houver join/tabela, envia apenas o ID externo
                    payload.Specifier = new SpecifierData
                    {
                        IdExt = reader["specifier_id"].ToString()!,
                        Name = string.Empty,
                        Doc = string.Empty,
                        Email = null,
                        Phone = null,
                        Role = "profissional"
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
                cr.CODCR as invoice_id,
                cr.VALOR as paid_amount,
                cr.DATA as paid_at
            FROM CONTARECEBERREC cr
            WHERE cr.VALOR > 0
            {dateFilter}
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

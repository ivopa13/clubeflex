using Microsoft.Extensions.Configuration;
using Serilog;
using ClubeFlex.Integrador.Models;

namespace ClubeFlex.Integrador.Services;

public class SyncService
{
    private readonly DatabaseService _databaseService;
    private readonly ClubeFlexApiService _apiService;
    private readonly int _maxRetries;
    private readonly int _retryDelaySeconds;

    public SyncService(
        DatabaseService databaseService,
        ClubeFlexApiService apiService,
        IConfiguration configuration)
    {
        _databaseService = databaseService;
        _apiService = apiService;
        _maxRetries = int.TryParse(configuration["SyncSettings:RetryAttempts"], out var retries) ? retries : 3;
        _retryDelaySeconds = int.TryParse(configuration["SyncSettings:RetryDelaySeconds"], out var delay) ? delay : 30;
    }

    /// <summary>
    /// Executa sincronização completa (faturas + pagamentos)
    /// </summary>
    public async Task ExecuteSyncAsync()
    {
        Log.Information("=== Iniciando Teste de Conectividade ===");

        // Testar conexões
        var dbOk = await _databaseService.TestConnectionAsync();
        var apiOk = await _apiService.TestConnectionAsync();

        if (!dbOk || !apiOk)
        {
            Log.Fatal("Falha nos testes de conectividade. Abortando sincronização.");
            return;
        }

        Log.Information("=== Sincronizando Faturas Criadas ===");
        await SyncInvoicesAsync();

        Log.Information("=== Sincronizando Pagamentos Confirmados ===");
        await SyncPaymentsAsync();

        Log.Information("=== Sincronização Finalizada ===");
    }

    /// <summary>
    /// Sincroniza faturas criadas
    /// </summary>
    private async Task SyncInvoicesAsync()
    {
        try
        {
            var invoices = await _databaseService.GetNewInvoicesAsync();

            if (invoices.Count == 0)
            {
                Log.Information("Nenhuma fatura nova para sincronizar");
                return;
            }

            int success = 0;
            int errors = 0;

            foreach (var invoice in invoices)
            {
                var result = await SendWithRetryAsync(
                    async () => await _apiService.SendInvoiceCreatedAsync(invoice),
                    invoice.EventId
                );

                var log = new SyncLog
                {
                    EventId = invoice.EventId,
                    EventType = "fatura-criada",
                    Status = result ? "success" : "error",
                    Payload = Newtonsoft.Json.JsonConvert.SerializeObject(invoice),
                    ErrorMessage = result ? null : "Falha após tentativas de retry",
                    Attempts = result ? 1 : _maxRetries
                };

                await _databaseService.SaveSyncLogAsync(log);

                if (result)
                    success++;
                else
                    errors++;
            }

            Log.Information($"Faturas processadas: {success} sucesso, {errors} erros");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao sincronizar faturas");
        }
    }

    /// <summary>
    /// Sincroniza pagamentos confirmados
    /// </summary>
    private async Task SyncPaymentsAsync()
    {
        try
        {
            var payments = await _databaseService.GetNewPaymentsAsync();

            if (payments.Count == 0)
            {
                Log.Information("Nenhum pagamento novo para sincronizar");
                return;
            }

            int success = 0;
            int errors = 0;

            foreach (var payment in payments)
            {
                var result = await SendWithRetryAsync(
                    async () => await _apiService.SendPaymentConfirmedAsync(payment),
                    payment.EventId
                );

                var log = new SyncLog
                {
                    EventId = payment.EventId,
                    EventType = "pagamento-confirmado",
                    Status = result ? "success" : "error",
                    Payload = Newtonsoft.Json.JsonConvert.SerializeObject(payment),
                    ErrorMessage = result ? null : "Falha após tentativas de retry",
                    Attempts = result ? 1 : _maxRetries
                };

                await _databaseService.SaveSyncLogAsync(log);

                if (result)
                    success++;
                else
                    errors++;
            }

            Log.Information($"Pagamentos processados: {success} sucesso, {errors} erros");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao sincronizar pagamentos");
        }
    }

    /// <summary>
    /// Envia com retry automático em caso de falha
    /// </summary>
    private async Task<bool> SendWithRetryAsync(Func<Task<bool>> sendAction, string eventId)
    {
        for (int attempt = 1; attempt <= _maxRetries; attempt++)
        {
            var success = await sendAction();

            if (success)
                return true;

            if (attempt < _maxRetries)
            {
                Log.Warning($"Tentativa {attempt}/{_maxRetries} falhou para {eventId}. Aguardando {_retryDelaySeconds}s...");
                await Task.Delay(_retryDelaySeconds * 1000);
            }
        }

        Log.Error($"Todas as {_maxRetries} tentativas falharam para {eventId}");
        return false;
    }
}

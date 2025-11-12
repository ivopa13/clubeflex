using Microsoft.Extensions.Configuration;
using Serilog;
using ClubeFlex.Integrador.Models;

namespace ClubeFlex.Integrador.Services;

public class SyncService
{
    private readonly DatabaseService _databaseService;
    private readonly ClubeFlexApiService _apiService;
    private readonly CloudSyncLogService _cloudSyncLogService;
    private readonly int _maxRetries;
    private readonly int _retryDelaySeconds;
    private readonly bool _testMode;
    private readonly int _testModeLimit;
    private readonly DateTime? _syncFromDate;

    public SyncService(
        DatabaseService databaseService,
        ClubeFlexApiService apiService,
        CloudSyncLogService cloudSyncLogService,
        IConfiguration configuration)
    {
        _databaseService = databaseService;
        _apiService = apiService;
        _cloudSyncLogService = cloudSyncLogService;
        _maxRetries = int.TryParse(configuration["SyncSettings:RetryAttempts"], out var retries) ? retries : 3;
        _retryDelaySeconds = int.TryParse(configuration["SyncSettings:RetryDelaySeconds"], out var delay) ? delay : 30;
        _testMode = bool.TryParse(configuration["SyncSettings:TestMode"], out var testMode) && testMode;
        _testModeLimit = int.TryParse(configuration["SyncSettings:TestModeLimit"], out var limit) ? limit : 10;
        
        var syncFromDateStr = configuration["SyncSettings:SyncFromDate"];
        _syncFromDate = !string.IsNullOrEmpty(syncFromDateStr) && DateTime.TryParse(syncFromDateStr, out var date) 
            ? date 
            : null;

        if (_testMode)
            Log.Warning($"⚠️ MODO TESTE ATIVADO - Sincronizando apenas {_testModeLimit} registros mais recentes");
        
        if (_syncFromDate.HasValue)
            Log.Information($"📅 Sincronizando apenas registros a partir de {_syncFromDate.Value:dd/MM/yyyy}");
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
            var limit = _testMode ? _testModeLimit : (int?)null;
            var invoices = await _databaseService.GetNewInvoicesAsync(limit, _syncFromDate);

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
                    Status = result.Success ? "success" : "error",
                    Payload = Newtonsoft.Json.JsonConvert.SerializeObject(invoice),
                    ErrorMessage = result.ErrorMessage,
                    Attempts = result.Success ? 1 : (result.IsValidationError ? 1 : _maxRetries)
                };

                await _cloudSyncLogService.SaveSyncLogAsync(log);

                if (result.Success)
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
    /// Sincroniza pagamentos confirmados (a prazo + à vista)
    /// </summary>
    private async Task SyncPaymentsAsync()
    {
        try
        {
            var limit = _testMode ? _testModeLimit : (int?)null;
            
            // Buscar pagamentos a prazo (CONTARECEBERREC)
            var creditPayments = await _databaseService.GetNewPaymentsAsync(limit, _syncFromDate);
            
            // Buscar pagamentos à vista (MOVENDAREC)
            var cashPayments = await _databaseService.GetCashPaymentsAsync(limit, _syncFromDate);
            
            // Combinar ambas as listas
            var allPayments = creditPayments.Concat(cashPayments).ToList();

            if (allPayments.Count == 0)
            {
                Log.Information("Nenhum pagamento novo para sincronizar");
                return;
            }

            Log.Information($"📊 Total de pagamentos encontrados: {allPayments.Count}");
            Log.Information($"   - Pagamentos a prazo (CONTARECEBERREC): {creditPayments.Count}");
            Log.Information($"   - Pagamentos à vista (MOVENDAREC): {cashPayments.Count}");

            int success = 0;
            int errors = 0;

            foreach (var payment in allPayments)
            {
                var result = await SendWithRetryAsync(
                    async () => await _apiService.SendPaymentConfirmedAsync(payment),
                    payment.EventId
                );

                var log = new SyncLog
                {
                    EventId = payment.EventId,
                    EventType = "pagamento-confirmado",
                    Status = result.Success ? "success" : "error",
                    Payload = Newtonsoft.Json.JsonConvert.SerializeObject(payment),
                    ErrorMessage = result.ErrorMessage,
                    Attempts = result.Success ? 1 : (result.IsValidationError ? 1 : _maxRetries)
                };

                await _cloudSyncLogService.SaveSyncLogAsync(log);

                if (result.Success)
                    success++;
                else
                    errors++;
            }

            Log.Information($"✅ Pagamentos processados: {success} sucesso, {errors} erros");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao sincronizar pagamentos");
        }
    }

    /// <summary>
    /// Envia com retry automático em caso de falha
    /// </summary>
    private async Task<ApiResponse> SendWithRetryAsync(Func<Task<ApiResponse>> sendAction, string eventId)
    {
        for (int attempt = 1; attempt <= _maxRetries; attempt++)
        {
            try
            {
                var result = await sendAction();

                if (result.Success)
                    return result;

                // Se é erro de validação, não retenta
                if (result.IsValidationError)
                {
                    Log.Warning($"❌ Erro de validação detectado para {eventId}. Não será retentado.");
                    return result;
                }

                // Se é erro técnico e ainda tem tentativas, aguarda e retenta
                if (attempt < _maxRetries)
                {
                    Log.Warning($"Tentativa {attempt}/{_maxRetries} falhou para {eventId}. Aguardando {_retryDelaySeconds}s...");
                    await Task.Delay(_retryDelaySeconds * 1000);
                }
            }
            catch (Exception ex)
            {
                Log.Error(ex, $"Erro na tentativa {attempt} para {eventId}");
                
                if (attempt >= _maxRetries)
                {
                    return new ApiResponse 
                    { 
                        Success = false, 
                        ErrorMessage = ex.Message 
                    };
                }
                
                await Task.Delay(_retryDelaySeconds * 1000);
            }
        }

        Log.Error($"Todas as {_maxRetries} tentativas falharam para {eventId}");
        return new ApiResponse 
        { 
            Success = false, 
            ErrorMessage = "Falha após todas as tentativas" 
        };
    }
}

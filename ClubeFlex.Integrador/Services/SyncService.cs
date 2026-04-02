using Microsoft.Extensions.Configuration;
using Serilog;
using ClubeFlex.Integrador.Models;

namespace ClubeFlex.Integrador.Services;

/// <summary>
/// Serviço de sincronização multi-projeto
/// Envia dados do ERP para múltiplos projetos Lovable simultaneamente
/// </summary>
public class SyncService
{
    private readonly DatabaseService _databaseService;
    private readonly List<ProjectConfig> _projects;
    private readonly int _maxRetries;
    private readonly int _retryDelaySeconds;
    private readonly bool _testMode;
    private readonly int _testModeLimit;
    private readonly int _batchSize;
    private readonly DateTime? _syncFromDate;

    public SyncService(DatabaseService databaseService, IConfiguration configuration)
    {
        _databaseService = databaseService;

        _projects = configuration.GetSection("Projects").Get<List<ProjectConfig>>() ?? new List<ProjectConfig>();

        if (_projects.Count == 0)
        {
            var legacyConfig = LoadLegacyConfig(configuration);
            if (legacyConfig != null)
                _projects.Add(legacyConfig);
        }

        foreach (var project in _projects)
        {
            if (project.IsValid())
                Log.Information($"📦 Projeto configurado: {project.Name} - Sincroniza: {project.GetSyncDescription()}");
            else
                Log.Warning($"⚠️ Projeto {project.Name} tem configuração inválida e será ignorado");
        }

        _maxRetries = int.TryParse(configuration["SyncSettings:RetryAttempts"], out var retries) ? retries : 3;
        _retryDelaySeconds = int.TryParse(configuration["SyncSettings:RetryDelaySeconds"], out var delay) ? delay : 30;
        _testMode = bool.TryParse(configuration["SyncSettings:TestMode"], out var testMode) && testMode;
        _testModeLimit = int.TryParse(configuration["SyncSettings:TestModeLimit"], out var limit) ? limit : 10;
        _batchSize = int.TryParse(configuration["SyncSettings:BatchSize"], out var batch) ? batch : 500;

        Log.Information($"📦 BatchSize configurado: {_batchSize}");

        var syncFromDateStr = configuration["SyncSettings:SyncFromDate"];
        if (!string.IsNullOrEmpty(syncFromDateStr))
        {
            if (syncFromDateStr.Equals("TODAY", StringComparison.OrdinalIgnoreCase))
            {
                _syncFromDate = DateTime.Today.AddDays(-1);
                Log.Information($"🔄 Sincronizando dados de ontem até hoje: {_syncFromDate.Value:dd/MM/yyyy}");
            }
            else if (DateTime.TryParse(syncFromDateStr, out var date))
            {
                _syncFromDate = date;
                Log.Information($"📅 Sincronizando apenas registros a partir de {_syncFromDate.Value:dd/MM/yyyy}");
            }
        }

        if (_testMode)
            Log.Warning($"⚠️ MODO TESTE ATIVADO - Sincronizando apenas {_testModeLimit} registros");
    }

    private ProjectConfig? LoadLegacyConfig(IConfiguration configuration)
    {
        var baseUrl = configuration["ClubeFlexApi:BaseUrl"];
        var apiKey = configuration["ClubeFlexApi:ApiKey"];

        if (string.IsNullOrEmpty(baseUrl) || string.IsNullOrEmpty(apiKey))
            return null;

        Log.Information("📌 Usando configuração legacy (ClubeFlexApi)");

        return new ProjectConfig
        {
            Name = "ClubeFlex",
            BaseUrl = baseUrl,
            ApiKey = apiKey,
            SyncInvoices = true,
            SyncPayments = true,
            SyncReceivables = false
        };
    }

    /// <summary>
    /// Executa sincronização para todos os projetos (chamado pelo Program.cs)
    /// </summary>
    public async Task ExecuteSyncAsync()
    {
        var validProjects = _projects.Where(p => p.IsValid()).ToList();

        if (validProjects.Count == 0)
        {
            Log.Error("❌ Nenhum projeto válido configurado. Verifique o appsettings.json");
            return;
        }

        Log.Information($"🚀 Iniciando sincronização para {validProjects.Count} projeto(s)");

        foreach (var project in validProjects)
            await SyncForProjectAsync(project);

        Log.Information("✅ Sincronização de todos os projetos concluída");
    }

    /// <summary>
    /// Atualiza tipos de movimento das faturas (chamado pelo Program.cs com --update-types)
    /// Use a edge function reclassify-invoices no painel admin para reclassificação em lote.
    /// </summary>
    public Task UpdateInvoiceTypesAsync()
    {
        Log.Information("ℹ️ Para reclassificar tipos de movimento, use o painel admin em /admin/vendas > Manutenção de Dados.");
        Log.Information("A reclassificação via integrador não está disponível nesta versão.");
        return Task.CompletedTask;
    }

    /// <summary>
    /// Retorna o projeto ClubeFlex (projeto principal) para centralização de logs
    /// </summary>
    private ProjectConfig? GetMainProject()
    {
        return _projects.FirstOrDefault(p => p.Name == "ClubeFlex" && p.IsValid());
    }

    private async Task SyncForProjectAsync(ProjectConfig project)
    {
        Log.Information($"[{project.Name}] === Iniciando sincronização ===");

        var apiService = new ProjectApiService(project);
        var syncLogService = new ProjectSyncLogService(project);

        // Para projetos secundários, criar também um log centralizado no projeto principal
        ProjectSyncLogService? centralLogService = null;
        var mainProject = GetMainProject();
        if (mainProject != null && project.Name != "ClubeFlex")
        {
            centralLogService = new ProjectSyncLogService(mainProject, project.Name);
        }

        await syncLogService.StartExecutionAsync();
        if (centralLogService != null)
            await centralLogService.StartExecutionAsync();

        var counters = new SyncCounters();

        try
        {
            if (project.SyncInvoices)
                await SyncInvoicesForProjectAsync(project, apiService, syncLogService, counters);

            if (project.SyncPayments)
                await SyncPaymentsForProjectAsync(project, apiService, syncLogService, counters);

            if (project.SyncReceivables)
                await SyncReceivablesForProjectAsync(project, apiService, syncLogService, counters, project.SyncReceivablesIgnoreDate);

            if (project.SyncCustomers)
                await SyncCustomersForProjectAsync(project, apiService, syncLogService, counters);

            Log.Information($"[{project.Name}] ✅ Concluído: {counters.SuccessCount} sucesso, {counters.ErrorCount} erros");
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{project.Name}] Erro durante sincronização");
        }
        finally
        {
            var status = counters.ErrorCount > 0 ? "completed_with_errors" : "completed";
            var total = counters.InvoiceCount + counters.PaymentCount + counters.CustomerCount;
            await syncLogService.FinishExecutionAsync(status, total, counters.SuccessCount, counters.ErrorCount, counters.InvoiceCount, counters.PaymentCount);
            if (centralLogService != null)
                await centralLogService.FinishExecutionAsync(status, total, counters.SuccessCount, counters.ErrorCount, counters.InvoiceCount, counters.PaymentCount);
        }
    }

    private async Task SyncInvoicesForProjectAsync(
        ProjectConfig project,
        ProjectApiService apiService,
        ProjectSyncLogService syncLogService,
        SyncCounters counters)
    {
        Log.Information($"[{project.Name}] === Sincronizando Faturas ===");

        try
        {
            var existingChecksums = await syncLogService.GetInvoiceChecksumsAsync();
            var limit = _testMode ? _testModeLimit : _batchSize;

            int totalInvoices = 0, totalSuccess = 0, totalErrors = 0, batchNumber = 0;

            while (true)
            {
                batchNumber++;
                var offset = (batchNumber - 1) * limit;
                Log.Information($"[{project.Name}] 📦 Lote {batchNumber} de faturas (offset {offset})...");

                var invoices = await _databaseService.GetNewInvoicesAsync(limit, _syncFromDate, existingChecksums, offset);

                if (invoices.Count == 0)
                {
                    Log.Information(batchNumber == 1
                        ? $"[{project.Name}] Nenhuma fatura nova ou alterada"
                        : $"[{project.Name}] Faturas: {batchNumber - 1} lotes processados");
                    break;
                }

                totalInvoices += invoices.Count;
                Log.Information($"[{project.Name}] 📋 Lote {batchNumber}: {invoices.Count} faturas");

                foreach (var invoice in invoices)
                {
                    var result = await SendWithRetryAsync(
                        async () => await apiService.SendInvoiceCreatedAsync(invoice),
                        invoice.EventId, project.Name);

                    await syncLogService.SaveSyncLogAsync(new SyncLog
                    {
                        EventId = invoice.EventId,
                        EventType = "fatura",
                        Status = result.Success ? "success" : "error",
                        ErrorMessage = result.ErrorMessage,
                        Payload = invoice.Checksum != null ? $"{{\"checksum\":\"{invoice.Checksum}\"}}" : null
                    });

                    counters.InvoiceCount++;
                    if (result.Success) { counters.SuccessCount++; totalSuccess++; }
                    else { counters.ErrorCount++; totalErrors++; }
                }

                if (invoices.Count < limit || _testMode) break;
            }

            if (totalInvoices > 0)
                Log.Information($"[{project.Name}] 📊 Faturas: {totalInvoices} processadas, {totalSuccess} sucesso, {totalErrors} erros");
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{project.Name}] Erro ao sincronizar faturas");
        }
    }

    private async Task SyncPaymentsForProjectAsync(
        ProjectConfig project,
        ProjectApiService apiService,
        ProjectSyncLogService syncLogService,
        SyncCounters counters)
    {
        Log.Information($"[{project.Name}] === Sincronizando Pagamentos ===");

        try
        {
            var existingChecksums = await syncLogService.GetPaymentChecksumsAsync();
            var limit = _testMode ? _testModeLimit : _batchSize;
            var acc = new PaymentAccumulator();

            await PaginateAndSendPaymentsAsync("A prazo",
                async (lim, off) => await _databaseService.GetNewPaymentsAsync(lim, _syncFromDate, existingChecksums, off),
                limit, project, apiService, syncLogService, counters, acc);

            await PaginateAndSendPaymentsAsync("À vista",
                async (lim, off) => await _databaseService.GetCashPaymentsAsync(lim, _syncFromDate, existingChecksums, off),
                limit, project, apiService, syncLogService, counters, acc);

            await PaginateAndSendPaymentsAsync("Cheques",
                async (lim, off) => await _databaseService.GetClearedChecksAsync(lim, _syncFromDate, existingChecksums, off),
                limit, project, apiService, syncLogService, counters, acc);

            if (acc.TotalPayments > 0)
                Log.Information($"[{project.Name}] 📊 Pagamentos: {acc.TotalPayments} processados, {acc.TotalSuccess} sucesso, {acc.TotalErrors} erros");
            else
                Log.Information($"[{project.Name}] Nenhum pagamento novo ou alterado");
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{project.Name}] Erro ao sincronizar pagamentos");
        }
    }

    private class PaymentAccumulator
    {
        public int TotalPayments { get; set; }
        public int TotalSuccess { get; set; }
        public int TotalErrors { get; set; }
    }

    private async Task PaginateAndSendPaymentsAsync(
        string paymentTypeName,
        Func<int, int, Task<List<PagamentoPayload>>> fetchFunc,
        int limit,
        ProjectConfig project,
        ProjectApiService apiService,
        ProjectSyncLogService syncLogService,
        SyncCounters counters,
        PaymentAccumulator acc)
    {
        int batchNumber = 0;

        while (true)
        {
            batchNumber++;
            var offset = (batchNumber - 1) * limit;
            var payments = await fetchFunc(limit, offset);

            if (payments.Count == 0)
            {
                Log.Information(batchNumber == 1
                    ? $"[{project.Name}] {paymentTypeName}: nenhum pagamento novo"
                    : $"[{project.Name}] {paymentTypeName}: {batchNumber - 1} lotes processados");
                break;
            }

            acc.TotalPayments += payments.Count;
            Log.Information($"[{project.Name}] 📋 {paymentTypeName} lote {batchNumber}: {payments.Count} pagamentos");

            foreach (var payment in payments)
            {
                var result = await SendWithRetryAsync(
                    async () => await apiService.SendPaymentConfirmedAsync(payment),
                    payment.EventId, project.Name);

                await syncLogService.SaveSyncLogAsync(new SyncLog
                {
                    EventId = payment.EventId,
                    EventType = "pagamento",
                    Status = result.Success ? "success" : "error",
                    ErrorMessage = result.ErrorMessage,
                    Payload = payment.Checksum != null ? $"{{\"checksum\":\"{payment.Checksum}\"}}" : null
                });

                counters.PaymentCount++;
                if (result.Success) { counters.SuccessCount++; acc.TotalSuccess++; }
                else { counters.ErrorCount++; acc.TotalErrors++; }
            }

            if (payments.Count < limit || _testMode) break;
        }
    }

    private async Task SyncReceivablesForProjectAsync(
        ProjectConfig project,
        ProjectApiService apiService,
        ProjectSyncLogService syncLogService,
        SyncCounters counters,
        bool ignoreFromDate = false)
    {
        Log.Information($"[{project.Name}] === Sincronizando Títulos a Receber ===");

        // Parsear SyncReceivablesFullFromDate do ProjectConfig
        DateTime? fullFromDate = null;
        if (!string.IsNullOrEmpty(project.SyncReceivablesFullFromDate) && DateTime.TryParse(project.SyncReceivablesFullFromDate, out var parsedDate))
        {
            fullFromDate = parsedDate;
            Log.Information($"[{project.Name}] 📅 Filtro inteligente: abertos do histórico + tudo a partir de {parsedDate:dd/MM/yyyy}");
        }

        try
        {
            var existingChecksums = await syncLogService.GetReceivableChecksumsAsync();
            var limit = _testMode ? _testModeLimit : _batchSize;

            if (ignoreFromDate && fullFromDate == null)
                Log.Information($"[{project.Name}] 🔓 Modo histórico: ignorando filtro de data");

            // === Paginação de títulos ===
            int totalReceivables = 0, totalRecSuccess = 0, totalRecErrors = 0, batchNumber = 0;

            while (true)
            {
                batchNumber++;
                var offset = (batchNumber - 1) * limit;
                Log.Information($"[{project.Name}] 📦 Lote {batchNumber} de títulos (offset {offset})...");

                var receivableBatch = await _databaseService.GetReceivablesAsync(limit, _syncFromDate, existingChecksums, ignoreFromDate, offset, fullFromDate);
                var receivables = receivableBatch.Items;

                if (receivables.Count == 0)
                {
                    if (receivableBatch.HasMoreRows && !_testMode)
                    {
                        Log.Information($"[{project.Name}] Lote {batchNumber} sem alterações. Avançando para o próximo lote...");
                        continue;
                    }

                    Log.Information(batchNumber == 1
                        ? $"[{project.Name}] Nenhum título novo ou alterado"
                        : $"[{project.Name}] Títulos: {batchNumber - 1} lotes processados");
                    break;
                }

                totalReceivables += receivables.Count;
                Log.Information($"[{project.Name}] 📋 Lote {batchNumber}: {receivables.Count} títulos");

                foreach (var receivable in receivables)
                {
                    receivable.ExecutionId = syncLogService.GetCurrentExecutionId();

                    var result = await SendWithRetryAsync(
                        async () => await apiService.SendReceivableAsync(receivable),
                        receivable.EventId, project.Name);

                    await syncLogService.SaveSyncLogAsync(new SyncLog
                    {
                        EventId = receivable.EventId,
                        EventType = "titulo",
                        Status = result.Success ? "success" : "error",
                        ErrorMessage = result.ErrorMessage,
                        Payload = receivable.Checksum != null ? $"{{\"checksum\":\"{receivable.Checksum}\"}}" : null
                    });

                    counters.InvoiceCount++;
                    if (result.Success) { counters.SuccessCount++; totalRecSuccess++; }
                    else { counters.ErrorCount++; totalRecErrors++; }
                }

                if (!receivableBatch.HasMoreRows || _testMode) break;
            }

            if (totalReceivables > 0)
                Log.Information($"[{project.Name}] 📊 Títulos: {totalReceivables} processados, {totalRecSuccess} sucesso, {totalRecErrors} erros");

            // === Paginação de pagamentos de títulos ===
            int totalPayments = 0, totalPaySuccess = 0, totalPayErrors = 0, payBatch = 0;
            var existingPayChecksums = await syncLogService.GetReceivablePaymentChecksumsAsync();

            while (true)
            {
                payBatch++;
                var offset = (payBatch - 1) * limit;
                Log.Information($"[{project.Name}] 📦 Lote {payBatch} de pagamentos de títulos (offset {offset})...");

                var payBatchResult = await _databaseService.GetReceivablePaymentsAsync(limit, _syncFromDate, existingPayChecksums, ignoreFromDate, offset, fullFromDate);
                var payments = payBatchResult.Items;

                if (payments.Count == 0)
                {
                    if (payBatchResult.HasMoreRows && !_testMode)
                    {
                        Log.Information($"[{project.Name}] Lote {payBatch} de pagamentos sem alterações. Avançando...");
                        continue;
                    }

                    Log.Information(payBatch == 1
                        ? $"[{project.Name}] Nenhum pagamento de título novo"
                        : $"[{project.Name}] Pagamentos de títulos: {payBatch - 1} lotes processados");
                    break;
                }

                totalPayments += payments.Count;
                Log.Information($"[{project.Name}] 📋 Lote {payBatch}: {payments.Count} pagamentos de títulos");

                foreach (var payment in payments)
                {
                    payment.ExecutionId = syncLogService.GetCurrentExecutionId();

                    var result = await SendWithRetryAsync(
                        async () => await apiService.SendReceivablePaymentAsync(payment),
                        payment.EventId, project.Name);

                    await syncLogService.SaveSyncLogAsync(new SyncLog
                    {
                        EventId = payment.EventId,
                        EventType = "titulo_pagamento",
                        Status = result.Success ? "success" : "error",
                        ErrorMessage = result.ErrorMessage,
                        Payload = payment.Checksum != null ? $"{{\"checksum\":\"{payment.Checksum}\"}}" : null
                    });

                    counters.PaymentCount++;
                    if (result.Success) { counters.SuccessCount++; totalPaySuccess++; }
                    else { counters.ErrorCount++; totalPayErrors++; }
                }

                if (!payBatchResult.HasMoreRows || _testMode) break;
            }

            if (totalPayments > 0)
                Log.Information($"[{project.Name}] 📊 Pagamentos de títulos: {totalPayments} processados, {totalPaySuccess} sucesso, {totalPayErrors} erros");
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{project.Name}] Erro ao sincronizar títulos a receber");
        }
    }

    /// <summary>
    /// Envia com retry automático. Erros 4xx não são retentados (permanentes).
    /// </summary>
    private async Task<ApiResponse> SendWithRetryAsync(Func<Task<ApiResponse>> sendAction, string eventId, string projectName)
    {
        for (int attempt = 1; attempt <= _maxRetries; attempt++)
        {
            try
            {
                var result = await sendAction();

                if (result.Success)
                    return result;

                // Erros 4xx são permanentes — não retentar
                if (result.IsValidationError)
                {
                    Log.Warning($"[{projectName}] ⚠️ Erro permanente (4xx) para {eventId}: {result.ErrorMessage}. Não será retentado.");
                    return result;
                }

                if (attempt < _maxRetries)
                {
                    Log.Warning($"[{projectName}] Tentativa {attempt}/{_maxRetries} falhou para {eventId}. Aguardando {_retryDelaySeconds}s...");
                    await Task.Delay(TimeSpan.FromSeconds(_retryDelaySeconds));
                }
                else
                {
                    Log.Error($"[{projectName}] ❌ Falha após {_maxRetries} tentativas para {eventId}: {result.ErrorMessage}");
                    result.ErrorMessage = $"Falha após todas as tentativas";
                    return result;
                }
            }
            catch (Exception ex)
            {
                if (attempt < _maxRetries)
                {
                    Log.Warning(ex, $"[{projectName}] Exceção na tentativa {attempt}/{_maxRetries} para {eventId}. Aguardando {_retryDelaySeconds}s...");
                    await Task.Delay(TimeSpan.FromSeconds(_retryDelaySeconds));
                }
                else
                {
                    Log.Error(ex, $"[{projectName}] ❌ Exceção após {_maxRetries} tentativas para {eventId}");
                    return new ApiResponse { Success = false, ErrorMessage = "Falha após todas as tentativas" };
                }
            }
        }

        return new ApiResponse { Success = false, ErrorMessage = "Falha após todas as tentativas" };
    }

    private class SyncCounters
    {
        public int InvoiceCount { get; set; }
        public int PaymentCount { get; set; }
        public int CustomerCount { get; set; }
        public int SuccessCount { get; set; }
        public int ErrorCount { get; set; }
    }

    private async Task SyncCustomersForProjectAsync(
        ProjectConfig project,
        ProjectApiService apiService,
        ProjectSyncLogService syncLogService,
        SyncCounters counters)
    {
        Log.Information($"[{project.Name}] === Sincronizando Clientes ===");

        try
        {
            var existingChecksums = await syncLogService.GetCustomerChecksumsAsync();
            var limit = _testMode ? _testModeLimit : _batchSize;

            int totalCustomers = 0, totalSuccess = 0, totalErrors = 0, batchNumber = 0;

            while (true)
            {
                batchNumber++;
                var offset = (batchNumber - 1) * limit;
                Log.Information($"[{project.Name}] 📦 Lote {batchNumber} de clientes (offset {offset})...");

                var customerBatch = await _databaseService.GetCustomersAsync(limit, existingChecksums, offset);
                var customers = customerBatch.Items;

                if (customers.Count == 0)
                {
                    if (customerBatch.HasMoreRows && !_testMode)
                    {
                        Log.Information($"[{project.Name}] Lote {batchNumber} sem alterações. Avançando para o próximo lote...");
                        continue;
                    }

                    Log.Information(batchNumber == 1
                        ? $"[{project.Name}] Nenhum cliente novo ou alterado"
                        : $"[{project.Name}] Clientes: {batchNumber - 1} lotes processados");
                    break;
                }

                totalCustomers += customers.Count;
                Log.Information($"[{project.Name}] 📋 Lote {batchNumber}: {customers.Count} clientes");

                foreach (var customer in customers)
                {
                    var result = await SendWithRetryAsync(
                        async () => await apiService.SendCustomerAsync(customer),
                        customer.EventId, project.Name);

                    await syncLogService.SaveSyncLogAsync(new SyncLog
                    {
                        EventId = customer.EventId,
                        EventType = "cliente",
                        Status = result.Success ? "success" : "error",
                        ErrorMessage = result.ErrorMessage,
                        Payload = customer.Checksum != null ? $"{{\"checksum\":\"{customer.Checksum}\"}}" : null
                    });

                    counters.CustomerCount++;
                    if (result.Success) { counters.SuccessCount++; totalSuccess++; }
                    else { counters.ErrorCount++; totalErrors++; }
                }

                if (!customerBatch.HasMoreRows || _testMode) break;
            }

            if (totalCustomers > 0)
                Log.Information($"[{project.Name}] 📊 Clientes: {totalCustomers} processados, {totalSuccess} sucesso, {totalErrors} erros");
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{project.Name}] Erro ao sincronizar clientes");
        }
    }
}

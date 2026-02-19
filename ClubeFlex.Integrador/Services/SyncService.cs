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
    
    // Serviços por projeto (inicializados sob demanda)
    private readonly Dictionary<string, ProjectApiService> _apiServices = new();
    private readonly Dictionary<string, ProjectSyncLogService> _syncLogServices = new();

    public SyncService(DatabaseService databaseService, IConfiguration configuration)
    {
        _databaseService = databaseService;
        
        // Carregar configurações de múltiplos projetos
        _projects = configuration.GetSection("Projects").Get<List<ProjectConfig>>() ?? new List<ProjectConfig>();
        
        // Se não houver configuração multi-projeto, tentar carregar configuração legacy
        if (_projects.Count == 0)
        {
            var legacyConfig = LoadLegacyConfig(configuration);
            if (legacyConfig != null)
            {
                _projects.Add(legacyConfig);
            }
        }
        
        // Validar projetos
        foreach (var project in _projects)
        {
            if (project.IsValid())
            {
                Log.Information($"📦 Projeto configurado: {project.Name} - Sincroniza: {project.GetSyncDescription()}");
            }
            else
            {
                Log.Warning($"⚠️ Projeto {project.Name} tem configuração inválida e será ignorado");
            }
        }
        
        // Configurações gerais de sync
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
                Log.Information($"🔄 Sincronizando dados de ontem até hoje: {_syncFromDate.Value:dd/MM/yyyy} - {DateTime.Today:dd/MM/yyyy}");
            }
            else if (DateTime.TryParse(syncFromDateStr, out var date))
            {
                _syncFromDate = date;
                Log.Information($"📅 Sincronizando apenas registros a partir de {_syncFromDate.Value:dd/MM/yyyy}");
            }
        }

        if (_testMode)
            Log.Warning($"⚠️ MODO TESTE ATIVADO - Sincronizando apenas {_testModeLimit} registros mais recentes");
    }

    /// <summary>
    /// Carrega configuração no formato antigo (ClubeFlexApi) para compatibilidade
    /// </summary>
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
    /// Obtém ou cria serviço de API para um projeto
    /// </summary>
    private ProjectApiService GetOrCreateApiService(ProjectConfig project)
    {
        if (!_apiServices.TryGetValue(project.Name, out var service))
        {
            service = new ProjectApiService(project.BaseUrl, project.ApiKey);
            _apiServices[project.Name] = service;
        }
        return service;
    }

    /// <summary>
    /// Obtém ou cria serviço de log para um projeto
    /// </summary>
    private ProjectSyncLogService GetOrCreateSyncLogService(ProjectConfig project)
    {
        if (!_syncLogServices.TryGetValue(project.Name, out var service))
        {
            service = new ProjectSyncLogService(project.BaseUrl, project.ApiKey, project.Name);
            _syncLogServices[project.Name] = service;
        }
        return service;
    }

    /// <summary>
    /// Executa sincronização para todos os projetos configurados
    /// </summary>
    public async Task SyncAllProjectsAsync()
    {
        var validProjects = _projects.Where(p => p.IsValid()).ToList();
        
        if (validProjects.Count == 0)
        {
            Log.Error("❌ Nenhum projeto válido configurado. Verifique o appsettings.json");
            return;
        }

        Log.Information($"🚀 Iniciando sincronização para {validProjects.Count} projeto(s)");

        foreach (var project in validProjects)
        {
            await SyncForProjectAsync(project);
        }

        Log.Information("✅ Sincronização de todos os projetos concluída");
    }

    /// <summary>
    /// Executa sincronização para um projeto específico
    /// </summary>
    private async Task SyncForProjectAsync(ProjectConfig project)
    {
        Log.Information($"[{project.Name}] === Iniciando sincronização ===");

        var apiService = GetOrCreateApiService(project);
        var syncLogService = GetOrCreateSyncLogService(project);

        await syncLogService.StartExecutionAsync();

        var counters = new SyncCounters();

        try
        {
            // Sempre sincronizar faturas primeiro (para garantir que pagamentos encontrem os títulos)
            if (project.SyncInvoices)
                await SyncInvoicesForProjectAsync(project, apiService, syncLogService, counters);

            if (project.SyncPayments)
                await SyncPaymentsForProjectAsync(project, apiService, syncLogService, counters);

            if (project.SyncReceivables)
                await SyncReceivablesForProjectAsync(project, apiService, syncLogService, counters);

            Log.Information($"[{project.Name}] ✅ Concluído: {counters.SuccessCount} sucesso, {counters.ErrorCount} erros");
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{project.Name}] Erro durante sincronização");
        }
        finally
        {
            await syncLogService.FinishExecutionAsync(counters.InvoiceCount, counters.PaymentCount, counters.SuccessCount, counters.ErrorCount);
        }
    }

    /// <summary>
    /// Sincroniza faturas (invoices) para um projeto.
    /// Usa checksum para detectar alterações e evitar reenvio desnecessário
    /// </summary>
    private async Task SyncInvoicesForProjectAsync(
        ProjectConfig project, 
        ProjectApiService apiService, 
        ProjectSyncLogService syncLogService,
        SyncCounters counters)
    {
        Log.Information($"[{project.Name}] === Sincronizando Faturas ===");

        try
        {
            // Buscar checksums existentes para comparação (em vez de apenas event_ids)
            var existingChecksums = await syncLogService.GetInvoiceChecksumsAsync();
            var limit = _testMode ? _testModeLimit : _batchSize;

            int totalInvoices = 0;
            int totalInvoiceSuccess = 0;
            int totalInvoiceErrors = 0;
            int batchNumber = 0;

            while (true)
            {
                batchNumber++;
                var offset = (batchNumber - 1) * limit;
                Log.Information($"[{project.Name}] 📦 Buscando lote {batchNumber} de faturas (offset {offset}, limit {limit})...");

                var invoices = await _databaseService.GetNewInvoicesAsync(limit, _syncFromDate, existingChecksums, offset);

                if (invoices.Count == 0)
                {
                    if (batchNumber == 1)
                        Log.Information($"[{project.Name}] Nenhuma fatura nova ou alterada para sincronizar");
                    else
                        Log.Information($"[{project.Name}] Faturas: todos os lotes processados ({batchNumber - 1} lotes)");
                    break;
                }

                totalInvoices += invoices.Count;
                Log.Information($"[{project.Name}] 📋 Lote {batchNumber}: {invoices.Count} faturas");

                foreach (var invoice in invoices)
                {
                    var result = await SendWithRetryAsync(
                        async () => await apiService.SendInvoiceCreatedAsync(invoice),
                        invoice.EventId,
                        project.Name);

                    await syncLogService.LogEventAsync(invoice.EventId, "fatura", result.Success, result.ErrorMessage, invoice.Checksum);

                    counters.InvoiceCount++;
                    if (result.Success) { counters.SuccessCount++; totalInvoiceSuccess++; }
                    else { counters.ErrorCount++; totalInvoiceErrors++; }
                }

                if (invoices.Count < limit)
                {
                    Log.Information($"[{project.Name}] Faturas: último lote (retornou {invoices.Count} < {limit})");
                    break;
                }

                if (_testMode) break;
            }

            if (totalInvoices > 0)
                Log.Information($"[{project.Name}] 📊 Total faturas: {totalInvoices} processadas, {totalInvoiceSuccess} sucesso, {totalInvoiceErrors} erros");
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{project.Name}] Erro ao sincronizar faturas");
        }
    }

    /// <summary>
    /// Sincroniza pagamentos para um projeto.
    /// Usa checksum para detectar alterações e evitar reenvio desnecessário
    /// </summary>
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

            // === LOOP DE PAGINAÇÃO para cada tipo de pagamento ===
            var acc = new PaymentAccumulator();

            // Paginar pagamentos a prazo (CONTARECEBERREC)
            await PaginateAndSendPaymentsAsync(
                "A prazo",
                async (lim, off) => await _databaseService.GetNewPaymentsAsync(lim, _syncFromDate, existingChecksums, off),
                limit, project, apiService, syncLogService, counters, acc);

            // Paginar pagamentos à vista (MOVENDAREC)
            await PaginateAndSendPaymentsAsync(
                "À vista",
                async (lim, off) => await _databaseService.GetCashPaymentsAsync(lim, _syncFromDate, existingChecksums, off),
                limit, project, apiService, syncLogService, counters, acc);

            // Paginar cheques compensados
            await PaginateAndSendPaymentsAsync(
                "Cheques",
                async (lim, off) => await _databaseService.GetClearedChecksAsync(lim, _syncFromDate, existingChecksums, off),
                limit, project, apiService, syncLogService, counters, acc);

            if (acc.TotalPayments > 0)
                Log.Information($"[{project.Name}] 📊 Total pagamentos: {acc.TotalPayments} processados, {acc.TotalSuccess} sucesso, {acc.TotalErrors} erros");
            else
                Log.Information($"[{project.Name}] Nenhum pagamento novo ou alterado para sincronizar");
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{project.Name}] Erro ao sincronizar pagamentos");
        }
    }

    /// <summary>
    /// Acumulador de contadores de pagamento (substitui ref int em async)
    /// </summary>
    private class PaymentAccumulator
    {
        public int TotalPayments { get; set; }
        public int TotalSuccess { get; set; }
        public int TotalErrors { get; set; }
    }

    /// <summary>
    /// Pagina e envia um tipo de pagamento sequencialmente
    /// </summary>
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
                if (batchNumber == 1)
                    Log.Information($"[{project.Name}] {paymentTypeName}: nenhum pagamento novo");
                else
                    Log.Information($"[{project.Name}] {paymentTypeName}: todos os lotes processados ({batchNumber - 1} lotes)");
                break;
            }

            acc.TotalPayments += payments.Count;
            Log.Information($"[{project.Name}] 📋 {paymentTypeName} lote {batchNumber}: {payments.Count} pagamentos");

            foreach (var payment in payments)
            {
                var result = await SendWithRetryAsync(
                    async () => await apiService.SendPaymentConfirmedAsync(payment),
                    payment.EventId,
                    project.Name);

                await syncLogService.LogEventAsync(payment.EventId, "pagamento", result.Success, result.ErrorMessage, payment.Checksum);

                counters.PaymentCount++;
                if (result.Success) { counters.SuccessCount++; acc.TotalSuccess++; }
                else { counters.ErrorCount++; acc.TotalErrors++; }
            }

            if (payments.Count < limit)
            {
                Log.Information($"[{project.Name}] ✅ {paymentTypeName}: último lote (retornou {payments.Count} < {limit})");
                break;
            }

            if (_testMode) break;
        }
    }

    /// <summary>
    /// Sincroniza contas a receber (títulos) para um projeto.
    /// Usa checksum para detectar alterações e evitar reenvio desnecessário
    /// </summary>
    private async Task SyncReceivablesForProjectAsync(
        ProjectConfig project, 
        ProjectApiService apiService,
        ProjectSyncLogService syncLogService,
        SyncCounters counters,
        bool ignoreFromDate = false)
    {
        Log.Information($"[{project.Name}] === Sincronizando Títulos a Receber ===");

        try
        {
            var existingChecksums = await syncLogService.GetReceivableChecksumsAsync();
            var limit = _testMode ? _testModeLimit : _batchSize;

            // Verificar se deve ignorar filtro de data (modo histórico)
            var syncSettings = ignoreFromDate ? null : _syncFromDate;
            if (ignoreFromDate)
                Log.Information($"[{project.Name}] 🔓 Modo histórico: ignorando filtro de data para títulos");

            // === LOOP DE PAGINAÇÃO para títulos ===
            int totalReceivables = 0;
            int totalReceivableSuccess = 0;
            int totalReceivableErrors = 0;
            int batchNumber = 0;

            while (true)
            {
                batchNumber++;
                var offset = (batchNumber - 1) * limit;
                Log.Information($"[{project.Name}] 📦 Buscando lote {batchNumber} de títulos (offset {offset}, limit {limit})...");

                var receivables = await _databaseService.GetReceivablesAsync(limit, _syncFromDate, existingChecksums, ignoreFromDate, offset);

                if (receivables.Count == 0)
                {
                    if (batchNumber == 1)
                        Log.Information($"[{project.Name}] Nenhum título novo ou alterado para sincronizar");
                    else
                        Log.Information($"[{project.Name}] Títulos: todos os lotes processados ({batchNumber - 1} lotes)");
                    break;
                }

                totalReceivables += receivables.Count;
                Log.Information($"[{project.Name}] 📋 Lote {batchNumber}: {receivables.Count} títulos");

                foreach (var receivable in receivables)
                {
                    receivable.ExecutionId = syncLogService.GetCurrentExecutionId();

                    var result = await SendWithRetryAsync(
                        async () => await apiService.SendReceivableAsync(receivable),
                        receivable.EventId,
                        project.Name);

                    await syncLogService.LogEventAsync(receivable.EventId, "titulo", result.Success, result.ErrorMessage, receivable.Checksum);

                    counters.InvoiceCount++;
                    if (result.Success) { counters.SuccessCount++; totalReceivableSuccess++; }
                    else { counters.ErrorCount++; totalReceivableErrors++; }
                }

                if (receivables.Count < limit)
                {
                    Log.Information($"[{project.Name}] Títulos: último lote (retornou {receivables.Count} < {limit})");
                    break;
                }

                if (_testMode) break;
            }

            if (totalReceivables > 0)
                Log.Information($"[{project.Name}] 📊 Total títulos: {totalReceivables} processados, {totalReceivableSuccess} sucesso, {totalReceivableErrors} erros");

            // === LOOP DE PAGINAÇÃO para pagamentos de títulos ===
            int totalPaymentSuccess = 0;
            int totalPaymentErrors = 0;
            int totalPayments = 0;
            int paymentBatchNumber = 0;

            var existingPaymentChecksums = await syncLogService.GetReceivablePaymentChecksumsAsync();

            while (true)
            {
                paymentBatchNumber++;
                var offset = (paymentBatchNumber - 1) * limit;
                Log.Information($"[{project.Name}] 📦 Buscando lote {paymentBatchNumber} de pagamentos de títulos (offset {offset})...");

                var payments = await _databaseService.GetReceivablePaymentsAsync(limit, _syncFromDate, existingPaymentChecksums, ignoreFromDate, offset);

                if (payments.Count == 0)
                {
                    if (paymentBatchNumber == 1)
                        Log.Information($"[{project.Name}] Nenhum pagamento de título novo para sincronizar");
                    else
                        Log.Information($"[{project.Name}] Pagamentos de títulos: todos os lotes processados ({paymentBatchNumber - 1} lotes)");
                    break;
                }

                totalPayments += payments.Count;
                Log.Information($"[{project.Name}] 📋 Lote {paymentBatchNumber}: {payments.Count} pagamentos de títulos novos/alterados");

                foreach (var payment in payments)
                {
                    payment.ExecutionId = syncLogService.GetCurrentExecutionId();

                    var result = await SendWithRetryAsync(
                        async () => await apiService.SendReceivablePaymentAsync(payment),
                        payment.EventId,
                        project.Name);

                    await syncLogService.LogEventAsync(payment.EventId, "pagamento_titulo", result.Success, result.ErrorMessage, payment.Checksum);

                    counters.PaymentCount++;
                    if (result.Success)
                    {
                        counters.SuccessCount++;
                        totalPaymentSuccess++;
                    }
                    else
                    {
                        counters.ErrorCount++;
                        totalPaymentErrors++;
                    }
                }

                if (payments.Count < limit)
                {
                    Log.Information($"[{project.Name}] Pagamentos de títulos: último lote (retornou {payments.Count} < {limit})");
                    break;
                }

                if (_testMode) break;
            }

            if (totalPayments > 0)
            {
                Log.Information($"[{project.Name}] 📊 Total pagamentos de títulos: {totalPayments} processados, {totalPaymentSuccess} sucesso, {totalPaymentErrors} erros");
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{project.Name}] Erro ao sincronizar pagamentos de títulos");
        }
    }

    /// <summary>
    /// Envia com retry automático em caso de falha.
    /// Erros 4xx (Bad Request, Not Found) não são retentados — são erros permanentes.
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

                // Erros de validação (4xx) são permanentes — não retentar
                if (result.IsValidationError)
                {
                    Log.Warning($"[{projectName}] ⚠️ Erro permanente (4xx) para {eventId}: {result.ErrorMessage}. Não será retentado.");
                    return result;
                }

                if (attempt < _maxRetries)
                {
                    Log.Warning($"[{projectName}] Tentativa {attempt}/{_maxRetries} falhou para {eventId}: {result.ErrorMessage}. Aguardando {_retryDelaySeconds}s...");
                    await Task.Delay(TimeSpan.FromSeconds(_retryDelaySeconds));
                }
                else
                {
                    Log.Error($"[{projectName}] ❌ Falha após {_maxRetries} tentativas para {eventId}: {result.ErrorMessage}");
                    result.ErrorMessage = $"Falha após todas as tentativas: {result.ErrorMessage}";
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
                    return new ApiResponse { Success = false, ErrorMessage = $"Falha após todas as tentativas" };
                }
            }
        }

        return new ApiResponse { Success = false, ErrorMessage = "Falha após todas as tentativas" };
    }

    /// <summary>
    /// Contadores de sincronização por projeto
    /// </summary>
    private class SyncCounters
    {
        public int InvoiceCount { get; set; }
        public int PaymentCount { get; set; }
        public int SuccessCount { get; set; }
        public int ErrorCount { get; set; }
    }
}

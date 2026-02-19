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
    private ProjectApiService GetApiService(ProjectConfig project)
    {
        if (!_apiServices.ContainsKey(project.Name))
        {
            _apiServices[project.Name] = new ProjectApiService(project);
        }
        return _apiServices[project.Name];
    }

    /// <summary>
    /// Obtém ou cria serviço de logs para um projeto
    /// </summary>
    private ProjectSyncLogService GetSyncLogService(ProjectConfig project)
    {
        if (!_syncLogServices.ContainsKey(project.Name))
        {
            _syncLogServices[project.Name] = new ProjectSyncLogService(project);
        }
        return _syncLogServices[project.Name];
    }

    /// <summary>
    /// Executa sincronização completa para todos os projetos configurados
    /// </summary>
    public async Task ExecuteSyncAsync()
    {
        var validProjects = _projects.Where(p => p.IsValid()).ToList();
        
        if (validProjects.Count == 0)
        {
            Log.Fatal("Nenhum projeto válido configurado. Verifique o appsettings.json");
            return;
        }

        Log.Information($"=== Iniciando Sincronização para {validProjects.Count} projeto(s) ===");

        // Testar conexão com o banco uma vez
        var dbOk = await _databaseService.TestConnectionAsync();
        if (!dbOk)
        {
            Log.Fatal("Falha na conexão com o banco de dados. Abortando.");
            return;
        }

        // Sincronizar cada projeto
        foreach (var project in validProjects)
        {
            await SyncProjectAsync(project);
        }

        Log.Information("=== Sincronização Finalizada ===");
    }

    /// <summary>
    /// Sincroniza um projeto específico
    /// </summary>
    private async Task SyncProjectAsync(ProjectConfig project)
    {
        Log.Information($"");
        Log.Information($"════════════════════════════════════════════════════");
        Log.Information($"  📦 Projeto: {project.Name}");
        Log.Information($"  📋 Sincroniza: {project.GetSyncDescription()}");
        Log.Information($"════════════════════════════════════════════════════");

        var apiService = GetApiService(project);
        var syncLogService = GetSyncLogService(project);
        
        // Testar conectividade com a API do projeto
        var apiOk = await apiService.TestConnectionAsync();
        if (!apiOk)
        {
            Log.Error($"[{project.Name}] Falha na conectividade. Pulando este projeto.");
            return;
        }

        // Iniciar rastreamento de execução
        await syncLogService.StartExecutionAsync();

        var counters = new SyncCounters();

        try
        {
            // Sincronizar faturas se habilitado
            if (project.SyncInvoices)
            {
                await SyncInvoicesForProjectAsync(project, apiService, syncLogService, counters);
            }

            // Sincronizar pagamentos se habilitado
            if (project.SyncPayments)
            {
                await SyncPaymentsForProjectAsync(project, apiService, syncLogService, counters);
            }

            // Sincronizar títulos a receber se habilitado
            if (project.SyncReceivables)
            {
                await SyncReceivablesForProjectAsync(project, apiService, syncLogService, counters);
            }

            // Finalizar execução
            var totalEvents = counters.InvoiceCount + counters.PaymentCount + counters.ReceivableCount;
            var status = counters.ErrorCount > 0 ? "completed_with_errors" : "completed";
            
            await syncLogService.FinishExecutionAsync(
                status, 
                totalEvents, 
                counters.SuccessCount, 
                counters.ErrorCount, 
                counters.InvoiceCount, 
                counters.PaymentCount
            );

            Log.Information($"[{project.Name}] ✅ Concluído: {counters.SuccessCount} sucesso, {counters.ErrorCount} erros");
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{project.Name}] Erro durante sincronização");
            await syncLogService.FinishExecutionAsync(
                "failed", 
                counters.InvoiceCount + counters.PaymentCount + counters.ReceivableCount, 
                counters.SuccessCount, 
                counters.ErrorCount, 
                counters.InvoiceCount, 
                counters.PaymentCount
            );
        }
    }

    /// <summary>
    /// Sincroniza faturas para um projeto específico com paginação automática
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

            // === LOOP DE PAGINAÇÃO: buscar todas as faturas em lotes ===
            int totalInvoiceSuccess = 0;
            int totalInvoiceErrors = 0;
            int totalInvoices = 0;
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
                        Log.Information($"[{project.Name}] ✅ Todos os lotes de faturas processados ({batchNumber - 1} lotes)");
                    break;
                }

                totalInvoices += invoices.Count;
                Log.Information($"[{project.Name}] 📋 Lote {batchNumber}: {invoices.Count} faturas novas/alteradas");

                foreach (var invoice in invoices)
                {
                    var result = await SendWithRetryAsync(
                        async () => await apiService.SendInvoiceCreatedAsync(invoice),
                        invoice.EventId,
                        project.Name
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

                    await syncLogService.SaveSyncLogAsync(log);

                    counters.InvoiceCount++;
                    if (result.Success) { counters.SuccessCount++; totalInvoiceSuccess++; }
                    else { counters.ErrorCount++; totalInvoiceErrors++; }
                }

                Log.Information($"[{project.Name}] ✅ Lote {batchNumber} faturas: {invoices.Count - totalInvoiceErrors} sucesso");

                // Se retornou menos que o limit, não há mais dados
                if (invoices.Count < limit)
                {
                    Log.Information($"[{project.Name}] ✅ Último lote de faturas (retornou {invoices.Count} < {limit})");
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
    /// Sincroniza pagamentos para um projeto específico com paginação automática
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
            int totalPaymentSuccess = 0;
            int totalPaymentErrors = 0;
            int totalPayments = 0;

            // Paginar pagamentos a prazo (CONTARECEBERREC)
            await PaginateAndSendPaymentsAsync(
                "A prazo",
                async (lim, off) => await _databaseService.GetNewPaymentsAsync(lim, _syncFromDate, existingChecksums, off),
                limit, project, apiService, syncLogService, counters,
                ref totalPayments, ref totalPaymentSuccess, ref totalPaymentErrors);

            // Paginar pagamentos à vista (MOVENDAREC)
            await PaginateAndSendPaymentsAsync(
                "À vista",
                async (lim, off) => await _databaseService.GetCashPaymentsAsync(lim, _syncFromDate, existingChecksums, off),
                limit, project, apiService, syncLogService, counters,
                ref totalPayments, ref totalPaymentSuccess, ref totalPaymentErrors);

            // Paginar cheques compensados
            await PaginateAndSendPaymentsAsync(
                "Cheques",
                async (lim, off) => await _databaseService.GetClearedChecksAsync(lim, _syncFromDate, existingChecksums, off),
                limit, project, apiService, syncLogService, counters,
                ref totalPayments, ref totalPaymentSuccess, ref totalPaymentErrors);

            if (totalPayments > 0)
                Log.Information($"[{project.Name}] 📊 Total pagamentos: {totalPayments} processados, {totalPaymentSuccess} sucesso, {totalPaymentErrors} erros");
            else
                Log.Information($"[{project.Name}] Nenhum pagamento novo ou alterado para sincronizar");
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{project.Name}] Erro ao sincronizar pagamentos");
        }
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
        ref int totalPayments,
        ref int totalSuccess,
        ref int totalErrors)
    {
        int batchNumber = 0;

        while (true)
        {
            batchNumber++;
            var offset = (batchNumber - 1) * limit;

            Log.Information($"[{project.Name}] 📦 {paymentTypeName}: lote {batchNumber} (offset {offset})...");

            var payments = await fetchFunc(limit, offset);

            if (payments.Count == 0)
            {
                if (batchNumber == 1)
                    Log.Information($"[{project.Name}] {paymentTypeName}: nenhum pagamento novo");
                else
                    Log.Information($"[{project.Name}] {paymentTypeName}: todos os lotes processados ({batchNumber - 1} lotes)");
                break;
            }

            totalPayments += payments.Count;
            Log.Information($"[{project.Name}] 📋 {paymentTypeName} lote {batchNumber}: {payments.Count} pagamentos");

            foreach (var payment in payments)
            {
                var result = await SendWithRetryAsync(
                    async () => await apiService.SendPaymentConfirmedAsync(payment),
                    payment.EventId,
                    project.Name
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

                await syncLogService.SaveSyncLogAsync(log);

                counters.PaymentCount++;
                if (result.Success) { counters.SuccessCount++; totalSuccess++; }
                else { counters.ErrorCount++; totalErrors++; }
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
    /// Sincroniza títulos a receber para um projeto específico (Sistema de Cobranças)
    /// </summary>
    /// <summary>
    /// Sincroniza títulos a receber para um projeto específico (Sistema de Cobranças)
    /// Usa checksum para detectar alterações e evitar reenvio desnecessário
    /// </summary>
    private async Task SyncReceivablesForProjectAsync(
        ProjectConfig project, 
        ProjectApiService apiService, 
        ProjectSyncLogService syncLogService,
        SyncCounters counters)
    {
        Log.Information($"[{project.Name}] === Sincronizando Títulos a Receber ===");
        
        try
        {
            // Buscar checksums existentes para comparação
            var existingChecksums = await syncLogService.GetReceivableChecksumsAsync();
            var limit = _testMode ? _testModeLimit : _batchSize;
            
            // Usar configuração do projeto para ignorar ou não o filtro de data
            var ignoreFromDate = project.SyncReceivablesIgnoreDate;
            
            if (ignoreFromDate)
            {
                Log.Information($"[{project.Name}] 📅 SyncReceivablesIgnoreDate = true: Buscando TODOS os títulos (abertos, pagos e cancelados)");
            }
            
            // === LOOP DE PAGINAÇÃO: buscar todos os títulos em lotes ===
            int totalReceivableSuccess = 0;
            int totalReceivableErrors = 0;
            int totalReceivables = 0;
            int batchNumber = 0;
            
            while (true)
            {
                batchNumber++;
                var offset = (batchNumber - 1) * limit;
                
                Log.Information($"[{project.Name}] 📦 Buscando lote {batchNumber} (offset {offset}, limit {limit})...");
                
                var receivables = await _databaseService.GetReceivablesAsync(limit, _syncFromDate, existingChecksums, ignoreFromDate, offset);
                
                if (receivables.Count == 0)
                {
                    if (batchNumber == 1)
                    {
                        Log.Information($"[{project.Name}] Nenhum título novo ou alterado para sincronizar");
                    }
                    else
                    {
                        Log.Information($"[{project.Name}] ✅ Todos os lotes processados ({batchNumber - 1} lotes)");
                    }
                    break;
                }
                
                totalReceivables += receivables.Count;
                Log.Information($"[{project.Name}] 📋 Lote {batchNumber}: {receivables.Count} títulos novos/alterados");
                
                var overdueCount = receivables.Count(r => r.IsOverdue);
                if (overdueCount > 0)
                {
                    Log.Warning($"[{project.Name}] ⚠️ {overdueCount} títulos vencidos neste lote");
                }

                foreach (var receivable in receivables)
                {
                    receivable.ExecutionId = syncLogService.GetCurrentExecutionId();

                    var result = await SendWithRetryAsync(
                        async () => await apiService.SendReceivableAsync(receivable),
                        receivable.EventId,
                        project.Name
                    );

                    var log = new SyncLog
                    {
                        EventId = receivable.EventId,
                        EventType = "titulo-criado",
                        Status = result.Success ? "success" : "error",
                        Payload = Newtonsoft.Json.JsonConvert.SerializeObject(receivable),
                        ErrorMessage = result.ErrorMessage,
                        Attempts = result.Success ? 1 : (result.IsValidationError ? 1 : _maxRetries)
                    };

                    await syncLogService.SaveSyncLogAsync(log);

                    counters.ReceivableCount++;
                    if (result.Success)
                    {
                        counters.SuccessCount++;
                        totalReceivableSuccess++;
                    }
                    else
                    {
                        counters.ErrorCount++;
                        totalReceivableErrors++;
                    }
                }

                Log.Information($"[{project.Name}] ✅ Lote {batchNumber}: {receivables.Count - totalReceivableErrors} sucesso");
                
                // Se retornou menos que o limit, não há mais dados
                if (receivables.Count < limit)
                {
                    Log.Information($"[{project.Name}] ✅ Último lote processado (retornou {receivables.Count} < {limit})");
                    break;
                }
                
                // Em modo teste, não continuar
                if (_testMode) break;
            }
            
            if (totalReceivables > 0)
            {
                Log.Information($"[{project.Name}] 📊 Total títulos: {totalReceivables} processados, {totalReceivableSuccess} sucesso, {totalReceivableErrors} erros");
            }

            // === Sincronizar pagamentos de títulos (titulo-pago) ===
            await SyncReceivablePaymentsForProjectAsync(project, apiService, syncLogService, counters, ignoreFromDate);
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{project.Name}] Erro ao sincronizar títulos a receber");
        }
    }

    /// <summary>
    /// Sincroniza pagamentos de títulos a receber para um projeto específico (titulo-pago)
    /// </summary>
    private async Task SyncReceivablePaymentsForProjectAsync(
        ProjectConfig project,
        ProjectApiService apiService,
        ProjectSyncLogService syncLogService,
        SyncCounters counters,
        bool ignoreFromDate)
    {
        Log.Information($"[{project.Name}] === Sincronizando Pagamentos de Títulos ===");

        try
        {
            var existingChecksums = await syncLogService.GetReceivablePaymentChecksumsAsync();
            var limit = _testMode ? _testModeLimit : _batchSize;

            // === LOOP DE PAGINAÇÃO para pagamentos de títulos ===
            int totalPaymentSuccess = 0;
            int totalPaymentErrors = 0;
            int totalPayments = 0;
            int batchNumber = 0;
            
            while (true)
            {
                batchNumber++;
                var offset = (batchNumber - 1) * limit;
                
                Log.Information($"[{project.Name}] 📦 Buscando lote {batchNumber} de pagamentos (offset {offset}, limit {limit})...");
                
                var payments = await _databaseService.GetReceivablePaymentsAsync(limit, _syncFromDate, existingChecksums, ignoreFromDate, offset);

                if (payments.Count == 0)
                {
                    if (batchNumber == 1)
                    {
                        Log.Information($"[{project.Name}] Nenhum pagamento de título novo ou alterado para sincronizar");
                    }
                    else
                    {
                        Log.Information($"[{project.Name}] ✅ Todos os lotes de pagamentos processados ({batchNumber - 1} lotes)");
                    }
                    break;
                }

                totalPayments += payments.Count;
                Log.Information($"[{project.Name}] 📋 Lote {batchNumber}: {payments.Count} pagamentos de títulos novos/alterados");

                foreach (var payment in payments)
                {
                    payment.ExecutionId = syncLogService.GetCurrentExecutionId();

                    var result = await SendWithRetryAsync(
                        async () => await apiService.SendReceivablePaymentAsync(payment),
                        payment.EventId,
                        project.Name
                    );

                    var log = new SyncLog
                    {
                        EventId = payment.EventId,
                        EventType = "titulo-pago",
                        Status = result.Success ? "success" : "error",
                        Payload = Newtonsoft.Json.JsonConvert.SerializeObject(payment),
                        ErrorMessage = result.ErrorMessage,
                        Attempts = result.Success ? 1 : (result.IsValidationError ? 1 : _maxRetries)
                    };

                    await syncLogService.SaveSyncLogAsync(log);

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

                Log.Information($"[{project.Name}] ✅ Lote {batchNumber} pagamentos: {payments.Count} processados");
                
                if (payments.Count < limit)
                {
                    Log.Information($"[{project.Name}] ✅ Último lote de pagamentos (retornou {payments.Count} < {limit})");
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
    /// Atualiza tipos de movimento das faturas existentes (para o primeiro projeto com SyncInvoices)
    /// </summary>
    public async Task UpdateInvoiceTypesAsync()
    {
        Log.Information("=== Atualizando Tipos de Movimento das Faturas ===");

        var projectWithInvoices = _projects.FirstOrDefault(p => p.IsValid() && p.SyncInvoices);
        if (projectWithInvoices == null)
        {
            Log.Error("Nenhum projeto configurado para sincronizar faturas");
            return;
        }

        try
        {
            var dbOk = await _databaseService.TestConnectionAsync();
            var apiService = GetApiService(projectWithInvoices);
            var apiOk = await apiService.TestConnectionAsync();

            if (!dbOk || !apiOk)
            {
                Log.Fatal("Falha nos testes de conectividade. Abortando.");
                return;
            }

            var invoiceTypes = await _databaseService.GetAllInvoiceTypesAsync();

            if (invoiceTypes.Count == 0)
            {
                Log.Information("Nenhuma fatura encontrada para atualizar");
                return;
            }

            Log.Information($"Encontradas {invoiceTypes.Count} faturas para classificar");

            var result = await apiService.UpdateInvoiceTypesAsync(invoiceTypes);

            if (result.Success)
            {
                Log.Information($"✅ Atualização concluída: {result.Message}");
            }
            else
            {
                Log.Error($"❌ Erro na atualização: {result.ErrorMessage}");
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Erro ao atualizar tipos de movimento");
        }
    }

    /// <summary>
    /// Envia com retry automático em caso de falha
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

                if (result.IsValidationError)
                {
                    Log.Warning($"[{projectName}] ❌ Erro de validação para {eventId}. Não será retentado.");
                    return result;
                }

                if (attempt < _maxRetries)
                {
                    Log.Warning($"[{projectName}] Tentativa {attempt}/{_maxRetries} falhou para {eventId}. Aguardando {_retryDelaySeconds}s...");
                    await Task.Delay(_retryDelaySeconds * 1000);
                }
            }
            catch (Exception ex)
            {
                Log.Error(ex, $"[{projectName}] Erro na tentativa {attempt} para {eventId}");
                
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

        Log.Error($"[{projectName}] Todas as {_maxRetries} tentativas falharam para {eventId}");
        return new ApiResponse 
        { 
            Success = false, 
            ErrorMessage = "Falha após todas as tentativas" 
        };
    }

    /// <summary>
    /// Contadores de sincronização por projeto
    /// </summary>
    private class SyncCounters
    {
        public int InvoiceCount { get; set; }
        public int PaymentCount { get; set; }
        public int ReceivableCount { get; set; }
        public int SuccessCount { get; set; }
        public int ErrorCount { get; set; }
    }
}

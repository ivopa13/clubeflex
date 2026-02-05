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
    /// Sincroniza faturas para um projeto específico
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
            var limit = _testMode ? _testModeLimit : (int?)null;
            var invoices = await _databaseService.GetNewInvoicesAsync(limit, _syncFromDate, existingChecksums);

            if (invoices.Count == 0)
            {
                Log.Information($"[{project.Name}] Nenhuma fatura nova ou alterada para sincronizar");
                return;
            }

            Log.Information($"[{project.Name}] Encontradas {invoices.Count} faturas novas/alteradas");

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
                if (result.Success)
                    counters.SuccessCount++;
                else
                    counters.ErrorCount++;
            }

            Log.Information($"[{project.Name}] Faturas: {counters.InvoiceCount - counters.ErrorCount} sucesso, {counters.ErrorCount} erros");
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{project.Name}] Erro ao sincronizar faturas");
        }
    }

    /// <summary>
    /// Sincroniza pagamentos para um projeto específico
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
            // Buscar checksums existentes para comparação (em vez de apenas event_ids)
            var existingChecksums = await syncLogService.GetPaymentChecksumsAsync();
            var limit = _testMode ? _testModeLimit : (int?)null;
            
            // Buscar todos os tipos de pagamento usando checksums
            var creditPayments = await _databaseService.GetNewPaymentsAsync(limit, _syncFromDate, existingChecksums);
            var cashPayments = await _databaseService.GetCashPaymentsAsync(limit, _syncFromDate, existingChecksums);
            var clearedChecks = await _databaseService.GetClearedChecksAsync(limit, _syncFromDate, existingChecksums);
            
            var allPayments = creditPayments.Concat(cashPayments).Concat(clearedChecks).ToList();

            if (allPayments.Count == 0)
            {
                Log.Information($"[{project.Name}] Nenhum pagamento novo ou alterado para sincronizar");
                return;
            }

            Log.Information($"[{project.Name}] 📊 Total de pagamentos novos/alterados: {allPayments.Count}");
            Log.Information($"[{project.Name}]    - A prazo: {creditPayments.Count}");
            Log.Information($"[{project.Name}]    - À vista: {cashPayments.Count}");
            Log.Information($"[{project.Name}]    - Cheques: {clearedChecks.Count}");

            int paymentSuccess = 0;
            int paymentErrors = 0;

            foreach (var payment in allPayments)
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
                if (result.Success)
                {
                    counters.SuccessCount++;
                    paymentSuccess++;
                }
                else
                {
                    counters.ErrorCount++;
                    paymentErrors++;
                }
            }

            Log.Information($"[{project.Name}] ✅ Pagamentos: {paymentSuccess} sucesso, {paymentErrors} erros");
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{project.Name}] Erro ao sincronizar pagamentos");
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
            // Buscar checksums existentes para comparação (em vez de apenas event_ids)
            var existingChecksums = await syncLogService.GetReceivableChecksumsAsync();
            var limit = _testMode ? _testModeLimit : (int?)null;
            
            // Usar configuração do projeto para ignorar ou não o filtro de data
            // Para régua de cobrança, é necessário buscar TODOS os títulos em aberto (vencidos + a vencer)
            var ignoreFromDate = project.SyncReceivablesIgnoreDate;
            
            if (ignoreFromDate)
            {
                Log.Information($"[{project.Name}] 📅 SyncReceivablesIgnoreDate = true: Buscando TODOS os títulos em aberto");
            }
            
            // Passar checksums existentes para comparação - apenas títulos alterados serão retornados
            var receivables = await _databaseService.GetReceivablesAsync(limit, _syncFromDate, existingChecksums, ignoreFromDate);

            if (receivables.Count == 0)
            {
                Log.Information($"[{project.Name}] Nenhum título novo ou alterado para sincronizar");
                return;
            }

            Log.Information($"[{project.Name}] 📋 Encontrados {receivables.Count} títulos novos/alterados");
            
            var overdueCount = receivables.Count(r => r.IsOverdue);
            if (overdueCount > 0)
            {
                Log.Warning($"[{project.Name}] ⚠️ {overdueCount} títulos estão vencidos!");
            }

            int receivableSuccess = 0;
            int receivableErrors = 0;

            foreach (var receivable in receivables)
            {
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
                    receivableSuccess++;
                }
                else
                {
                    counters.ErrorCount++;
                    receivableErrors++;
                }
            }

            Log.Information($"[{project.Name}] ✅ Títulos: {receivableSuccess} sucesso, {receivableErrors} erros");
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{project.Name}] Erro ao sincronizar títulos a receber");
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

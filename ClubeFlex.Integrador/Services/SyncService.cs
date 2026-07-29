using Microsoft.Extensions.Configuration;
using Newtonsoft.Json;
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
    private readonly DateTime? _configWindowFrom;
    private readonly DateTime? _configWindowTo;


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

        // Janela opcional via appsettings.json (não precisa CLI no Windows)
        //   "SyncSettings": { "WindowMonth": "2026-03" }
        //   ou "WindowFrom": "2026-03-01", "WindowTo": "2026-03-31"
        var windowMonth = configuration["SyncSettings:WindowMonth"];
        var windowFromStr = configuration["SyncSettings:WindowFrom"];
        var windowToStr = configuration["SyncSettings:WindowTo"];
        if (!string.IsNullOrWhiteSpace(windowMonth) && DateTime.TryParse(windowMonth + "-01", out var mStart))
        {
            _configWindowFrom = new DateTime(mStart.Year, mStart.Month, 1);
            _configWindowTo = _configWindowFrom.Value.AddMonths(1).AddDays(-1);
        }
        if (!string.IsNullOrWhiteSpace(windowFromStr) && DateTime.TryParse(windowFromStr, out var wf)) _configWindowFrom = wf;
        if (!string.IsNullOrWhiteSpace(windowToStr) && DateTime.TryParse(windowToStr, out var wt)) _configWindowTo = wt;
        if (_configWindowFrom.HasValue && _configWindowTo.HasValue)
            Log.Warning($"🎯 Janela de datas via appsettings: {_configWindowFrom.Value:dd/MM/yyyy} → {_configWindowTo.Value:dd/MM/yyyy}");
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
    /// <param name="backfillReceivables">Se true, ignora checksum em títulos (reenvia tudo). Use para corrigir inadimplência fantasma.</param>
    /// <param name="windowFrom">Data inicial da janela (--from / --month). Quando informada junto com windowTo, restringe títulos e pagamentos ao intervalo.</param>
    /// <param name="windowTo">Data final da janela.</param>
    /// <param name="onlyProjects">Se informado, sincroniza apenas os projetos cujo Name esteja na lista (--only=Nome1,Nome2).</param>
    public async Task ExecuteSyncAsync(bool backfillReceivables = false, DateTime? windowFrom = null, DateTime? windowTo = null, IEnumerable<string>? onlyProjects = null)
    {
        // CLI tem prioridade; se não veio, usa janela do appsettings.json
        windowFrom ??= _configWindowFrom;
        windowTo ??= _configWindowTo;

        var validProjects = _projects.Where(p => p.IsValid()).ToList();

        var filter = onlyProjects?.Select(n => n.Trim()).Where(n => n.Length > 0).ToList();
        if (filter is { Count: > 0 })
        {
            var before = validProjects.Count;
            validProjects = validProjects
                .Where(p => filter.Any(n => string.Equals(n, p.Name, StringComparison.OrdinalIgnoreCase)))
                .ToList();
            Log.Information($"🎯 Filtro --only ativo: {string.Join(", ", filter)} ({validProjects.Count}/{before} projeto(s) selecionado(s))");
        }

        if (validProjects.Count == 0)
        {
            Log.Error("❌ Nenhum projeto válido configurado. Verifique o appsettings.json");
            return;
        }

        Log.Information($"🚀 Iniciando sincronização para {validProjects.Count} projeto(s)");
        if (backfillReceivables)
            Log.Warning("⚠️ MODO BACKFILL ATIVO: títulos serão reenviados ignorando checksum");
        if (windowFrom.HasValue && windowTo.HasValue)
            Log.Warning($"🎯 JANELA DE DATAS ATIVA: {windowFrom.Value:dd/MM/yyyy} → {windowTo.Value:dd/MM/yyyy} (apenas títulos e pagamentos neste intervalo)");


        foreach (var project in validProjects)
            await SyncForProjectAsync(project, backfillReceivables, windowFrom, windowTo);

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

    private async Task SyncForProjectAsync(ProjectConfig project, bool backfillReceivables = false, DateTime? windowFrom = null, DateTime? windowTo = null)
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
                await SyncReceivablesForProjectAsync(project, apiService, syncLogService, counters, project.SyncReceivablesIgnoreDate, backfillReceivables, windowFrom, windowTo);

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
        bool ignoreFromDate = false,
        bool backfillMode = false,
        DateTime? windowFrom = null,
        DateTime? windowTo = null)
    {
        Log.Information($"[{project.Name}] === Sincronizando Títulos a Receber ===");
        if (backfillMode)
            Log.Warning($"[{project.Name}] 🔁 BACKFILL: ignorando checksum — TODOS os títulos serão reenviados");
        var windowed = windowFrom.HasValue && windowTo.HasValue;
        if (windowed)
            Log.Information($"[{project.Name}] 🎯 Janela: {windowFrom!.Value:dd/MM/yyyy} → {windowTo!.Value:dd/MM/yyyy}");

        // Parsear SyncReceivablesFullFromDate do ProjectConfig
        DateTime? fullFromDate = null;
        if (!string.IsNullOrEmpty(project.SyncReceivablesFullFromDate) && DateTime.TryParse(project.SyncReceivablesFullFromDate, out var parsedDate))
        {
            fullFromDate = parsedDate;
            Log.Information($"[{project.Name}] 📅 Filtro inteligente: abertos do histórico + tudo a partir de {parsedDate:dd/MM/yyyy}");
        }

        try
        {
            // Em modo backfill, passar dicionário vazio para forçar reenvio de tudo
            var existingChecksums = backfillMode
                ? new Dictionary<string, string>()
                : await syncLogService.GetReceivableChecksumsAsync();
            var limit = _testMode ? _testModeLimit : _batchSize;

            if (ignoreFromDate && fullFromDate == null)
                Log.Information($"[{project.Name}] 🔓 Modo histórico: ignorando filtro de data");

            // === Paginação de títulos ===
            int totalReceivables = 0, totalRecSuccess = 0, totalRecErrors = 0, totalRecSkipped = 0, batchNumber = 0;

            while (true)
            {
                batchNumber++;
                var offset = (batchNumber - 1) * limit;
                Log.Information($"[{project.Name}] 📦 Lote {batchNumber} de títulos (offset {offset})...");

                // Janela explícita tem prioridade: usa from/to e ignora filtro inteligente/backfill de data
                var effectiveIgnoreDate = windowed ? false : (ignoreFromDate || backfillMode);
                var effectiveFullFromDate = windowed ? (DateTime?)null : (backfillMode ? (DateTime?)null : fullFromDate);
                var effectiveFromDate = windowed ? windowFrom : _syncFromDate;
                var receivableBatch = await _databaseService.GetReceivablesAsync(limit, effectiveFromDate, existingChecksums, effectiveIgnoreDate, offset, effectiveFullFromDate, windowed ? windowTo : null);
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

                // Particionar: cancelados PRIMEIRO (Status='C'), depois demais.
                // Ordem por execução: cancelamentos antes de novas faturas/atualizações.
                var cancelled = receivables.Where(r => r.Status == "C").ToList();
                var others = receivables.Where(r => r.Status != "C").ToList();

                foreach (var receivable in cancelled)
                {
                    receivable.ExecutionId = syncLogService.GetCurrentExecutionId();

                    var cancelDate = receivable.CancelledAt ?? DateTime.Today;
                    var cancelPayload = new TituloCanceladoPayload
                    {
                        ReceivableIdExt = receivable.ReceivableIdExt,
                        EventId = $"CANCEL_{receivable.ReceivableIdExt}_{cancelDate:yyyy-MM-dd}",
                        Source = "erp_windows",
                        CancelledAt = cancelDate.ToString("yyyy-MM-dd"),
                        Reason = receivable.CancelReason ?? "FLAGCANCELADA=Y",
                        ExecutionId = receivable.ExecutionId
                    };

                    var result = await SendWithRetryAsync(
                        async () => await apiService.SendReceivableCancelledAsync(cancelPayload),
                        cancelPayload.EventId, project.Name);

                    var auditPayload = JsonConvert.SerializeObject(new
                    {
                        checksum = receivable.Checksum,
                        receivable_id_ext = cancelPayload.ReceivableIdExt,
                        cancelled_at = cancelPayload.CancelledAt,
                        reason = cancelPayload.Reason
                    });

                    await syncLogService.SaveSyncLogAsync(new SyncLog
                    {
                        EventId = cancelPayload.EventId,
                        EventType = "titulo_cancelamento",
                        Status = result.Success ? "success" : "error",
                        ErrorMessage = result.ErrorMessage,
                        Payload = auditPayload
                    });

                    counters.InvoiceCount++;
                    if (result.Success) { counters.SuccessCount++; totalRecSuccess++; }
                    else { counters.ErrorCount++; totalRecErrors++; }
                }

                foreach (var receivable in others)
                {
                    receivable.ExecutionId = syncLogService.GetCurrentExecutionId();

                    // Pular títulos cujo cliente não tem CPF/CNPJ válido (evita 400 em massa na edge function).
                    // Cancelamentos NÃO entram aqui — já foram tratados acima sem precisar de CPF/CNPJ.
                    if (!HasValidDoc(receivable.Customer?.Cpf, receivable.Customer?.Cnpj))
                    {
                        Log.Warning($"[{project.Name}] ⏭️ Título {receivable.ReceivableIdExt} ignorado: cliente {receivable.Customer?.IdExt} ({receivable.Customer?.Name}) sem CPF/CNPJ válido no ERP");
                        counters.SkippedCount++;
                        totalRecSkipped++;
                        continue;
                    }

                    var result = await SendWithRetryAsync(
                        async () => await apiService.SendReceivableAsync(receivable),
                        receivable.EventId, project.Name);

                    // Persistir payload completo (checksum + status + saldos) para auditoria
                    var auditPayload = JsonConvert.SerializeObject(new
                    {
                        checksum = receivable.Checksum,
                        receivable_id_ext = receivable.ReceivableIdExt,
                        amount = receivable.Amount,
                        paid_amount = receivable.PaidAmount,
                        balance = receivable.Balance,
                        status = receivable.Status,
                        due_date = receivable.DueDate
                    });

                    await syncLogService.SaveSyncLogAsync(new SyncLog
                    {
                        EventId = receivable.EventId,
                        EventType = "titulo",
                        Status = result.Success ? "success" : "error",
                        ErrorMessage = result.ErrorMessage,
                        Payload = auditPayload
                    });

                    counters.InvoiceCount++;
                    if (result.Success) { counters.SuccessCount++; totalRecSuccess++; }
                    else { counters.ErrorCount++; totalRecErrors++; }
                }

                if (!receivableBatch.HasMoreRows || _testMode) break;
            }

            if (totalReceivables > 0 || totalRecSkipped > 0)
                Log.Information($"[{project.Name}] 📊 Títulos: {totalReceivables} processados, {totalRecSuccess} sucesso, {totalRecErrors} erros, {totalRecSkipped} pulados (cliente sem CPF/CNPJ)");

            // === Paginação de pagamentos de títulos ===
            int totalPayments = 0, totalPaySuccess = 0, totalPayErrors = 0, payBatch = 0;
            // Em backfill, ignora checksum também nos pagamentos (reenvia tudo com status='P' quando aplicável)
            var existingPayChecksums = backfillMode
                ? new Dictionary<string, string>()
                : await syncLogService.GetReceivablePaymentChecksumsAsync();

            while (true)
            {
                payBatch++;
                var offset = (payBatch - 1) * limit;
                Log.Information($"[{project.Name}] 📦 Lote {payBatch} de pagamentos de títulos (offset {offset})...");

                var effectiveIgnoreDatePay = windowed ? false : (ignoreFromDate || backfillMode);
                var effectiveFullFromDatePay = windowed ? (DateTime?)null : (backfillMode ? (DateTime?)null : fullFromDate);
                var effectiveFromDatePay = windowed ? windowFrom : _syncFromDate;
                var payBatchResult = await _databaseService.GetReceivablePaymentsAsync(limit, effectiveFromDatePay, existingPayChecksums, effectiveIgnoreDatePay, offset, effectiveFullFromDatePay, windowed ? windowTo : null);
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

                    // Pular pagamentos cujo título tem cliente sem CPF/CNPJ válido
                    // (esses títulos foram pulados na rotina de /titulo-criado e gerariam 404 "Receivable not found")
                    if (!HasValidDoc(payment.CustomerCpf, payment.CustomerCnpj))
                    {
                        Log.Warning($"[{project.Name}] ⏭️ Pagamento {payment.EventId} ignorado: título {payment.ReceivableIdExt} tem cliente sem CPF/CNPJ válido no ERP");
                        counters.SkippedCount++;
                        continue;
                    }

                    var result = await SendWithRetryAsync(
                        async () => await apiService.SendReceivablePaymentAsync(payment),
                        payment.EventId, project.Name);

                    // Persistir payload completo para auditoria (checksum + dados do pagamento)
                    var auditPayload = JsonConvert.SerializeObject(new
                    {
                        checksum = payment.Checksum,
                        receivable_id_ext = payment.ReceivableIdExt,
                        paid_amount = payment.PaidAmount,
                        paid_at = payment.PaidAt,
                        payment_type = payment.PaymentType,
                        payment_event_id = payment.PaymentEventId
                    });

                    await syncLogService.SaveSyncLogAsync(new SyncLog
                    {
                        EventId = payment.EventId,
                        EventType = "titulo_pagamento",
                        Status = result.Success ? "success" : "error",
                        ErrorMessage = result.ErrorMessage,
                        Payload = auditPayload
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
        public int SkippedCount { get; set; }
    }

    /// <summary>
    /// Verifica se o cliente tem CPF (>=11 dígitos) ou CNPJ (>=14 dígitos) válido.
    /// Rejeita strings vazias, apenas zeros, ou apenas pontuação.
    /// </summary>
    private static bool HasValidDoc(string? cpf, string? cnpj)
    {
        return HasMinDigits(cpf, 11) || HasMinDigits(cnpj, 14);
    }

    private static bool HasMinDigits(string? value, int min)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        int count = 0;
        foreach (var ch in value)
        {
            if (ch >= '0' && ch <= '9')
            {
                count++;
                if (count >= min) break;
            }
        }
        if (count < min) return false;
        // Rejeitar se todos os dígitos forem zero
        bool allZero = true;
        foreach (var ch in value)
        {
            if (ch >= '1' && ch <= '9') { allZero = false; break; }
        }
        return !allZero;
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

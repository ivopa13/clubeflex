using System.Text;
using System.Text.Json;
using ClubeFlex.Integrador.Models;
using Serilog;

namespace ClubeFlex.Integrador.Services;

/// <summary>
/// Serviço de logs de sincronização para um projeto específico
/// Permite rastrear execuções por projeto
/// </summary>
public class ProjectSyncLogService
{
    private readonly HttpClient _httpClient;
    private readonly string _functionsUrl;
    private readonly string _apiUrl;
    private readonly string _projectName;
    private string? _currentExecutionId;

    public ProjectSyncLogService(ProjectConfig config)
    {
        _projectName = config.Name;
        _httpClient = new HttpClient();
        
        // Separar URLs para Edge Functions e PostgREST
        var cleanBaseUrl = config.BaseUrl.Replace("/rest/v1", "").Replace("/functions/v1", "");
        _functionsUrl = $"{cleanBaseUrl}/functions/v1";
        _apiUrl = $"{cleanBaseUrl}/rest/v1";
        
        _httpClient.DefaultRequestHeaders.Add("apikey", config.ApiKey);
        _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {config.ApiKey}");
        
        Log.Debug($"[{_projectName}] SyncLog configurado: Functions={_functionsUrl}");
    }

    public string ProjectName => _projectName;

    /// <summary>
    /// Inicia uma nova execução do integrador para este projeto
    /// </summary>
    public async Task<string> StartExecutionAsync()
    {
        _currentExecutionId = $"EXEC_{_projectName}_{DateTime.Now:yyyyMMdd_HHmmss}_{Guid.NewGuid().ToString("N")[..8]}";
        
        try
        {
            var payload = new
            {
                action = "start",
                execution_id = _currentExecutionId
            };

            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync($"{_functionsUrl}/integrator-execution", content);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                Log.Warning($"⚠️ [{_projectName}] Não foi possível registrar início da execução: {response.StatusCode}");
            }
            else
            {
                Log.Information($"🚀 [{_projectName}] Execução iniciada: {_currentExecutionId}");
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex, $"⚠️ [{_projectName}] Não foi possível registrar início da execução");
        }

        return _currentExecutionId;
    }

    /// <summary>
    /// Finaliza a execução atual do integrador
    /// </summary>
    public async Task FinishExecutionAsync(string status, int totalEvents, int successCount, int errorCount, int invoiceCount, int paymentCount)
    {
        if (string.IsNullOrEmpty(_currentExecutionId))
        {
            Log.Warning($"⚠️ [{_projectName}] Nenhuma execução ativa para finalizar");
            return;
        }

        try
        {
            var payload = new
            {
                action = "finish",
                execution_id = _currentExecutionId,
                status = status,
                total_events = totalEvents,
                success_count = successCount,
                error_count = errorCount,
                invoice_count = invoiceCount,
                payment_count = paymentCount
            };

            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync($"{_functionsUrl}/integrator-execution", content);

            if (!response.IsSuccessStatusCode)
            {
                Log.Warning($"⚠️ [{_projectName}] Não foi possível registrar fim da execução");
            }
            else
            {
                Log.Information($"✅ [{_projectName}] Execução finalizada: {_currentExecutionId} ({status})");
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex, $"⚠️ [{_projectName}] Não foi possível registrar fim da execução");
        }
        finally
        {
            _currentExecutionId = null;
        }
    }

    public string? GetCurrentExecutionId() => _currentExecutionId;

    public async Task SaveSyncLogAsync(SyncLog log)
    {
        try
        {
            var mappedEventType = log.EventType switch
            {
                "fatura-criada" or "invoice_created" or "fatura" => "fatura",
                "pagamento-confirmado" or "payment_confirmed" or "pagamento" => "pagamento",
                "titulo-criado" or "titulo" => "titulo",
                "titulo-pago" => "titulo_pagamento",
                _ => log.EventType
            };

            var payload = new
            {
                event_id = log.EventId?.Trim() ?? string.Empty,
                event_type = mappedEventType,
                status = log.Status,
                payload = log.Payload != null ? JsonSerializer.Deserialize<object>(log.Payload) : null,
                error_message = log.ErrorMessage,
                attempts = log.Attempts,
                execution_id = _currentExecutionId
            };

            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync($"{_functionsUrl}/sync-log", content);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                Log.Error($"[{_projectName}] Erro ao salvar log: {response.StatusCode}");
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, $"[{_projectName}] Erro ao enviar log");
        }
    }

    public async Task<HashSet<string>> GetSuccessfulEventIdsAsync(string eventType)
    {
        var eventIds = new HashSet<string>();
        
        try
        {
            var url = $"{_apiUrl}/sync_logs?event_type=eq.{eventType}&status=eq.success&select=event_id";
            
            var response = await _httpClient.GetAsync(url);
            
            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync();
                var logs = JsonSerializer.Deserialize<List<SyncLogResponse>>(json);
                
                foreach (var log in logs ?? Enumerable.Empty<SyncLogResponse>())
                {
                    if (!string.IsNullOrEmpty(log.EventId))
                        eventIds.Add(log.EventId);
                }
                
                Log.Information($"✅ [{_projectName}] {eventIds.Count} event_ids já sincronizados ({eventType})");
            }
            else
            {
                Log.Warning($"❌ [{_projectName}] Erro ao consultar sync_logs: {response.StatusCode}");
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex, $"⚠️ [{_projectName}] Não foi possível consultar logs sincronizados ({eventType})");
        }
        
        return eventIds;
    }
}

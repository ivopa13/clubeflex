using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using ClubeFlex.Integrador.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace ClubeFlex.Integrador.Services;

public class CloudSyncLogService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<CloudSyncLogService> _logger;
    private readonly string _baseUrl;
    private readonly string _apiKey;

    public CloudSyncLogService(IConfiguration configuration, ILogger<CloudSyncLogService> logger)
    {
        _logger = logger;
        _httpClient = new HttpClient();
        
        var apiConfig = configuration.GetSection("ClubeFlexApi");
        _baseUrl = apiConfig["BaseUrl"] ?? throw new Exception("BaseUrl não configurado");
        _apiKey = apiConfig["ApiKey"] ?? throw new Exception("ApiKey não configurado");
        
        _httpClient.DefaultRequestHeaders.Add("apikey", _apiKey);
    }

    public async Task SaveSyncLogAsync(SyncLog log)
    {
        try
        {
            var payload = new
            {
                event_id = log.EventId,
                event_type = log.EventType,
                status = log.Status,
                payload = log.Payload != null ? JsonSerializer.Deserialize<object>(log.Payload) : null,
                error_message = log.ErrorMessage,
                attempts = log.Attempts
            };

            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync($"{_baseUrl}/sync-log", content);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogError($"Erro ao salvar log na nuvem: {response.StatusCode} - {errorContent}");
            }
            else
            {
                _logger.LogDebug($"Log salvo na nuvem: {log.EventId} ({log.EventType})");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erro ao enviar log para nuvem");
        }
    }
}

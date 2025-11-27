using Microsoft.Extensions.Configuration;
using Serilog;
using ClubeFlex.Integrador.Services;

namespace ClubeFlex.Integrador;

class Program
{
static async Task<int> Main(string[] args)
    {
        // PRIMEIRO: Output básico sem depender de nada
        Console.WriteLine("==============================================");
        Console.WriteLine("       CLUBE FLEX INTEGRADOR v1.1");
        Console.WriteLine("==============================================");
        Console.WriteLine($"Data/Hora: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
        Console.WriteLine($"Diretório atual: {Directory.GetCurrentDirectory()}");
        Console.WriteLine($"appsettings.json existe: {File.Exists("appsettings.json")}");
        Console.WriteLine();

        try
        {
            // Tentar configurar Serilog
            Console.WriteLine("Configurando sistema de logs...");
            Log.Logger = new LoggerConfiguration()
                .MinimumLevel.Information()
                .WriteTo.Console()
                .WriteTo.File("logs/sync-.txt", rollingInterval: RollingInterval.Day)
                .CreateLogger();
            Console.WriteLine("Sistema de logs configurado com sucesso.");
            Console.WriteLine();

            Log.Information("=== Clube Flex Integrador Iniciado ===");

            // Carregar configurações
            Console.WriteLine("Carregando configurações...");
            var configuration = new ConfigurationBuilder()
                .SetBasePath(Directory.GetCurrentDirectory())
                .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
                .Build();
            Console.WriteLine("Configurações carregadas com sucesso.");

            // Validar configurações obrigatórias
            var connectionString = configuration.GetConnectionString("LocalDatabase");
            var apiBaseUrl = configuration["ClubeFlexApi:BaseUrl"];
            var apiKey = configuration["ClubeFlexApi:ApiKey"];

            Console.WriteLine($"Connection string configurada: {!string.IsNullOrEmpty(connectionString)}");
            Console.WriteLine($"API BaseUrl configurada: {!string.IsNullOrEmpty(apiBaseUrl)}");
            Console.WriteLine($"API Key configurada: {!string.IsNullOrEmpty(apiKey)}");
            Console.WriteLine();

            if (string.IsNullOrEmpty(connectionString))
            {
                Log.Fatal("Connection string 'LocalDatabase' não configurada no appsettings.json");
                Console.WriteLine("ERRO: Connection string 'LocalDatabase' não configurada!");
                return 1;
            }

            if (string.IsNullOrEmpty(apiBaseUrl) || string.IsNullOrEmpty(apiKey))
            {
                Log.Fatal("Configurações da API do Clube Flex não encontradas no appsettings.json");
                Console.WriteLine("ERRO: Configurações da API não encontradas!");
                return 1;
            }

            // Inicializar serviços
            Console.WriteLine("Inicializando serviços...");
            var databaseService = new DatabaseService(connectionString);
            var apiService = new ClubeFlexApiService(apiBaseUrl, apiKey);
            var cloudSyncLogService = new CloudSyncLogService(configuration);
            var syncService = new SyncService(databaseService, apiService, cloudSyncLogService, configuration);
            Console.WriteLine("Serviços inicializados com sucesso.");
            Console.WriteLine();

            // Executar sincronização
            Log.Information("Iniciando sincronização...");
            Console.WriteLine("Iniciando sincronização...");
            await syncService.ExecuteSyncAsync();
            Log.Information("Sincronização concluída com sucesso");
            Console.WriteLine("Sincronização concluída com sucesso!");

            return 0;
        }
        catch (Exception ex)
        {
            Console.WriteLine();
            Console.WriteLine("===================== ERRO =====================");
            Console.WriteLine($"Tipo: {ex.GetType().Name}");
            Console.WriteLine($"Mensagem: {ex.Message}");
            Console.WriteLine($"StackTrace: {ex.StackTrace}");
            Console.WriteLine("================================================");
            
            try { Log.Fatal(ex, "Erro fatal durante execução"); } catch { }
            return 1;
        }
        finally
        {
            Console.WriteLine();
            Console.WriteLine("=== Clube Flex Integrador Finalizado ===");
            try { Log.CloseAndFlush(); } catch { }
            
            Console.WriteLine();
            Console.WriteLine("Pressione ENTER para fechar...");
            Console.ReadLine();
        }
    }
}

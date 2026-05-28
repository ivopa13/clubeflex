using Microsoft.Extensions.Configuration;
using Serilog;
using ClubeFlex.Integrador.Services;

namespace ClubeFlex.Integrador;

class Program
{
    static async Task<int> Main(string[] args)
    {
        // MODO SILENCIOSO É O PADRÃO - fecha automaticamente
        // Use --interactive ou -i se quiser que espere Enter no final
        bool interactiveMode = args.Contains("--interactive") || args.Contains("-i");
        bool updateTypesMode = args.Contains("--update-types");
        bool fullHistoryMode = args.Contains("--full-history") || args.Contains("--historico");
        bool backfillReceivables = args.Contains("--backfill-receivables");

        // Janela de datas opcional: --month=YYYY-MM  |  --from=YYYY-MM-DD --to=YYYY-MM-DD
        DateTime? windowFrom = null;
        DateTime? windowTo = null;
        string? monthArg = args.FirstOrDefault(a => a.StartsWith("--month="))?.Substring("--month=".Length);
        string? fromArg = args.FirstOrDefault(a => a.StartsWith("--from="))?.Substring("--from=".Length);
        string? toArg = args.FirstOrDefault(a => a.StartsWith("--to="))?.Substring("--to=".Length);
        if (!string.IsNullOrEmpty(monthArg) && DateTime.TryParse(monthArg + "-01", out var monthStart))
        {
            windowFrom = new DateTime(monthStart.Year, monthStart.Month, 1);
            windowTo = windowFrom.Value.AddMonths(1).AddDays(-1);
        }
        if (!string.IsNullOrEmpty(fromArg) && DateTime.TryParse(fromArg, out var fromParsed)) windowFrom = fromParsed;
        if (!string.IsNullOrEmpty(toArg) && DateTime.TryParse(toArg, out var toParsed)) windowTo = toParsed;
        bool windowed = windowFrom.HasValue && windowTo.HasValue;

        Console.WriteLine("==============================================");
        Console.WriteLine("       CLUBE FLEX INTEGRADOR v2.0");
        Console.WriteLine("         (Multi-Projeto Support)");
        Console.WriteLine("==============================================");
        if (!interactiveMode) Console.WriteLine("       [FECHA AUTOMATICAMENTE]");
        if (updateTypesMode) Console.WriteLine("       [MODO: ATUALIZAÇÃO DE TIPOS]");
        if (fullHistoryMode) Console.WriteLine("       [MODO: HISTÓRICO COMPLETO - SEM FILTRO DE DATA]");
        if (backfillReceivables) Console.WriteLine("       [MODO: BACKFILL TÍTULOS - IGNORA CHECKSUM]");
        if (windowed) Console.WriteLine($"       [JANELA: {windowFrom!.Value:dd/MM/yyyy} → {windowTo!.Value:dd/MM/yyyy}]");
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
            var configBuilder = new ConfigurationBuilder()
                .SetBasePath(Directory.GetCurrentDirectory())
                .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true);

            // No modo histórico completo, sobrescreve SyncFromDate para null (sem filtro)
            if (fullHistoryMode)
            {
                Console.WriteLine("⚠️  MODO HISTÓRICO: SyncFromDate será ignorado. Todos os registros serão sincronizados.");
                configBuilder.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["SyncSettings:SyncFromDate"] = ""
                });
            }

            var configuration = configBuilder.Build();
            Console.WriteLine("Configurações carregadas com sucesso.");

            // Validar configurações obrigatórias
            var connectionString = configuration.GetConnectionString("LocalDatabase");

            Console.WriteLine($"Connection string configurada: {!string.IsNullOrEmpty(connectionString)}");
            Console.WriteLine();

            if (string.IsNullOrEmpty(connectionString))
            {
                Log.Fatal("Connection string 'LocalDatabase' não configurada no appsettings.json");
                Console.WriteLine("ERRO: Connection string 'LocalDatabase' não configurada!");
                return 1;
            }

            // Verificar projetos configurados
            var projects = configuration.GetSection("Projects").GetChildren().ToList();
            var legacyApiUrl = configuration["ClubeFlexApi:BaseUrl"];
            
            if (projects.Count == 0 && string.IsNullOrEmpty(legacyApiUrl))
            {
                Log.Fatal("Nenhum projeto configurado. Configure 'Projects' ou 'ClubeFlexApi' no appsettings.json");
                Console.WriteLine("ERRO: Nenhum projeto configurado no appsettings.json!");
                return 1;
            }

            if (projects.Count > 0)
            {
                Console.WriteLine($"Projetos configurados: {projects.Count}");
                foreach (var project in projects)
                {
                    var name = project["Name"] ?? "Sem nome";
                    var syncInvoices = project["SyncInvoices"] == "True" || project["SyncInvoices"] == "true";
                    var syncPayments = project["SyncPayments"] == "True" || project["SyncPayments"] == "true";
                    var syncReceivables = project["SyncReceivables"] == "True" || project["SyncReceivables"] == "true";
                    var syncCustomers = project["SyncCustomers"] == "True" || project["SyncCustomers"] == "true";
                    
                    var syncs = new List<string>();
                    if (syncInvoices) syncs.Add("faturas");
                    if (syncPayments) syncs.Add("pagamentos");
                    if (syncReceivables) syncs.Add("títulos");
                    if (syncCustomers) syncs.Add("clientes");
                    
                    Console.WriteLine($"  📦 {name}: {string.Join(", ", syncs)}");
                }
            }
            else
            {
                Console.WriteLine("Usando configuração legacy (ClubeFlexApi)");
            }
            Console.WriteLine();

            // Inicializar serviços
            Console.WriteLine("Inicializando serviços...");
            var databaseService = new DatabaseService(connectionString);
            var syncService = new SyncService(databaseService, configuration);
            Console.WriteLine("Serviços inicializados com sucesso.");
            Console.WriteLine();

            if (updateTypesMode)
            {
                // Modo de atualização de tipos de movimento
                Log.Information("Iniciando atualização de tipos de movimento...");
                Console.WriteLine("Iniciando atualização de tipos de movimento...");
                await syncService.UpdateInvoiceTypesAsync();
                Log.Information("Atualização de tipos concluída");
                Console.WriteLine("Atualização de tipos concluída!");
            }
            else
            {
                // Executar sincronização normal (ou histórica com --full-history)
                var modeLabel = fullHistoryMode ? "histórica completa (sem filtro de data)" : "normal";
                if (backfillReceivables) modeLabel += " + BACKFILL títulos (ignora checksum)";
                if (windowed) modeLabel += $" + JANELA {windowFrom!.Value:dd/MM/yyyy}-{windowTo!.Value:dd/MM/yyyy}";
                Log.Information($"Iniciando sincronização {modeLabel}...");
                Console.WriteLine($"Iniciando sincronização {modeLabel}...");
                await syncService.ExecuteSyncAsync(backfillReceivables, windowFrom, windowTo);
                Log.Information("Sincronização concluída com sucesso");
                Console.WriteLine("Sincronização concluída com sucesso!");
            }

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
            
            // Só pedir Enter se passar --interactive explicitamente
            if (interactiveMode)
            {
                Console.WriteLine();
                Console.WriteLine("Pressione ENTER para fechar...");
                Console.ReadLine();
            }
        }
    }
}

using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;

namespace ClubeFlex.Integrador.Models;

/// <summary>
/// Payload para sincronização dedicada de clientes
/// Envia dados da tabela CLIENTE do Firebird para projetos externos
/// </summary>
public class ClientePayload
{
    [JsonProperty("event_id")]
    public string EventId { get; set; } = string.Empty;

    [JsonProperty("source")]
    public string Source { get; set; } = "erp_windows";

    [JsonProperty("customer_id_ext")]
    public string CustomerIdExt { get; set; } = string.Empty;

    [JsonProperty("name")]
    public string Name { get; set; } = string.Empty;

    [JsonProperty("cpf")]
    public string? Cpf { get; set; }

    [JsonProperty("cnpj")]
    public string? Cnpj { get; set; }

    [JsonProperty("email")]
    public string? Email { get; set; }

    [JsonProperty("phone")]
    public string? Phone { get; set; }

    [JsonProperty("status")]
    public string Status { get; set; } = "active";

    [JsonProperty("street")]
    public string? Street { get; set; }

    [JsonProperty("number")]
    public string? Number { get; set; }

    [JsonProperty("complement")]
    public string? Complement { get; set; }

    [JsonProperty("neighborhood")]
    public string? Neighborhood { get; set; }

    [JsonProperty("city")]
    public string? City { get; set; }

    [JsonProperty("state")]
    public string? State { get; set; }

    [JsonProperty("zip_code")]
    public string? ZipCode { get; set; }

    /// <summary>
    /// Data original de cadastro no CPlus (DATCAD).
    /// Usado para distinguir clientes realmente novos de antigos editados/desbloqueados.
    /// </summary>
    [JsonProperty("created_at_ext")]
    public DateTime? CreatedAtExt { get; set; }


    /// <summary>
    /// Checksum MD5 dos campos principais para detectar alterações
    /// </summary>
    [JsonProperty("checksum")]
    public string Checksum { get; set; } = string.Empty;

    /// <summary>
    /// Calcula o checksum baseado nos campos que podem mudar
    /// </summary>
    public void CalculateChecksum()
    {
        var dataToHash = $"{CustomerIdExt}|{Name}|{Cpf}|{Cnpj}|{Email}|{Phone}|{Status}|{Street}|{Number}|{Complement}|{Neighborhood}|{City}|{State}|{ZipCode}";
        
        using var md5 = MD5.Create();
        var inputBytes = Encoding.UTF8.GetBytes(dataToHash);
        var hashBytes = md5.ComputeHash(inputBytes);
        
        Checksum = Convert.ToHexString(hashBytes).ToLowerInvariant();
    }
}

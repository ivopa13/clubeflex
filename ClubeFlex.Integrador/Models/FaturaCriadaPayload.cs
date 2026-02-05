using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;

namespace ClubeFlex.Integrador.Models;

public class FaturaCriadaPayload
{
    [JsonProperty("event_id")]
    public string EventId { get; set; } = string.Empty;

    [JsonProperty("source")]
    public string Source { get; set; } = "erp_windows";

    [JsonProperty("invoice_id_ext")]
    public string InvoiceIdExt { get; set; } = string.Empty;

    [JsonProperty("order_number")]
    public string? OrderNumber { get; set; }

    [JsonProperty("total_amount")]
    public decimal TotalAmount { get; set; }

    [JsonProperty("issued_at")]
    public string IssuedAt { get; set; } = string.Empty;

    [JsonProperty("customer")]
    public CustomerData Customer { get; set; } = new();

    [JsonProperty("specifier")]
    public SpecifierData? Specifier { get; set; }

    [JsonProperty("movement_type")]
    public string MovementType { get; set; } = "produto";

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
        // Campos que identificam unicamente a fatura e seus valores
        var specifierId = Specifier?.IdExt ?? "";
        var dataToHash = $"{InvoiceIdExt}|{TotalAmount:F2}|{IssuedAt}|{Customer.IdExt}|{specifierId}|{MovementType}";
        
        using var md5 = MD5.Create();
        var inputBytes = Encoding.UTF8.GetBytes(dataToHash);
        var hashBytes = md5.ComputeHash(inputBytes);
        
        Checksum = Convert.ToHexString(hashBytes).ToLowerInvariant();
    }
}

public class CustomerData
{
    [JsonProperty("id_ext")]
    public string IdExt { get; set; } = string.Empty;

    [JsonProperty("name")]
    public string Name { get; set; } = string.Empty;

    [JsonProperty("doc")]
    public string? Doc { get; set; }  // Mantido para compatibilidade

    [JsonProperty("cpf")]
    public string? Cpf { get; set; }

    [JsonProperty("cnpj")]
    public string? Cnpj { get; set; }

    [JsonProperty("email")]
    public string? Email { get; set; }

    [JsonProperty("phone")]
    public string? Phone { get; set; }
}

public class SpecifierData
{
    [JsonProperty("id_ext")]
    public string IdExt { get; set; } = string.Empty;

    [JsonProperty("name")]
    public string Name { get; set; } = string.Empty;

    [JsonProperty("doc")]
    public string? Doc { get; set; }  // Mantido para compatibilidade

    [JsonProperty("cpf")]
    public string? Cpf { get; set; }

    [JsonProperty("cnpj")]
    public string? Cnpj { get; set; }

    [JsonProperty("email")]
    public string? Email { get; set; }

    [JsonProperty("phone")]
    public string? Phone { get; set; }

    [JsonProperty("role")]
    public string Role { get; set; } = "profissional";
}

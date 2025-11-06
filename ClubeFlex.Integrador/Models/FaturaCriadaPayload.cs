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

    [JsonProperty("total_amount")]
    public decimal TotalAmount { get; set; }

    [JsonProperty("issued_at")]
    public string IssuedAt { get; set; } = string.Empty;

    [JsonProperty("customer")]
    public CustomerData Customer { get; set; } = new();

    [JsonProperty("specifier")]
    public SpecifierData? Specifier { get; set; }
}

public class CustomerData
{
    [JsonProperty("id_ext")]
    public string IdExt { get; set; } = string.Empty;

    [JsonProperty("name")]
    public string Name { get; set; } = string.Empty;

    [JsonProperty("doc")]
    public string Doc { get; set; } = string.Empty;

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
    public string Doc { get; set; } = string.Empty;

    [JsonProperty("email")]
    public string? Email { get; set; }

    [JsonProperty("phone")]
    public string? Phone { get; set; }

    [JsonProperty("role")]
    public string Role { get; set; } = "profissional";
}

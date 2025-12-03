namespace ClubeFlex.Integrador.Models;

public class ApiResponse
{
    public bool Success { get; set; }
    public bool IsValidationError { get; set; }
    public string? ErrorMessage { get; set; }
    public string? Message { get; set; }
}

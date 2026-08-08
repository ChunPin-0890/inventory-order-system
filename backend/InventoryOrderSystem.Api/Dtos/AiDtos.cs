namespace InventoryOrderSystem.Api.Dtos;

public record GenerateDescriptionRequest(string ProductName, string CategoryName, string? Keywords);

public record GenerateDescriptionResponse(string Description);

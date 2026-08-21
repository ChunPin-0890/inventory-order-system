namespace InventoryOrderSystem.Api.Dtos;

public record SupplierDto(int Id, string Name, string? ContactName, string? Email, string? Phone);

public record CreateSupplierRequest(string Name, string? ContactName, string? Email, string? Phone);

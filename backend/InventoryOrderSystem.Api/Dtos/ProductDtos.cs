namespace InventoryOrderSystem.Api.Dtos;

public record ProductDto(int Id, string Sku, string Name, string? Description, int CategoryId, string CategoryName,
    decimal UnitPrice, int QuantityOnHand, int ReorderThreshold, bool IsLowStock, bool IsActive);

public record CreateProductRequest(string Sku, string Name, string? Description, int CategoryId,
    decimal UnitPrice, int QuantityOnHand, int ReorderThreshold);

public record UpdateProductRequest(string Name, string? Description, int CategoryId,
    decimal UnitPrice, int ReorderThreshold);

public record AdjustStockRequest(int Quantity, string? Reason);

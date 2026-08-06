using InventoryOrderSystem.Api.Dtos;

namespace InventoryOrderSystem.Api.Services;

public interface IProductService
{
    Task<List<ProductDto>> GetAllAsync(int? categoryId = null, bool? lowStockOnly = null, bool includeInactive = false);
    Task<ProductDto?> GetByIdAsync(int id);
    Task<ProductDto> CreateAsync(CreateProductRequest request);
    Task<ProductDto?> UpdateAsync(int id, UpdateProductRequest request);
    Task<bool> DeactivateAsync(int id);
    Task<ProductDto?> ReactivateAsync(int id);
    Task<ProductDto?> AdjustStockAsync(int id, AdjustStockRequest request);
}

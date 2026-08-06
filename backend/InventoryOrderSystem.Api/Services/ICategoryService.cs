using InventoryOrderSystem.Api.Dtos;

namespace InventoryOrderSystem.Api.Services;

public interface ICategoryService
{
    Task<List<CategoryDto>> GetAllAsync();
    Task<CategoryDto> CreateAsync(CreateCategoryRequest request);
}

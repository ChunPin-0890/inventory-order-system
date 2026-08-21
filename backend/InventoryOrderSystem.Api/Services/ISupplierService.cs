using InventoryOrderSystem.Api.Dtos;

namespace InventoryOrderSystem.Api.Services;

public interface ISupplierService
{
    Task<List<SupplierDto>> GetAllAsync();
    Task<SupplierDto> CreateAsync(CreateSupplierRequest request);
}

using InventoryOrderSystem.Api.Dtos;

namespace InventoryOrderSystem.Api.Services;

public interface IProductDescriptionService
{
    Task<GenerateDescriptionResponse> GenerateAsync(GenerateDescriptionRequest request, CancellationToken ct = default);
}

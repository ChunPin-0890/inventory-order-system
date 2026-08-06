using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Services;
using Xunit;

namespace InventoryOrderSystem.Tests.Services;

public class ProductServiceTests
{
    [Fact]
    public async Task CreateAsync_RecordsInitialStockMovement()
    {
        using var db = TestHelpers.CreateInMemoryDb();
        var categoryId = TestHelpers.SeedCategory(db, "Hardware");
        var service = new ProductService(db);

        var product = await service.CreateAsync(new CreateProductRequest(
            "SKU-001", "Widget", "A widget", categoryId, 9.99m, 50, 10));

        Assert.Equal(50, product.QuantityOnHand);
        Assert.Equal("Hardware", product.CategoryName);
        Assert.Single(db.StockMovements);
    }

    [Fact]
    public async Task CreateAsync_UnknownCategory_ThrowsInvalidOperation()
    {
        using var db = TestHelpers.CreateInMemoryDb();
        var service = new ProductService(db);

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.CreateAsync(
            new CreateProductRequest("SKU-X", "X", null, 999, 1m, 1, 5)));
    }

    [Fact]
    public async Task GetAllAsync_LowStockOnly_FiltersCorrectly()
    {
        using var db = TestHelpers.CreateInMemoryDb();
        var categoryId = TestHelpers.SeedCategory(db);
        var service = new ProductService(db);

        await service.CreateAsync(new CreateProductRequest("SKU-A", "A", null, categoryId, 1m, 5, 10));  // low stock
        await service.CreateAsync(new CreateProductRequest("SKU-B", "B", null, categoryId, 1m, 100, 10)); // healthy

        var lowStock = await service.GetAllAsync(lowStockOnly: true);

        Assert.Single(lowStock);
        Assert.Equal("SKU-A", lowStock[0].Sku);
    }

    [Fact]
    public async Task AdjustStockAsync_NegativeAdjustment_ReducesQuantity()
    {
        using var db = TestHelpers.CreateInMemoryDb();
        var categoryId = TestHelpers.SeedCategory(db);
        var service = new ProductService(db);
        var product = await service.CreateAsync(new CreateProductRequest("SKU-C", "C", null, categoryId, 1m, 20, 10));

        var updated = await service.AdjustStockAsync(product.Id, new AdjustStockRequest(-5, "Damaged"));

        Assert.Equal(15, updated!.QuantityOnHand);
    }

    [Fact]
    public async Task AdjustStockAsync_CannotGoNegative_ThrowsInvalidOperation()
    {
        using var db = TestHelpers.CreateInMemoryDb();
        var categoryId = TestHelpers.SeedCategory(db);
        var service = new ProductService(db);
        var product = await service.CreateAsync(new CreateProductRequest("SKU-D", "D", null, categoryId, 1m, 3, 10));

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.AdjustStockAsync(product.Id, new AdjustStockRequest(-10, "Too many")));
    }

    [Fact]
    public async Task UpdateAsync_UnknownId_ReturnsNull()
    {
        using var db = TestHelpers.CreateInMemoryDb();
        var categoryId = TestHelpers.SeedCategory(db);
        var service = new ProductService(db);

        var result = await service.UpdateAsync(999, new UpdateProductRequest("X", null, categoryId, 1m, 5));

        Assert.Null(result);
    }

    [Fact]
    public async Task DeactivateAsync_HidesProductFromDefaultListing()
    {
        using var db = TestHelpers.CreateInMemoryDb();
        var categoryId = TestHelpers.SeedCategory(db);
        var service = new ProductService(db);
        var product = await service.CreateAsync(new CreateProductRequest("SKU-E", "E", null, categoryId, 1m, 10, 5));

        var deactivated = await service.DeactivateAsync(product.Id);
        var visible = await service.GetAllAsync();
        var withInactive = await service.GetAllAsync(includeInactive: true);

        Assert.True(deactivated);
        Assert.Empty(visible);
        Assert.Single(withInactive);
        Assert.False(withInactive[0].IsActive);
    }

    [Fact]
    public async Task ReactivateAsync_MakesProductVisibleAgain()
    {
        using var db = TestHelpers.CreateInMemoryDb();
        var categoryId = TestHelpers.SeedCategory(db);
        var service = new ProductService(db);
        var product = await service.CreateAsync(new CreateProductRequest("SKU-F", "F", null, categoryId, 1m, 10, 5));
        await service.DeactivateAsync(product.Id);

        var reactivated = await service.ReactivateAsync(product.Id);
        var visible = await service.GetAllAsync();

        Assert.True(reactivated!.IsActive);
        Assert.Single(visible);
    }
}

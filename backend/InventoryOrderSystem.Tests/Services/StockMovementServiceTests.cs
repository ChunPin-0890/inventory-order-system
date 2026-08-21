using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Models;
using InventoryOrderSystem.Api.Services;
using Xunit;

namespace InventoryOrderSystem.Tests.Services;

public class StockMovementServiceTests
{
    [Fact]
    public async Task GetAllAsync_ReturnsMovementsNewestFirst()
    {
        var db = TestHelpers.CreateInMemoryDb();
        var categoryId = TestHelpers.SeedCategory(db, "Hardware");
        var productService = new ProductService(db);
        var product = await productService.CreateAsync(
            new CreateProductRequest("SKU-M", "Widget", null, categoryId, 5m, 10, 5)); // writes 1 movement (Initial stock)

        await productService.AdjustStockAsync(product.Id, new AdjustStockRequest(5, "Restock")); // +1 movement

        var service = new StockMovementService(db);
        var movements = await service.GetAllAsync();

        Assert.Equal(2, movements.Count);
        Assert.Equal("Restock", movements[0].Reason); // most recent first
        Assert.Equal("Initial stock", movements[1].Reason);
    }

    [Fact]
    public async Task GetAllAsync_FiltersByProductId()
    {
        var db = TestHelpers.CreateInMemoryDb();
        var categoryId = TestHelpers.SeedCategory(db, "Hardware");
        var productService = new ProductService(db);
        var productA = await productService.CreateAsync(new CreateProductRequest("SKU-A", "A", null, categoryId, 1m, 5, 2));
        var productB = await productService.CreateAsync(new CreateProductRequest("SKU-B", "B", null, categoryId, 1m, 5, 2));

        var service = new StockMovementService(db);
        var forA = await service.GetAllAsync(productId: productA.Id);

        Assert.Single(forA);
        Assert.Equal(productA.Id, forA[0].ProductId);
        Assert.NotEqual(productB.Id, forA[0].ProductId);
    }

    [Fact]
    public async Task GetAllAsync_FiltersByType()
    {
        var db = TestHelpers.CreateInMemoryDb();
        var categoryId = TestHelpers.SeedCategory(db, "Hardware");
        var productService = new ProductService(db);
        var product = await productService.CreateAsync(
            new CreateProductRequest("SKU-T", "Widget", null, categoryId, 5m, 10, 2)); // StockIn
        await productService.AdjustStockAsync(product.Id, new AdjustStockRequest(-3, "Damaged")); // StockOut

        var service = new StockMovementService(db);
        var stockOutOnly = await service.GetAllAsync(type: StockMovementType.StockOut);

        Assert.Single(stockOutOnly);
        Assert.Equal("Damaged", stockOutOnly[0].Reason);
    }
}

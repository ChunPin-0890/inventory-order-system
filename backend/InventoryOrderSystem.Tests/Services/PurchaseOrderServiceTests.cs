using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Models;
using InventoryOrderSystem.Api.Services;
using Xunit;

namespace InventoryOrderSystem.Tests.Services;

public class PurchaseOrderServiceTests
{
    private static async Task<(InventoryOrderSystem.Api.Data.AppDbContext db, int supplierId, ProductDto product)> SeedAsync(int quantity = 5)
    {
        var db = TestHelpers.CreateInMemoryDb();
        var categoryId = TestHelpers.SeedCategory(db, "Hardware");
        var productService = new ProductService(db);
        var product = await productService.CreateAsync(
            new CreateProductRequest("SKU-PO", "Widget", null, categoryId, 10m, quantity, 5));

        var supplierService = new SupplierService(db);
        var supplier = await supplierService.CreateAsync(new CreateSupplierRequest("Acme Co", "Lena", "lena@acme.test", null));

        return (db, supplier.Id, product);
    }

    [Fact]
    public async Task CreateAsync_StartsAsDraft()
    {
        var (db, supplierId, product) = await SeedAsync();
        var service = new PurchaseOrderService(db);

        var po = await service.CreateAsync(new CreatePurchaseOrderRequest(
            supplierId, null, new List<PurchaseOrderItemRequest> { new(product.Id, 20) }));

        Assert.Equal(PurchaseOrderStatus.Draft, po.Status);
        Assert.Single(po.Items);
        Assert.Equal(20, po.Items[0].OrderedQuantity);
        Assert.Equal(0, po.Items[0].ReceivedQuantity);
    }

    [Fact]
    public async Task CreateAsync_UnknownSupplier_Throws()
    {
        var (db, _, product) = await SeedAsync();
        var service = new PurchaseOrderService(db);

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.CreateAsync(
            new CreatePurchaseOrderRequest(999, null, new List<PurchaseOrderItemRequest> { new(product.Id, 5) })));
    }

    [Fact]
    public async Task MarkOrderedAsync_FromDraft_Succeeds()
    {
        var (db, supplierId, product) = await SeedAsync();
        var service = new PurchaseOrderService(db);
        var po = await service.CreateAsync(new CreatePurchaseOrderRequest(
            supplierId, null, new List<PurchaseOrderItemRequest> { new(product.Id, 10) }));

        var ordered = await service.MarkOrderedAsync(po.Id);

        Assert.Equal(PurchaseOrderStatus.Ordered, ordered!.Status);
    }

    [Fact]
    public async Task ReceiveAsync_NotOrdered_Throws()
    {
        var (db, supplierId, product) = await SeedAsync();
        var service = new PurchaseOrderService(db);
        var po = await service.CreateAsync(new CreatePurchaseOrderRequest(
            supplierId, null, new List<PurchaseOrderItemRequest> { new(product.Id, 10) }));

        // still Draft — receiving should be rejected
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.ReceiveAsync(po.Id, new ReceivePurchaseOrderRequest(
                new List<ReceiveLineRequest> { new(po.Items[0].Id, 5) })));
    }

    [Fact]
    public async Task ReceiveAsync_PartialReceive_IncreasesStockAndKeepsOrderedStatus()
    {
        var (db, supplierId, product) = await SeedAsync(quantity: 5);
        var service = new PurchaseOrderService(db);
        var po = await service.CreateAsync(new CreatePurchaseOrderRequest(
            supplierId, null, new List<PurchaseOrderItemRequest> { new(product.Id, 20) }));
        await service.MarkOrderedAsync(po.Id);

        var afterReceive = await service.ReceiveAsync(po.Id, new ReceivePurchaseOrderRequest(
            new List<ReceiveLineRequest> { new(po.Items[0].Id, 8) }));

        Assert.Equal(PurchaseOrderStatus.Ordered, afterReceive!.Status); // not fully received yet
        Assert.Equal(8, afterReceive.Items[0].ReceivedQuantity);

        var productService = new ProductService(db);
        var updatedProduct = await productService.GetByIdAsync(product.Id);
        Assert.Equal(13, updatedProduct!.QuantityOnHand); // 5 initial + 8 received
    }

    [Fact]
    public async Task ReceiveAsync_FullyReceived_TransitionsToReceived()
    {
        var (db, supplierId, product) = await SeedAsync(quantity: 0);
        var service = new PurchaseOrderService(db);
        var po = await service.CreateAsync(new CreatePurchaseOrderRequest(
            supplierId, null, new List<PurchaseOrderItemRequest> { new(product.Id, 10) }));
        await service.MarkOrderedAsync(po.Id);

        var received = await service.ReceiveAsync(po.Id, new ReceivePurchaseOrderRequest(
            new List<ReceiveLineRequest> { new(po.Items[0].Id, 10) }));

        Assert.Equal(PurchaseOrderStatus.Received, received!.Status);
        Assert.Equal(10, received.Items[0].ReceivedQuantity);
    }

    [Fact]
    public async Task ReceiveAsync_OverReceive_ThrowsAndDoesNotChangeStock()
    {
        var (db, supplierId, product) = await SeedAsync(quantity: 5);
        var service = new PurchaseOrderService(db);
        var po = await service.CreateAsync(new CreatePurchaseOrderRequest(
            supplierId, null, new List<PurchaseOrderItemRequest> { new(product.Id, 10) }));
        await service.MarkOrderedAsync(po.Id);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.ReceiveAsync(po.Id, new ReceivePurchaseOrderRequest(
                new List<ReceiveLineRequest> { new(po.Items[0].Id, 999) })));

        var productService = new ProductService(db);
        var unchanged = await productService.GetByIdAsync(product.Id);
        Assert.Equal(5, unchanged!.QuantityOnHand); // untouched — over-receive was rejected before any stock change
    }

    [Fact]
    public async Task CancelAsync_FromDraft_Succeeds()
    {
        var (db, supplierId, product) = await SeedAsync();
        var service = new PurchaseOrderService(db);
        var po = await service.CreateAsync(new CreatePurchaseOrderRequest(
            supplierId, null, new List<PurchaseOrderItemRequest> { new(product.Id, 10) }));

        var cancelled = await service.CancelAsync(po.Id);

        Assert.Equal(PurchaseOrderStatus.Cancelled, cancelled!.Status);
    }

    [Fact]
    public async Task CancelAsync_FromReceived_Throws()
    {
        var (db, supplierId, product) = await SeedAsync(quantity: 0);
        var service = new PurchaseOrderService(db);
        var po = await service.CreateAsync(new CreatePurchaseOrderRequest(
            supplierId, null, new List<PurchaseOrderItemRequest> { new(product.Id, 10) }));
        await service.MarkOrderedAsync(po.Id);
        await service.ReceiveAsync(po.Id, new ReceivePurchaseOrderRequest(
            new List<ReceiveLineRequest> { new(po.Items[0].Id, 10) }));

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.CancelAsync(po.Id));
    }

    [Theory]
    [InlineData(PurchaseOrderStatus.Draft, PurchaseOrderStatus.Ordered, true)]
    [InlineData(PurchaseOrderStatus.Draft, PurchaseOrderStatus.Received, false)]
    [InlineData(PurchaseOrderStatus.Ordered, PurchaseOrderStatus.Received, true)]
    [InlineData(PurchaseOrderStatus.Ordered, PurchaseOrderStatus.Cancelled, true)]
    [InlineData(PurchaseOrderStatus.Received, PurchaseOrderStatus.Cancelled, false)]
    public void PurchaseOrderStatusMachine_CanTransition_MatchesExpected(
        PurchaseOrderStatus from, PurchaseOrderStatus to, bool expected)
    {
        Assert.Equal(expected, PurchaseOrderStatusMachine.CanTransition(from, to));
    }
}

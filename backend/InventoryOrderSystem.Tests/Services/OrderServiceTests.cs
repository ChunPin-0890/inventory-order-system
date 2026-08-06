using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Models;
using InventoryOrderSystem.Api.Services;
using Xunit;

namespace InventoryOrderSystem.Tests.Services;

public class OrderServiceTests
{
    private static async Task<(InventoryOrderSystem.Api.Data.AppDbContext db, ProductDto product)> SeedProductAsync(int quantity = 10)
    {
        var db = TestHelpers.CreateInMemoryDb();
        var categoryId = TestHelpers.SeedCategory(db, "Hardware");
        var productService = new ProductService(db);
        var product = await productService.CreateAsync(
            new CreateProductRequest("SKU-X", "Widget", null, categoryId, 10m, quantity, 5));
        return (db, product);
    }

    [Fact]
    public async Task CreateAsync_DeductsStock_AndComputesTotal()
    {
        var (db, product) = await SeedProductAsync(quantity: 10);
        var orderService = new OrderService(db);

        var order = await orderService.CreateAsync(new CreateOrderRequest(
            "Alice", new List<OrderItemRequest> { new(product.Id, 3) }));

        Assert.Equal(30m, order.TotalAmount);

        var productService = new ProductService(db);
        var updatedProduct = await productService.GetByIdAsync(product.Id);
        Assert.Equal(7, updatedProduct!.QuantityOnHand);
    }

    [Fact]
    public async Task CreateAsync_InsufficientStock_ThrowsAndDoesNotPartiallyDeduct()
    {
        var (db, product) = await SeedProductAsync(quantity: 2);
        var orderService = new OrderService(db);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            orderService.CreateAsync(new CreateOrderRequest(
                "Bob", new List<OrderItemRequest> { new(product.Id, 5) })));

        var productService = new ProductService(db);
        var unchanged = await productService.GetByIdAsync(product.Id);
        Assert.Equal(2, unchanged!.QuantityOnHand); // stock untouched after failed order
    }

    [Fact]
    public async Task UpdateStatusAsync_ValidTransition_Succeeds()
    {
        var (db, product) = await SeedProductAsync();
        var orderService = new OrderService(db);
        var order = await orderService.CreateAsync(new CreateOrderRequest(
            "Carol", new List<OrderItemRequest> { new(product.Id, 1) }));

        var updated = await orderService.UpdateStatusAsync(order.Id, new UpdateOrderStatusRequest(OrderStatus.Confirmed));

        Assert.Equal(OrderStatus.Confirmed, updated!.Status);
    }

    [Fact]
    public async Task UpdateStatusAsync_InvalidTransition_Throws()
    {
        var (db, product) = await SeedProductAsync();
        var orderService = new OrderService(db);
        var order = await orderService.CreateAsync(new CreateOrderRequest(
            "Dave", new List<OrderItemRequest> { new(product.Id, 1) }));

        // Pending -> Shipped is not an allowed transition (must go through Confirmed first).
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            orderService.UpdateStatusAsync(order.Id, new UpdateOrderStatusRequest(OrderStatus.Shipped)));
    }

    [Fact]
    public async Task UpdateStatusAsync_Cancel_RestocksItems()
    {
        var (db, product) = await SeedProductAsync(quantity: 10);
        var orderService = new OrderService(db);
        var order = await orderService.CreateAsync(new CreateOrderRequest(
            "Eve", new List<OrderItemRequest> { new(product.Id, 4) }));

        await orderService.UpdateStatusAsync(order.Id, new UpdateOrderStatusRequest(OrderStatus.Cancelled));

        var productService = new ProductService(db);
        var restocked = await productService.GetByIdAsync(product.Id);
        Assert.Equal(10, restocked!.QuantityOnHand); // full quantity restored
    }

    [Fact]
    public async Task CreateAsync_MultipleItems_DeductsEachAndSumsTotal()
    {
        var db = TestHelpers.CreateInMemoryDb();
        var categoryId = TestHelpers.SeedCategory(db, "Hardware");
        var productService = new ProductService(db);
        var productA = await productService.CreateAsync(new CreateProductRequest("SKU-A", "Widget A", null, categoryId, 5m, 10, 2));
        var productB = await productService.CreateAsync(new CreateProductRequest("SKU-B", "Widget B", null, categoryId, 3m, 10, 2));
        var orderService = new OrderService(db);

        var order = await orderService.CreateAsync(new CreateOrderRequest(
            "Frank", new List<OrderItemRequest> { new(productA.Id, 2), new(productB.Id, 4) }));

        Assert.Equal(2, order.Items.Count);
        Assert.Equal(5m * 2 + 3m * 4, order.TotalAmount);

        var updatedA = await productService.GetByIdAsync(productA.Id);
        var updatedB = await productService.GetByIdAsync(productB.Id);
        Assert.Equal(8, updatedA!.QuantityOnHand);
        Assert.Equal(6, updatedB!.QuantityOnHand);
    }

    [Fact]
    public async Task GetAllAsync_Search_FiltersByCustomerOrOrderNumber()
    {
        var (db, product) = await SeedProductAsync(quantity: 10);
        var orderService = new OrderService(db);
        var order1 = await orderService.CreateAsync(new CreateOrderRequest("Grace Tan", new List<OrderItemRequest> { new(product.Id, 1) }));
        await orderService.CreateAsync(new CreateOrderRequest("Henry Lim", new List<OrderItemRequest> { new(product.Id, 1) }));

        var byCustomer = await orderService.GetAllAsync(search: "grace");
        var byOrderNumber = await orderService.GetAllAsync(search: order1.OrderNumber);
        var noMatch = await orderService.GetAllAsync(search: "nonexistent-customer");

        Assert.Single(byCustomer);
        Assert.Equal("Grace Tan", byCustomer[0].CustomerName);
        Assert.Single(byOrderNumber);
        Assert.Empty(noMatch);
    }

    [Theory]
    [InlineData(OrderStatus.Pending, OrderStatus.Confirmed, true)]
    [InlineData(OrderStatus.Pending, OrderStatus.Shipped, false)]
    [InlineData(OrderStatus.Confirmed, OrderStatus.Shipped, true)]
    [InlineData(OrderStatus.Shipped, OrderStatus.Completed, true)]
    [InlineData(OrderStatus.Completed, OrderStatus.Pending, false)]
    [InlineData(OrderStatus.Cancelled, OrderStatus.Confirmed, false)]
    public void OrderStatusMachine_CanTransition_MatchesExpected(OrderStatus from, OrderStatus to, bool expected)
    {
        Assert.Equal(expected, OrderStatusMachine.CanTransition(from, to));
    }
}

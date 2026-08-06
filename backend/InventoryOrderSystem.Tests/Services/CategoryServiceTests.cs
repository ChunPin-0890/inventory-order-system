using InventoryOrderSystem.Api.Dtos;
using InventoryOrderSystem.Api.Services;
using Xunit;

namespace InventoryOrderSystem.Tests.Services;

public class CategoryServiceTests
{
    [Fact]
    public async Task CreateAsync_NewName_CreatesCategory()
    {
        using var db = TestHelpers.CreateInMemoryDb();
        var service = new CategoryService(db);

        var category = await service.CreateAsync(new CreateCategoryRequest("Electronics"));

        Assert.Equal("Electronics", category.Name);
        Assert.Single(db.Categories);
    }

    [Fact]
    public async Task CreateAsync_DuplicateName_ReturnsExistingInsteadOfDuplicating()
    {
        using var db = TestHelpers.CreateInMemoryDb();
        var service = new CategoryService(db);

        var first = await service.CreateAsync(new CreateCategoryRequest("Hardware"));
        var second = await service.CreateAsync(new CreateCategoryRequest("Hardware"));

        Assert.Equal(first.Id, second.Id);
        Assert.Single(db.Categories);
    }

    [Fact]
    public async Task CreateAsync_BlankName_Throws()
    {
        using var db = TestHelpers.CreateInMemoryDb();
        var service = new CategoryService(db);

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.CreateAsync(new CreateCategoryRequest("   ")));
    }

    [Fact]
    public async Task GetAllAsync_ReturnsAlphabeticalOrder()
    {
        using var db = TestHelpers.CreateInMemoryDb();
        var service = new CategoryService(db);
        await service.CreateAsync(new CreateCategoryRequest("Zebra"));
        await service.CreateAsync(new CreateCategoryRequest("Apple"));

        var all = await service.GetAllAsync();

        Assert.Equal("Apple", all[0].Name);
        Assert.Equal("Zebra", all[1].Name);
    }
}

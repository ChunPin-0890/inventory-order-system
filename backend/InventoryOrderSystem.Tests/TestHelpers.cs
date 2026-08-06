using InventoryOrderSystem.Api.Data;
using InventoryOrderSystem.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace InventoryOrderSystem.Tests;

public static class TestHelpers
{
    /// <summary>
    /// Creates an isolated in-memory DbContext for unit tests.
    /// The in-memory provider doesn't support real transactions, so the
    /// TransactionIgnoredWarning is suppressed here — real deployments run against
    /// SQL Server, where OrderService's transactions are fully honored.
    /// </summary>
    public static AppDbContext CreateInMemoryDb(string? dbName = null)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString())
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        return new AppDbContext(options);
    }

    /// <summary>Seeds a single category and returns its id, for tests that need a valid CategoryId.</summary>
    public static int SeedCategory(AppDbContext db, string name = "Test Category")
    {
        var category = new Category { Name = name };
        db.Categories.Add(category);
        db.SaveChanges();
        return category.Id;
    }
}

# Code Guide — Line-by-Line / Block-by-Block Walkthrough

This document explains what every file in the project does, block by block. It's written for
studying the codebase and for interview prep — if you can explain any block here in your own
words, you understand that part of the project.

Layout:
- **Backend** (`backend/InventoryOrderSystem.Api`) — .NET 8 Web API
- **Backend Tests** (`backend/InventoryOrderSystem.Tests`) — xUnit
- **Frontend** (`frontend/src`) — React + TypeScript

---

## BACKEND

### `Program.cs` — the application's entry point and wiring

This file runs once, when the API process starts. It's where every "service" gets registered
into .NET's built-in dependency injection (DI) container, and where the HTTP request pipeline
(middleware) gets configured.

```csharp
var builder = WebApplication.CreateBuilder(args);
```
Creates a "builder" object — think of it as a construction site for the app. Everything below
adds a piece to it before we finally call `builder.Build()`.

```csharp
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });
```
Registers MVC controllers (your `ProductsController`, `OrdersController`, etc.) so ASP.NET Core
knows to route HTTP requests to them. The `.AddJsonOptions(...)` part configures how C# objects
become JSON: without it, an enum like `OrderStatus.Pending` would serialize as the number `0`;
with the `JsonStringEnumConverter`, it serializes as the string `"Pending"` — this is the fix for
a real bug we hit (frontend crashed trying to call `.toLowerCase()` on a number).

```csharp
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        options.UseInMemoryDatabase("InventoryOrderSystemDb")
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning));
    }
    else
    {
        options.UseSqlServer(connectionString);
    }
});
```
Registers `AppDbContext` (EF Core's "unit of work" object) into DI. If no real database
connection string is configured (local dev today), it falls back to an in-memory fake database.
Once we configure Azure SQL, `connectionString` will be non-empty and this switches to
`UseSqlServer` automatically — no other code needs to change.

```csharp
builder.Services.AddScoped<IProductService, ProductService>();
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddScoped<ICategoryService, CategoryService>();
builder.Services.AddScoped<ITokenService, TokenService>();
```
Registers each service behind its interface. "Scoped" means: one instance is created per HTTP
request, then thrown away. This is what lets a controller ask for `IProductService` in its
constructor and just receive a working instance — .NET wires it up automatically (this pattern
is called **Dependency Injection**).

```csharp
var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException(...);
...
builder.Services.AddAuthentication(options => { ... }).AddJwtBearer(options => { ... });
builder.Services.AddAuthorization();
```
Configures JWT authentication: reads the signing key/issuer/audience from config, tells ASP.NET
Core "requests carrying a Bearer token should be validated against these rules." This is what
powers every `[Authorize]` attribute on your controllers.

```csharp
builder.Services.AddCors(options => { options.AddPolicy(frontendCorsPolicy, policy => { ... }); });
```
CORS = Cross-Origin Resource Sharing. Browsers block JavaScript from calling a different
origin (domain+port) than the page was loaded from, unless the server explicitly allows it.
Your frontend (`localhost:5174`) and backend (`localhost:5256`) are different origins, so
without this, every API call would be silently blocked by the browser. In dev, any localhost
origin is allowed (because Vite's port shifts); in production, only the exact deployed frontend
URL (from config) is allowed.

```csharp
var app = builder.Build();
```
Turns the builder into an actual runnable app — after this point, you can't register new
services, only configure the request pipeline.

```csharp
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
    SeedData.SeedDemoUsers(db);
    SeedData.SeedDefaultCategories(db);
}
```
Dev-only: enables Swagger (an auto-generated API docs/testing UI at `/swagger`), creates the
database schema if it doesn't exist yet, and seeds the two demo user accounts + four default
categories so there's data to work with immediately.

```csharp
app.UseHttpsRedirection();
app.UseCors(frontendCorsPolicy);
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```
This is the **middleware pipeline** — every request passes through these in order:
1. Redirect HTTP → HTTPS
2. Apply CORS rules
3. `UseAuthentication` — figure out *who* is making the request (validate the JWT, if present)
4. `UseAuthorization` — check *whether* that identity is allowed to do what it's asking
5. `MapControllers` — route the request to the matching controller action

Order matters here: authentication must run before authorization (you can't check permissions
for an unknown user), and both must run before the request reaches your controllers.

```csharp
public static class SeedData
{
    public static void SeedDemoUsers(AppDbContext db) { ... }
    public static void SeedDefaultCategories(AppDbContext db) { ... }
}
```
A small helper class (not a service — it's just static setup code) that inserts starter data:
`admin`/`staff` accounts with hashed passwords, and category rows like "Hardware", "Electronics".

---

### `Models/` — the shape of your data (EF Core entities)

**`Product.cs`**
```csharp
public class Product
{
    public int Id { get; set; }
    public string Sku { get; set; } = string.Empty;
    ...
    public int CategoryId { get; set; }
    public Category? Category { get; set; }
    ...
    public bool IsActive { get; set; } = true;
    public byte[]? RowVersion { get; set; }
    public ICollection<StockMovement> StockMovements { get; set; } = new List<StockMovement>();
}
```
Each property becomes a database column (except navigation properties like `Category` and
`StockMovements`, which represent relationships, not columns). Key details:
- `CategoryId` + `Category` — a **foreign key pair**. `CategoryId` is the actual column; `Category`
  is a convenience so you can write `product.Category.Name` in C# instead of a manual join.
- `IsActive` — powers soft delete: false means "hidden, but still in the database."
- `RowVersion` — a special EF Core **concurrency token**. The database automatically changes
  this value every time the row is updated. EF Core uses it to detect "did someone else change
  this row since I read it?" — this is the mechanism behind the concurrency-safe stock logic.
- `ICollection<StockMovement>` — "one Product has many StockMovements" (the audit trail of every
  stock change for this product).

**`Category.cs`**
```csharp
public class Category
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public ICollection<Product> Products { get; set; } = new List<Product>();
}
```
Simple lookup entity. `Products` is the reverse side of the Product↔Category relationship.

**`Order.cs`**
```csharp
public enum OrderStatus { Pending, Confirmed, Shipped, Completed, Cancelled }

public class Order
{
    public int Id { get; set; }
    public string OrderNumber { get; set; } = string.Empty;
    public string CustomerName { get; set; } = string.Empty;
    public OrderStatus Status { get; set; } = OrderStatus.Pending;
    public decimal TotalAmount { get; set; }
    ...
    public ICollection<OrderItem> Items { get; set; } = new List<OrderItem>();
}

public class OrderItem
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order? Order { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
}

public static class OrderStatusMachine
{
    private static readonly Dictionary<OrderStatus, OrderStatus[]> AllowedTransitions = new()
    {
        [OrderStatus.Pending] = new[] { OrderStatus.Confirmed, OrderStatus.Cancelled },
        [OrderStatus.Confirmed] = new[] { OrderStatus.Shipped, OrderStatus.Cancelled },
        [OrderStatus.Shipped] = new[] { OrderStatus.Completed },
        [OrderStatus.Completed] = Array.Empty<OrderStatus>(),
        [OrderStatus.Cancelled] = Array.Empty<OrderStatus>(),
    };

    public static bool CanTransition(OrderStatus from, OrderStatus to)
        => AllowedTransitions.TryGetValue(from, out var allowed) && allowed.Contains(to);
}
```
`Order` has many `OrderItem`s (one order, several product lines — this is what makes multi-item
orders possible). `UnitPrice` is copied onto the `OrderItem` at the time of purchase — this is
deliberate: if you change a product's price later, past orders should still show what the
customer actually paid, not today's price.

`OrderStatusMachine` is a **finite state machine** implemented as a lookup dictionary — the
cleanest way to express "these are the only legal transitions." `CanTransition` is called by
`OrderService` before any status change is allowed, so invalid jumps (e.g. `Pending` straight to
`Shipped`) get rejected with a clear error instead of silently corrupting data.

**`StockMovement.cs`**
```csharp
public enum StockMovementType { StockIn, StockOut, Adjustment }

public class StockMovement
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public StockMovementType Type { get; set; }
    public int Quantity { get; set; }
    public string? Reason { get; set; }
    public int? OrderId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
```
An **audit log row** — one row is written every time stock changes for any reason (initial
stock, manual +10/-1 adjustment, an order consuming stock, a cancelled order restocking). This
is what would power a future "stock history" report page.

**`User.cs`**
```csharp
public enum UserRole { Admin, Staff }

public class User
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public UserRole Role { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
```
Note there is no `Password` property — only `PasswordHash`. The plain password is never stored,
ever (see `AuthController` below for how hashing works).

---

### `Data/AppDbContext.cs` — EF Core's "unit of work"

```csharp
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Product> Products => Set<Product>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Category> Categories => Set<Category>();
```
Each `DbSet<T>` is a queryable, in-memory-feeling collection that's actually backed by a
database table. `_db.Products.Where(...)` doesn't fetch anything until you call `.ToListAsync()`
or similar — EF Core builds up a query expression and only sends SQL to the database at that
point ("deferred execution").

```csharp
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Product>(e =>
        {
            e.HasIndex(p => p.Sku).IsUnique();
            e.Property(p => p.UnitPrice).HasColumnType("decimal(18,2)");
            e.Property(p => p.RowVersion).IsRowVersion();
            e.HasOne(p => p.Category).WithMany(c => c.Products).HasForeignKey(p => p.CategoryId);
        });
        ...
    }
}
```
`OnModelCreating` is where you fine-tune things EF Core can't guess automatically:
- `HasIndex(...).IsUnique()` — enforce at the database level that no two products share a SKU
- `HasColumnType("decimal(18,2)")` — store money as an exact decimal, not floating point
  (floating point money is a classic source of rounding bugs)
- `IsRowVersion()` — tells EF Core "this column is the concurrency token, auto-manage it"
- `HasOne(...).WithMany(...).HasForeignKey(...)` — explicitly describes the Product↔Category
  relationship so EF Core generates the correct foreign key constraint

---

### `Dtos/` — the shapes sent over the network

DTO = Data Transfer Object. These are **not** the same as your `Models/` entities — and that
separation is deliberate. Entities describe how data is stored; DTOs describe what's actually
safe/useful to send to or accept from the outside world.

**`ProductDtos.cs`**
```csharp
public record ProductDto(int Id, string Sku, string Name, string? Description, int CategoryId,
    string CategoryName, decimal UnitPrice, int QuantityOnHand, int ReorderThreshold,
    bool IsLowStock, bool IsActive);

public record CreateProductRequest(string Sku, string Name, string? Description, int CategoryId,
    decimal UnitPrice, int QuantityOnHand, int ReorderThreshold);
```
`record` is a C# type built for exactly this — immutable, value-based data holders (two records
with the same values are considered equal). Notice `ProductDto` includes a computed
`IsLowStock` field that doesn't exist as a real column — it's calculated on the way out
(`QuantityOnHand <= ReorderThreshold`), so the frontend never has to duplicate that logic.
`CreateProductRequest` deliberately excludes `Id` (the database assigns it) and `IsActive`
(defaults to true — clients can't create a pre-deactivated product).

**`OrderDtos.cs`**, **`AuthDtos.cs`**, **`CategoryDtos.cs`** follow the same pattern — one record
per "shape of data going in" and "shape of data coming out," kept intentionally separate from
the database entities.

---

### `Services/` — where the actual business logic lives

**`ProductService.cs`** — full walkthrough of the most important methods:

```csharp
public async Task<List<ProductDto>> GetAllAsync(int? categoryId = null, bool? lowStockOnly = null, bool includeInactive = false)
{
    var query = _db.Products.Include(p => p.Category).AsQueryable();

    if (!includeInactive)
        query = query.Where(p => p.IsActive);

    if (categoryId.HasValue)
        query = query.Where(p => p.CategoryId == categoryId.Value);

    var products = await query.OrderBy(p => p.Name).ToListAsync();

    var result = products.Select(ToDto);
    if (lowStockOnly == true)
        result = result.Where(p => p.IsLowStock);

    return result.ToList();
}
```
`.Include(p => p.Category)` — without this, `product.Category` would be `null` even though the
foreign key `CategoryId` is set; EF Core is deliberately lazy and only loads related data you
explicitly ask for (this avoids accidentally loading huge amounts of related data). Filters are
applied progressively by reassigning `query` — none of this hits the database until
`.ToListAsync()` is called; up to that point it's just building a query plan.

```csharp
public async Task<ProductDto> CreateAsync(CreateProductRequest request)
{
    var categoryExists = await _db.Categories.AnyAsync(c => c.Id == request.CategoryId);
    if (!categoryExists)
        throw new InvalidOperationException($"Category {request.CategoryId} does not exist.");

    var product = new Product { Sku = request.Sku, Name = request.Name, ... };
    _db.Products.Add(product);
    await _db.SaveChangesAsync();

    if (request.QuantityOnHand > 0)
    {
        _db.StockMovements.Add(new StockMovement { ProductId = product.Id, Type = StockMovementType.StockIn, ... });
        await _db.SaveChangesAsync();
    }

    return (await GetByIdAsync(product.Id))!;
}
```
Validates the referenced category actually exists before trusting it (never trust client input).
`_db.Products.Add(product)` doesn't touch the database yet — it just tells EF Core's internal
change tracker "this is a new row." `SaveChangesAsync()` is what actually generates and executes
the `INSERT` SQL statement. A second `StockMovement` row is written to log the initial stock as
an audit entry, tied back to this new product's now-known `Id`.

```csharp
public async Task<bool> DeactivateAsync(int id)
{
    var product = await _db.Products.FindAsync(id);
    if (product is null) return false;
    product.IsActive = false;
    product.UpdatedAt = DateTime.UtcNow;
    await _db.SaveChangesAsync();
    return true;
}
```
This is **soft delete** — notice there's no `_db.Products.Remove(...)` anywhere. The row stays in
the database forever; only a flag flips. This preserves order history (an `OrderItem` pointing
to a deleted product would otherwise be a dangling/broken reference) and lets an Admin reverse
the action later via `ReactivateAsync`.

```csharp
public async Task<ProductDto?> AdjustStockAsync(int id, AdjustStockRequest request)
{
    const int maxRetries = 3;
    for (var attempt = 0; attempt < maxRetries; attempt++)
    {
        var product = await _db.Products.FindAsync(id);
        if (product is null) return null;

        var newQuantity = product.QuantityOnHand + request.Quantity;
        if (newQuantity < 0)
            throw new InvalidOperationException("Insufficient stock for this adjustment.");

        product.QuantityOnHand = newQuantity;
        _db.StockMovements.Add(new StockMovement { ... });

        try
        {
            await _db.SaveChangesAsync();
            return await GetByIdAsync(id);
        }
        catch (DbUpdateConcurrencyException)
        {
            foreach (var entry in _db.ChangeTracker.Entries())
                entry.State = EntityState.Detached;
        }
    }
    throw new InvalidOperationException("Could not adjust stock after multiple attempts due to concurrent updates.");
}
```
This is the **optimistic concurrency retry loop**, explained in depth earlier in our
conversation. The short version: read → check → write, and if `SaveChangesAsync()` throws
`DbUpdateConcurrencyException` (meaning the row's `RowVersion` changed since you read it —
someone else modified it in between), detach all tracked entities and loop again with fresh
data, up to 3 attempts.

**`OrderService.cs`** — the most important method, already traced in detail earlier in this
conversation (`CreateAsync` and `DeductStockWithRetryAsync`). The short summary for this
reference sheet: wraps the whole multi-item order creation in a database **transaction**
(all-or-nothing), and deducts stock for each line item using the same optimistic-concurrency
retry pattern as `AdjustStockAsync`.

```csharp
public async Task<OrderDto?> UpdateStatusAsync(int id, UpdateOrderStatusRequest request)
{
    var order = await _db.Orders.Include(o => o.Items).ThenInclude(i => i.Product)
        .FirstOrDefaultAsync(o => o.Id == id);
    if (order is null) return null;

    if (!OrderStatusMachine.CanTransition(order.Status, request.Status))
        throw new InvalidOperationException($"Cannot transition order from '{order.Status}' to '{request.Status}'.");

    if (request.Status == OrderStatus.Cancelled)
    {
        foreach (var item in order.Items)
        {
            var product = await _db.Products.FindAsync(item.ProductId);
            if (product is not null)
            {
                product.QuantityOnHand += item.Quantity;
                _db.StockMovements.Add(new StockMovement { ... Type = StockMovementType.StockIn, ... });
            }
        }
    }

    order.Status = request.Status;
    await _db.SaveChangesAsync();
    return ToDto(order);
}
```
`.Include(o => o.Items).ThenInclude(i => i.Product)` — a two-level eager load: get the order,
its line items, AND each item's product (needed to show product names in the response).
`OrderStatusMachine.CanTransition` gate-keeps the status change. If cancelling, every item's
quantity is added back to its product's stock — this is the "restock on cancel" behavior.

**`CategoryService.cs`**
```csharp
public async Task<CategoryDto> CreateAsync(CreateCategoryRequest request)
{
    var name = request.Name.Trim();
    if (string.IsNullOrEmpty(name))
        throw new InvalidOperationException("Category name is required.");

    var existing = await _db.Categories.FirstOrDefaultAsync(c => c.Name == name);
    if (existing is not null)
        return new CategoryDto(existing.Id, existing.Name);

    var category = new Category { Name = name };
    _db.Categories.Add(category);
    await _db.SaveChangesAsync();
    return new CategoryDto(category.Id, category.Name);
}
```
Notice: if the category already exists, it returns the existing one instead of erroring or
duplicating — this makes the "+ New category" button in the frontend safe to spam-click without
creating duplicate "Hardware" categories.

**`TokenService.cs`**
```csharp
public (string Token, DateTime ExpiresAt) GenerateToken(User user)
{
    var key = jwtSection["Key"] ?? throw new InvalidOperationException(...);
    var expiresAt = DateTime.UtcNow.AddMinutes(expiryMinutes);

    var claims = new[]
    {
        new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
        new Claim(ClaimTypes.Name, user.Username),
        new Claim(ClaimTypes.Role, user.Role.ToString()),
    };

    var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
    var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);
    var token = new JwtSecurityToken(issuer: jwtIssuer, audience: jwtAudience, claims: claims,
        expires: expiresAt, signingCredentials: credentials);

    return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
}
```
Builds a JWT (JSON Web Token) containing three "claims" — who the user is (`Id`, `Username`) and
what role they have. `SigningCredentials` with `HmacSha256` means the token is cryptographically
signed with your secret key — anyone can *read* the claims inside a JWT (it's just base64, not
encrypted), but nobody can *forge or alter* one without knowing the signing key, because the
signature wouldn't match. This is what `[Authorize(Roles = "Admin")]` checks against later.

---

### `Controllers/` — the HTTP layer

Controllers are intentionally thin — their job is to: receive the HTTP request, call the
right service method, and translate the result (or exception) into the right HTTP response.
They should never contain business logic themselves.

**`ProductsController.cs`**
```csharp
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProductsController : ControllerBase
{
```
`[Route("api/[controller]")]` — `[controller]` is replaced with the class name minus
"Controller", so this becomes `api/Products`. `[Authorize]` at the class level means every
action requires a valid JWT *unless* overridden by `[AllowAnonymous]` on a specific action.

```csharp
[HttpGet]
[AllowAnonymous]
public async Task<ActionResult<List<ProductDto>>> GetAll(
    [FromQuery] int? categoryId, [FromQuery] bool? lowStockOnly, [FromQuery] bool includeInactive = false)
{
    if (includeInactive && !User.IsInRole("Admin"))
        includeInactive = false;
    return Ok(await _service.GetAllAsync(categoryId, lowStockOnly, includeInactive));
}
```
`[AllowAnonymous]` overrides the class-level `[Authorize]` — this specific endpoint is public
(powers guest mode). `[FromQuery]` means these come from URL query params like
`?categoryId=2&lowStockOnly=true`. Note the server-side guard: even if a guest crafts a URL with
`includeInactive=true` manually, the server silently ignores it unless they're actually an Admin
— this is enforcing authorization on the server, not trusting the client.

```csharp
[HttpDelete("{id:int}")]
[Authorize(Roles = "Admin")]
public async Task<IActionResult> Deactivate(int id)
    => await _service.DeactivateAsync(id) ? NoContent() : NotFound();
```
`{id:int}` is a route constraint — only matches if the URL segment is actually an integer.
`[Authorize(Roles = "Admin")]` narrows this specific action to Admins only, overriding the
class-level plain `[Authorize]`. Returns HTTP 204 No Content on success, 404 if the product
doesn't exist.

**`OrdersController.cs`**
```csharp
[HttpPatch("{id:int}/status")]
public async Task<ActionResult<OrderDto>> UpdateStatus(int id, UpdateOrderStatusRequest request)
{
    if (request.Status == OrderStatus.Cancelled && !User.IsInRole("Admin"))
        return Forbid();

    try
    {
        var order = await _service.UpdateStatusAsync(id, request);
        return order is null ? NotFound() : Ok(order);
    }
    catch (InvalidOperationException ex)
    {
        return Conflict(new { message = ex.Message });
    }
}
```
`PATCH` (not `PUT`) because we're partially updating just the status, not replacing the whole
order. The role check for cancellation happens right in the controller (a business *authorization*
rule, distinct from the service's business *logic* rule about valid state transitions).
`InvalidOperationException` from the service (e.g. "can't transition Pending→Shipped") becomes
an HTTP 409 Conflict — a semantically correct status code for "your request conflicts with the
current state of the resource."

**`AuthController.cs`** — traced in full detail earlier in this conversation (the login flow).

**`CategoriesController.cs`** — same pattern as the others: public `GET`, authenticated `POST`.

---

## BACKEND TESTS

**`TestHelpers.cs`**
```csharp
public static AppDbContext CreateInMemoryDb(string? dbName = null)
{
    var options = new DbContextOptionsBuilder<AppDbContext>()
        .UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString())
        .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
        .Options;
    return new AppDbContext(options);
}
```
Every test gets its own **fresh, isolated** in-memory database (a random GUID as the "database
name" ensures no two tests can accidentally see each other's data, even running in parallel).
The `ConfigureWarnings` line silences a benign warning: the in-memory provider doesn't support
real SQL transactions, so it logs a warning whenever `OrderService` tries to start one — this
line says "we know, that's expected in tests, don't fail the test over it."

**Example test, annotated** (`OrderServiceTests.cs`):
```csharp
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
```
`[Fact]` marks this as an xUnit test method (no parameters, runs once). The test: seeds a
product with only 2 in stock, tries to order 5 (more than available), asserts that this throws.
Critically, it *also* re-fetches the product afterward and asserts the stock is still exactly 2
— proving the transaction rollback actually worked and nothing was partially deducted. This is
testing a specific failure mode, not just the happy path.

`[Theory]` + `[InlineData(...)]` (seen in the state machine tests) runs the same test method
multiple times with different input values — used to cover every legal/illegal status
transition combination in one compact block instead of one `[Fact]` per case.

---

## FRONTEND

### `api/client.ts` — the shared HTTP client

```ts
export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (raw) {
    const auth = JSON.parse(raw);
    if (auth.token) config.headers.Authorization = `Bearer ${auth.token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);
```
One shared axios instance, used by every `api/*.ts` file, so the base URL and auth logic is
defined exactly once. The **request interceptor** runs before every outgoing call, silently
attaching the JWT if one is stored — this is why individual API functions (`getProducts()`,
`createOrder()`, etc.) never manually add auth headers themselves. The **response interceptor**
runs after every response; if the server ever says 401 Unauthorized (expired/invalid token), it
clears the stored session and force-redirects to `/login` — a global "you got logged out"
handler in one place, rather than repeated in every component.

### `api/products.ts`, `api/orders.ts`, `api/auth.ts`, `api/categories.ts`

Each is a thin wrapper: one function per backend endpoint, typed with the shared TypeScript
interfaces from `types/index.ts`. Example:
```ts
export async function getProducts(params?: { categoryId?: number; lowStockOnly?: boolean; includeInactive?: boolean }): Promise<Product[]> {
  const { data } = await apiClient.get<Product[]>('/api/products', { params });
  return data;
}
```
`apiClient.get<Product[]>(...)` tells TypeScript "the JSON response will match the `Product[]`
shape" — this is what gives you autocomplete and compile-time errors if you misuse the result
elsewhere in the app, even though the actual data is just JSON at runtime (TypeScript types are
erased before the code ever runs — they're a compile-time-only safety net).

### `auth/AuthContext.tsx` — global auth state

```tsx
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());

  useEffect(() => {
    if (user) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(AUTH_STORAGE_KEY);
  }, [user]);

  async function login(username: string, password: string) {
    const authUser = await loginRequest(username, password);
    setUser(authUser);
  }

  function logout() { setUser(null); }

  const value = { user, isAuthenticated: user !== null, isAdmin: user?.role === 'Admin', login, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
```
This is React's **Context API** — a way to share state (here, "who's logged in") across the
whole component tree without manually passing it down through every component's props ("prop
drilling"). `AuthProvider` wraps the whole app once in `main.tsx`; any component anywhere can
call `useAuth()` and get the current user, `isAdmin` flag, and `login`/`logout` functions. The
`useEffect` automatically persists to `localStorage` whenever `user` changes — so logging in
survives a page refresh. The `readStoredUser()` initializer (not shown in full above) also
checks the token's `expiresAt` and clears it if already expired.

### `auth/ProtectedRoute.tsx`
```tsx
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}
```
A **wrapper component** — anything passed as `children` only renders if the user is
authenticated; otherwise it redirects to `/login`, remembering where they were trying to go
(`state={{ from: location }}`) so `LoginPage` can send them back after a successful login.

### `auth/RootIndex.tsx`
```tsx
export default function RootIndex() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? '/dashboard' : '/products'} replace />;
}
```
Handles the `/` route: authenticated users land on the Dashboard, guests land on the public
Products page — this is what makes guest mode "just work" without a login wall on first visit.

### `App.tsx` — route definitions
```tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/" element={<Layout />}>
    <Route index element={<RootIndex />} />
    <Route path="products" element={<ProductsPage />} />
    <Route path="dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
    <Route path="orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
  </Route>
</Routes>
```
Nested routes: `Layout` (the header/nav/footer shell) wraps every page except `/login`, and
renders whichever child route matched via its `<Outlet />`. Notice `products` has **no**
`ProtectedRoute` wrapper (public), while `dashboard` and `orders` do (require login) — this is
the routing-level half of guest mode; the other half is each page component individually
checking `isAuthenticated` to hide action buttons.

### `components/Layout.tsx`
```tsx
{isAuthenticated ? (
  <div className="user-info">
    <span className="user-badge">{user?.username} · {user?.role}</span>
    <button className="btn small" onClick={handleLogout}>Log out</button>
  </div>
) : (
  <div className="user-info">
    <span className="user-badge">Guest (view only)</span>
    <Link className="btn small primary" to="/login">Sign in</Link>
  </div>
)}
```
Conditional rendering based on auth state — the whole top-right corner of the nav bar switches
between "logged in" and "guest" presentation from the same component, driven entirely by
`useAuth()`.

### `pages/ProductsPage.tsx` — the most feature-dense page

```tsx
async function refresh() {
  setLoading(true);
  try {
    const [productList, categoryList] = await Promise.all([
      getProducts({ includeInactive: isAdmin && showInactive }),
      getCategories(),
    ]);
    setProducts(productList);
    setCategories(categoryList);
    ...
  } catch { setError('Could not reach the API. Is the backend running?'); }
  finally { setLoading(false); }
}
```
`Promise.all([...])` fires both API calls **concurrently** rather than one after another — since
neither depends on the other's result, this roughly halves the wait time versus awaiting them
sequentially. `includeInactive: isAdmin && showInactive` — only ever requests inactive products
if both conditions are true, a client-side mirror of the server-side check (defense in depth,
though the server is the one that actually enforces it).

```tsx
{isAuthenticated ? (
  p.isActive ? (
    <>
      <button className="btn small" onClick={() => handleAdjust(p, 10)}>+10</button>
      <button className="btn small" onClick={() => handleAdjust(p, -1)}>-1</button>
      {isAdmin && <button className="btn small danger" onClick={() => handleDeactivate(p)}>Deactivate</button>}
    </>
  ) : (
    isAdmin && <button className="btn small" onClick={() => handleReactivate(p)}>Reactivate</button>
  )
) : (
  <span className="minisub">—</span>
)}
```
Nested conditional rendering: guests see a dash, authenticated users see stock-adjust buttons
(and Admins additionally see Deactivate), inactive products (only visible to Admins with the
toggle on) show Reactivate instead. This is UI-layer role enforcement — remember, it's *only*
a convenience; the real enforcement is the `[Authorize(Roles = "Admin")]` on the backend.

### `pages/OrdersPage.tsx` — multi-item order form + search

```tsx
const [lines, setLines] = useState<DraftLine[]>([{ productId: '', quantity: 1 }]);

function addLine() {
  setLines((prev) => [...prev, { productId: '', quantity: 1 }]);
}
function removeLine(index: number) {
  setLines((prev) => prev.filter((_, i) => i !== index));
}
function updateLine(index: number, patch: Partial<DraftLine>) {
  setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
}
```
`lines` is an array of draft order rows, starting with one empty row. All three update functions
follow React's core rule: **never mutate state directly** — always create a new array
(`[...prev, ...]`, `.filter(...)`, `.map(...)`) so React can detect the change and re-render.
`updateLine` uses a spread (`{ ...line, ...patch }`) to merge a partial change into just the one
line being edited, leaving the others untouched.

```tsx
useEffect(() => {
  const handle = setTimeout(() => setSearch(searchInput.trim()), 350);
  return () => clearTimeout(handle);
}, [searchInput]);
```
This is a **debounce** — instead of firing an API search request on every single keystroke, it
waits 350ms after the user stops typing. The cleanup function (`return () => clearTimeout(...)`)
cancels the pending timeout if `searchInput` changes again before it fires — so only the *last*
keystroke in a burst actually triggers a search.

### `pages/LoginPage.tsx`
```tsx
const from = (location.state as { from?: Location })?.from?.pathname ?? '/';

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  try {
    await login(username, password);
    navigate(from, { replace: true });
  } catch {
    setError('Invalid username or password.');
  }
}
```
Reads back the `from` location that `ProtectedRoute` stashed earlier (or defaults to `/`), so
after a successful login the user lands back where they were trying to go, not always the
homepage. `navigate(from, { replace: true })` — `replace` means this doesn't add a new browser
history entry, so clicking "back" after login doesn't return to the login page itself.

### `index.css` — theming approach
```css
:root {
  --color-bg: #f7f8fa;
  --color-text: #1a1d23;
  ...
}
@media (prefers-color-scheme: dark) {
  :root { --color-bg: #0f1115; --color-text: #e6e8eb; ... }
}
```
CSS custom properties (variables) defined once, referenced everywhere (`background: var(--color-bg)`).
The `@media (prefers-color-scheme: dark)` block *redefines* the same variable names with dark
values — every component automatically respects the user's OS theme preference without any
JavaScript or per-component dark-mode logic.

---

## Quick reference: patterns worth being able to explain in an interview

- **Dependency Injection** (`Program.cs` service registration) — objects declare what they need
  in their constructor; the framework provides it.
- **Optimistic concurrency** (`RowVersion` + retry loop) — assume conflicts are rare, detect them
  after the fact, retry instead of locking.
- **Database transactions** (`BeginTransactionAsync`/`CommitAsync`/`RollbackAsync`) — all-or-
  nothing multi-step writes.
- **State machine** (`OrderStatusMachine`) — encode valid transitions as data, not scattered
  if-statements.
- **Soft delete** (`IsActive` flag) — preserve history, hide instead of destroy.
- **DTOs vs entities** — never expose your database shape directly over the network.
- **JWT auth** — stateless, signed tokens carrying identity + role claims.
- **React Context** (`AuthContext`) — share state across the tree without prop drilling.
- **Debouncing** (search box) — delay expensive work until input settles.

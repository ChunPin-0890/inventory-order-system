using System.Text;
using System.Text.Json.Serialization;
using InventoryOrderSystem.Api.Data;
using InventoryOrderSystem.Api.Models;
using InventoryOrderSystem.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        // Serialize enums (e.g. OrderStatus) as strings like "Pending" instead of numbers like 0,
        // so the frontend TypeScript types line up with what the API actually sends.
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        // No SQL Server configured (e.g. local dev without a DB) — fall back to an in-memory store.
        // The in-memory provider doesn't support real transactions, so that warning is suppressed here;
        // production always runs against SQL Server, where OrderService's transactions are fully honored.
        options.UseInMemoryDatabase("InventoryOrderSystemDb")
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning));
    }
    else
    {
        options.UseSqlServer(connectionString);
    }
});

builder.Services.AddScoped<IProductService, ProductService>();
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddScoped<ICategoryService, CategoryService>();
builder.Services.AddScoped<ITokenService, TokenService>();

// --- JWT authentication ---
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt:Key must be configured (see appsettings.json / user-secrets / env vars).");
var jwtIssuer = builder.Configuration["Jwt:Issuer"];
var jwtAudience = builder.Configuration["Jwt:Audience"];

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtIssuer,
        ValidAudience = jwtAudience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
    };
});
builder.Services.AddAuthorization();

const string frontendCorsPolicy = "FrontendCorsPolicy";
builder.Services.AddCors(options =>
{
    options.AddPolicy(frontendCorsPolicy, policy =>
    {
        if (builder.Environment.IsDevelopment())
        {
            // In dev, Vite's port can shift (autoPort), so allow any localhost origin.
            policy.SetIsOriginAllowed(origin => Uri.TryCreate(origin, UriKind.Absolute, out var uri)
                    && uri.Host is "localhost" or "127.0.0.1")
                .AllowAnyHeader().AllowAnyMethod();
        }
        else
        {
            var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                ?? Array.Empty<string>();
            policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
        }
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline.
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

app.UseHttpsRedirection();
app.UseCors(frontendCorsPolicy);
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

app.Run();

// Expose Program for WebApplicationFactory in integration tests.
public partial class Program { }

/// <summary>
/// Seeds two demo accounts on startup so the portfolio demo has ready-to-use logins
/// without needing a self-registration flow.
/// </summary>
public static class SeedData
{
    public static void SeedDemoUsers(AppDbContext db)
    {
        if (db.Users.Any()) return;

        var hasher = new PasswordHasher<User>();

        var admin = new User { Username = "admin", Role = UserRole.Admin };
        admin.PasswordHash = hasher.HashPassword(admin, "Admin123!");

        var staff = new User { Username = "staff", Role = UserRole.Staff };
        staff.PasswordHash = hasher.HashPassword(staff, "Staff123!");

        db.Users.AddRange(admin, staff);
        db.SaveChanges();
    }

    public static void SeedDefaultCategories(AppDbContext db)
    {
        if (db.Categories.Any()) return;

        db.Categories.AddRange(
            new Category { Name = "Hardware" },
            new Category { Name = "Electronics" },
            new Category { Name = "Office Supplies" },
            new Category { Name = "Packaging" });
        db.SaveChanges();
    }
}

using InventoryOrderSystem.Api.Models;
using InventoryOrderSystem.Api.Services;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace InventoryOrderSystem.Tests.Services;

public class TokenServiceTests
{
    private static ITokenService CreateService()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = "unit-test-secret-key-at-least-32-characters-long",
                ["Jwt:Issuer"] = "TestIssuer",
                ["Jwt:Audience"] = "TestAudience",
                ["Jwt:ExpiryMinutes"] = "60",
            })
            .Build();

        return new TokenService(config);
    }

    [Fact]
    public void GenerateToken_ProducesNonEmptyTokenWithFutureExpiry()
    {
        var service = CreateService();
        var user = new User { Id = 1, Username = "admin", Role = UserRole.Admin };

        var (token, expiresAt) = service.GenerateToken(user);

        Assert.False(string.IsNullOrWhiteSpace(token));
        Assert.True(expiresAt > DateTime.UtcNow);
    }

    [Fact]
    public void GenerateToken_EncodesUsernameAndRoleClaims()
    {
        var service = CreateService();
        var user = new User { Id = 2, Username = "staff", Role = UserRole.Staff };

        var (token, _) = service.GenerateToken(user);
        var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        Assert.Contains(jwt.Claims, c => c.Type == System.Security.Claims.ClaimTypes.Name && c.Value == "staff");
        Assert.Contains(jwt.Claims, c => c.Type == System.Security.Claims.ClaimTypes.Role && c.Value == "Staff");
    }
}

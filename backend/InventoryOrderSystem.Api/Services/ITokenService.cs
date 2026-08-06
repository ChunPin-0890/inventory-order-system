using InventoryOrderSystem.Api.Models;

namespace InventoryOrderSystem.Api.Services;

public interface ITokenService
{
    (string Token, DateTime ExpiresAt) GenerateToken(User user);
}

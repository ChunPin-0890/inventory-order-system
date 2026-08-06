using InventoryOrderSystem.Api.Models;

namespace InventoryOrderSystem.Api.Dtos;

public record LoginRequest(string Username, string Password);

public record LoginResponse(string Token, string Username, UserRole Role, DateTime ExpiresAt);

using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using InventoryOrderSystem.Api.Dtos;

namespace InventoryOrderSystem.Api.Services;

/// <summary>
/// Generates product marketing descriptions via Groq's Chat Completions API — a free, no-card,
/// OpenAI-compatible LLM API (runs open models like Llama at very high inference speed).
/// Configuration lives under "Groq": ApiKey, Model (see appsettings.json / user-secrets /
/// Azure App Service settings — never commit a real key).
/// </summary>
public class ProductDescriptionService : IProductDescriptionService
{
    private const string Endpoint = "https://api.groq.com/openai/v1/chat/completions";

    private readonly HttpClient _httpClient;
    private readonly IConfiguration _config;

    public ProductDescriptionService(HttpClient httpClient, IConfiguration config)
    {
        _httpClient = httpClient;
        _config = config;
    }

    public async Task<GenerateDescriptionResponse> GenerateAsync(GenerateDescriptionRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.ProductName))
            throw new InvalidOperationException("Product name is required to generate a description.");

        var section = _config.GetSection("Groq");
        var apiKey = section["ApiKey"];
        var model = section["Model"] ?? "llama-3.3-70b-versatile";

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException(
                "Groq is not configured. Set Groq:ApiKey (a free key from console.groq.com/keys, " +
                "no credit card needed) via user-secrets locally or App Service settings in production.");
        }

        var prompt = $"Write a concise, appealing e-commerce product description (2-3 sentences, no headings) " +
            $"for a product named \"{request.ProductName}\" in the category \"{request.CategoryName}\"." +
            (string.IsNullOrWhiteSpace(request.Keywords) ? "" : $" Emphasize these details: {request.Keywords}.");

        var payload = new
        {
            model,
            messages = new object[]
            {
                new { role = "system", content = "You are a helpful assistant that writes short, professional product descriptions for an inventory management system." },
                new { role = "user", content = prompt },
            },
            max_tokens = 150,
            temperature = 0.7,
        };

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, Endpoint)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json"),
        };
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        using var response = await _httpClient.SendAsync(httpRequest, ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Groq request failed ({(int)response.StatusCode}): {body}");
        }

        using var doc = JsonDocument.Parse(body);
        var description = doc.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString()
            ?? throw new InvalidOperationException("Groq returned an empty response.");

        return new GenerateDescriptionResponse(description.Trim());
    }
}

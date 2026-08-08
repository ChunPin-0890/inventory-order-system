import { apiClient } from './client';

export interface GenerateDescriptionRequest {
  productName: string;
  categoryName: string;
  keywords?: string;
}

export async function generateProductDescription(
  request: GenerateDescriptionRequest,
): Promise<string> {
  const { data } = await apiClient.post<{ description: string }>(
    '/api/ai/generate-description',
    request,
  );
  return data.description;
}

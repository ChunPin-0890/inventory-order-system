import { apiClient } from './client';
import type { AuthUser, UserRole } from '../types';

interface LoginResponse {
  token: string;
  username: string;
  role: UserRole;
  expiresAt: string;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const { data } = await apiClient.post<LoginResponse>('/api/auth/login', { username, password });
  return { token: data.token, username: data.username, role: data.role, expiresAt: data.expiresAt };
}

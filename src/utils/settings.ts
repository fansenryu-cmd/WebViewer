/**
 * 설정 저장 — localStorage 기반
 */

const GEMINI_API_KEY = 'novelforge_gemini_api_key';

export function getGeminiApiKey(): string | null {
  return localStorage.getItem(GEMINI_API_KEY);
}

export function setGeminiApiKey(key: string): void {
  if (key.trim()) {
    localStorage.setItem(GEMINI_API_KEY, key.trim());
  } else {
    localStorage.removeItem(GEMINI_API_KEY);
  }
}

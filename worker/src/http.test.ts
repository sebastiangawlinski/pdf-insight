import { describe, expect, it } from 'vitest';
import { corsHeaders, parseAllowedOrigins } from './http';
import worker from './index';
import type { Env } from './config';

const env: Env = {
  LLM_API_KEY: 'k',
  LLM_BASE_URL: 'https://llm.example/v1',
  LLM_MODEL: 'm',
  ALLOWED_ORIGINS: 'https://sebastiangawlinski.github.io/',
};

function call(request: Request): Promise<Response> {
  return worker.fetch(request, env);
}

describe('CORS', () => {
  it('parsuje listę originów i usuwa końcowy ukośnik', () => {
    expect(parseAllowedOrigins(' https://a.io/, http://localhost:5173 ')).toEqual([
      'https://a.io',
      'http://localhost:5173',
    ]);
  });

  it('nie ustawia Access-Control-Allow-Origin dla obcej domeny', () => {
    const headers = corsHeaders('https://evil.example', ['https://a.io']);
    expect(headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('odrzuca POST z niedozwolonej domeny (403)', async () => {
    const response = await call(
      new Request('https://api.example/analyze', {
        method: 'POST',
        headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
    expect(response.status).toBe(403);
  });

  it('odpowiada na preflight z dozwolonej domeny', async () => {
    const response = await call(
      new Request('https://api.example/analyze', {
        method: 'OPTIONS',
        headers: { Origin: 'https://sebastiangawlinski.github.io' },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://sebastiangawlinski.github.io',
    );
  });

  it('waliduje ciało żądania (400)', async () => {
    const response = await call(
      new Request('https://api.example/analyze', {
        method: 'POST',
        headers: {
          Origin: 'https://sebastiangawlinski.github.io',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileName: 'a.pdf', pages: 0, text: '' }),
      }),
    );
    expect(response.status).toBe(400);
  });
});

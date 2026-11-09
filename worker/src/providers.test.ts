import { describe, expect, it, vi } from 'vitest';
import type { Env } from './config';
import { ApiError } from './http';
import {
  buildProviders,
  completeWithFallback,
  estimateTokens,
  extractWorkersAiText,
  ProviderError,
  workersAiProvider,
  type ChatMessage,
  type Provider,
} from './providers';

const messages: ChatMessage[] = [{ role: 'user', content: 'Krótki dokument.' }];

function fakeProvider(
  name: string,
  behaviour: string | ProviderError,
  maxInputTokens: number | null = null,
) {
  const complete = vi.fn(() =>
    typeof behaviour === 'string' ? Promise.resolve(behaviour) : Promise.reject(behaviour),
  );
  const provider: Provider = { name, model: `${name}-model`, maxInputTokens, complete };
  return { provider, complete };
}

function fakeAi(run: (model: string, inputs: unknown) => Promise<unknown>): Ai {
  return { run } as unknown as Ai;
}

describe('completeWithFallback', () => {
  it('używa pierwszego dostawcy, jeśli odpowiada', async () => {
    const a = fakeProvider('A', '{"ok":1}');
    const b = fakeProvider('B', '{"ok":2}');
    const result = await completeWithFallback([a.provider, b.provider], messages);
    expect(result).toMatchObject({ text: '{"ok":1}', index: 0 });
    expect(b.complete).not.toHaveBeenCalled();
  });

  it('przy wyczerpanym limicie przechodzi do następnego dostawcy', async () => {
    const a = fakeProvider('A', new ProviderError('rate_limit', 'limit'));
    const b = fakeProvider('B', '{"ok":2}');
    const result = await completeWithFallback([a.provider, b.provider], messages);
    expect(result).toMatchObject({ text: '{"ok":2}', index: 1 });
  });

  it('pomija dostawcę, dla którego dokument jest za duży (bez wysyłania zapytania)', async () => {
    const big: ChatMessage[] = [{ role: 'user', content: 'x'.repeat(30_000) }];
    const a = fakeProvider('A', '{"small":1}', 4_500);
    const b = fakeProvider('B', '{"big":1}');
    const result = await completeWithFallback([a.provider, b.provider], big);
    expect(a.complete).not.toHaveBeenCalled();
    expect(result.index).toBe(1);
  });

  it('ponowna próba zaczyna od wskazanego dostawcy', async () => {
    const a = fakeProvider('A', '{"a":1}');
    const b = fakeProvider('B', '{"b":1}');
    const result = await completeWithFallback([a.provider, b.provider], messages, 1);
    expect(result.text).toBe('{"b":1}');
    expect(a.complete).not.toHaveBeenCalled();
  });

  it('gdy wszyscy wyczerpali limit — czytelny błąd 429', async () => {
    const a = fakeProvider('A', new ProviderError('rate_limit', 'limit'));
    const b = fakeProvider('B', new ProviderError('unavailable', 'down'));
    await expect(completeWithFallback([a.provider, b.provider], messages)).rejects.toMatchObject({
      status: 429,
    });
  });

  it('bez skonfigurowanych dostawców — błąd konfiguracji', async () => {
    await expect(completeWithFallback([], messages)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('workersAiProvider', () => {
  it('zwraca tekst odpowiedzi', async () => {
    const provider = workersAiProvider(
      fakeAi(() => Promise.resolve({ response: '{"a":1}' })),
      'm',
    );
    await expect(provider.complete(messages)).resolves.toBe('{"a":1}');
  });

  it('wyczerpany dzienny limit (3036) zamienia na rate_limit', async () => {
    const provider = workersAiProvider(
      fakeAi(() => Promise.reject(new Error('3036: Account limited: daily free allocation'))),
      'm',
    );
    await expect(provider.complete(messages)).rejects.toMatchObject({ failure: 'rate_limit' });
  });

  it('inne błędy zamienia na unavailable', async () => {
    const provider = workersAiProvider(
      fakeAi(() => Promise.reject(new Error('boom'))),
      'm',
    );
    await expect(provider.complete(messages)).rejects.toMatchObject({ failure: 'unavailable' });
  });
});

describe('extractWorkersAiText', () => {
  it('obsługuje różne formaty odpowiedzi', () => {
    expect(extractWorkersAiText({ response: 'tekst' })).toBe('tekst');
    expect(extractWorkersAiText({ response: { a: 1 } })).toBe('{"a":1}');
    expect(extractWorkersAiText({ choices: [{ message: { content: 'c' } }] })).toBe('c');
    expect(extractWorkersAiText(null)).toBe('');
  });
});

describe('buildProviders', () => {
  it('kolejność: Workers AI, potem modele Groq z konfiguracji', () => {
    const env: Env = {
      AI: fakeAi(() => Promise.resolve({})),
      WORKERS_AI_MODEL: '@cf/test',
      LLM_API_KEY: 'k',
      LLM_BASE_URL: 'https://api.groq.com/openai/v1',
      LLM_MODELS: 'openai/gpt-oss-120b, openai/gpt-oss-20b',
      ALLOWED_ORIGINS: '',
    };
    expect(buildProviders(env).map((p) => `${p.name}:${p.model}`)).toEqual([
      'Workers AI:@cf/test',
      'Groq:openai/gpt-oss-120b',
      'Groq:openai/gpt-oss-20b',
    ]);
  });

  it('bez klucza Groq zostaje sam Workers AI', () => {
    const env: Env = { AI: fakeAi(() => Promise.resolve({})), ALLOWED_ORIGINS: '' };
    expect(buildProviders(env)).toHaveLength(1);
  });
});

describe('estimateTokens', () => {
  it('szacuje ok. 3 znaki na token', () => {
    expect(estimateTokens([{ role: 'user', content: 'x'.repeat(300) }])).toBe(100);
  });
});

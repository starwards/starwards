import { BrainRequest } from './request';

/** A choice answer as the snap-judgment endpoint returns it. */
type JevChoiceAnswer = {
    type: 'choice';
    choice: string;
    confidence: number;
    probabilities: Record<string, number>;
};

export type JevResponse = {
    model: string;
    answers: Record<string, JevChoiceAnswer>;
    inputTokens: number;
    latencyMs: number;
};

export type JevClient = { ask(request: BrainRequest, model: string): Promise<JevResponse> };

/** The request exactly as it goes on the wire: what Jev reads, and so what an answer is cached under. */
export function jevBody(request: BrainRequest, model: string) {
    return JSON.stringify({ model, state: request.state, questions: request.questions });
}

type JevClientOptions = {
    apiKey?: string;
    baseUrl?: string;
    /** Requests this process may send per minute; the account limit is shared by every worker. */
    requestsPerMinute?: number;
    maxRetries?: number;
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
};

const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529]);

/**
 * Talks to TypeSafe's System One endpoint (`POST /v1/systemone`) with plain `fetch`, so neither
 * repo carries an SDK. The key is read from `TYPESAFE_API_KEY` and never logged. Rate limits and
 * overload answers are retried with backoff, honouring `retry-after`. Refuses to reach the network
 * when `CI` is set.
 */
export function jevClient(options: JevClientOptions = {}): JevClient {
    const apiKey = options.apiKey ?? process.env.TYPESAFE_API_KEY;
    if (!apiKey) {
        throw new Error(
            'TYPESAFE_API_KEY is not set: a Jev brain cannot run without it. Set it in the environment, not in a file.',
        );
    }
    if (process.env.CI && !options.fetchImpl) {
        throw new Error('CI is set: a Jev brain must not spend money in CI. Use reference or idle crews there.');
    }
    const baseUrl = options.baseUrl ?? process.env.TYPESAFE_BASE_URL ?? 'https://api.typesafe.ai';
    const doFetch = options.fetchImpl ?? fetch;
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const spacingMs = 60_000 / (options.requestsPerMinute ?? 300);
    const maxRetries = options.maxRetries ?? 4;
    let nextSlot = 0;

    async function slot() {
        const now = Date.now();
        const at = Math.max(now, nextSlot);
        nextSlot = at + spacingMs;
        if (at > now) {
            await sleep(at - now);
        }
    }

    return {
        async ask(request, model) {
            const body = jevBody(request, model);
            for (let attempt = 0; ; attempt++) {
                await slot();
                const started = Date.now();
                const response = await doFetch(`${baseUrl}/v1/systemone`, {
                    method: 'POST',
                    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
                    body,
                });
                if (response.ok) {
                    const parsed = (await response.json()) as {
                        model: string;
                        answers: Record<string, JevChoiceAnswer>;
                        usage?: { input_tokens?: number };
                    };
                    return {
                        model: parsed.model,
                        answers: parsed.answers,
                        inputTokens: parsed.usage?.input_tokens ?? 0,
                        latencyMs: Date.now() - started,
                    };
                }
                if (!RETRY_STATUSES.has(response.status) || attempt >= maxRetries) {
                    throw new Error(`Jev answered ${response.status}: ${(await response.text()).slice(0, 500)}`);
                }
                const retryAfter = Number(response.headers.get('retry-after'));
                await sleep(
                    Number.isFinite(retryAfter) && retryAfter > 0
                        ? retryAfter * 1000
                        : Math.min(8000, 500 * 2 ** attempt),
                );
            }
        },
    };
}

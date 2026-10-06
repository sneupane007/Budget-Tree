// This module must only be imported in server contexts (API routes, Server Components).
import { Redis } from "@upstash/redis"

// Provisioned via the Vercel Marketplace (Upstash for Redis), which injects
// KV_REST_API_URL/TOKEN — or, if a second store is ever connected to this
// project, the VERCEL_ENV_-prefixed variants to avoid a name collision.
const redis = new Redis({
  url: (process.env.KV_REST_API_URL ?? process.env.VERCEL_ENV_KV_REST_API_URL)!,
  token: (process.env.KV_REST_API_TOKEN ?? process.env.VERCEL_ENV_KV_REST_API_TOKEN)!,
})

export function cacheKey(orgId: string, ...parts: string[]) {
  return `org:${orgId}:${parts.join(":")}`
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  return redis.get<T>(key)
}

export async function cacheSet<T>(key: string, value: T, ttl: number) {
  await redis.set(key, value, { ex: ttl })
}

export async function cacheInvalidate(...keys: string[]) {
  if (keys.length) await redis.del(...keys)
}

export async function cacheInvalidatePattern(pattern: string) {
  let cursor = 0
  do {
    const [next, keys] = await redis.scan(cursor, { match: pattern, count: 100 })
    cursor = Number(next)
    if (keys.length) await redis.del(...keys)
  } while (cursor !== 0)
}

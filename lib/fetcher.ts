export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? "Request failed")
  return json.data as T
}

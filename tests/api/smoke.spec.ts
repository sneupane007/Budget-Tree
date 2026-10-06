import { test, expect, data, createProject, flushCache, cacheKeys } from "../fixtures"

test.describe("infra smoke", () => {
  test("seeded admin has a session with role + org", async ({ as }) => {
    const api = await as("admin")
    const session = await (await api.get("/api/auth/session")).json()
    expect(session.user.role).toBe("ADMIN")
    expect(session.user.organizationId).toBeTruthy()
  })

  test("project create → fake redis is used by cached GET", async ({ as }) => {
    await flushCache()
    const api = await as("admin")
    await createProject(api)
    await data(await api.get("/api/projects"))
    expect((await cacheKeys()).some((k) => k.includes(":projects"))).toBe(true)
  })
})

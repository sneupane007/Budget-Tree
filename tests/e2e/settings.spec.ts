import { test, expect, data, uniq } from "../fixtures"
import { authFile, PASSWORD } from "../helpers/env"
import type { Page } from "@playwright/test"

test.setTimeout(90_000)

const row = (page: Page, text: string) => page.getByRole("row").filter({ hasText: text })

async function openInvite(page: Page) {
  await page.getByRole("button", { name: "Invite Member" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
}

async function fillInvite(page: Page, o: { name?: string; email?: string; role?: string; password?: string }) {
  const dlg = page.getByRole("dialog")
  if (o.name !== undefined) await dlg.getByPlaceholder("Jane Smith").fill(o.name)
  if (o.email !== undefined) await dlg.getByPlaceholder("jane@example.com").fill(o.email)
  if (o.role) {
    await dlg.getByRole("combobox").click()
    await page.getByRole("option", { name: new RegExp(`^${o.role}`) }).click()
  }
  if (o.password !== undefined) await dlg.getByPlaceholder("Min. 6 characters").fill(o.password)
}

test.describe("settings as admin", () => {
  test("shows org card and members table with own row marked (you)", async ({ page }) => {
    await page.goto("/settings")
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
    await expect(page.getByText("Org A", { exact: true })).toBeVisible()
    await expect(page.getByText("Government", { exact: true })).toBeVisible()
    await expect(page.getByText("Your role: ADMIN")).toBeVisible()
    for (const e of ["admin@a.test", "manager@a.test", "verifier@a.test", "viewer@a.test"]) {
      await expect(row(page, e)).toBeVisible()
    }
    await expect(page.getByText("admin@b.test")).toHaveCount(0)
    const me = row(page, "admin@a.test")
    await expect(me.getByText("(you)")).toBeVisible()
    await expect(me.getByRole("combobox")).toHaveCount(0)
    await expect(row(page, "manager@a.test").getByRole("combobox")).toBeVisible()
  })

  test("invite dialog validation errors", async ({ page }) => {
    await page.goto("/settings")
    await openInvite(page)
    await fillInvite(page, { name: "A", email: "a@b", password: "123" })
    await page.getByRole("button", { name: "Send Invite" }).click()
    const dlg = page.getByRole("dialog")
    await expect(dlg.getByText("Name must be at least 2 characters")).toBeVisible()
    await expect(dlg.getByText("Invalid email")).toBeVisible()
    await expect(dlg.getByText("Password must be at least 6 characters")).toBeVisible()
    await expect(dlg).toBeVisible()
  })

  test("Cancel closes the dialog without inviting", async ({ page }) => {
    await page.goto("/settings")
    await openInvite(page)
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("invite a member: toast, dialog closes, row present after reload, can log in", async ({ page, anon }) => {
    const email = `${uniq("inv")}@a.test`
    await page.goto("/settings")
    await openInvite(page)
    await fillInvite(page, { name: "Invited Person", email, role: "Verifier", password: PASSWORD })
    await page.getByRole("button", { name: "Send Invite" }).click()
    await expect(page.locator("[data-sonner-toast]").getByText("Invited Person added to the organization")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.reload()
    await expect(row(page, email)).toBeVisible()
    await expect(row(page, email).getByRole("combobox")).toContainText("Verifier")

    const csrf = await (await anon.get("/api/auth/csrf")).json()
    await anon.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email, password: PASSWORD, json: "true" } })
    const s = await (await anon.get("/api/auth/session")).json()
    expect(s.user.role).toBe("VERIFIER")
  })

  test("duplicate invite email shows error toast and keeps dialog open", async ({ page }) => {
    await page.goto("/settings")
    await openInvite(page)
    await fillInvite(page, { name: "Dup Person", email: "viewer@a.test", role: "Viewer", password: PASSWORD })
    await page.getByRole("button", { name: "Send Invite" }).click()
    await expect(page.locator("[data-sonner-toast]").getByText("A user with this email already exists")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("dialog")).toBeVisible()
  })

  test("change a member's role via the table; persists across reload", async ({ page, as }) => {
    const admin = await as("admin")
    const email = `${uniq("role")}@a.test`
    await data(await admin.post("/api/org/members", { data: { name: "Role Target", email, role: "VIEWER", password: PASSWORD } }))
    await page.goto("/settings")
    await row(page, email).getByRole("combobox").click()
    await page.getByRole("option", { name: "Manager" }).click()
    await expect(page.locator("[data-sonner-toast]").getByText("Role updated")).toBeVisible({ timeout: 15_000 })
    await expect(row(page, email).getByRole("combobox")).toContainText("Manager")
    await page.reload()
    await expect(row(page, email).getByRole("combobox")).toContainText("Manager")
  })

  test("newly invited member appears in the table without reload", async ({ page }) => {
    const email = `${uniq("nr")}@a.test`
    await page.goto("/settings")
    await openInvite(page)
    await fillInvite(page, { name: "No Reload", email, role: "Viewer", password: PASSWORD })
    await page.getByRole("button", { name: "Send Invite" }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 })
    await expect(row(page, email)).toBeVisible({ timeout: 5_000 })
  })

  test("organization member count updates after inviting", async ({ page }) => {
    await page.goto("/settings")
    const count = async () => Number((await page.getByText(/^\d+ members?$/).innerText()).split(" ")[0])
    const before = await count()
    await openInvite(page)
    await fillInvite(page, { name: "Count Person", email: `${uniq("cnt")}@a.test`, role: "Viewer", password: PASSWORD })
    await page.getByRole("button", { name: "Send Invite" }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 })
    await expect.poll(count, { timeout: 5_000 }).toBe(before + 1)
  })
})

for (const role of ["manager", "verifier", "viewer"] as const) {
  test.describe(`settings as ${role}`, () => {
    test.use({ storageState: authFile(role) })

    test("read-only: no invite button, no role selects, badges shown", async ({ page }) => {
      await page.goto("/settings")
      await expect(page.getByText(`Your role: ${role.toUpperCase()}`)).toBeVisible()
      await expect(row(page, "admin@a.test")).toBeVisible()
      await expect(page.getByRole("button", { name: "Invite Member" })).toHaveCount(0)
      await expect(page.getByRole("combobox")).toHaveCount(0)
      await expect(row(page, "admin@a.test").getByText("ADMIN", { exact: true })).toBeVisible()
    })
  })
}

test.describe("settings as org B admin", () => {
  test.use({ storageState: authFile("otherAdmin") })

  test("sees only own org and members", async ({ page }) => {
    await page.goto("/settings")
    await expect(page.getByText("Org B", { exact: true })).toBeVisible()
    await expect(page.getByText("NGO / Non-profit")).toBeVisible()
    await expect(row(page, "admin@b.test")).toBeVisible()
    await expect(page.getByText("admin@a.test")).toHaveCount(0)
  })
})

test.describe("settings logged out", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("redirects to /login", async ({ page }) => {
    await page.goto("/settings")
    await expect(page).toHaveURL(/\/login\?callbackUrl=/)
  })
})

import { test, expect, createProject, createNode, userId, uniq, data } from "../fixtures"
import { authFile } from "../helpers/env"
import type { Page } from "@playwright/test"

const rfNode = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`)
const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text })

// Org A accumulates many users across specs, so the owner list can overflow the viewport and
// clicking an option by name is flaky. Walk the list with the keyboard instead (position-independent).
async function pickOwner(page: Page, name: string) {
  const target = page.getByRole("option", { name: new RegExp(name) }).first()
  await target.waitFor()
  const highlighted = page.locator('[role="option"][data-highlighted]')
  for (let i = 0; i < 200; i++) {
    if (((await highlighted.first().textContent().catch(() => "")) ?? "").includes(name)) break
    await page.keyboard.press("ArrowDown")
  }
  await expect(highlighted.first()).toContainText(name)
  await page.keyboard.press("Enter")
}

async function openProject(page: Page, projectId: string, rootId: string) {
  await page.goto(`/projects/${projectId}`)
  await expect(rfNode(page, rootId)).toBeVisible()
}

async function world(as: any, total = "1000.00") {
  const api = await as("admin")
  const { rootId, projectId, project } = await createProject(api, total)
  const uid = await userId("admin")
  return { api, rootId, projectId, project, uid }
}

test.describe("project page renders the tree", () => {
  test("React Flow nodes + edges + layout for a 3-level tree", async ({ page, as }) => {
    const { api, rootId, projectId, uid } = await world(as, "1000.00")
    const a = await createNode(api, rootId, "400.00", uid, "Roads Alpha")
    const b = await createNode(api, rootId, "300.00", uid, "Bridges Beta")
    const g = await createNode(api, a.id, "100.00", uid, "Paving Gamma")
    await openProject(page, projectId, rootId)
    for (const id of [rootId, a.id, b.id, g.id]) await expect(rfNode(page, id)).toBeVisible()
    await expect(rfNode(page, a.id)).toContainText("Roads Alpha")
    await expect(rfNode(page, g.id)).toContainText("$100.00")
    await expect(page.locator(`[data-testid="rf__edge-${rootId}-${a.id}"]`)).toHaveCount(1)
    await expect(page.locator(`[data-testid="rf__edge-${rootId}-${b.id}"]`)).toHaveCount(1)
    await expect(page.locator(`[data-testid="rf__edge-${a.id}-${g.id}"]`)).toHaveCount(1)
    // layout: children below parent
    const py = (await rfNode(page, rootId).boundingBox())!.y
    const cy = (await rfNode(page, a.id).boundingBox())!.y
    const gy = (await rfNode(page, g.id).boundingBox())!.y
    expect(cy).toBeGreaterThan(py)
    expect(gy).toBeGreaterThan(cy)
  })

  test("page header shows the requested project", async ({ page, as }) => {
    const api = await as("admin")
    await createProject(api)
    const { project, projectId } = await createProject(api)
    await page.goto(`/projects/${projectId}`)
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible()
  })

  test("page only contains the requested project's nodes (no cross-project/org leak)", async ({ page, as }) => {
    const api = await as("admin")
    const other = await createProject(await as("otherAdmin"))
    const { projectId, rootId } = await createProject(api)
    await page.goto(`/projects/${projectId}`)
    await expect(page.locator(".react-flow__node")).toHaveCount(1)
    await expect(rfNode(page, other.rootId)).toHaveCount(0)
    void rootId
  })

  test("unknown project id shows not-found (404)", async ({ page }) => {
    const res = await page.goto("/projects/cdoesnotexist000000000000")
    expect(res?.status()).toBe(404)
  })

  test("other org's project shows not-found (404)", async ({ page, as }) => {
    const { projectId } = await createProject(await as("otherAdmin"))
    const res = await page.goto(`/projects/${projectId}`)
    expect(res?.status()).toBe(404)
  })
})

test.describe("selection and Add Child", () => {
  test("Add Child disabled until selection; pane click deselects", async ({ page, as }) => {
    const { rootId, projectId } = await world(as)
    await openProject(page, projectId, rootId)
    const add = page.getByRole("button", { name: "Add Child" })
    await expect(add).toBeDisabled()
    await rfNode(page, rootId).click()
    await expect(add).toBeEnabled()
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible() // detail panel
    await page.locator(".react-flow__pane").click({ position: { x: 20, y: 400 } })
    await expect(add).toBeDisabled()
    await expect(page.getByRole("tab", { name: "Overview" })).toBeHidden()
  })

  test("add child via dialog: node appears, toast, parent availability shown", async ({ page, as }) => {
    const { rootId, projectId, api } = await world(as, "1000.00")
    await openProject(page, projectId, rootId)
    await rfNode(page, rootId).click()
    await page.getByRole("button", { name: "Add Child" }).click()
    const dlg = page.getByRole("dialog")
    await expect(dlg.getByRole("heading", { name: "Add Child Node" })).toBeVisible()
    await expect(dlg).toContainText("Available")
    await expect(dlg).toContainText("$1,000.00")
    const name = uniq("ui-node")
    await dlg.getByPlaceholder("Roads — Phase 1").fill(name)
    await dlg.getByPlaceholder("0.00").fill("250.25")
    await dlg.getByRole("combobox").click()
    await pickOwner(page, "Test Manager")
    await dlg.getByRole("button", { name: "Create Node" }).click()
    await expect(toast(page, "Node created")).toBeVisible()
    await expect(dlg).toBeHidden()
    const card = page.locator(".react-flow__node").filter({ hasText: name })
    await expect(card).toBeVisible()
    await expect(card).toContainText("$250.25")
    await expect(card).toContainText("Test Manager")
    await expect(page.locator(`[data-testid^="rf__edge-${rootId}-"]`)).toHaveCount(1)
    // persisted
    const p = await data<any>(await api.get(`/api/projects/${projectId}`))
    const created = p.nodes.find((n: any) => n.name === name)
    expect(created.allocatedAmount).toBe("250.25")
    expect(created.parentId).toBe(rootId)
  })

  test("dialog validation: missing name/owner shows errors, no node created", async ({ page, as }) => {
    const { rootId, projectId } = await world(as)
    await openProject(page, projectId, rootId)
    const before = await page.locator(".react-flow__node").count()
    await rfNode(page, rootId).click()
    await page.getByRole("button", { name: "Add Child" }).click()
    const dlg = page.getByRole("dialog")
    await dlg.getByRole("button", { name: "Create Node" }).click()
    await expect(dlg.getByText("Node name must be at least 2 characters")).toBeVisible()
    await expect(dlg.getByText("Amount must be positive")).toBeVisible()
    await expect(page.locator(".react-flow__node")).toHaveCount(before)
  })

  test("server rejection (amount > available) shows error toast and keeps dialog open", async ({ page, as }) => {
    const { rootId, projectId } = await world(as, "100.00")
    await openProject(page, projectId, rootId)
    const before = await page.locator(".react-flow__node").count()
    await rfNode(page, rootId).click()
    await page.getByRole("button", { name: "Add Child" }).click()
    const dlg = page.getByRole("dialog")
    await dlg.getByPlaceholder("Roads — Phase 1").fill("Too Big")
    const amt = dlg.getByPlaceholder("0.00")
    await amt.fill("100.01")
    await dlg.getByRole("combobox").click()
    await pickOwner(page, "Test Admin")
    // bypass native max validation so the request reaches the server
    await page.evaluate(() => document.querySelector("form")!.noValidate = true)
    await dlg.getByRole("button", { name: "Create Node" }).click()
    await expect(toast(page, /Insufficient budget/)).toBeVisible()
    await expect(dlg).toBeVisible()
    await expect(page.locator(".react-flow__node")).toHaveCount(before)
  })

  test("Cancel closes the add dialog", async ({ page, as }) => {
    const { rootId, projectId } = await world(as)
    await openProject(page, projectId, rootId)
    await rfNode(page, rootId).click()
    await page.getByRole("button", { name: "Add Child" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
  })

  test("can add a child under a non-root node", async ({ page, as }) => {
    const { api, rootId, projectId, uid } = await world(as, "1000.00")
    const a = await createNode(api, rootId, "400.00", uid, "Parent Branch")
    await openProject(page, projectId, rootId)
    await rfNode(page, a.id).click()
    await page.getByRole("button", { name: "Add Child" }).click()
    const dlg = page.getByRole("dialog")
    await expect(dlg).toContainText("Parent Branch")
    await expect(dlg).toContainText("$400.00")
    await dlg.getByPlaceholder("Roads — Phase 1").fill("Deep Leaf")
    await dlg.getByPlaceholder("0.00").fill("400")
    await dlg.getByRole("combobox").click()
    await pickOwner(page, "Test Admin")
    await dlg.getByRole("button", { name: "Create Node" }).click()
    await expect(toast(page, "Node created")).toBeVisible()
    await expect(page.locator(".react-flow__node").filter({ hasText: "Deep Leaf" })).toBeVisible()
  })
})

test.describe("node detail panel", () => {
  test("overview shows allocated/spent/owner; tabs switch", async ({ page, as }) => {
    const { api, rootId, projectId, uid } = await world(as, "1000.00")
    const n = await createNode(api, rootId, "200.00", uid, "Detail Node")
    await openProject(page, projectId, rootId)
    await rfNode(page, n.id).click()
    await expect(page.getByText("Detail Node").last()).toBeVisible()
    await expect(page.getByText("Budget utilization")).toBeVisible()
    await expect(page.getByText("Test Admin").last()).toBeVisible()
    await expect(page.getByText("admin@a.test")).toBeVisible()
    for (const t of ["Access", "Budget", "Receipts", "Sign", "Audit", "Overview"]) {
      await page.getByRole("tab", { name: t, exact: true }).click()
      await expect(page.getByRole("tab", { name: t, exact: true })).toHaveAttribute("data-state", "active")
    }
  })

  test("close button hides the panel and deselects", async ({ page, as }) => {
    const { rootId, projectId } = await world(as)
    await openProject(page, projectId, rootId)
    await rfNode(page, rootId).click()
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible()
    await page.locator("div.w-96 button").first().click()
    await expect(page.getByRole("tab", { name: "Overview" })).toBeHidden()
    await expect(page.getByRole("button", { name: "Add Child" })).toBeDisabled()
  })

  test("Budget tab: reallocate updates panel + persists + card", async ({ page, as }) => {
    const { api, rootId, projectId, uid } = await world(as, "1000.00")
    const n = await createNode(api, rootId, "200.00", uid, "Realloc Node")
    await openProject(page, projectId, rootId)
    await rfNode(page, n.id).click()
    await page.getByRole("tab", { name: "Budget", exact: true }).click()
    const save = page.getByRole("button", { name: "Reallocate Budget" })
    await expect(save).toBeDisabled()
    await page.getByPlaceholder("200").fill("350.50")
    await page.getByPlaceholder("e.g. Budget revision Q2").fill("scope grew")
    await save.click()
    await expect(toast(page, "Budget reallocated")).toBeVisible()
    await expect(rfNode(page, n.id)).toContainText("$350.50")
    const node = await data<any>(await api.get(`/api/nodes/${n.id}`))
    expect(node.allocatedAmount).toBe("350.5")
    expect(node.auditLogs.find((a: any) => a.action === "BUDGET_AMENDED").newValue.reason).toBe("scope grew")
  })

  test("Budget tab: over-parent reallocation shows server error toast", async ({ page, as }) => {
    const { api, rootId, projectId, uid } = await world(as, "1000.00")
    const n = await createNode(api, rootId, "200.00", uid, "Overalloc Node")
    await openProject(page, projectId, rootId)
    await rfNode(page, n.id).click()
    await page.getByRole("tab", { name: "Budget", exact: true }).click()
    await page.getByPlaceholder("200").fill("1000.01")
    await page.getByRole("button", { name: "Reallocate Budget" }).click()
    await expect(toast(page, /Insufficient budget/)).toBeVisible()
    expect((await data<any>(await api.get(`/api/nodes/${n.id}`))).allocatedAmount).toBe("200")
  })

  test("Budget tab: below children's sum shows error toast", async ({ page, as }) => {
    const { api, rootId, projectId, uid } = await world(as, "1000.00")
    const n = await createNode(api, rootId, "200.00", uid, "Parent With Kids")
    await createNode(api, n.id, "150.00", uid)
    await openProject(page, projectId, rootId)
    await rfNode(page, n.id).click()
    await page.getByRole("tab", { name: "Budget", exact: true }).click()
    await page.getByPlaceholder("200").fill("100")
    await page.getByRole("button", { name: "Reallocate Budget" }).click()
    await expect(toast(page, /less than children/)).toBeVisible()
  })

  test("Access tab: change owner and approver, Save Changes persists", async ({ page, as }) => {
    const { api, rootId, projectId, uid } = await world(as, "1000.00")
    const n = await createNode(api, rootId, "200.00", uid, "Access Node")
    await openProject(page, projectId, rootId)
    await rfNode(page, n.id).click()
    await page.getByRole("tab", { name: "Access", exact: true }).click()
    const save = page.getByRole("button", { name: "Save Changes" })
    await expect(save).toBeDisabled()
    const combos = page.getByRole("tabpanel").getByRole("combobox")
    await combos.nth(0).click()
    await page.getByRole("option", { name: /Test Manager/ }).click()
    await expect(save).toBeEnabled()
    await combos.nth(1).click()
    await page.getByRole("option", { name: /Test Verifier/ }).click()
    await save.click()
    await expect(toast(page, "Access updated")).toBeVisible()
    await expect(rfNode(page, n.id)).toContainText("Test Manager")
    const node = await data<any>(await api.get(`/api/nodes/${n.id}`))
    expect(node.ownerId).toBe(await userId("manager"))
    expect(node.approverId).toBe(await userId("verifier"))
  })
})

test.describe("role-based UI", () => {
  for (const role of ["viewer", "verifier"] as const) {
    test.describe(`as ${role}`, () => {
      test.use({ storageState: authFile(role) })
      test("no Add Child button; Budget/Access tabs are read-only", async ({ page, as }) => {
        const { api, rootId, projectId, uid } = await world(as)
        const n = await createNode(api, rootId, "200.00", uid, "RO Node")
        await openProject(page, projectId, rootId)
        await expect(rfNode(page, n.id)).toBeVisible()
        await expect(page.getByRole("button", { name: "Add Child" })).toHaveCount(0)
        await rfNode(page, n.id).click()
        await page.getByRole("tab", { name: "Budget", exact: true }).click()
        await expect(page.getByText("Admin or Manager role required to reallocate budget.")).toBeVisible()
        await expect(page.getByRole("button", { name: "Reallocate Budget" })).toHaveCount(0)
        await page.getByRole("tab", { name: "Access", exact: true }).click()
        await expect(page.getByText("Admin or Manager role required to change access.")).toBeVisible()
        await expect(page.getByRole("button", { name: "Save Changes" })).toHaveCount(0)
      })
    })
  }

  test.describe("as manager", () => {
    test.use({ storageState: authFile("manager") })
    test("manager sees Add Child and editable Budget tab", async ({ page, as }) => {
      const { api, rootId, projectId, uid } = await world(as)
      const n = await createNode(api, rootId, "200.00", uid, "Mgr Node")
      await openProject(page, projectId, rootId)
      await rfNode(page, n.id).click()
      await expect(page.getByRole("button", { name: "Add Child" })).toBeEnabled()
      await page.getByRole("tab", { name: "Budget", exact: true }).click()
      await expect(page.getByPlaceholder("200")).toBeVisible()
    })
  })
})

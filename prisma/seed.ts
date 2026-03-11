import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  // Clean up
  await prisma.auditLog.deleteMany()
  await prisma.signature.deleteMany()
  await prisma.receipt.deleteMany()
  await prisma.budgetNode.deleteMany()
  await prisma.project.deleteMany()
  await prisma.user.deleteMany()
  await prisma.organization.deleteMany()

  const org = await prisma.organization.create({
    data: { name: "Demo Organization", type: "GOVERNMENT" },
  })

  const password = await bcrypt.hash("password123", 12)

  const admin = await prisma.user.create({
    data: {
      name: "Alice Admin",
      email: "alice@demo.com",
      password,
      role: "ADMIN",
      organizationId: org.id,
    },
  })

  const manager = await prisma.user.create({
    data: {
      name: "Bob Manager",
      email: "bob@demo.com",
      password,
      role: "MANAGER",
      organizationId: org.id,
    },
  })

  const verifier = await prisma.user.create({
    data: {
      name: "Carol Verifier",
      email: "carol@demo.com",
      password,
      role: "VERIFIER",
      organizationId: org.id,
    },
  })

  // Project
  const project = await prisma.project.create({
    data: {
      name: "National Infrastructure 2026",
      description: "Road, bridge, and port development",
      totalBudget: "1000000.00",
      currency: "USD",
      organizationId: org.id,
    },
  })

  // Root node
  const root = await prisma.budgetNode.create({
    data: {
      name: "National Infrastructure 2026",
      description: "Root allocation",
      allocatedAmount: "1000000.00",
      isRoot: true,
      depth: 0,
      status: "IN_PROGRESS",
      projectId: project.id,
      ownerId: admin.id,
      rootForProject: { connect: { id: project.id } },
    },
  })

  // Level 1 nodes
  const roads = await prisma.budgetNode.create({
    data: {
      name: "Roads",
      allocatedAmount: "400000.00",
      depth: 1,
      status: "IN_PROGRESS",
      projectId: project.id,
      parentId: root.id,
      ownerId: manager.id,
    },
  })

  const bridges = await prisma.budgetNode.create({
    data: {
      name: "Bridges",
      allocatedAmount: "300000.00",
      depth: 1,
      status: "PLANNED",
      projectId: project.id,
      parentId: root.id,
      ownerId: admin.id,
    },
  })

  const ports = await prisma.budgetNode.create({
    data: {
      name: "Ports",
      allocatedAmount: "300000.00",
      depth: 1,
      status: "PLANNED",
      projectId: project.id,
      parentId: root.id,
      ownerId: admin.id,
    },
  })

  // Level 2 nodes
  await prisma.budgetNode.create({
    data: {
      name: "Roads — Phase 1",
      description: "Urban road expansion",
      allocatedAmount: "200000.00",
      spentAmount: "45000.00",
      depth: 2,
      status: "IN_PROGRESS",
      projectId: project.id,
      parentId: roads.id,
      ownerId: manager.id,
    },
  })

  await prisma.budgetNode.create({
    data: {
      name: "Roads — Phase 2",
      description: "Rural connectivity",
      allocatedAmount: "200000.00",
      depth: 2,
      status: "PLANNED",
      projectId: project.id,
      parentId: roads.id,
      ownerId: verifier.id,
    },
  })

  await prisma.budgetNode.create({
    data: {
      name: "Main Bridge Overhaul",
      allocatedAmount: "300000.00",
      depth: 2,
      status: "PLANNED",
      projectId: project.id,
      parentId: bridges.id,
      ownerId: admin.id,
    },
  })

  // Audit logs
  await prisma.auditLog.createMany({
    data: [
      {
        nodeId: root.id,
        userId: admin.id,
        action: "NODE_CREATED",
        newValue: { name: "National Infrastructure 2026", allocatedAmount: "1000000" },
      },
      {
        nodeId: roads.id,
        userId: admin.id,
        action: "NODE_CREATED",
        newValue: { name: "Roads", allocatedAmount: "400000", parentId: root.id },
      },
    ],
  })

  console.log("Seed complete!")
  console.log("  Admin: alice@demo.com / password123")
  console.log("  Manager: bob@demo.com / password123")
  console.log("  Verifier: carol@demo.com / password123")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

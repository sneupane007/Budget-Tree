import Link from "next/link"
import {
  TreePine,
  BarChart3,
  FileCheck,
  Users,
  Shield,
  GitBranch,
  CheckCircle2,
  ArrowRight,
} from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Navbar */}
      <header className="sticky top-0 z-50 bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TreePine className="h-5 w-5 text-green-600" />
            <span className="font-semibold text-sm">BudgetTree</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm px-4 py-2 rounded-md border border-input hover:bg-gray-50 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="text-sm px-4 py-2 rounded-md bg-gray-900 text-white hover:bg-gray-700 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 py-20 grid lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-50 text-green-700 px-3 py-1 rounded-full border border-green-200">
            <TreePine className="h-3.5 w-3.5" />
            Hierarchical Budget Management
          </span>
          <h1 className="text-4xl lg:text-5xl font-semibold tracking-tight text-gray-900 leading-tight">
            Control your budgets<br />with full clarity
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed max-w-md">
            Allocate, track, and verify budgets across your organization. Every dollar accounted for — with receipts, approvals, and a complete audit trail.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 text-sm px-5 py-2.5 rounded-md bg-gray-900 text-white hover:bg-gray-700 transition-colors font-medium"
            >
              Get Started free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="text-sm px-5 py-2.5 rounded-md border border-input hover:bg-gray-50 transition-colors font-medium"
            >
              Log in
            </Link>
          </div>
        </div>

        {/* Budget tree visual mock */}
        <div className="rounded-xl border bg-card shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Engineering Q2 Budget</span>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>
          </div>

          {/* Root node */}
          <div className="rounded-lg border bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Engineering</span>
              <span className="text-sm font-semibold">$120,000</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: "62%" }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>$74,400 spent</span>
              <span>62%</span>
            </div>
          </div>

          {/* Child nodes */}
          <div className="pl-4 space-y-2 border-l-2 border-gray-100 ml-3">
            {[
              { label: "Frontend", alloc: "$40,000", spent: "$28,000", pct: 70, color: "bg-blue-400" },
              { label: "Backend", alloc: "$50,000", spent: "$32,000", pct: 64, color: "bg-green-500" },
              { label: "Infrastructure", alloc: "$30,000", spent: "$14,400", pct: 48, color: "bg-violet-400" },
            ].map((node) => (
              <div key={node.label} className="rounded-md border bg-white p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{node.label}</span>
                  <span className="text-xs font-semibold">{node.alloc}</span>
                </div>
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${node.color} rounded-full`} style={{ width: `${node.pct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{node.spent} spent</span>
                  <span>{node.pct}%</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            <span className="text-xs text-muted-foreground">3 receipts attached · 1 pending approval</span>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <div className="border-t border-b bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { label: "Hierarchical Budgets", desc: "Nest budgets across any org depth" },
            { label: "Real-time Tracking", desc: "Spend updates reflected instantly" },
            { label: "Full Audit Trail", desc: "Every action logged and timestamped" },
            { label: "Team Access Control", desc: "Role-based permissions per node" },
          ].map((stat) => (
            <div key={stat.label} className="space-y-1">
              <p className="text-sm font-semibold text-gray-900">{stat.label}</p>
              <p className="text-xs text-muted-foreground">{stat.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Features grid */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center space-y-3 mb-12">
          <h2 className="text-2xl font-semibold text-gray-900">Everything you need for budget governance</h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            From top-level allocations to individual receipts — BudgetTree gives every stakeholder visibility and control.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: GitBranch,
              title: "Budget Tree",
              desc: "Model your organization as a hierarchical tree. Every team, department, and project gets its own node with allocated and spent amounts.",
            },
            {
              icon: BarChart3,
              title: "Allocation Control",
              desc: "Allocate budgets top-down. The system enforces that child allocations never exceed the parent budget — automatically.",
            },
            {
              icon: FileCheck,
              title: "Receipt Tracking",
              desc: "Attach receipts directly to budget nodes. Keep spending documented and auditable with file uploads per transaction.",
            },
            {
              icon: CheckCircle2,
              title: "Approval Workflow",
              desc: "Require digital signatures before spend is approved. Assign approvers per node and capture sign-off in one place.",
            },
            {
              icon: Shield,
              title: "Audit Trail",
              desc: "A full, immutable log of every action — allocations, spend entries, approvals, and role changes — with timestamps and user attribution.",
            },
            {
              icon: Users,
              title: "Team Management",
              desc: "Invite members with Admin or Member roles. Assign node-level ownership and approval rights across your organization.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-lg border bg-card shadow-sm p-5 space-y-3">
              <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-green-50">
                <Icon className="h-4.5 w-4.5 text-green-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 border-t border-b py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-3 mb-12">
            <h2 className="text-2xl font-semibold text-gray-900">How it works</h2>
            <p className="text-sm text-muted-foreground">Up and running in three steps</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Create a project",
                desc: "Set up a project and define your total budget. Invite team members and assign roles.",
              },
              {
                step: "02",
                title: "Build your budget tree",
                desc: "Add child nodes for each department, team, or initiative. Allocate portions of the budget down the hierarchy.",
              },
              {
                step: "03",
                title: "Track, spend & approve",
                desc: "Log spend against nodes, attach receipts, and collect approvals. Watch rollups update in real time.",
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="space-y-3">
                <span className="text-3xl font-bold text-green-600">{step}</span>
                <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-20">
        <div className="max-w-2xl mx-auto px-6 text-center space-y-6">
          <h2 className="text-2xl font-semibold text-gray-900">Ready to take control of your budgets?</h2>
          <p className="text-sm text-muted-foreground">
            Start for free. No credit card required.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 text-sm px-6 py-3 rounded-md bg-gray-900 text-white hover:bg-gray-700 transition-colors font-medium"
          >
            Get Started free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TreePine className="h-4 w-4 text-green-600" />
            <span className="text-xs font-semibold text-gray-900">BudgetTree</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/login" className="hover:text-gray-900 transition-colors">Log in</Link>
            <Link href="/dashboard" className="hover:text-gray-900 transition-colors">Dashboard</Link>
            <span>© {new Date().getFullYear()} BudgetTree</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

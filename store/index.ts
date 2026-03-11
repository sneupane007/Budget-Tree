import { create } from "zustand"
import { devtools } from "zustand/middleware"
import { createTreeSlice, type TreeSlice } from "./slices/tree-slice"
import { createUISlice, type UISlice } from "./slices/ui-slice"
import { createProjectSlice, type ProjectSlice } from "./slices/project-slice"

export type RootStore = TreeSlice & UISlice & ProjectSlice

export const useStore = create<RootStore>()(
  devtools(
    (...a) => ({
      ...createTreeSlice(...a),
      ...createUISlice(...a),
      ...createProjectSlice(...a),
    }),
    { name: "BudgetTree" }
  )
)

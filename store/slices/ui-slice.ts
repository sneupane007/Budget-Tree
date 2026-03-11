import type { StateCreator } from "zustand"

export type PanelTab = "overview" | "receipts" | "signature" | "audit"

export interface UISlice {
  panelOpen: boolean
  activeTab: PanelTab
  isAddNodeDialogOpen: boolean
  isEditNodeDialogOpen: boolean
  setPanelOpen: (open: boolean) => void
  setActiveTab: (tab: PanelTab) => void
  openAddNodeDialog: () => void
  closeAddNodeDialog: () => void
  openEditNodeDialog: () => void
  closeEditNodeDialog: () => void
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  panelOpen: false,
  activeTab: "overview",
  isAddNodeDialogOpen: false,
  isEditNodeDialogOpen: false,

  setPanelOpen: (open) => set({ panelOpen: open }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  openAddNodeDialog: () => set({ isAddNodeDialogOpen: true }),
  closeAddNodeDialog: () => set({ isAddNodeDialogOpen: false }),
  openEditNodeDialog: () => set({ isEditNodeDialogOpen: true }),
  closeEditNodeDialog: () => set({ isEditNodeDialogOpen: false }),
})

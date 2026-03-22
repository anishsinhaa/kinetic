import { create } from 'zustand'

export interface AuthUser {
  id: string
  email: string | null | undefined
}

interface AppState {
  user: AuthUser | null
  isAuthReady: boolean
  setUser: (user: AuthUser | null) => void
  setAuthReady: (ready: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  isAuthReady: false,
  setUser: (user) => set({ user }),
  setAuthReady: (isAuthReady) => set({ isAuthReady }),
}))

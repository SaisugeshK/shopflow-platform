import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import type { Category, Supplier } from '@/services/types'


export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/api/v1/categories'), staleTime: 60_000 })
}

export function useTaxRates() {
  return useQuery({ queryKey: ['tax-settings'], queryFn: () => api.get<{ allowedGstRates: number[]; defaultGstRate: number; roundOffEnabled: boolean; calculationMode: string }>('/api/v1/business/tax-settings'), staleTime: 300_000 })
}

export function useSuppliers() {
  return useQuery({ queryKey: ['suppliers', 'all'], queryFn: () => api.page<Supplier>('/api/v1/suppliers', { active: true, pageSize: 100 }) })
}

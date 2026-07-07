import { supabase } from '@/lib/supabase'

export type CustomerRole = 'buyer' | 'runner'

export interface Company {
  id: string
  name: string
  created_at: string
}

/** The receiver_profiles row for the logged-in customer (role is set), or null. */
export interface CurrentCustomer {
  id: string
  name: string
  surname: string | null
  email: string
  role: CustomerRole
  company_id: string | null
}

/**
 * Resolve the current auth user to a portal customer. Returns null for staff or
 * for receivers that were never invited (role IS NULL). Backed by the
 * "Customer reads own profile" RLS policy (own-row only).
 */
export async function getCurrentCustomer(): Promise<CurrentCustomer | null> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return null
  const { data } = await supabase
    .from('receiver_profiles')
    .select('id, name, surname, email, role, company_id')
    .eq('auth_user_id', uid)
    .not('role', 'is', null)
    .maybeSingle()
  return (data as CurrentCustomer | null) ?? null
}

export async function listCompanies(): Promise<Company[]> {
  const { data, error } = await supabase.from('companies').select('*').order('name')
  if (error) throw error
  return (data ?? []) as Company[]
}

export async function createCompany(name: string): Promise<Company> {
  const { data, error } = await supabase.from('companies').insert({ name: name.trim() }).select().single()
  if (error) throw error
  return data as Company
}

export interface InviteCustomerDto {
  email: string
  name: string
  surname?: string
  phone?: string
  company_id: string
  role: CustomerRole
}

/** Invite a customer to the portal via the invite-customer edge function. */
export async function inviteCustomer(dto: InviteCustomerDto): Promise<void> {
  const { data, error } = await supabase.functions.invoke('invite-customer', { body: dto })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}

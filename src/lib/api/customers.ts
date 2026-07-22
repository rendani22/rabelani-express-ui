import { supabase } from '@/lib/supabase'
import type { ReceiverProfile } from '@/lib/api/receivers'

export type CustomerRole = 'buyer' | 'runner'

/** Display names for the portal roles. The 'runner' value is stored; "End user" is what we show. */
export const CUSTOMER_ROLE_LABEL: Record<CustomerRole, string> = {
  buyer: 'Buyer',
  runner: 'End user',
}

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
    .eq('is_active', true)          // deactivated accounts get no portal access
    .maybeSingle()
  return (data as CurrentCustomer | null) ?? null
}

export async function listCompanies(): Promise<Company[]> {
  const { data, error } = await supabase.from('companies').select('*').order('name')
  if (error) throw error
  return (data ?? []) as Company[]
}

export async function createCompany(name: string): Promise<Company> {
  const clean = name.trim()
  // Company names must be unique. The DB has no UNIQUE constraint, so guard here
  // (case-insensitive). `%`/`_` are ilike wildcards — escape them for an exact match.
  const pattern = clean.replace(/[\\%_]/g, '\\$&')
  const { data: existing, error: dupError } = await supabase
    .from('companies')
    .select('id')
    .ilike('name', pattern)
    .maybeSingle()
  if (dupError) throw dupError
  if (existing) throw new Error('A company with this name already exists.')

  const { data, error } = await supabase.from('companies').insert({ name: clean }).select().single()
  if (error) throw error
  return data as Company
}

/**
 * Delete a company. Refuses if any receiver profiles (accounts) are still
 * assigned to it — a company can only be removed once it's empty.
 */
export async function deleteCompany(id: string): Promise<void> {
  const { count, error: countError } = await supabase
    .from('receiver_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', id)
  if (countError) throw countError
  if ((count ?? 0) > 0) throw new Error('This company still has accounts assigned to it.')

  const { error } = await supabase.from('companies').delete().eq('id', id)
  if (error) throw error
}

export interface InviteCustomerDto {
  email: string
  name: string
  surname?: string
  phone?: string
  company_id: string
  role: CustomerRole
  /** End users only: the buyer who may see their packages. Omit for none. */
  buyer_id?: string | null
}

/** Invite a customer to the portal via the invite-customer edge function. */
export async function inviteCustomer(dto: InviteCustomerDto): Promise<void> {
  const { data, error } = await supabase.functions.invoke('invite-customer', { body: dto })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}

/** One customer's auth-side invite state, from the `customer_invite_status` RPC. */
export interface CustomerInviteStatus {
  receiver_id: string
  /** auth.users.email_confirmed_at — NULL until they accept the invite. */
  confirmed_at: string | null
  /** auth.users.last_sign_in_at — NULL if they have never had a session. */
  last_sign_in_at: string | null
}

/**
 * Invite/verification state for every customer with an auth account.
 *
 * Staff-only: the RPC filters on `customers.read` internally and returns zero
 * rows to a caller without it, so a permission gap shows up as missing badges
 * rather than as an error on the directory.
 */
export async function listCustomerInviteStatus(): Promise<CustomerInviteStatus[]> {
  const { data, error } = await supabase.rpc('customer_invite_status')
  if (error) throw error
  return (data ?? []) as CustomerInviteStatus[]
}

/**
 * Re-send a customer's portal invite.
 *
 * This is the same edge-function call as the original invite — `invite-customer`
 * is idempotent and mints a fresh link every time. It is named separately
 * because the intent at the call site is different, and because the caller has
 * a `ReceiverProfile` rather than a hand-filled form.
 *
 * For a customer who never accepted, Supabase issues a genuine *invite* link
 * (GoTrue rejects an invite only for an already-confirmed user), so this is not
 * a password-reset in disguise.
 */
export async function resendCustomerInvite(profile: ReceiverProfile): Promise<void> {
  if (!profile.role) throw new Error('This customer has no portal access to re-send.')
  if (!profile.company_id) throw new Error('This customer has no company assigned.')
  await inviteCustomer({
    email: profile.email,
    name: profile.name,
    surname: profile.surname,
    phone: profile.phone,
    company_id: profile.company_id,
    role: profile.role,
    buyer_id: profile.buyer_id ?? null,
  })
}

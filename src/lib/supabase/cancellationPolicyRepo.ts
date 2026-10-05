import { getSupabase } from './client'
import {
  DEFAULT_CANCELLATION_POLICY,
  type CancellationPolicy,
  type FeePortion,
} from '../cancellationPolicy'

function portion(value: unknown, fallback: FeePortion): FeePortion {
  if (value === 'full' || value === 'half' || value === 'none') return value
  return fallback
}

export async function loadCancellationPolicy(): Promise<CancellationPolicy> {
  const supabase = getSupabase()
  if (!supabase) return { ...DEFAULT_CANCELLATION_POLICY }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ...DEFAULT_CANCELLATION_POLICY }
  const { data, error } = await supabase
    .from('profiles')
    .select('cancel_notice_hours, cancel_late_fee, cancel_early_fee, dna_fee')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw error
  if (!data) return { ...DEFAULT_CANCELLATION_POLICY }
  return {
    noticeHours: Number(data.cancel_notice_hours ?? DEFAULT_CANCELLATION_POLICY.noticeHours),
    lateFee: portion(data.cancel_late_fee, DEFAULT_CANCELLATION_POLICY.lateFee),
    earlyFee: portion(data.cancel_early_fee, DEFAULT_CANCELLATION_POLICY.earlyFee),
    dnaFee: portion(data.dna_fee, DEFAULT_CANCELLATION_POLICY.dnaFee),
  }
}

export async function saveCancellationPolicy(policy: CancellationPolicy): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const noticeHours = Math.max(0, Math.min(720, Math.round(Number(policy.noticeHours) || 0)))
  const { error } = await supabase
    .from('profiles')
    .update({
      cancel_notice_hours: noticeHours,
      cancel_late_fee: portion(policy.lateFee, 'full'),
      cancel_early_fee: portion(policy.earlyFee, 'none'),
      dna_fee: portion(policy.dnaFee, 'full'),
    })
    .eq('id', user.id)
  if (error) throw error
}

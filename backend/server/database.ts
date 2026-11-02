import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

type SupabaseError = { code?: string; message: string }
type SupabaseTable = {
  Row: Record<string, unknown>
  Insert: Record<string, unknown>
  Update: Record<string, unknown>
  Relationships: []
}
type SupabaseDatabase = {
  public: {
    Tables: Record<string, SupabaseTable>
    Views: Record<string, never>
    Functions: {
      record_fee_payment: {
        Args: { p_fee_id: string; p_payment_id: string; p_amount: number; p_reference: string; p_paid_at: string }
        Returns: Record<string, unknown>[]
      }
      record_stock_movement: {
        Args: { p_item_id: string; p_movement_id: string; p_type: string; p_quantity: number; p_note: string; p_at: string }
        Returns: Record<string, unknown>[]
      }
      update_task_state: {
        Args: { p_user_id: string; p_task_key: string; p_completed: boolean; p_history_id: string; p_at: string }
        Returns: Record<string, unknown>[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
type SupabaseClient = ReturnType<typeof createClient<SupabaseDatabase>>

let client: SupabaseClient | undefined
let connection: Promise<void> | undefined

export function getDatabaseCredentials() {
  const url = process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }
  return { url: url.replace(/\/+$/, ''), serviceRoleKey }
}

export class DatabaseError extends Error {
  readonly code: string | undefined

  constructor(error: SupabaseError) {
    super(error.message)
    this.name = 'DatabaseError'
    this.code = error.code
  }
}

export function getDatabaseClient(): SupabaseClient {
  if (client) return client
  const { url, serviceRoleKey } = getDatabaseCredentials()

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error('SUPABASE_URL must be a valid project URL.')
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== '127.0.0.1' && parsedUrl.hostname !== 'localhost') {
    throw new Error('SUPABASE_URL must use HTTPS.')
  }

  client = createClient<SupabaseDatabase>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
  return client
}

export function connectToDatabase(): Promise<void> {
  if (!connection) {
    const request = getDatabaseClient()
      .from('school_users')
      .select('_id')
      .limit(1)
      .then(({ error }) => {
        if (error) throw new DatabaseError(error)
      })
    connection = Promise.resolve(request).catch((error: unknown) => {
        connection = undefined
        throw error
      })
  }
  return connection
}

export async function checkDatabaseConnection(): Promise<boolean> {
  await connectToDatabase()
  return true
}

export function isValidObjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: unknown }).code === '23505'
}

export function newObjectId(): string {
  return randomBytes(12).toString('hex')
}

export function throwDatabaseError(error: SupabaseError): never {
  throw new DatabaseError(error)
}

export async function recordFeePayment(input: {
  feeId: string
  paymentId: string
  amount: number
  reference: string
  paidAt: Date
}) {
  const { data, error } = await getDatabaseClient().rpc('record_fee_payment', {
    p_fee_id: input.feeId,
    p_payment_id: input.paymentId,
    p_amount: input.amount,
    p_reference: input.reference,
    p_paid_at: input.paidAt.toISOString(),
  })
  if (error) throw new DatabaseError(error)
  return data
}

export async function recordStockMovement(input: {
  itemId: string
  movementId: string
  type: 'restock' | 'usage'
  quantity: number
  note: string
  at: Date
}) {
  const { data, error } = await getDatabaseClient().rpc('record_stock_movement', {
    p_item_id: input.itemId,
    p_movement_id: input.movementId,
    p_type: input.type,
    p_quantity: input.quantity,
    p_note: input.note,
    p_at: input.at.toISOString(),
  })
  if (error) throw new DatabaseError(error)
  return data
}

export async function updateTaskState(input: {
  userId: string
  taskKey: string
  completed: boolean
  historyId: string
  at: Date
}) {
  const { data, error } = await getDatabaseClient().rpc('update_task_state', {
    p_user_id: input.userId,
    p_task_key: input.taskKey,
    p_completed: input.completed,
    p_history_id: input.historyId,
    p_at: input.at.toISOString(),
  })
  if (error) throw new DatabaseError(error)
  return data
}

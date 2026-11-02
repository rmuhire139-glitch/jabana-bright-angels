import { getDatabaseCredentials, newObjectId, throwDatabaseError } from './database.js'

export type SchoolRole = 'administrator' | 'dos' | 'teacher' | 'dos_teacher' | 'accountant'

type DbRow = { _id: string; createdAt: Date; updatedAt: Date }
type Persisted<T> = T & { save(): Promise<void>; deleteOne(): Promise<void> }
type Filter = Record<string, unknown>
type Update = Record<string, unknown>
type BulkOperation = { updateOne: { filter: Filter; update: Update; upsert?: boolean } }
type SortOrder = Record<string, 1 | -1>

export interface SchoolUserRow extends DbRow {
  email: string
  passwordHash: string
  authVersion: number
  role: SchoolRole
  teacherName: string
  teacherStudies: string
  teacherGroupApproved: boolean
  assignedCourses: string[]
  active: boolean
}

export interface SchoolSessionRow extends DbRow {
  userId: string
  authVersion: number
  tokenHash: string
  expiresAt: Date
}

export interface PasswordRecoveryRow extends DbRow {
  userId: string
  codeHash: string
  attempts: number
  expiresAt: Date
}

export interface TaskStateRow extends DbRow {
  userId: string
  taskKey: string
  completedAt: Date | null
  history: Array<{ _id?: string; completed: boolean; at: Date }>
}

export interface ContactMessageRow extends DbRow {
  name: string
  email: string
  subject: string
  message: string
  dismissedAt: Date | null
}

export interface GoogleOAuthStateRow extends DbRow {
  userId: string
  stateHash: string
  expiresAt: Date
}

export interface SchoolEmailConnectionRow extends DbRow {
  key: 'school'
  email: string
  encryptedRefreshToken: string
  tokenIv: string
  tokenAuthTag: string
  connectedBy: string
  connectedAt: Date
}

export interface AdmissionInquiryRow extends DbRow {
  studentName: string
  grade: string
  guardianName: string
  email: string
  phone: string
  message: string
  status: 'new' | 'contacted' | 'closed' | 'registered'
  studentId: string | null
}

export interface StudentRow extends DbRow {
  name: string
  grade: string
  guardianName: string
  guardianPhone: string
  sdmsCode?: string
  admissionInquiryId?: string
  active: boolean
}

export interface StudentMarkRow extends DbRow {
  studentId: string
  studentNumber: string
  studentName: string
  classGrade: string
  subjectCode: string
  subjectName: string
  assessmentType: string
  assessmentName: string
  marksObtained: number
  maxMarks: number
  term: string
  academicYear: string
  calculatedGrade: string
  gradePoints: number | null
  remarks: string
  importedBy: string
  importedAt: Date
}

export interface TeachingAssignmentRow extends DbRow {
  academicYear: string
  teacherId: string
  grade: string
  subject: string
  periodsPerWeek: number
}

export interface TimetableSlot {
  day: string
  period: number
  startsAt: string
  endsAt: string
  grade: string
  subject: string
  teacherId: string
  teacherEmail: string
}

export interface ClassTimetableRow extends DbRow {
  academicYear: string
  slots: TimetableSlot[]
  generatedBy: string
  generatedAt: Date
}

export interface FeePayment {
  _id?: string
  amount: number
  paidAt: Date
  reference: string
}

export interface StudentFeeRow extends DbRow {
  studentId: string
  academicYear: string
  term: string
  amountDue: number
  payments: FeePayment[]
}

export interface FeeScheduleRow extends DbRow {
  academicYear: string
  grade: string
  term: string
  amountDue: number
}

export interface StockMovement {
  _id?: string
  type: 'restock' | 'usage'
  quantity: number
  note: string
  at: Date
}

export interface StockItemRow extends DbRow {
  name: string
  category: string
  unit: string
  quantity: number
  lowStockThreshold: number
  movements: StockMovement[]
}

export interface FeeAnnouncementRow extends DbRow {
  title: string
  body: string
  published: boolean
  createdBy: string
}

type QueryOptions = {
  fields?: string[]
  sort?: SortOrder
  limit?: number
  populate?: Array<{ field: string; columns: string[] }>
  lean: boolean
}

type RestMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'
type RestResult<T> = T

const dateFields = new Set([
  'createdAt',
  'updatedAt',
  'expiresAt',
  'connectedAt',
  'generatedAt',
  'importedAt',
  'paidAt',
  'dismissedAt',
  'completedAt',
  'at',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(serialize)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'save' && key !== 'deleteOne')
      .map(([key, child]) => [key, serialize(child)]),
  )
}

function deserialize(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((child) => deserialize(child))
  if (!isRecord(value)) {
    if (key && dateFields.has(key) && typeof value === 'string') {
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? value : date
    }
    return value
  }
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [childKey, deserialize(child, childKey)]),
  )
}

function quoteFilterValue(value: unknown): string {
  if (typeof value === 'string') return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function filterValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return quoteFilterValue(value)
  return String(value)
}

function matchesValue(actual: unknown, expected: unknown): boolean {
  if (isRecord(expected)) {
    return Object.entries(expected).every(([operator, value]) => {
      if (operator === '$in') return Array.isArray(value) && value.some((candidate) => matchesValue(actual, candidate))
      if (operator === '$ne') return !matchesValue(actual, value)
      const actualNumber = actual instanceof Date ? actual.getTime() : actual
      const valueNumber = value instanceof Date ? value.getTime() : value
      if (operator === '$gt') return typeof actualNumber === 'number' && typeof valueNumber === 'number' ? actualNumber > valueNumber : String(actualNumber) > String(valueNumber)
      if (operator === '$gte') return typeof actualNumber === 'number' && typeof valueNumber === 'number' ? actualNumber >= valueNumber : String(actualNumber) >= String(valueNumber)
      if (operator === '$lt') return typeof actualNumber === 'number' && typeof valueNumber === 'number' ? actualNumber < valueNumber : String(actualNumber) < String(valueNumber)
      if (operator === '$lte') return typeof actualNumber === 'number' && typeof valueNumber === 'number' ? actualNumber <= valueNumber : String(actualNumber) <= String(valueNumber)
      return false
    })
  }
  if (actual instanceof Date && expected instanceof Date) return actual.getTime() === expected.getTime()
  return actual === expected
}

function nestedValues(value: unknown, path: string[]): unknown[] {
  if (path.length === 0) return [value]
  if (Array.isArray(value)) return value.flatMap((item) => nestedValues(item, path))
  if (!isRecord(value)) return [undefined]
  return nestedValues(value[path[0]], path.slice(1))
}

function matchesFilter(row: Record<string, unknown>, filter: Filter): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$expr') return true
    const values = nestedValues(row, key.split('.'))
    return values.some((actual) => matchesValue(actual, expected))
  })
}

function filterParams(filter: Filter): { params: URLSearchParams; needsLocalFiltering: boolean } {
  const params = new URLSearchParams()
  let needsLocalFiltering = false
  for (const [field, condition] of Object.entries(filter)) {
    if (field === '$expr' || field.includes('.')) {
      needsLocalFiltering = true
      continue
    }
    if (isRecord(condition)) {
      for (const [operator, value] of Object.entries(condition)) {
        if (operator === '$in' && Array.isArray(value)) {
          params.set(field, `in.(${value.map(quoteFilterValue).join(',')})`)
        } else if (operator === '$ne' && value === null) {
          params.set(field, 'not.is.null')
        } else if (operator === '$ne') {
          params.set(field, `neq.${filterValue(value)}`)
        } else if (operator === '$gt' || operator === '$gte' || operator === '$lt' || operator === '$lte') {
          const restOperator = { $gt: 'gt', $gte: 'gte', $lt: 'lt', $lte: 'lte' }[operator]
          params.set(field, `${restOperator}.${filterValue(value)}`)
        } else {
          needsLocalFiltering = true
        }
      }
    } else if (condition === null) {
      params.set(field, 'is.null')
    } else {
      params.set(field, `eq.${filterValue(condition)}`)
    }
  }
  return { params, needsLocalFiltering }
}

async function restRequest<T>(
  table: string,
  method: RestMethod,
  params: URLSearchParams,
  body?: unknown,
  prefer?: string,
): Promise<RestResult<T>> {
  const { url, serviceRoleKey } = getDatabaseCredentials()
  const response = await fetch(`${url}/rest/v1/${encodeURIComponent(table)}?${params.toString()}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(prefer ? { prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(serialize(body)) }),
  })
  const responseText = await response.text()
  let responseBody: unknown
  if (responseText) {
    try {
      responseBody = JSON.parse(responseText) as unknown
    } catch {
      if (response.ok) throw new Error(`Supabase returned an invalid response for ${table}.`)
      responseBody = { message: responseText }
    }
  }
  if (!response.ok) {
    const bodyRecord = isRecord(responseBody) ? responseBody : {}
    throwDatabaseError({
      code: typeof bodyRecord.code === 'string' ? bodyRecord.code : undefined,
      message: typeof bodyRecord.message === 'string' ? bodyRecord.message : `Supabase request for ${table} failed with HTTP ${response.status}.`,
    })
  }
  return deserialize(responseBody) as RestResult<T>
}

function selectedFields(options: QueryOptions): string {
  if (!options.fields?.length) return '*'
  return [...new Set(['_id', ...options.fields])].join(',')
}

async function selectRows<T extends DbRow>(
  table: string,
  filter: Filter,
  options: QueryOptions,
): Promise<T[]> {
  if (Object.values(filter).some((condition) => isRecord(condition) && Array.isArray(condition.$in) && condition.$in.length === 0)) {
    return []
  }
  const { params, needsLocalFiltering } = filterParams(filter)
  params.set('select', selectedFields(options))
  const rows: T[] = []
  const pageSize = 1000
  const desiredCount = needsLocalFiltering ? Number.POSITIVE_INFINITY : options.limit ?? Number.POSITIVE_INFINITY
  let offset = 0
  while (offset < desiredCount) {
    const pageParams = new URLSearchParams(params)
    pageParams.set('limit', String(Math.min(pageSize, desiredCount - offset)))
    pageParams.set('offset', String(offset))
    const result = await restRequest<unknown>(table, 'GET', pageParams)
    if (!Array.isArray(result)) throw new Error(`Supabase returned an invalid row set for ${table}.`)
    const page = result.filter(isRecord) as T[]
    rows.push(...page)
    offset += page.length
    if (page.length < pageSize || page.length === 0) break
  }
  let filteredRows = rows
  if (needsLocalFiltering) filteredRows = filteredRows.filter((row) => matchesFilter(row as Record<string, unknown>, filter))
  if (options.sort) {
    const sortEntries = Object.entries(options.sort)
    filteredRows = filteredRows.sort((left, right) => {
      for (const [field, direction] of sortEntries) {
        const first = left[field as keyof T]
        const second = right[field as keyof T]
        const a = first instanceof Date ? first.getTime() : first
        const b = second instanceof Date ? second.getTime() : second
        if (a === b) continue
        if (a === null || a === undefined) return -direction
        if (b === null || b === undefined) return direction
        return (a < b ? -1 : 1) * direction
      }
      return 0
    })
  }
  if (options.limit !== undefined) filteredRows = filteredRows.slice(0, options.limit)
  for (const populate of options.populate ?? []) {
    const idsSet = new Set<string>()
    for (const row of filteredRows) {
      const id = row[populate.field as keyof T]
      if (typeof id === 'string') idsSet.add(id)
    }
    const ids = [...idsSet]
    if (!ids.length) continue
    const users = await selectRows<SchoolUserRow>(
      'school_users',
      { _id: { $in: ids } },
      { fields: populate.columns, lean: true },
    )
    const usersById = new Map(users.map((user) => [user._id, user]))
    for (const row of filteredRows) {
      const id = row[populate.field as keyof T]
      if (typeof id === 'string') {
        Object.assign(row, { [populate.field]: usersById.get(id) ?? null })
      }
    }
  }
  return filteredRows
}

function applyProjection<T extends DbRow>(row: T, options: QueryOptions): T {
  if (!options.fields?.length) return row
  const selected: Record<string, unknown> = { _id: row._id }
  for (const field of options.fields) {
    if (field in row) selected[field] = row[field as keyof T]
  }
  return selected as T
}

function getEqualFilterFields(filter: Filter): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(filter).filter(([, value]) => !isRecord(value)),
  )
}

function applyUpdate<T extends DbRow>(row: T, update: Update, inserting = false): T {
  const result = structuredClone(row) as T
  if ('$set' in update && isRecord(update.$set)) Object.assign(result, update.$set)
  if (inserting && '$setOnInsert' in update && isRecord(update.$setOnInsert)) {
    for (const [key, value] of Object.entries(update.$setOnInsert)) {
      if (!(key in result)) Object.assign(result, { [key]: value })
    }
  }
  if ('$inc' in update && isRecord(update.$inc)) {
    for (const [key, value] of Object.entries(update.$inc)) {
      const current = result[key as keyof T]
      if (typeof value === 'number') Object.assign(result, { [key]: (typeof current === 'number' ? current : 0) + value })
    }
  }
  if ('$push' in update && isRecord(update.$push)) {
    for (const [key, value] of Object.entries(update.$push)) {
      const current = result[key as keyof T]
      const values = Array.isArray(current) ? [...current] : []
      const push = isRecord(value) && Array.isArray(value.$each) ? value.$each : [value]
      const embedded = push.map((item) => {
        if (!isRecord(item) || key === 'slots') return item
        return { _id: newObjectId(), ...item }
      })
      values.push(...embedded)
      const slice = isRecord(value) && typeof value.$slice === 'number' ? value.$slice : undefined
      const limited = slice === undefined
        ? values
        : slice < 0
          ? values.slice(slice)
          : values.slice(0, slice)
      Object.assign(result, { [key]: limited })
    }
  }
  result.updatedAt = new Date()
  return result
}

function addEmbeddedIds<T extends DbRow>(row: T): T {
  const result = structuredClone(row) as T
  for (const field of ['history', 'payments', 'movements'] as const) {
    const values = result[field as keyof T]
    if (Array.isArray(values)) {
      Object.assign(result, {
        [field]: values.map((value) => isRecord(value) && !('_id' in value)
          ? { _id: newObjectId(), ...value }
          : value),
      })
    }
  }
  return result
}

function makeDocument<T extends DbRow>(table: string, value: T): Persisted<T> {
  const document = value as Persisted<T>
  Object.defineProperties(document, {
    save: {
      enumerable: false,
      value: async () => {
        const updated: Record<string, unknown> = {
          ...(serialize(document) as Record<string, unknown>),
          updatedAt: new Date().toISOString(),
        }
        delete updated._id
        const params = new URLSearchParams({ select: '*' })
        params.set('_id', `eq.${document._id}`)
        const saved = await restRequest<unknown[]>(table, 'PATCH', params, updated, 'return=representation')
        if (!Array.isArray(saved) || !saved[0]) throw new Error(`Could not save record ${document._id} in ${table}.`)
        Object.assign(document, saved[0])
      },
    },
    deleteOne: {
      enumerable: false,
      value: async () => {
        const params = new URLSearchParams({ select: '_id' })
        params.set('_id', `eq.${document._id}`)
        await restRequest(table, 'DELETE', params, undefined, 'return=representation')
      },
    },
  })
  return document
}

class DbQuery<T> implements PromiseLike<T> {
  private readonly options: QueryOptions = { lean: false }

  constructor(private readonly execute: (options: QueryOptions) => Promise<T>) {}

  select(fields: string): this {
    this.options.fields = fields.split(/\s+/).filter(Boolean).filter((field) => !field.startsWith('-'))
    return this
  }

  sort(order: SortOrder): this {
    this.options.sort = order
    return this
  }

  limit(count: number): this {
    this.options.limit = count
    return this
  }

  populate(field: string, columns = ''): this {
    this.options.populate = [...(this.options.populate ?? []), {
      field,
      columns: columns.split(/\s+/).filter(Boolean),
    }]
    return this
  }

  lean(): this {
    this.options.lean = true
    return this
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute(this.options).then(onfulfilled, onrejected)
  }
}

type ModelOptions<T> = {
  table: string
  defaults?: Partial<T>
  conflictFields?: string[]
}

type DbModel<T extends DbRow> = {
  find(filter?: Filter): DbQuery<T[]>
  findOne(filter?: Filter): DbQuery<Persisted<T> | null>
  findById(id: string): DbQuery<Persisted<T> | null>
  findByIdAndUpdate(
    id: string,
    update: Update,
    options?: { new?: boolean; runValidators?: boolean },
  ): DbQuery<Persisted<T> | null>
  findByIdAndDelete(id: string): DbQuery<Persisted<T> | null>
  findOneAndUpdate(
    filter: Filter,
    update: Update,
    options?: { upsert?: boolean; new?: boolean; runValidators?: boolean; setDefaultsOnInsert?: boolean },
  ): DbQuery<Persisted<T> | null>
  findOneAndDelete(filter: Filter): DbQuery<Persisted<T> | null>
  updateOne(filter: Filter, update: Update): DbQuery<{ matchedCount: number }>
  deleteOne(filter: Filter): DbQuery<{ deletedCount: number }>
  deleteMany(filter: Filter): DbQuery<{ deletedCount: number }>
  exists(filter: Filter): Promise<{ _id: string } | null>
  countDocuments(filter?: Filter): Promise<number>
  create(value: Partial<T>): Promise<Persisted<T>>
  bulkWrite(
    operations: BulkOperation[],
    options?: { ordered?: boolean },
  ): Promise<{ upsertedCount: number; matchedCount: number }>
}

function makeModel<T extends DbRow>(config: ModelOptions<T>): DbModel<T> {
  const { table, defaults = {}, conflictFields = ['_id'] } = config
  const query = <R>(execute: (options: QueryOptions) => Promise<R>) => new DbQuery<R>(execute)
  const findRows = (filter: Filter = {}) => query(async (options) => {
    const rows = await selectRows<T>(table, filter, options)
    return options.lean ? rows.map((row) => applyProjection(row, options)) : rows.map((row) => makeDocument(table, applyProjection(row, options)))
  })

  const model: DbModel<T> = {
    find: findRows,
    findOne: (filter = {}) => query(async (options) => {
      const row = (await selectRows<T>(table, filter, { ...options, limit: 1 }))[0]
      if (!row) return null
      const projected = applyProjection(row, options)
      return (options.lean ? projected : makeDocument(table, projected)) as Persisted<T>
    }),
    findById: (id) => model.findOne({ _id: id }),
    findByIdAndUpdate: (id, update, options) => model.findOneAndUpdate({ _id: id }, update, options),
    findByIdAndDelete: (id) => model.findOneAndDelete({ _id: id }),
    findOneAndUpdate: (filter, update, options = {}) => query(async (queryOptions) => {
      const existing = (await selectRows<T>(table, filter, { ...queryOptions, limit: 1 }))[0]
      const inserting = !existing && options.upsert === true
      if (!existing && !inserting) return null
      const now = new Date()
      const source = existing ?? ({
        ...defaults,
        ...getEqualFilterFields(filter),
        _id: newObjectId(),
        createdAt: now,
        updatedAt: now,
      } as T)
      const updated = addEmbeddedIds(applyUpdate(source, update, inserting))
      if (inserting) {
        const params = new URLSearchParams({ select: '*' })
        params.set('on_conflict', conflictFields.join(','))
        const rows = await restRequest<unknown[]>(table, 'POST', params, serialize(updated), 'resolution=merge-duplicates,return=representation')
        const row = Array.isArray(rows) ? rows[0] : null
        if (!isRecord(row)) return null
        const projected = applyProjection(row as T, queryOptions)
        return (queryOptions.lean ? projected : makeDocument(table, projected)) as Persisted<T>
      }
      const patchFilter = { ...filter, _id: existing._id }
      const { params, needsLocalFiltering } = filterParams(patchFilter)
      params.set('select', '*')
      if (needsLocalFiltering) throw new Error(`A nested filter cannot be used to update ${table}.`)
      const rows = await restRequest<unknown[]>(table, 'PATCH', params, updated, 'return=representation')
      const row = Array.isArray(rows) ? rows[0] : null
      if (!isRecord(row)) return null
      const projected = applyProjection(row as T, queryOptions)
      return (queryOptions.lean ? projected : makeDocument(table, projected)) as Persisted<T>
    }),
    findOneAndDelete: (filter) => query(async (options) => {
      const existing = (await selectRows<T>(table, filter, { ...options, limit: 1 }))[0]
      if (!existing) return null
      const params = filterParams({ ...filter, _id: existing._id }).params
      params.set('select', '*')
      const rows = await restRequest<unknown[]>(table, 'DELETE', params, undefined, 'return=representation')
      const row = Array.isArray(rows) ? rows[0] : null
      if (!isRecord(row)) return null
      const projected = applyProjection(row as T, options)
      return (options.lean ? projected : makeDocument(table, projected)) as Persisted<T>
    }),
    updateOne: (filter, update) => query(async (options) => {
      const existing = (await selectRows<T>(table, filter, { ...options, limit: 1 }))[0]
      if (!existing) return { matchedCount: 0 }
      const updated = applyUpdate(existing, update)
      const params = filterParams({ ...filter, _id: existing._id }).params
      params.set('select', '_id')
      const rows = await restRequest<unknown[]>(table, 'PATCH', params, updated, 'return=representation')
      return { matchedCount: Array.isArray(rows) ? rows.length : 0 }
    }),
    deleteOne: (filter) => query(async () => {
      const params = filterParams(filter).params
      params.set('select', '_id')
      const rows = await restRequest<unknown[]>(table, 'DELETE', params, undefined, 'return=representation')
      return { deletedCount: Array.isArray(rows) ? rows.length : 0 }
    }),
    deleteMany: (filter) => query(async () => {
      const params = filterParams(filter).params
      params.set('select', '_id')
      const rows = await restRequest<unknown[]>(table, 'DELETE', params, undefined, 'return=representation')
      return { deletedCount: Array.isArray(rows) ? rows.length : 0 }
    }),
    exists: async (filter) => {
      const row = (await selectRows<T>(table, filter, { fields: ['_id'], limit: 1, lean: true }))[0]
      return row ? { _id: row._id } : null
    },
    countDocuments: async (filter = {}) => (await selectRows<T>(table, filter, { fields: ['_id'], lean: true })).length,
    create: async (value) => {
      const now = new Date()
      const row = addEmbeddedIds({
        ...defaults,
        ...value,
        _id: value._id ?? newObjectId(),
        createdAt: value.createdAt ?? now,
        updatedAt: value.updatedAt ?? now,
      } as T)
      const params = new URLSearchParams({ select: '*' })
      const inserted = await restRequest<unknown[]>(table, 'POST', params, row, 'return=representation')
      if (!Array.isArray(inserted) || !isRecord(inserted[0])) throw new Error(`Supabase did not return the inserted ${table} record.`)
      return makeDocument(table, inserted[0] as T)
    },
    bulkWrite: async (operations) => {
      if (!operations.length) return { upsertedCount: 0, matchedCount: 0 }
      const firstFilterField = conflictFields[0]
      let upsertedCount = 0
      let matchedCount = 0
      for (let offset = 0; offset < operations.length; offset += 500) {
        const batch = operations.slice(offset, offset + 500)
        const keyValues = batch
          .map((operation) => operation.updateOne.filter[firstFilterField])
          .filter((value) => value !== undefined)
        const existingRows = keyValues.length
          ? await selectRows<T>(table, { [firstFilterField]: { $in: keyValues } }, { lean: true })
          : []
        const rowsByKey = new Map(existingRows.map((row) => [
          conflictFields.map((field) => String(row[field as keyof T])).join('\u0000'),
          row,
        ]))
        const touchedKeys = new Set<string>()
        for (const { updateOne: operation } of batch) {
          const key = conflictFields.map((field) => String(operation.filter[field])).join('\u0000')
          touchedKeys.add(key)
          const existing = rowsByKey.get(key)
          if (existing) matchedCount += 1
          else upsertedCount += 1
          const source = existing ?? ({
            ...defaults,
            ...getEqualFilterFields(operation.filter),
            _id: newObjectId(),
            createdAt: new Date(),
            updatedAt: new Date(),
          } as T)
          rowsByKey.set(key, addEmbeddedIds(applyUpdate(source, operation.update, !existing)))
        }
        const touchedRows = [...touchedKeys].map((key) => rowsByKey.get(key)).filter((row): row is T => row !== undefined)
        const params = new URLSearchParams({ select: '*' })
        params.set('on_conflict', conflictFields.join(','))
        await restRequest<unknown[]>(table, 'POST', params, touchedRows, 'resolution=merge-duplicates,return=representation')
      }
      return { upsertedCount, matchedCount }
    },
  }
  return model
}

export const SchoolUser = makeModel<SchoolUserRow>({
  table: 'school_users',
  defaults: { authVersion: 0, teacherName: '', teacherStudies: '', teacherGroupApproved: false, assignedCourses: [], active: true },
  conflictFields: ['email'],
})
export const SchoolSession = makeModel<SchoolSessionRow>({ table: 'school_sessions', conflictFields: ['tokenHash'] })
export const PasswordRecovery = makeModel<PasswordRecoveryRow>({ table: 'password_recoveries', defaults: { attempts: 0 }, conflictFields: ['userId'] })
export const TaskState = makeModel<TaskStateRow>({ table: 'task_states', defaults: { completedAt: null, history: [] }, conflictFields: ['userId', 'taskKey'] })
export const ContactMessage = makeModel<ContactMessageRow>({ table: 'contact_messages', defaults: { dismissedAt: null } })
export const GoogleOAuthState = makeModel<GoogleOAuthStateRow>({ table: 'google_oauth_states', conflictFields: ['stateHash'] })
export const SchoolEmailConnection = makeModel<SchoolEmailConnectionRow>({ table: 'school_email_connections', conflictFields: ['key'] })
export const AdmissionInquiry = makeModel<AdmissionInquiryRow>({
  table: 'admission_inquiries',
  defaults: { message: '', status: 'new', studentId: null },
})
export const Student = makeModel<StudentRow>({
  table: 'students',
  defaults: { guardianName: '', guardianPhone: '', active: true },
})
export const StudentMark = makeModel<StudentMarkRow>({
  table: 'student_marks',
  defaults: { classGrade: '', calculatedGrade: '', gradePoints: null, remarks: '' },
  conflictFields: ['studentNumber', 'subjectCode', 'assessmentType', 'assessmentName', 'term', 'academicYear'],
})
export const TeachingAssignment = makeModel<TeachingAssignmentRow>({
  table: 'teaching_assignments',
  conflictFields: ['academicYear', 'teacherId', 'grade', 'subject'],
})
export const ClassTimetable = makeModel<ClassTimetableRow>({
  table: 'class_timetables',
  defaults: { slots: [] },
  conflictFields: ['academicYear'],
})
export const StudentFee = makeModel<StudentFeeRow>({
  table: 'student_fees',
  defaults: { payments: [] },
  conflictFields: ['studentId', 'academicYear', 'term'],
})
export const FeeSchedule = makeModel<FeeScheduleRow>({
  table: 'fee_schedules',
  conflictFields: ['academicYear', 'grade', 'term'],
})
export const StockItem = makeModel<StockItemRow>({ table: 'stock_items', defaults: { movements: [] } })
export const FeeAnnouncement = makeModel<FeeAnnouncementRow>({
  table: 'fee_announcements',
  defaults: { published: true },
})

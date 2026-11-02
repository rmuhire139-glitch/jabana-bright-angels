import 'dotenv/config'
import mongoose from 'mongoose'

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '')
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const sourceUri = process.env.MONGODB_SOURCE_URI || 'mongodb://127.0.0.1:27017/jabana_school'
const resume = process.argv.includes('--resume')

const collections = [
  ['schoolusers', 'school_users'],
  ['schoolsessions', 'school_sessions'],
  ['passwordrecoveries', 'password_recoveries'],
  ['taskstates', 'task_states'],
  ['contactmessages', 'contact_messages'],
  ['googleoauthstates', 'google_oauth_states'],
  ['schoolemailconnections', 'school_email_connections'],
  ['admissioninquiries', 'admission_inquiries'],
  ['students', 'students'],
  ['studentmarks', 'student_marks'],
  ['teachingassignments', 'teaching_assignments'],
  ['classtimetables', 'class_timetables'],
  ['studentfees', 'student_fees'],
  ['feeschedules', 'fee_schedules'],
  ['stockitems', 'stock_items'],
  ['feeannouncements', 'fee_announcements'],
]

const defaults = {
  school_users: {
    authVersion: 0,
    teacherName: '',
    teacherStudies: '',
    teacherGroupApproved: false,
    assignedCourses: [],
    active: true,
  },
  password_recoveries: { attempts: 0 },
  task_states: { history: [] },
  admission_inquiries: { message: '', status: 'new', studentId: null },
  students: { guardianName: '', guardianPhone: '', active: true },
  student_marks: { classGrade: '', calculatedGrade: '', gradePoints: null, remarks: '' },
  class_timetables: { slots: [] },
  student_fees: { payments: [] },
  stock_items: { movements: [] },
  fee_announcements: { published: true },
}

function assertConfiguration() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the local, git-ignored .env file.')
  }
  const parsedUrl = new URL(supabaseUrl)
  if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname.endsWith('.supabase.co')) {
    throw new Error('SUPABASE_URL must be the HTTPS project URL ending in .supabase.co.')
  }
}

async function supabaseRequest(table, query = '', options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}${query}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
      ...options.headers,
    },
  })
  if (!response.ok) {
    throw new Error(`Supabase request for ${table} failed with HTTP ${response.status}. Check the schema, credentials, and migration state.`)
  }
  return response
}

function serializeDocument(value) {
  if (Array.isArray(value)) return value.map(serializeDocument)
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value.toISOString()
    if (value?._bsontype === 'ObjectId') return value.toHexString()
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== '__v')
        .map(([key, child]) => [key, serializeDocument(child)]),
    )
  }
  return value
}

function applyDefaults(table, row) {
  const now = new Date().toISOString()
  return {
    createdAt: now,
    updatedAt: now,
    ...defaults[table],
    ...(table === 'student_marks' ? { importedAt: now } : {}),
    ...(table === 'class_timetables' ? { generatedAt: now } : {}),
    ...row,
  }
}

async function main() {
  assertConfiguration()
  await mongoose.connect(sourceUri, { serverSelectionTimeoutMS: 10000 })

  try {
    if (!resume) {
      for (const [, table] of collections) {
        const response = await supabaseRequest(table, '?select=_id&limit=1')
        const rows = await response.json()
        if (rows.length > 0) {
          throw new Error(`The Supabase table ${table} is not empty. Verify the destination, then rerun with --resume only if continuing a partially completed import.`)
        }
      }
    }

    const database = mongoose.connection.db
    if (!database) throw new Error('MongoDB connection did not expose the source database.')

    const admissionsById = new Map()
    let importedRecords = 0

    for (const [collectionName, table] of collections) {
      const sourceCollection = database.collection(collectionName)
      const documents = await sourceCollection.find({}).toArray()
      const rows = documents.map((document) => applyDefaults(table, serializeDocument(document)))

      if (table === 'admission_inquiries') {
        for (const row of rows) {
          if (row.studentId) {
            admissionsById.set(row._id, row.studentId)
            row.studentId = null
          }
        }
      }

      for (let offset = 0; offset < rows.length; offset += 100) {
        const batch = rows.slice(offset, offset + 100)
        if (batch.length === 0) continue
        await supabaseRequest(table, '?on_conflict=_id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(batch),
        })
      }

      importedRecords += rows.length
      console.log(`Imported ${rows.length} records into ${table}.`)
    }

    for (const [inquiryId, studentId] of admissionsById) {
      const query = `?${new URLSearchParams({ _id: `eq.${inquiryId}` })}`
      await supabaseRequest('admission_inquiries', query, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ studentId }),
      })
    }

    console.log(`MongoDB import completed: ${importedRecords} records across ${collections.length} tables.`)
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'MongoDB import failed.')
  process.exitCode = 1
})

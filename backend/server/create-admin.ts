import 'dotenv/config'
import { makePasswordHash } from './auth.js'
import { connectToDatabase } from './database.js'
import { SchoolUser } from './models.js'

async function createInitialAdministrator() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.INITIAL_ADMIN_PASSWORD
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !email || !password) {
    throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INITIAL_ADMIN_EMAIL, and INITIAL_ADMIN_PASSWORD before creating an administrator.')
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('INITIAL_ADMIN_EMAIL must be a valid email address.')
  if (password.length < 12) throw new Error('INITIAL_ADMIN_PASSWORD must contain at least 12 characters.')

  await connectToDatabase()
  if (await SchoolUser.exists({ email })) throw new Error('An account with INITIAL_ADMIN_EMAIL already exists.')
  await SchoolUser.create({ email, passwordHash: await makePasswordHash(password), role: 'administrator' })
  console.log(`Administrator account created for ${email}.`)
}

createInitialAdministrator()
  .catch((error: unknown) => {
    console.error('Could not create the initial administrator:', error)
    process.exitCode = 1
  })

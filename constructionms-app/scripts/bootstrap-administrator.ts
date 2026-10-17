/**
 * Creates the first Administrator (the former `dotnet run -- --bootstrap-administrator`).
 * Allowed only while the Users table is empty. Supply the account through environment
 * variables (or .env.local), then remove them:
 *   BOOTSTRAP_ADMINISTRATOR_USERNAME, BOOTSTRAP_ADMINISTRATOR_FULL_NAME,
 *   BOOTSTRAP_ADMINISTRATOR_EMAIL, BOOTSTRAP_ADMINISTRATOR_PHONE_NUMBER,
 *   BOOTSTRAP_ADMINISTRATOR_PASSWORD
 */
import { count, eq } from 'drizzle-orm'
import { closeAppDbContext, getAppDbContext } from '@/ConstructionMS.Infrastructure/Data/AppDbContext'
import { roles, users } from '@/ConstructionMS.Infrastructure/Data/schema'
import { UserService } from '@/ConstructionMS.Infrastructure/Services/Users/UserService'
import { loadLocalEnvironment, requireSchemaAsync } from './environment'

async function main(): Promise<void> {
  loadLocalEnvironment()
  const db = getAppDbContext()
  await requireSchemaAsync(db, 'bootstrap-administrator')

  const [{ value: userCount } = { value: 0 }] = await db.select({ value: count() }).from(users)
  if (userCount > 0) {
    throw new Error('Administrator bootstrap is permitted only while the Users table is empty.')
  }

  const administratorRoles = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.roleName, 'Administrator'))
    .limit(2)
  if (administratorRoles.length !== 1) throw new Error('Sequence contains no elements')

  const username = process.env.BOOTSTRAP_ADMINISTRATOR_USERNAME
  const fullName = process.env.BOOTSTRAP_ADMINISTRATOR_FULL_NAME
  const email = process.env.BOOTSTRAP_ADMINISTRATOR_EMAIL
  const phoneNumber = process.env.BOOTSTRAP_ADMINISTRATOR_PHONE_NUMBER
  const password = process.env.BOOTSTRAP_ADMINISTRATOR_PASSWORD
  if (!username?.trim() || !fullName?.trim() || !email?.trim() || !phoneNumber?.trim() || !password?.trim()) {
    throw new Error(
      'BOOTSTRAP_ADMINISTRATOR_USERNAME, _FULL_NAME, _EMAIL, _PHONE_NUMBER and _PASSWORD are all required. ' +
      'Supply them through the environment, never committed files.')
  }

  await new UserService(db).createAsync({
    username,
    fullName,
    email,
    phoneNumber,
    password,
    roleId: administratorRoles[0]!.id,
  })
  console.log('The initial Administrator account was created. Remove the bootstrap secrets now.')
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => closeAppDbContext())

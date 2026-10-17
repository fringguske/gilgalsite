/**
 * Administrator recovery (the former `dotnet run -- --reset-administrator-password`):
 *   npm run reset-administrator-password -- --administrator-username <username>
 * The new password is typed into an interactive terminal so it never appears in
 * command-line arguments, environment variables or shell history.
 */
import { closeAppDbContext, getAppDbContext } from '@/ConstructionMS.Infrastructure/Data/AppDbContext'
import { createLogger } from '@/ConstructionMS.Application/Common/Logger'
import { CredentialService } from '@/ConstructionMS.Infrastructure/Services/Auth/CredentialService'
import { loadLocalEnvironment, requireSchemaAsync } from './environment'

function getRequiredOption(args: string[], optionName: string): string {
  const optionIndex = args.indexOf(optionName)
  if (optionIndex < 0 || optionIndex === args.length - 1 || args[optionIndex + 1]!.startsWith('--')) {
    throw new Error(`${optionName} requires a value.`)
  }
  return args[optionIndex + 1]!
}

function readSecret(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    process.stdout.write(prompt)
    const characters: string[] = []
    const stdin = process.stdin
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === '\r' || character === '\n') {
          finish()
          process.stdout.write('\n')
          resolve(characters.join(''))
          return
        }
        if (character === '\u0003') {
          finish()
          process.stdout.write('\n')
          reject(new Error('Administrator recovery was cancelled.'))
          return
        }
        if (character === '\u007f' || character === '\b') {
          characters.pop()
        } else if (character >= ' ') {
          characters.push(character)
        }
      }
    }
    const finish = () => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
    }
    stdin.on('data', onData)
  })
}

async function main(): Promise<void> {
  loadLocalEnvironment()
  const username = getRequiredOption(process.argv.slice(2), '--administrator-username')
  if (!process.stdin.isTTY) {
    throw new Error(
      'Administrator recovery requires an interactive terminal so the password is never passed ' +
      'through command-line arguments, environment variables, or shell history.')
  }

  const db = getAppDbContext()
  await requireSchemaAsync(db, 'reset-administrator-password')
  const newPassword = await readSecret('New Administrator password: ')
  const confirmation = await readSecret('Confirm Administrator password: ')
  if (newPassword !== confirmation) {
    throw new Error('The passwords did not match. No change was made.')
  }

  await new CredentialService(db, createLogger('CredentialService')).resetAdministratorPasswordAsync(username, newPassword)
  console.log('Administrator password reset completed. Existing sessions for the account are now invalid.')
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => closeAppDbContext())

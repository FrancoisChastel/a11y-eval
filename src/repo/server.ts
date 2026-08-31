import { spawn } from 'node:child_process'

const POLL_INTERVAL_MS = 500

/**
 * Starts the app's dev server and waits until readyUrl responds (any HTTP status
 * counts — listening is what matters). Returns an async stop() that kills the
 * whole process group so bundler child processes don't leak.
 */
export const startServer = async (
  command: string,
  cwd: string,
  readyUrl: string,
  timeoutMs = 90_000,
): Promise<() => Promise<void>> => {
  const child = spawn(command, { cwd, shell: true, detached: true, stdio: 'ignore' })

  let exited = false
  child.on('exit', () => {
    exited = true
  })

  const stop = async (): Promise<void> => {
    if (exited || child.pid === undefined) return
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      /* already gone */
    }
  }

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (exited) throw new Error(`Server command exited before becoming ready: ${command}`)
    try {
      await fetch(readyUrl, { signal: AbortSignal.timeout(2_000) })
      return stop
    } catch {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }
  await stop()
  throw new Error(`Server did not respond at ${readyUrl} within ${timeoutMs / 1000}s (command: ${command})`)
}

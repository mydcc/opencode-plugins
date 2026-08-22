import type { Plugin } from "@opencode-ai/plugin"
import { openSync, writeSync, closeSync } from "node:fs"

const EMOJI: Record<string, string> = {
  initializing: "🚀",
  idle: "😴",
  thinking: "🤔",
  working: "🏃",
  tool_use: "🛠️",
}

function basename(p: string): string {
  const parts = p.split("/").filter(Boolean)
  return parts.length ? parts[parts.length - 1] : p
}

function workspaceName(dir: string): string {
  const m = dir.match(/\/google\/src\/cloud\/[^/]+\/([^/]+)/)
  if (m) return m[1]
  return basename(dir) || "unknown"
}

export const TitlePlugin: Plugin = async ({ directory, worktree }) => {
  const base = worktree ?? directory ?? process.cwd()
  let lastTitle = ""

  let tty: number | null = null
  try {
    tty = openSync("/dev/tty", "w")
  } catch {
    tty = null
  }

  function setTitle(state: string) {
    const emoji = EMOJI[state] ?? "🤖"
    const title = `${emoji} ${state} | ${workspaceName(base)}`
    if (title === lastTitle) return
    lastTitle = title
    try {
      if (tty !== null) {
        writeSync(tty, `\x1b]0;${title}\x07`)
      }
    } catch {
      // terminal may be gone; ignore
    }
  }

  process.on("exit", () => {
    if (tty !== null) closeSync(tty)
  })

  return {
    event: async ({ event }) => {
      switch (event.type) {
        case "session.created":
          setTitle("initializing")
          break
        case "session.status": {
          const status = (event.properties as any)?.status?.type
          if (status === "busy") setTitle("working")
          else if (status === "retry") setTitle("thinking")
          else if (status === "idle") setTitle("idle")
          break
        }
        case "message.updated": {
          const role = (event.properties as any)?.info?.role
          if (role === "assistant") setTitle("thinking")
          break
        }
        case "session.idle":
          setTitle("idle")
          break
      }
    },
    "tool.execute.before": async () => {
      setTitle("tool_use")
    },
    "tool.execute.after": async () => {
      setTitle("working")
    },
  }
}

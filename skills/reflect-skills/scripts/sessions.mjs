#!/usr/bin/env node
// Prints what the user asked for in recent Claude Code sessions, plus the
// skills and commands that already exist, for reflect-skills to read.
//
//   node sessions.mjs [--days N] [--project <path>] [--all-projects] [--max-chars N]
//
// Read-only. Ported from claude-reflect's project_paths.py and
// extract_session_learnings.py (MIT, Bayram Annakov; see ../LICENSE).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const opt = name => {
  const i = args.indexOf(name)
  return i < 0 ? undefined : args[i + 1]
}
const days = Number(opt('--days') ?? 14)
const allProjects = args.includes('--all-projects')
const project = path.resolve(opt('--project') ?? process.cwd())
const maxChars = Number(opt('--max-chars') ?? 400)

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
const projectsDir = path.join(claudeDir, 'projects')

// Claude Code names a project's folder by turning every UTF-16 code unit that
// isn't an ASCII letter or digit into "-" (a JS regex without /u does exactly
// that), after NFC normalisation. Names over 200 characters are cut and given
// a hash suffix, so for those an existing folder with the prefix wins.
export function folderName(dir) {
  const encoded = dir.normalize('NFC').replace(/[^A-Za-z0-9]/g, '-')
  if (encoded.length <= 200) return encoded
  const prefix = encoded.slice(0, 200)
  const match = safeReaddir(projectsDir).find(n => n.startsWith(prefix + '-'))
  return match ?? prefix
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

// Folder names can differ from the cwd in drive-letter case on Windows.
function findFolder(name) {
  const names = safeReaddir(projectsDir)
  return names.find(n => n === name) ?? names.find(n => n.toLowerCase() === name.toLowerCase())
}

// The same filter as upstream's should_include_message: drop system content,
// tool output, continuation summaries and pasted structured text.
const SKIP = [
  /^</, /^\[/, /^\{/, /tool_result/, /tool_use_id/, /<task-notification>/, /<system-reminder>/,
  /This session is being continued/, /^Analysis:/, /^\*\*/, /^ {3}-/,
]

// A slash command shows up as <command-name>/ship</command-name> plus its args.
// Keep it as "/ship args": which skills the user already reaches for is evidence too.
function commandOf(text) {
  const name = /<command-name>([^<]*)<\/command-name>/.exec(text)?.[1]?.trim()
  if (!name) return undefined
  const argv = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1]?.trim()
  return argv ? `${name} ${argv}` : name
}

export function promptsOf(file) {
  const out = []
  let cwd
  let lines
  try {
    lines = fs.readFileSync(file, 'utf8').split('\n')
  } catch {
    return { cwd, prompts: out }
  }
  for (const line of lines) {
    if (!line.trim()) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    cwd ??= entry.cwd
    if (entry.type !== 'user' || entry.isMeta || entry.isSidechain) continue
    const content = entry.message?.content
    const texts = typeof content === 'string'
      ? [content]
      : Array.isArray(content) ? content.filter(c => c?.type === 'text').map(c => c.text ?? '') : []
    for (const raw of texts) {
      const text = raw.trim()
      if (!text) continue
      const command = commandOf(text)
      if (command) {
        out.push(command)
        continue
      }
      if (text.includes('<command-') || SKIP.some(re => re.test(text))) continue
      const flat = text.replace(/\s+/g, ' ')
      out.push(flat.length > maxChars ? flat.slice(0, maxChars) + '…' : flat)
    }
  }
  return { cwd, prompts: out }
}

function sessionsIn(folder) {
  const dir = path.join(projectsDir, folder)
  const since = Date.now() - days * 86_400_000
  return safeReaddir(dir)
    .filter(n => n.endsWith('.jsonl'))
    .map(n => ({ file: path.join(dir, n), mtime: fs.statSync(path.join(dir, n)).mtimeMs }))
    .filter(s => s.mtime >= since)
    .sort((a, b) => a.mtime - b.mtime)
}

// Skill and command names that already exist, so candidates don't duplicate them.
function existingSkills() {
  const found = new Set()
  const add = (dir, kind) => {
    for (const n of safeReaddir(dir)) {
      if (kind === 'skill' && fs.existsSync(path.join(dir, n, 'SKILL.md'))) found.add(n)
      if (kind === 'command' && n.endsWith('.md')) found.add(n.slice(0, -3))
    }
  }
  for (const base of [claudeDir, path.join(project, '.claude')]) {
    add(path.join(base, 'skills'), 'skill')
    add(path.join(base, 'commands'), 'command')
  }
  add(path.join(project, 'skills'), 'skill')
  // Plugin skills: plugins/cache/<marketplace>/<plugin>/<version>/skills/<name>.
  const cache = path.join(claudeDir, 'plugins', 'cache')
  for (const m of safeReaddir(cache))
    for (const p of safeReaddir(path.join(cache, m)))
      for (const v of safeReaddir(path.join(cache, m, p))) {
        for (const n of safeReaddir(path.join(cache, m, p, v, 'skills')))
          if (fs.existsSync(path.join(cache, m, p, v, 'skills', n, 'SKILL.md'))) found.add(`${p}:${n}`)
        for (const n of safeReaddir(path.join(cache, m, p, v, 'commands')))
          if (n.endsWith('.md')) found.add(`${p}:${n.slice(0, -3)}`)
      }
  return [...found].sort()
}

function main() {
  let folders
  if (allProjects) {
    folders = safeReaddir(projectsDir).filter(n => fs.statSync(path.join(projectsDir, n)).isDirectory())
  } else {
    const name = findFolder(folderName(project))
    if (!name) {
      console.log(`No session folder for ${project} under ${projectsDir} (expected ${folderName(project)}).`)
      process.exit(1)
    }
    folders = [name]
  }

  let sessionCount = 0
  let promptCount = 0
  const blocks = []
  for (const folder of folders) {
    const sessions = sessionsIn(folder)
    const parts = []
    let label = folder
    for (const s of sessions) {
      const { cwd, prompts } = promptsOf(s.file)
      if (cwd) label = cwd
      if (!prompts.length) continue
      sessionCount++
      promptCount += prompts.length
      const date = new Date(s.mtime).toISOString().slice(0, 10)
      parts.push(`## ${date} ${path.basename(s.file, '.jsonl').slice(0, 8)}\n` + prompts.map(p => `- ${p}`).join('\n'))
    }
    if (parts.length) blocks.push(`# PROJECT ${label}\n\n${parts.join('\n\n')}`)
  }

  console.log(`Sessions: ${sessionCount} with prompts, last ${days} days, ${allProjects ? 'all projects' : project}`)
  console.log(`Prompts: ${promptCount}\n`)
  console.log(`# EXISTING SKILLS AND COMMANDS\n${existingSkills().join(', ') || '(none found)'}\n`)
  console.log(blocks.join('\n\n') || '(no prompts in range)')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

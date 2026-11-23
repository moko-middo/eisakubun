import type { Drill } from '../types'
import { parseDrill } from '../lib/drill'

/** content/drills/*.md をビルド時に取り込む（新しい日付が先頭）。和訳がなく問題が作れないものは出さない */
const files = import.meta.glob<string>('/content/drills/*.md', { query: '?raw', import: 'default', eager: true })

export const DRILLS: Drill[] = Object.entries(files)
  .map(([path, md]) => parseDrill(path.split('/').pop()!.replace(/\.md$/, ''), md))
  .filter((d) => d.problems.length > 0)
  .sort((a, b) => b.name.localeCompare(a.name))

export const PROBLEMS = DRILLS.flatMap((d) => d.problems)

import type { Block } from './habit'

/**
 * マイクラ風のブロックの絵（8×8 のドット絵）。1 文字が 1 ドットで、文字は下のパレットの色。
 */
const PALETTE: Record<string, string> = {
  // 土
  a: '#866043',
  b: '#6b4a30',
  c: '#9b7653',
  d: '#5a3d26',
  // 草
  g: '#6aaa3c',
  h: '#5a9132',
  i: '#7fc04a',
  // 金
  y: '#f8d83a',
  l: '#fff3a0',
  o: '#d4a020',
  w: '#fffbe0',
  // ダイヤ
  e: '#62e0dd',
  f: '#b8f8f2',
  k: '#2fb3b0',
  x: '#e8fffd',
}

const PIXELS: Record<Exclude<Block, 'air'>, string[]> = {
  dirt: ['acabaaca', 'bacaadab', 'aabacaaa', 'cadaabac', 'abaacaba', 'aacabada', 'dabaacab', 'acaabaca'],
  grass: ['gihgighg', 'hggihgig', 'ghgigahg', 'agacgaga', 'bacaadab', 'cadaabac', 'abaacaba', 'dabaacab'],
  gold: ['wlllllly', 'lyyyyyyo', 'lyylyyyo', 'lyyyyyyo', 'lyyyylyo', 'lyyyyyyo', 'lyyyyyyo', 'yooooooo'],
  diamond: ['xffffffe', 'feeeeeek', 'feefeeek', 'feeeeeek', 'feeeefek', 'feeeeeek', 'feeeeeek', 'ekkkkkkk'],
}

function svg(rows: string[]) {
  const rects = rows
    .flatMap((row, y) => [...row].map((ch, x) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${PALETTE[ch]}"/>`))
    .join('')
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges">${rects}</svg>`,
  )}")`
}

export const BLOCK_IMAGE: Record<Block, string> = {
  air: 'none',
  dirt: svg(PIXELS.dirt),
  grass: svg(PIXELS.grass),
  gold: svg(PIXELS.gold),
  diamond: svg(PIXELS.diamond),
}

export const BLOCK_NAME: Record<Block, string> = {
  air: '空気',
  dirt: '土',
  grass: '草',
  gold: '金',
  diamond: 'ダイヤ',
}

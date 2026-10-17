export type ZipEntry = {
  path: string
  data: Uint8Array
}

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  CRC_TABLE[n] = c >>> 0
}

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i += 1) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function dosTime(date = new Date()): { time: number; day: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

function u16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true)
}

function u32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true)
}

/** Stored (uncompressed) zip. Paths are UTF-8. */
export function zipStore(entries: ZipEntry[], now = new Date()): Uint8Array {
  const stamp = dosTime(now)
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.path.replaceAll('\\', '/'))
    const data = entry.data
    const crc = crc32(data)
    const local = new Uint8Array(30 + name.length)
    const view = new DataView(local.buffer)
    u32(view, 0, 0x04034b50)
    u16(view, 4, 20)
    u16(view, 6, 0x0800)
    u16(view, 8, 0)
    u16(view, 10, stamp.time)
    u16(view, 12, stamp.day)
    u32(view, 14, crc)
    u32(view, 18, data.length)
    u32(view, 22, data.length)
    u16(view, 26, name.length)
    u16(view, 28, 0)
    local.set(name, 30)
    locals.push(local, data)

    const central = new Uint8Array(46 + name.length)
    const centralView = new DataView(central.buffer)
    u32(centralView, 0, 0x02014b50)
    u16(centralView, 4, 20)
    u16(centralView, 6, 20)
    u16(centralView, 8, 0x0800)
    u16(centralView, 10, 0)
    u16(centralView, 12, stamp.time)
    u16(centralView, 14, stamp.day)
    u32(centralView, 16, crc)
    u32(centralView, 20, data.length)
    u32(centralView, 24, data.length)
    u16(centralView, 28, name.length)
    u16(centralView, 30, 0)
    u16(centralView, 32, 0)
    u16(centralView, 34, 0)
    u16(centralView, 36, 0)
    u32(centralView, 38, 0)
    u32(centralView, 42, offset)
    central.set(name, 46)
    centrals.push(central)
    offset += local.length + data.length
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  u32(endView, 0, 0x06054b50)
  u16(endView, 4, 0)
  u16(endView, 6, 0)
  u16(endView, 8, entries.length)
  u16(endView, 10, entries.length)
  u32(endView, 12, centralSize)
  u32(endView, 16, offset)
  u16(endView, 20, 0)

  const total = offset + centralSize + end.length
  const out = new Uint8Array(total)
  let cursor = 0
  for (const part of locals) {
    out.set(part, cursor)
    cursor += part.length
  }
  for (const part of centrals) {
    out.set(part, cursor)
    cursor += part.length
  }
  out.set(end, cursor)
  return out
}

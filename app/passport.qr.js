/*
 * PASSPORT — Sovereign Identity System
 * passport.qr.js — QR CODE GENERATOR
 *
 * Generates QR codes as inline SVG. No external calls. No dependencies.
 * Pure JS implementation of QR Code Model 2, versions 1–40.
 *
 * Single public function:
 *   makeQR(text, size) → SVG string (width=size, height=size)
 *
 * Usage:
 *   document.getElementById('qr').innerHTML = makeQR('https://...', 180)
 *
 * Based on the QR code standard (ISO 18004).
 * Adapted from qrcodegen by Project Nayuki (MIT License).
 * Sovereign fork — self-hosted, no CDN, no network call.
 */

// ─────────────────────────────────────────────────────────────────────────────
// GALOIS FIELD ARITHMETIC (GF 2^8, polynomial 0x11D)
// ─────────────────────────────────────────────────────────────────────────────

var QR = (() => {

  // Precompute GF(256) exp/log tables
  const GF_EXP = new Uint8Array(512)
  const GF_LOG = new Uint8Array(256)
  {
    let x = 1
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x
      GF_LOG[x] = i
      x = x << 1
      if (x & 0x100) x ^= 0x11D
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]
  }

  const gfMul = (a, b) => (!a || !b) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]

  // Reed-Solomon error correction codewords
  function rsGenerator(degree) {
    const g = new Uint8Array(degree + 1)
    g[degree] = 1
    let root = 1
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++)
        g[j] = gfMul(g[j], root) ^ (j > 0 ? g[j-1] : 0)
      g[degree] = gfMul(g[degree], root)
      root = GF_EXP[GF_LOG[root] + 1]
    }
    return g
  }

  function rsRemainder(data, generator) {
    const result = new Uint8Array(generator.length - 1)
    for (const b of data) {
      const factor = b ^ result[0]
      result.copyWithin(0, 1)
      result[result.length - 1] = 0
      for (let i = 0; i < result.length; i++)
        result[i] ^= gfMul(generator[i + 1], factor)
    }
    return result
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QR VERSION / CAPACITY TABLES
  // Error correction level M (15% recovery) — good balance for URLs
  // ─────────────────────────────────────────────────────────────────────────

  // [version]: [totalCodewords, dataCodewords, ecCodewordsPerBlock, blocks]
  const EC_M = [
    null,
    [26,  16,  10, 1], [44,  28,  16, 1], [70,  44,  26, 1],
    [100, 64,  18, 2], [134, 86,  24, 2], [172, 108, 16, 4],
    [196, 124, 18, 4], [242, 154, 22, 4], [292, 182, 22, 5],
    [346, 216, 26, 5], [404, 254, 30, 5], [466, 290, 22, 8],
    [532, 334, 22, 8], [581, 365, 24, 8], [655, 415, 24, 10],
    [733, 453, 28, 10],[815, 507, 28, 12],[901, 563, 26, 14],
    [991, 627, 26, 16],[1085,669, 26, 17],[1156,714, 26, 17],
    [1258,782, 28, 18],[1364,860, 28, 20],[1474,914, 28, 21],
    [1588,1000,28,23], [1706,1062,28,25],[1828,1128,28,26],
    [1921,1193,28,28],[2051,1267,28,29],[2185,1373,28,30],
    [2323,1455,28,33],[2465,1541,28,34],[2611,1631,28,35],
    [2761,1725,28,36],[2876,1812,28,37],[3034,1914,28,38],
    [3196,1992,28,40],[3362,2102,28,41],[3532,2216,28,43],
    [3706,2334,28,45]
  ]

  // Alignment pattern positions by version
  const ALIGN = [
    [], [], [6,18], [6,22], [6,26], [6,30], [6,34],
    [6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],
    [6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],
    [6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],
    [6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],
    [6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],
    [6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],
    [6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],
    [6,30,54,78,102,126,150],[6,24,50,76,102,128,154],
    [6,28,54,80,106,132,158],[6,32,58,84,110,136,162],
    [6,26,54,82,110,138,166],[6,30,58,86,114,142,170]
  ]

  // Format info strings for EC level M, masks 0–7
  const FORMAT_M = [
    0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0
  ]

  // ─────────────────────────────────────────────────────────────────────────
  // DATA ENCODING — byte mode (UTF-8)
  // ─────────────────────────────────────────────────────────────────────────

  function encodeData(text, version) {
    const bytes = new TextEncoder().encode(text)
    const cap   = EC_M[version][1]
    const bits  = []

    const push = (val, len) => {
      for (let i = len - 1; i >= 0; i--)
        bits.push((val >> i) & 1)
    }

    push(0b0100, 4)          // mode: byte
    push(bytes.length, version < 10 ? 8 : 16)
    for (const b of bytes) push(b, 8)

    // Terminator
    for (let i = 0; i < 4 && bits.length < cap * 8; i++) bits.push(0)
    while (bits.length % 8) bits.push(0)

    // Pad bytes
    const pads = [0xEC, 0x11]
    let pi = 0
    while (bits.length < cap * 8) push(pads[pi++ % 2], 8)

    // Bits to bytes
    const out = new Uint8Array(cap)
    for (let i = 0; i < cap; i++)
      out[i] = (bits[i*8]<<7)|(bits[i*8+1]<<6)|(bits[i*8+2]<<5)|
               (bits[i*8+3]<<4)|(bits[i*8+4]<<3)|(bits[i*8+5]<<2)|
               (bits[i*8+6]<<1)|bits[i*8+7]
    return out
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INTERLEAVE + RS BLOCKS
  // ─────────────────────────────────────────────────────────────────────────

  function buildCodewords(text, version) {
    const [total, dataCap, ecPer, numBlocks] = EC_M[version]
    const data  = encodeData(text, version)
    const gen   = rsGenerator(ecPer)

    const shortBlocks = numBlocks - (total % numBlocks || 0)
    const shortLen    = Math.floor(dataCap / numBlocks)

    const dataBlocks = [], ecBlocks = []
    let offset = 0
    for (let i = 0; i < numBlocks; i++) {
      const len = shortLen + (i >= shortBlocks ? 1 : 0)
      const blk = data.slice(offset, offset + len)
      dataBlocks.push(blk)
      ecBlocks.push(rsRemainder(blk, gen))
      offset += len
    }

    const out = []
    const maxLen = dataBlocks[dataBlocks.length - 1].length
    for (let i = 0; i < maxLen; i++)
      for (const b of dataBlocks) if (i < b.length) out.push(b[i])
    for (let i = 0; i < ecPer; i++)
      for (const b of ecBlocks) out.push(b[i])

    return out
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MATRIX BUILDING
  // ─────────────────────────────────────────────────────────────────────────

  function makeMatrix(version) {
    const size = version * 4 + 17
    const m    = Array.from({length: size}, () => new Int8Array(size).fill(-1))
    const set  = (r, c, v) => { if (r >= 0 && r < size && c >= 0 && c < size) m[r][c] = v }

    // Finder patterns + separators
    const finder = (row, col) => {
      for (let r = -1; r <= 7; r++)
        for (let c = -1; c <= 7; c++) {
          const v = r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
            (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
          set(row + r, col + c, v ? 1 : 0)
        }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0)

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      m[6][i] = m[i][6] = i % 2 === 0 ? 1 : 0
    }

    // Dark module
    m[size - 8][8] = 1

    // Alignment patterns
    const ap = ALIGN[version]
    for (const r of ap) for (const c of ap) {
      if (m[r][c] !== -1) continue
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++)
          set(r + dr, c + dc,
            dr === -2 || dr === 2 || dc === -2 || dc === 2 ? 1 :
            (dr === 0 && dc === 0) ? 1 : 0)
    }

    // Format info placeholders
    const fpos = [0,1,2,3,4,5,7,8,8,8,8,8,8,8]
    const fcol = [8,8,8,8,8,8,8,8,7,5,4,3,2,1,0]
    for (let i = 0; i < 15; i++) {
      set(fpos[i], 8, 0); set(8, fcol[i], 0)
    }
    set(size-8, 8, 0)

    return m
  }

  // Data placement zigzag
  function placeData(m, codewords, version) {
    const size = m.length
    let   idx  = 0, bit = 7

    const nextBit = () => {
      if (idx >= codewords.length) return 0
      const b = (codewords[idx] >> bit) & 1
      if (--bit < 0) { bit = 7; idx++ }
      return b
    }

    let upward = true
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let vert = 0; vert < size; vert++) {
        const row = upward ? size - 1 - vert : vert
        for (let lr = 0; lr < 2; lr++) {
          const col = right - lr
          if (m[row][col] === -1) m[row][col] = nextBit()
        }
      }
      upward = !upward
    }
  }

  // Mask pattern 2: (row // 2 + col // 3) % 2 == 0
  // Good default — balanced, avoids streaks
  function applyMask(m) {
    const size = m.length
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (m[r][c] !== -1 && (Math.floor(r/2) + Math.floor(c/3)) % 2 === 0)
          m[r][c] ^= 1
    return 2 // mask index
  }

  function writeFormat(m, mask, version) {
    const size = m.length
    const fmt  = FORMAT_M[mask]
    const bits = []
    for (let i = 14; i >= 0; i--) bits.push((fmt >> i) & 1)

    // Around top-left finder
    const positions = [
      [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
      [7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]
    ]
    positions.forEach(([r,c], i) => m[r][c] = bits[i])

    // Top-right + bottom-left copies
    for (let i = 0; i < 8; i++) m[size-1-i][8] = bits[i]
    for (let i = 8; i < 15; i++) m[8][size-15+i] = bits[i]
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VERSION SELECTION
  // ─────────────────────────────────────────────────────────────────────────

  function pickVersion(text) {
    const bytes = new TextEncoder().encode(text).length
    for (let v = 1; v <= 40; v++) {
      const cap = EC_M[v][1] - (v < 10 ? 3 : 4) // mode+length overhead
      if (bytes <= cap) return v
    }
    throw new Error('Text too long for QR')
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SVG OUTPUT
  // ─────────────────────────────────────────────────────────────────────────

  function toSVG(m, px) {
    const quiet = 4
    const size  = m.length
    const mod   = px / (size + quiet * 2)
    const off   = quiet * mod
    const rects = []

    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (m[r][c] === 1)
          rects.push(`<rect x="${off + c*mod}" y="${off + r*mod}" width="${mod}" height="${mod}"/>`)

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${px}" ` +
           `width="${px}" height="${px}" shape-rendering="crispEdges">` +
           `<rect width="${px}" height="${px}" fill="#fff"/>` +
           `<g fill="#000">${rects.join('')}</g></svg>`
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  function makeQR(text, size = 180) {
    const version   = pickVersion(text)
    const codewords = buildCodewords(text, version)
    const matrix    = makeMatrix(version)
    placeData(matrix, codewords, version)
    const mask = applyMask(matrix)
    writeFormat(matrix, mask, version)
    return toSVG(matrix, size)
  }

  return { makeQR }

})()

var makeQR = QR.makeQR

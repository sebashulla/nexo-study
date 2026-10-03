import http from 'node:http'
import https from 'node:https'
import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

export const fetchLimits = { bytes: 2 * 1024 * 1024, timeout: 10000, redirects: 3 }
export function sourceError(message, status = 400) { return Object.assign(new Error(message), { status, publicMessage: message }) }
const blocked = new BlockList()
for (const [base,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],
  ['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(base,bits,'ipv4')
for (const [base,bits] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]]) blocked.addSubnet(base,bits,'ipv6')
export function publicAddress(address) {
  const family = isIP(address)
  if (family === 4) return !blocked.check(address,'ipv4')
  // Allow only global unicast. This also denies IPv4-mapped, NAT64, link-local,
  // loopback, ULA, multicast and transition addresses without ambiguous decoding.
  if (family === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !blocked.check(address,'ipv6')
  return false
}
export function validateSourceUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw sourceError('El enlace debe tener hasta 2048 caracteres.')
  let url; try { url = new URL(value) } catch { throw sourceError('Pega un enlace HTTP o HTTPS válido.') }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'')
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.port && url.port !== (url.protocol === 'https:' ? '443' : '80') ||
    !host || !host.includes('.') && !isIP(host) || /(^|\.)(localhost|local|internal|invalid|test|example)$/.test(host) ||
    /^(metadata|instance-data)(\.|$)/.test(host) || isIP(host) && !publicAddress(host)) throw sourceError('Este enlace apunta a una dirección privada o a un protocolo no permitido.')
  url.hash = ''; return url
}
async function pinnedTarget(url, resolve, signal) {
  const hostname = url.hostname.replace(/^\[|\]$/g,'')
  const records = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await Promise.race([
    resolve(hostname,{ all: true, verbatim: true }), new Promise((_,reject) => signal.addEventListener('abort',() => reject(sourceError('El sitio tardó demasiado en responder.',408)),{ once: true }))])
  if (signal.aborted) throw sourceError('El sitio tardó demasiado en responder.',408)
  if (!Array.isArray(records) || !records.length || records.some(record => !publicAddress(record.address))) throw sourceError('Este enlace resuelve a una dirección privada o no permitida.')
  return { hostname, address: records[0].address, family: records[0].family }
}
function requestOnce(url, target, signal) {
  return new Promise((resolve,reject) => {
    const request = (url.protocol === 'https:' ? https : http).request(url, { method: 'GET', agent: false, signal,
      maxHeaderSize: 16384, headers: { Accept: 'text/html,application/json,text/plain;q=0.8', 'Accept-Encoding': 'identity', 'User-Agent': 'NexoStudy/0.9.7 source-reader' },
      // Pin the already validated DNS result. No second resolver lookup at connect.
      lookup: (_host,options,callback) => options?.all ? callback(null,[{ address: target.address, family: target.family }]) : callback(null,target.address,target.family),
    }, async response => {
      try {
        const remote = response.socket?.remoteAddress?.replace(/^::ffff:/,'')
        if (!remote || !publicAddress(remote) || remote.toLowerCase() !== target.address.toLowerCase()) throw sourceError('No pudimos verificar la dirección del sitio.')
        if ([301,302,303,307,308].includes(response.statusCode)) { response.destroy(); return resolve({ status: response.statusCode, headers: response.headers, body: Buffer.alloc(0) }) }
        if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') throw sourceError('Este sitio envía una compresión que no podemos leer de forma segura.')
        if (Number(response.headers['content-length']) > fetchLimits.bytes) throw sourceError('La página supera el límite de 2 MB.',413)
        const parts = []; let size = 0
        for await (const part of response) { size += part.length; if (size > fetchLimits.bytes) throw sourceError('La página supera el límite de 2 MB.',413); parts.push(part) }
        resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(parts) })
      } catch (error) { response.destroy(); reject(error) }
    })
    request.on('error',error => reject(error.name === 'AbortError' ? sourceError('El sitio tardó demasiado en responder.',408) : sourceError('No pudimos abrir este enlace. Revisa la dirección y reintenta.',502)))
    request.end()
  })
}
export async function safeSourceFetch(value, { resolve = lookup, transport = requestOnce } = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(),fetchLimits.timeout)
  let url = validateSourceUrl(value)
  try {
    for (let redirects=0;redirects<=fetchLimits.redirects;redirects++) {
      const target = await pinnedTarget(url,resolve,controller.signal)
      const response = await transport(url,target,controller.signal)
      if ([301,302,303,307,308].includes(response.status)) {
        if (redirects === fetchLimits.redirects || !response.headers.location) throw sourceError('El sitio redirige demasiadas veces.')
        url = validateSourceUrl(new URL(response.headers.location,url).href); continue
      }
      if (response.status < 200 || response.status >= 300) throw sourceError('El sitio no permite acceder a este contenido. Puedes pegar el texto manualmente.',422)
      if (response.body.length > fetchLimits.bytes) throw sourceError('La página supera el límite de 2 MB.',413)
      return { ...response, sourceUrl: url.href }
    }
  } finally { clearTimeout(timer) }
}

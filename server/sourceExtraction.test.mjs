import test from 'node:test'
import assert from 'node:assert/strict'
import { publicAddress, safeSourceFetch, validateSourceUrl } from './safeSourceFetch.mjs'
import { extractArticle, processRemoteSource, youtubeSource } from './sourceExtraction.mjs'

for (const address of ['127.0.0.1','10.0.0.2','172.16.1.1','172.31.1.1','192.168.0.1','169.254.169.254','100.64.1.1','0.0.0.0','224.0.0.1','198.18.0.1',
  '::1','::','::ffff:127.0.0.1','::ffff:8.8.8.8','fc00::1','fe80::1','64:ff9b::a00:1','2001:db8::1','2002:7f00:1::1','ff02::1']) {
  test(`SSRF rejects address ${address}`,() => assert.equal(publicAddress(address),false))
}
for (const value of ['http://localhost/x','http://127.1/','http://2130706433/','http://0x7f000001/','http://[::1]/','http://[::ffff:127.0.0.1]/','https://metadata.google.internal/',
  'file:///etc/passwd','ftp://example.com','https://user:pass@www.wikipedia.org/','https://www.wikipedia.org:8443/']) {
  test(`SSRF rejects URL ${value}`,() => assert.throws(() => validateSourceUrl(value)))
}
test('public IPs and normal HTTPS are accepted',() => {
  assert(publicAddress('8.8.8.8')); assert(publicAddress('2606:4700:4700::1111')); assert(publicAddress('2001:4860:4860::8888'))
  assert.equal(validateSourceUrl('https://www.wikipedia.org/a#section').href,'https://www.wikipedia.org/a')
})
test('mixed public/private DNS answers are rejected before transport',async () => {
  let calls = 0
  await assert.rejects(safeSourceFetch('https://article.org',{ resolve: async () => [{ address:'8.8.8.8',family:4 },{ address:'10.0.0.1',family:4 }],transport:async () => { calls++; } }),/privada/)
  assert.equal(calls,0)
})
test('redirect to private IP never reaches a second request',async () => {
  let calls = 0
  await assert.rejects(safeSourceFetch('https://article.org',{ resolve: async () => [{ address:'8.8.8.8',family:4 }],
    transport: async () => { calls++; return { status:302,headers:{ location:'http://169.254.169.254/latest/meta-data/' } } } }),/privada/)
  assert.equal(calls,1)
})
test('redirect resolves and validates a new hostname; connection receives only the pinned address',async () => {
  const hosts = [], targets = []
  const result = await safeSourceFetch('https://article.org',{ resolve:async host => { hosts.push(host); return [{ address:'8.8.8.8',family:4 }] },
    transport:async (url,target) => { targets.push(target); return targets.length === 1 ? { status:302,headers:{ location:'https://final.org/content' } } : { status:200,headers:{'content-type':'text/html'},body:Buffer.from('ok') } } })
  assert.deepEqual(hosts,['article.org','final.org']); assert(targets.every(target => target.address === '8.8.8.8')); assert.equal(result.sourceUrl,'https://final.org/content')
})
test('redirect loop has a finite request budget',async () => {
  let calls = 0
  await assert.rejects(safeSourceFetch('https://article.org',{ resolve:async () => [{address:'8.8.8.8',family:4}],transport:async () => { calls++; return {status:302,headers:{location:'/again'}} } }),/demasiadas/)
  assert.equal(calls,4)
})
test('response size is bounded even when content-length is absent',async () => {
  await assert.rejects(safeSourceFetch('https://article.org',{ resolve:async () => [{address:'8.8.8.8',family:4}],transport:async () => ({status:200,headers:{},body:Buffer.alloc(2097153)}) }),/2 MB/)
})
test('article parser strips active content/navigation and preserves semantic sections',async () => {
  const result = await extractArticle('<html><head><title>Campo eléctrico</title><style>MARKER_CSS</style></head><body><nav>MARKER_NAV</nav><article><h1>Campo eléctrico</h1><p>La fuerza eléctrica de Coulomb relaciona cargas y distancia entre ellas.</p><h2>Potencial</h2><p>La energía potencial depende del campo y de las cargas presentes.</p><script>MARKER_SCRIPT</script><p hidden>MARKER_HIDDEN</p><iframe src="http://localhost"/></article><footer>MARKER_FOOTER</footer></body></html>','https://article.org')
  assert.equal(result.title,'Campo eléctrico'); assert.equal(result.sections.length,2); assert.equal(result.sections[1].heading,'Potencial')
  assert.doesNotMatch(result.plainText,/MARKER_/)
})
test('valid web source returns a normalized document, not a raw proxy response',async () => {
  const result = await processRemoteSource({sourceType:'web',url:'https://article.org'},{fetchSource:async () => ({headers:{'content-type':'text/html; charset=utf-8'},body:Buffer.from('<main><h2>Movimiento</h2><p>La velocidad horizontal permanece constante cuando no actúa una fuerza horizontal.</p></main>'),sourceUrl:'https://article.org'})})
  assert(result.plainText.includes('velocidad horizontal')); assert.equal(result.sourceMetadata.units[0].page,1)
})
test('empty and binary web content produce legible errors',async () => {
  await assert.rejects(extractArticle('<body><script>hidden</script></body>','https://article.org'),/contenido suficiente/)
  await assert.rejects(processRemoteSource({sourceType:'web',url:'https://article.org'},{fetchSource:async () => ({headers:{'content-type':'application/pdf'},body:Buffer.from('pdf')})}),/Subir/)
})
test('YouTube canonicalizes only actual HTTPS video links',() => {
  assert.equal(youtubeSource('https://youtu.be/dQw4w9WgXcQ?t=30').videoId,'dQw4w9WgXcQ')
  assert.throws(() => youtubeSource('https://youtube.com.evil.org/watch?v=dQw4w9WgXcQ'))
})
test('YouTube uses an explicitly authorized transcript provider in the ingestion contract',async () => {
  const result = await processRemoteSource({sourceType:'youtube',url:'https://youtu.be/dQw4w9WgXcQ'}, { fetchSource:async () => ({body:Buffer.from('{"title":"Clase de física","author_name":"Profesor"}')}),
    transcriptProvider:async id => { assert.equal(id,'dQw4w9WgXcQ'); return [{timestamp:194,text:'Ley de Coulomb: fuerza eléctrica.'},{timestamp:762,text:'La componente horizontal de velocidad permanece.'}] } })
  assert.equal(result.sections[1].timestamp,762); assert.equal(result.partial,false); assert.equal(result.sourceMetadata.extraction,'authorized-transcript')
})
test('YouTube without authorized transcript remains honestly partial',async () => {
  const result = await processRemoteSource({sourceType:'youtube',url:'https://youtu.be/dQw4w9WgXcQ'},{fetchSource:async () => ({body:Buffer.from('{"title":"Clase"}')})})
  assert.equal(result.partial,true); assert.equal(result.plainText,''); assert.equal(result.warning,'No encontramos una transcripción disponible.')
})

test('article DOM complexity is bounded even within the byte limit',async () => {
  await assert.rejects(extractArticle('<main>'+('<span>x</span>'.repeat(26000))+'</main>','https://article.org'),/demasiados elementos/)
})
test('authorized transcript rejects out-of-order timestamps',async () => {
  await assert.rejects(processRemoteSource({sourceType:'youtube',url:'https://youtu.be/dQw4w9WgXcQ'}, {
    fetchSource:async () => ({body:Buffer.from('{"title":"Clase"}')}),
    transcriptProvider:async () => [{timestamp:194,text:'La fuerza eléctrica relaciona cargas y distancia.'},{timestamp:30,text:'La velocidad horizontal permanece constante.'}]
  }),/formato inválido/)
})

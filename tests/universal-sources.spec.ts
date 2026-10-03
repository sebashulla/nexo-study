import { expect, test, type Page } from '@playwright/test'
import { academicMock, login, png, user } from './helpers/academicMock'
import { docx, pptx } from './helpers/sourceFixtures'
import type { Course } from '../src/types'

const course: Course = { id:'course-sources',name:'Física universal',emoji:'⚛️',materials:[] }
async function prepare(page: Page) {
  const mock=await academicMock(page); mock.seedCourse(course)
  await page.route('**/api/ai/solve',route => route.fulfill({ json:{ text: JSON.stringify({ readable:true,text:'La fuerza eléctrica de Coulomb depende de las cargas y del cuadrado de la distancia.',cards:Array.from({length:4},() => ({front:'¿Qué relaciona la ley de Coulomb?',back:'La fuerza, las cargas y la distancia.',sourcePage:1,concept:'Campo eléctrico'})) }) } }))
  await login(page); return mock
}
async function add(page: Page, choice: string, from='/courses/course-sources') {
  await page.goto(from); await page.getByRole('button',{ name:/Agregar (tu primer )?material/ }).first().click()
  const dialog=page.getByRole('dialog',{ name:'Agregar material' }); await dialog.getByRole('button',{ name:new RegExp(`^${choice}`) }).click(); return dialog
}
async function pasted(page: Page, type='Pegar', title='Campo eléctrico') {
  const dialog=await add(page,type)
  await dialog.getByLabel(type==='Apuntes'?'Tus apuntes':'Contenido',{exact:true}).fill('# Campo eléctrico\nLa fuerza de Coulomb depende de las cargas y su separación.\n\n# Potencial\nLa energía potencial depende de la configuración de cargas.')
  await dialog.getByLabel('Título',{exact:true}).fill(title)
  await dialog.getByRole('button',{name:'Guardar y abrir material'}).click()
  await expect(page.locator('.document-reader')).toContainText('La fuerza de Coulomb')
}
for (const [name,mime,buffer,marker] of [
  ['fisica.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',docx,'La fuerza de Coulomb'],
  ['fisica.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation',pptx,'Movimiento parabólico'],
  ['fisica.txt','text/plain',Buffer.from('La fuerza de Coulomb depende de las cargas eléctricas y su separación.'),'La fuerza de Coulomb'],
  ['fisica.md','text/markdown',Buffer.from('# Campo eléctrico\nLa fuerza de Coulomb depende de las cargas eléctricas y su separación.'),'La fuerza de Coulomb'],
  ['fisica.png','image/png',png,'La fuerza eléctrica de Coulomb'],
] as const) test(`upload ${name} persists private original, normalized text and reloadable reader`,async ({page}) => {
  const mock=await prepare(page), dialog=await add(page,'Subir')
  await expect(dialog.getByRole('combobox',{name:'Curso',exact:true})).toHaveValue(course.id)
  await dialog.locator('input[type=file]').setInputFiles({name,mimeType:mime,buffer})
  await dialog.getByRole('button',{name:'Guardar y abrir material'}).click()
  await expect(page).toHaveURL(/\/workspace$/); await expect(page.locator('.universal-reader')).toContainText(marker)
  const mat=[...mock.rows.get('materials')!.values()][0]
  expect(mat.processing_status).toBe('ready'); expect(mat.storage_path).toContain(`${user.id}/${course.id}/`)
  expect((mat.pages as unknown[]).length).toBeGreaterThan(0); expect(mock.rows.get('material_chunks')!.size).toBeGreaterThan(0)
  expect(mock.uploaded).toHaveLength(1)
  await page.reload(); await expect(page.locator('.universal-reader')).toContainText(marker)
})
test('Home has no demo; destination is mandatory, inline course creation opens pasted source immediately',async ({page}) => {
  await academicMock(page); await login(page)
  await expect(page.locator('.home-page')).not.toContainText('Movimiento parabólico')
  const dialog=await add(page,'Pegar','/')
  await dialog.getByLabel('Contenido',{exact:true}).fill('Un primer material de física con contenido suficiente para estudiar.')
  await expect(dialog.getByLabel('Título',{exact:true})).toHaveValue('Un primer material de física con contenido suficiente para estudiar.')
  await expect(dialog.getByRole('button',{name:'Guardar y abrir material'})).toBeDisabled()
  await dialog.getByRole('button',{name:'+ Crear nuevo curso'}).click(); await dialog.getByLabel('Nombre del nuevo curso').fill('Mi primer curso')
  await dialog.getByRole('button',{name:'Guardar y abrir material'}).click()
  await expect(page).toHaveURL(/\/workspace$/); await expect(page.locator('.document-reader')).toContainText('Un primer material')
})
test('paste is editable; Library and Ctrl K find the source and open its section',async ({page}) => {
  await prepare(page); await pasted(page)
  await page.goto('/library'); await page.getByRole('textbox',{name:'Buscar en biblioteca'}).fill('Campo eléctrico')
  await page.locator('.library-entry').filter({hasText:'Campo eléctrico'}).first().click()
  await expect(page.locator('.document-reader')).toContainText('La fuerza de Coulomb')
  await page.keyboard.press('Control+k'); const search=page.getByRole('dialog',{name:'Buscar en Nexo Study'})
  await search.getByRole('combobox').fill('Campo eléctrico'); await search.locator('.global-search-results button').filter({hasText:'Campo eléctrico'}).first().click()
  await expect(page.locator('.document-reader')).toContainText('La fuerza de Coulomb')
})
test('web source uses authenticated backend; private/redirect error remains retryable without fake content',async ({page}) => {
  const mock=await prepare(page); let failure=true
  await page.route('**/api/sources/process',route => failure ? route.fulfill({status:400,json:{error:'La dirección privada no está permitida.'}}) : route.fulfill({json:{title:'Ley de Coulomb',plainText:'La fuerza eléctrica depende de las cargas y la distancia.',sections:[{page:1,heading:'Cargas',text:'La fuerza eléctrica depende de las cargas y la distancia.'}],sourceMetadata:{sourceUrl:'https://example.org/fisica',extraction:'article-html',units:[{page:1,heading:'Cargas'}]}}}))
  const dialog=await add(page,'Pegar'); await dialog.getByRole('button',{name:'Enlace',exact:true}).click(); await dialog.getByLabel('Enlace web').fill('https://example.org/fisica')
  await dialog.getByRole('button',{name:'Guardar y abrir material'}).click(); await expect(page.locator('.source-processing')).toContainText('dirección privada')
  expect([...mock.rows.get('materials')!.values()][0].processing_status).toBe('failed')
  failure=false; await page.getByRole('button',{name:'Reintentar',exact:true}).click(); await expect(page.locator('.document-reader')).toContainText('La fuerza eléctrica')
  expect([...mock.rows.get('materials')!.values()][0].source_type).toBe('web')
})
test('YouTube without transcript is partial, manual timestamped transcript persists and links to correct time',async ({page}) => {
  const mock=await prepare(page)
  await page.route('**/api/sources/process',route => route.fulfill({json:{title:'Física en video',plainText:'',sections:[],partial:true,warning:'No encontramos una transcripción disponible.',sourceMetadata:{videoId:'dQw4w9WgXcQ',sourceUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',extraction:'youtube-metadata-only'}}}))
  const dialog=await add(page,'YouTube'); await dialog.getByLabel('URL').fill('https://youtu.be/dQw4w9WgXcQ'); await dialog.getByRole('button',{name:'Guardar y abrir material'}).click()
  await expect(page.locator('.transcript-reader')).toContainText('No encontramos una transcripción disponible.')
  let mat=[...mock.rows.get('materials')!.values()][0]; expect(mat.analysis_status).toBe('partial'); expect(mat.content).toBe('')
  await page.getByLabel('Transcripción manual').fill('03:14 La fuerza de Coulomb relaciona cargas y distancia.\n12:42 La velocidad depende del movimiento.')
  await page.getByRole('button',{name:'Guardar transcripción'}).click(); await expect(page.locator('.document-reader')).toContainText('La fuerza de Coulomb')
  await expect(page.getByRole('link',{name:/Ver video en 3:14/})).toHaveAttribute('href',/t=194s$/)
  mat=[...mock.rows.get('materials')!.values()][0]; expect(mat.analysis_status).toBe('ready'); expect((mat.pages as {timestamp:number}[])[1].timestamp).toBe(762)
})
test('YouTube authorized-provider mock renders timestamped content; invalid video URL never submits',async ({page}) => {
  await prepare(page); let calls=0
  await page.route('**/api/sources/process',route => { calls++; return route.fulfill({json:{title:'Clase accesible',plainText:'La fuerza de Coulomb relaciona cargas y distancia.',sections:[{page:1,timestamp:194,text:'La fuerza de Coulomb relaciona cargas y distancia.'}],sourceMetadata:{sourceUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',videoId:'dQw4w9WgXcQ',units:[{page:1,timestamp:194}]}}}) })
  const dialog=await add(page,'YouTube'); await dialog.getByLabel('URL').fill('https://evil.example/watch?v=dQw4w9WgXcQ'); await dialog.getByRole('button',{name:'Guardar y abrir material'}).click(); await expect(dialog.getByRole('alert')).toBeVisible(); expect(calls).toBe(0)
  await dialog.getByLabel('URL').fill('https://youtu.be/dQw4w9WgXcQ'); await dialog.getByRole('button',{name:'Guardar y abrir material'}).click(); await expect(page.locator('.document-reader')).toContainText('La fuerza de Coulomb'); expect(calls).toBe(1)
})
test('upload failure preserves queued source, retry succeeds once; bad extension/MIME/bytes are rejected before upload',async ({page}) => {
  const mock=await prepare(page); mock.control.failUpload=1
  const dialog=await add(page,'Subir'); await dialog.locator('input[type=file]').setInputFiles({name:'bad.docx',mimeType:'application/pdf',buffer:docx}); await expect(dialog.getByRole('alert')).toBeVisible(); expect(mock.uploaded).toHaveLength(0)
  await dialog.locator('input[type=file]').setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('not a PNG')}); await expect(dialog.getByRole('alert')).toBeVisible()
  await dialog.locator('input[type=file]').setInputFiles({name:'fisica.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:docx}); await dialog.getByRole('button',{name:'Guardar y abrir material'}).click()
  await expect(page.locator('.source-processing')).toContainText('subir el original'); expect(mock.rows.get('materials')!.size).toBe(1)
  mock.control.failUpload=0; await page.getByRole('button',{name:'Reintentar',exact:true}).click(); await expect(page.locator('.document-reader')).toContainText('La fuerza de Coulomb'); expect(mock.rows.get('materials')!.size).toBe(1); expect(mock.uploaded).toHaveLength(1)
})
test('note autosave changes context, preserves revisions across refresh and invalidates prior resources',async ({page}) => {
  const mock=await prepare(page); await pasted(page,'Apuntes')
  await page.getByRole('button',{name:'Editar apunte'}).click(); await page.getByLabel('Contenido del apunte').fill('# Energía\nLa energía cinética es igual a la mitad de la masa por la velocidad al cuadrado.')
  await expect(page.locator('.reader-note-tools')).toContainText('Guardado'); await expect.poll(() => [...mock.rows.get('materials')!.values()][0].content).toContain('energía cinética')
  const mat=[...mock.rows.get('materials')!.values()][0]; expect((mat.metadata as {sourceRevision:number}).sourceRevision).toBe(3)
  expect([...mock.rows.get('study_artifacts')!.values()].some(a => a.status==='failed')).toBe(true)
  await page.reload(); await expect(page.locator('.document-reader')).toContainText('energía cinética')
})
test('archive excludes a source from course then Library restores it; cleanup failure retains metadata and retry removes original first',async ({page}) => {
  const mock=await prepare(page), dialog=await add(page,'Subir'); await dialog.locator('input[type=file]').setInputFiles({name:'fisica.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:docx}); await dialog.getByRole('button',{name:'Guardar y abrir material'}).click(); await expect(page.locator('.document-reader')).toContainText('La fuerza de Coulomb')
  const id=String([...mock.rows.get('materials')!.values()][0].id)
  await page.goto(`/courses/${course.id}`); await page.getByRole('button',{name:'Opciones de fisica'}).click(); await page.getByRole('menuitem',{name:'Archivar',exact:true}).click(); await expect(page.locator('.material-card-frame')).toHaveCount(0)
  await page.goto('/library'); await page.getByLabel('Ver materiales archivados').check(); await page.locator('.library-entry').filter({hasText:'fisica'}).first().click(); await page.getByRole('button',{name:'Restaurar material'}).click()
  await expect(page.getByRole('button',{name:'Restaurar material'})).toHaveCount(0)
  await page.goto(`/courses/${course.id}`); mock.control.failRemoval=true
  await page.getByRole('button',{name:'Opciones de fisica'}).click(); await page.getByRole('menuitem',{name:'Eliminar',exact:true}).click(); await page.getByRole('button',{name:'Eliminar definitivamente'}).click(); await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible(); expect(mock.rows.get('materials')!.has(id)).toBe(true)
  await page.getByRole('button',{name:'Cerrar diálogo'}).click(); mock.control.failRemoval=false; await page.getByRole('button',{name:'Reintentar limpieza'}).click(); await expect.poll(() => mock.rows.get('materials')!.size).toBe(0); expect(mock.removed).toHaveLength(1)
  await page.reload(); expect(mock.rows.get('materials')!.size).toBe(0)
})
test('saving a Nexo answer as note is explicit and note feeds flashcards without another material model',async ({page}) => {
  const mock=await prepare(page); await pasted(page,'Apuntes')
  await page.goto(`/courses/${course.id}/ai`); await page.getByRole('textbox',{name:'Preguntar sobre el curso'}).fill('¿Qué es el campo eléctrico?'); await page.getByRole('button',{name:'Preguntar a Nexo'}).click(); await expect(page.getByRole('button',{name:'Guardar como apunte'})).toBeVisible(); expect(mock.rows.get('materials')!.size).toBe(1)
  await page.getByRole('button',{name:'Guardar como apunte'}).click(); const dialog=page.getByRole('dialog',{name:'Agregar material'}); await expect(dialog.getByRole('combobox',{name:'Curso',exact:true})).toHaveValue(course.id); await dialog.getByRole('button',{name:'Guardar y abrir material'}).click(); await expect(page.locator('.note-reader')).toBeVisible(); expect(mock.rows.get('materials')!.size).toBe(2)
  if(page.viewportSize()!.width<=700) await page.getByRole('tab',{name:'Nexo IA',exact:true}).click()
  const practice=page.locator('.material-content-section').filter({has:page.locator('summary').filter({hasText:/^Practicar$/})}); if(await practice.getAttribute('open')===null) await practice.locator('summary').click(); await page.getByRole('button',{name:/^Flashcards/}).click(); await page.getByRole('button',{name:'Generar flashcards con Nexo'}).click(); await expect(page.locator('.flashcard')).toContainText('¿Qué relaciona la ley de Coulomb?')
})

test('DOCX practice uses section citations; an incorrect answer immediately updates graph and Home',async ({page}) => {
  const mock=await prepare(page), dialog=await add(page,'Subir')
  await dialog.locator('input[type=file]').setInputFiles({name:'fisica.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:docx})
  await dialog.getByRole('button',{name:'Guardar y abrir material'}).click(); await expect(page.locator('.document-reader')).toContainText('La fuerza de Coulomb')
  let prompt=''
  await page.route('**/api/ai/solve',route => { prompt=route.request().postDataJSON().question; return route.fulfill({json:{text:JSON.stringify({questions:Array.from({length:4},(_,index) => ({question:`¿De qué depende la fuerza eléctrica? ${index}`,options:['Cargas y distancia','Solo masa','Temperatura','Color'],correctOption:0,explanation:'La ley de Coulomb relaciona las cargas y la distancia.',concept:'Campo eléctrico',sourcePage:1}))})}}) })
  const id=String([...mock.rows.get('materials')!.values()][0].id)
  await page.goto(`/courses/${course.id}/materials/${id}/study/multiple-choice`)
  await page.getByRole('button',{name:'Generar preguntas de opción múltiple con Nexo'}).click(); await expect(page.locator('.quiz-card')).toHaveCount(page.viewportSize()!.width<=700?1:4)
  expect(prompt).toContain('sección «Campo eléctrico»'); expect(prompt.length).toBeLessThan(16000)
  await page.locator('.options button').nth(1).click(); await expect(page.locator('.feedback')).toContainText('Revisa esta idea')
  await expect.poll(() => mock.rows.get('concept_evidence')?.size).toBe(1); await expect.poll(() => [...mock.rows.get('learning_state')!.values()][0].attempts).toBe(1)
  await page.getByRole('button',{name:'Fuente: sección «Campo eléctrico»'}).click(); await expect(page.locator('.document-reader')).toContainText('La fuerza de Coulomb')
  await page.goto('/'); await expect(page.locator('.home-today-actions')).toContainText('Campo eléctrico'); await expect(page.locator('.home-today-actions')).toContainText('reforzar')
})

for(const [type,label] of [['pptx','Diapositiva 2'],['youtube','YouTube · 12:42']] as const) test(`${type} artifact citation opens the exact source unit`,async ({page}) => {
  const mock=await academicMock(page)
  const id=`cite-${type}`,createdAt='2026-10-01T12:00:00Z'
  const pages=[{page:1,heading:'Introducción',text:'La fuerza eléctrica depende de las cargas.',timestamp:type==='youtube'?30:undefined},{page:2,heading:'Potencial',text:'MARCADOR_UNIDAD_DOS: la energía potencial depende de la configuración de cargas.',timestamp:type==='youtube'?762:undefined}]
  mock.seedCourse({...course,materials:[{id,title:'Física',sourceType:type,text:pages.map(unit => unit.text).join('\n'),pages,createdAt,processingStatus:'ready',analysisStatus:'ready',sourceMetadata:{sourceUrl:type==='youtube'?'https://www.youtube.com/watch?v=dQw4w9WgXcQ':undefined,units:pages.map(({page,heading,timestamp})=>({page,heading,timestamp}))},artifacts:[{id:'20000000-0000-4000-8000-000000000003',type:'flashcards',status:'ready',version:1,sourceMaterialId:id,createdAt,updatedAt:createdAt,payload:{cards:Array.from({length:4},()=>({front:'¿Qué determina el potencial?',back:'La configuración de cargas.',sourcePage:2}))}}]}]})
  mock.rows.set('material_topics',new Map([['remote-topic',{id:'remote-topic',user_id:user.id,course_id:course.id,material_id:id,title:'Potencial remoto',page_start:2}]]))
  await login(page)
  await page.keyboard.press('Control+k');const search=page.getByRole('dialog',{name:'Buscar en Nexo Study'})
  await search.getByRole('combobox').fill('Potencial remoto')
  await expect(search.getByRole('option',{name:new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))})).toBeVisible()
  await search.getByRole('option',{name:/Potencial remoto/}).click();await expect(page.locator('.reader-body')).toContainText('MARCADOR_UNIDAD_DOS')
  await page.goto(`/courses/${course.id}/library`)
  await page.getByRole('textbox',{name:'Buscar en biblioteca',exact:true}).fill('Potencial remoto')
  await page.locator('.library-entry').filter({hasText:'Potencial remoto'}).click()
  await expect(page.locator('.reader-body')).toContainText('MARCADOR_UNIDAD_DOS')
  await page.goto(`/courses/${course.id}/materials/${id}/study/flashcards`)
  await page.getByRole('button',{name:`Fuente: ${label}`,exact:true}).click()
  await expect(page.locator('.reader-body')).toContainText('MARCADOR_UNIDAD_DOS')
  if(type==='youtube') await expect(page.locator('.transcript-reader .reader-origin').getByRole('link')).toHaveAttribute('href',/t=762/)
})

test('DOCX flashcards reject an invented citation then retry with the actual section',async ({page}) => {
  const mock=await prepare(page),dialog=await add(page,'Subir')
  await dialog.locator('input[type=file]').setInputFiles({name:'fisica.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:docx})
  await dialog.getByRole('button',{name:'Guardar y abrir material'}).click();await expect(page.locator('.document-reader')).toContainText('La fuerza de Coulomb')
  let invented=true
  await page.route('**/api/ai/solve',route=>route.fulfill({json:{text:JSON.stringify({cards:Array.from({length:4},()=>({front:'¿De qué depende la fuerza?',back:'De las cargas y distancia.',sourcePage:invented?999:1,concept:'Campo eléctrico'}))})}}))
  const id=String([...mock.rows.get('materials')!.values()][0].id)
  await page.goto(`/courses/${course.id}/materials/${id}/study/flashcards`)
  await page.getByRole('button',{name:'Generar flashcards con Nexo'}).click()
  await expect(page.getByRole('heading',{name:'No pudimos preparar flashcards'})).toBeVisible()
  await expect(page.locator('.flashcard')).toHaveCount(0)
  expect([...mock.rows.get('study_artifacts')!.values()].some(row=>row.type==='flashcards'&&row.status==='ready')).toBe(false)
  invented=false;await page.getByRole('button',{name:'Reintentar',exact:true}).click()
  await expect(page.locator('.flashcard')).toContainText('¿De qué depende la fuerza?')
  await page.getByRole('button',{name:'Fuente: sección «Campo eléctrico»',exact:true}).click()
  await expect(page.locator('.reader-body')).toContainText('La fuerza de Coulomb')
})

test('interrupted remote source can retry after hydration without staying in processing forever',async ({page}) => {
  const mock=await academicMock(page),id='interrupted-source'
  mock.seedCourse({...course,materials:[{id,title:'Apunte interrumpido',sourceType:'note',text:'La fuerza de Coulomb depende de las cargas y su separación.',createdAt:'2026-10-01T12:00:00Z',processingStatus:'queued',analysisStatus:'not_started',sourceRevision:1}]})
  await login(page);await page.goto(`/courses/${course.id}/materials/${id}/workspace`)
  await expect(page.locator('.source-processing')).toContainText('La preparación se interrumpió')
  await page.getByRole('button',{name:'Reintentar',exact:true}).click()
  await expect(page.locator('.reader-body')).toContainText('La fuerza de Coulomb')
  expect(mock.rows.get('materials')!.size).toBe(1)
  await expect.poll(()=>mock.rows.get('materials')!.get(id)!.processing_status).toBe('ready')
})

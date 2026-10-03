import { expect, test } from '@playwright/test'
import { academicMock, login } from './helpers/academicMock'
import type { Course, SourceType } from '../src/types'

const types: SourceType[]=['docx','pptx','text','web','youtube','image','note']
const text='La fuerza de Coulomb depende de las cargas y del cuadrado de la distancia. El campo eléctrico permite describir la fuerza sobre una carga de prueba.'
const course: Course={id:'universal-qa',name:'Física',emoji:'⚛️',materials:types.map((type,index) => ({id:`source-${type}`,title:`${type==='note'?'Mis apuntes':type==='youtube'?'Clase de física':type==='pptx'?'Diapositivas de física':'Campo eléctrico'} · ${type}`,sourceType:type,text,createdAt:`2026-10-01T12:0${index}:00Z`,processingStatus:'ready',analysisStatus:'ready',sourceRevision:2,storagePath:type==='image'?'12345678-1234-4234-8234-123456789012/universal-qa/source-image/original.png':undefined,
  sourceMetadata:{sourceUrl:type==='youtube'?'https://www.youtube.com/watch?v=dQw4w9WgXcQ':type==='web'?'https://example.org/fisica':undefined,units:[{page:1,heading:'Campo eléctrico',timestamp:type==='youtube'?194:undefined},{page:2,heading:'Potencial',timestamp:type==='youtube'?762:undefined}]},
  pages:[{page:1,heading:'Campo eléctrico',timestamp:type==='youtube'?194:undefined,text,blocks:[{kind:'paragraph',text}]},{page:2,heading:'Potencial',timestamp:type==='youtube'?762:undefined,text:'La energía potencial eléctrica depende de la configuración de cargas.'}],chunks:[{id:`00000000-0000-4000-8000-00000000000${index}`,materialId:`source-${type}`,pageStart:1,pageEnd:1,text,keywords:['Coulomb']}] }))}

for (const [width,height] of [[320,640],[360,800],[375,667],[390,844],[393,852],[430,932],[768,1024],[1366,768],[1440,900],[1920,1080]]) test(`universal source surfaces ${width}x${height}`,async ({page},info) => {
  test.skip(info.project.name!=='desktop','Viewport matrix runs once; source interaction suite covers touch projects.')
  test.setTimeout(90000); await page.setViewportSize({width,height}); const mock=await academicMock(page); mock.seedCourse(course); await login(page)
  const errors: string[]=[]; page.on('pageerror',error => errors.push(error.message))
  const shot=async (name: string) => {
    await page.evaluate(() => scrollTo(0,0)); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({path:info.outputPath(`${name}-${width}.png`),animations:'disabled'})
  }
  await shot('01-home')
  await page.getByRole('button',{name:/Agregar (tu primer )?material/}).first().click(); const dialog=page.getByRole('dialog',{name:'Agregar material'}); await expect(dialog).toBeVisible(); await shot('02-add-source')
  if (width<=700) { const box=await dialog.boundingBox(); expect(box!.x).toBe(0); expect(box!.width).toBe(width); expect(Math.abs(box!.y+box!.height-height)).toBeLessThan(3) }
  await page.keyboard.press('Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
  await page.goto('/library'); await expect(page.locator('.library-v2')).toBeVisible(); if(width<=700) { await page.getByRole('button',{name:/Filtros/}).click(); await page.getByRole('button',{name:'Documentos',exact:true}).click() } else await page.getByRole('button',{name:'Documentos',exact:true}).click(); await shot('03-library')
  await page.goto('/courses/universal-qa'); await expect(page.locator('.course-overview')).toBeVisible(); await shot('04-course')
  for (const [type,name] of [['docx','05-document'],['pptx','06-slides'],['youtube','07-transcript'],['image','08-image'],['note','09-note']] as const) {
    await page.goto(`/courses/universal-qa/materials/source-${type}/workspace`); await expect(page.locator('.document-reader')).toContainText('La fuerza de Coulomb'); await shot(name)
  }
  if(width<=700) await page.getByRole('tab',{name:'Nexo IA',exact:true}).click()
  await expect(page.locator('.material-nexo-panel')).toBeVisible(); await shot('10-nexo')
  expect(errors).toEqual([])
})

test('AddSource labels, keyboard file input, focus trap, Escape and focus return work at 375',async ({page}) => {
  await page.setViewportSize({width:375,height:667}); const mock=await academicMock(page); mock.seedCourse(course); await login(page)
  const trigger=page.getByRole('button',{name:/Agregar (tu primer )?material/}).first(); await trigger.click(); const dialog=page.getByRole('dialog',{name:'Agregar material'})
  await dialog.getByRole('button',{name:/^Subir/}).click(); await expect(dialog.locator('input[type=file]')).toHaveAccessibleName('Elige un archivo o arrástralo aquí')
  for(let i=0;i<16;i++) { await page.keyboard.press('Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true) }
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused()
})

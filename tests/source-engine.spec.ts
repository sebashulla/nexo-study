import { expect, test } from '@playwright/test'
import { docx, docxParts, officeZip, pptx } from './helpers/sourceFixtures'

test('native Office extraction preserves DOCX headings lists tables and ordered PPTX slides with speaker notes',async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async ({ word, slides }) => {
    // @ts-expect-error Vite source module in browser
    const { extractOffice } = await import('/src/lib/officeExtraction.ts')
    const a = await extractOffice(new File([new Uint8Array(word)],'fisica.docx'),'docx','Física')
    const b = await extractOffice(new File([new Uint8Array(slides)],'fisica.pptx'),'pptx','Física')
    return { a,b }
  },{ word:[...docx],slides:[...pptx] })
  expect(result.a.sections).toHaveLength(2); expect(result.a.sections[0].heading).toBe('Campo eléctrico')
  expect(result.a.sections[0].blocks.map((b: {kind:string}) => b.kind)).toEqual(['heading','paragraph','list','table'])
  expect(result.a.plainText).toContain('Fuerza | Newton')
  expect(result.b.sections).toHaveLength(2); expect(result.b.sections[0].heading).toBe('Movimiento parabólico')
  expect(result.b.sections[0].text).toContain('Notas del presentador'); expect(result.b.sections[1].text).toContain('vértice')
})
test('Office rejects corrupt ZIP, wrong format, entity declarations and expansion bombs',async ({ page }) => {
  await page.goto('/')
  const bomb = officeZip({ ...docxParts,'word/document.xml':'<w:document>'+(' '.repeat(5*1024*1024))+'</w:document>' })
  const entity = officeZip({ ...docxParts,'word/document.xml':'<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///secret">]><foo>&x;</foo>' })
  const result = await page.evaluate(async values => {
    // @ts-expect-error Vite source module in browser
    const { extractOffice } = await import('/src/lib/officeExtraction.ts')
    const errors: string[]=[]
    for (const value of values) { try { await extractOffice(new File([new Uint8Array(value)],'bad.docx'),'docx','Bad'); errors.push('NOT_REJECTED') } catch (error) { errors.push((error as Error).message) } }
    return errors
  },[[1,2,3],[...pptx],[...entity],[...bomb]])
  expect(result.every((value: string) => value !== 'NOT_REJECTED')).toBe(true)
  expect(result[2]).toContain('XML'); expect(result[3]).toContain('descomprimido')
})

test('artifact references reject invented units and normalization bounds Office headings',async ({page}) => {
  await page.goto('/')
  const result=await page.evaluate(async () => {
    // @ts-expect-error Vite source module in browser
    const {validateArtifactReferences}=await import('/src/lib/artifactPrompts.ts')
    // @ts-expect-error Vite source module in browser
    const {normalizedDocument}=await import('/src/lib/sourceModel.ts')
    const rejected=[]
    for(const unit of [999,0,1.5,'2']) {
      try {validateArtifactReferences({cards:[{sourcePage:unit}]},new Set([1,2]));rejected.push(false)} catch {rejected.push(true)}
    }
    validateArtifactReferences({questions:[{sourcePage:2},{}]},new Set([1,2]))
    return {rejected,heading:normalizedDocument('Office',[{page:1,text:'Contenido',heading:'A'.repeat(300)}],{}).sections[0].heading.length}
  })
  expect(result.rejected).toEqual([true,true,true,true]);expect(result.heading).toBe(180)
})

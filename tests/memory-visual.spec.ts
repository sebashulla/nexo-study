import { openGlobalSearch } from './helpers/navigation'
import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { academicMock, login } from './helpers/academicMock'
import { graphCourse } from './helpers/learningFixture'

const sizes = [[320,640],[360,800],[375,667],[390,844],[393,852],[430,932],[768,1024],[1366,768],[1440,900],[1920,1080]]
for (const [width,height] of sizes) test(`V096 visual matrix ${width}x${height}`, async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'The viewport matrix runs once in Chromium; browser behavior is covered by the functional suite.')
  test.setTimeout(90000)
  await page.setViewportSize({width,height}); await page.emulateMedia({reducedMotion:'reduce'})
  const mock = await academicMock(page); mock.seedCourse(graphCourse)
  await page.route('**/api/ai/solve', route => route.fulfill({json:{text:'La componente horizontal permanece en el vértice. La componente vertical es cero, pero la rapidez no es cero.'}}))
  await login(page)
  await mkdir('test-results/v096-visual',{recursive:true})
  const capture = async (name: string) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`).toBe(true)
    await page.screenshot({path:`test-results/v096-visual/${width}x${height}-${name}.png`,animations:'disabled'})
  }
  await page.goto('/courses/course-graph/materials/material-graph/study/multiple-choice')
  await page.locator('.quiz-card .options button').nth(1).click()
  await expect.poll(() => mock.rows.get('concept_evidence')?.size).toBe(1)
  await page.goto('/'); await expect(page.locator('.home-today-actions')).toContainText('Movimiento parabólico'); await capture('01-home')
  await page.goto('/resolver'); await expect(page.getByRole('textbox',{name:'Escribe tu pregunta'})).toBeVisible(); await capture('02-resolver')
  await page.getByRole('textbox',{name:'Escribe tu pregunta'}).fill('¿Por qué la rapidez no es cero en el vértice?')
  await page.getByRole('button',{name:'Enviar pregunta'}).click(); await expect(page.locator('.solver-assistant-bubble')).toContainText('horizontal'); await capture('03-chat')
  await page.getByRole('button',{name:'Mostrar conversaciones'}).click()
  await expect(page.locator('.conversation-history-row')).toHaveCount(1); await capture('04-history')
  await page.keyboard.press('Escape')
  await page.goto('/courses/course-graph/ai')
  await page.getByRole('textbox',{name:'Preguntar sobre el curso'}).fill('¿Cómo se relacionan las componentes de Movimiento parabólico?')
  await page.getByRole('button',{name:'Preguntar a Nexo'}).click(); await expect(page.locator('.material-chat-answer')).toContainText('horizontal')
  if (width <= 700) {
    await expect(page.locator('.material-chat-answer p').first()).toBeInViewport()
    await expect(page.getByRole('button',{name:'Preguntar a Nexo',exact:true})).toBeInViewport()
    await expect.poll(() => page.locator('.course-ai-thread').evaluate(element => element.clientHeight)).toBeGreaterThanOrEqual(120)
  }
  await capture('05-course-ai')
  await page.goto('/courses/course-graph/materials/material-graph/workspace')
  if(width<=700) await page.getByRole('tab',{name:'Nexo IA',exact:true}).click()
  await page.getByRole('tab',{name:'Chat',exact:true}).click()
  await page.getByRole('textbox',{name:'Preguntar sobre este material'}).fill('¿Cómo cambia la velocidad en Movimiento parabólico?')
  await page.getByRole('button',{name:'Preguntar a Nexo'}).click(); await expect(page.locator('.material-chat-answer')).toContainText('horizontal')
  await capture('06-material-ai')
  await page.goto('/progress'); await expect(page.locator('.concept-state-list')).toContainText('Movimiento parabólico'); await capture('07-progress')
  await page.locator('.concept-state-list button').filter({hasText:'Movimiento parabólico'}).click()
  await expect(page.locator('.concept-evidence-list')).toContainText('Quiz'); await capture('08-concept')
  await page.keyboard.press('Escape')
  await openGlobalSearch(page); await page.getByRole('combobox').fill('Movimiento parabólico')
  await expect(page.getByText('Buscando…',{exact:true})).toHaveCount(0); await expect(page.getByRole('option').filter({hasText:'¿Cómo cambia la velocidad'})).toBeVisible(); await capture('09-search'); await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'Mi cuenta',exact:true}).click(); await page.getByRole('menuitem',{name:'Mi perfil'}).click()
  await page.getByRole('button',{name:'Ver memoria'}).click(); await expect(page.getByRole('dialog',{name:'Datos y memoria de Nexo'})).toContainText('Movimiento parabólico'); await capture('10-memory')
})

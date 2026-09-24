import { expect, test, type Page } from '@playwright/test'

const user = { id: '12345678-1234-4234-8234-123456789012', aud: 'authenticated', role: 'authenticated', email: 'estudiante@example.com', user_metadata: { full_name: 'Estudiante Nexo' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user }

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/v1/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/user') ? user : session }))
  await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }))
})

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('UnaClave123!')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible()
}

test('Corrector sends the selected work type and renders the review', async ({ page }) => {
  let payload: Record<string, unknown> | undefined
  await page.route('**/api/ai/solve', route => {
    payload = route.request().postDataJSON()
    return route.fulfill({ json: { text: 'La estructura es clara. Añade una fuente para la conclusión.' } })
  })
  await login(page)
  await page.goto('/corrector')
  await page.getByLabel('Tipo de trabajo').selectOption('Ensayo')
  await page.getByRole('textbox', { name: 'Texto del trabajo' }).fill('Mi ensayo tiene una conclusión que necesita evidencia.')
  await page.getByRole('button', { name: 'Revisar con Nexo' }).click()
  await expect(page.locator('.review-answer')).toContainText('Añade una fuente')
  expect(payload).toMatchObject({ task: 'review', category: 'Ensayo', deep: false, question: 'Mi ensayo tiene una conclusión que necesita evidencia.' })
})

test('Resolver preserves reinforced reasoning in the request', async ({ page }) => {
  let payload: Record<string, unknown> | undefined
  await page.route('**/api/ai/solve', route => {
    payload = route.request().postDataJSON()
    return route.fulfill({ json: { text: 'Primero identificamos los datos; luego verificamos el resultado.' } })
  })
  await login(page)
  await page.goto('/resolver')
  await page.locator('.deep-toggle').click()
  await expect(page.getByRole('checkbox', { name: 'Razonamiento reforzado' })).toBeChecked()
  await page.getByRole('textbox', { name: 'Escribe tu pregunta' }).fill('Explica este procedimiento')
  await page.getByRole('button', { name: 'Enviar pregunta' }).click()
  await expect(page.locator('.solver-assistant-bubble')).toContainText('verificamos el resultado')
  expect(payload).toMatchObject({ task: 'solve', deep: true, question: 'Explica este procedimiento' })
})

test('Resolver sends multiple image attachments together', async ({ page }) => {
  let payload: { images?: unknown[] } | undefined
  await page.route('**/api/ai/solve', route => {
    payload = route.request().postDataJSON()
    return route.fulfill({ json: { text: 'Ambas imágenes contienen información para comparar.' } })
  })
  await login(page)
  await page.goto('/resolver')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB3sAAAAASUVORK5CYII=', 'base64')
  await page.locator('.solver-composer input[type="file"]').setInputFiles([
    { name: 'pagina-1.png', mimeType: 'image/png', buffer: png },
    { name: 'pagina-2.png', mimeType: 'image/png', buffer: png },
  ])
  await expect(page.locator('.solver-attachments img')).toHaveCount(2)
  await page.getByRole('textbox', { name: 'Escribe tu pregunta' }).fill('Compara las dos imágenes')
  await page.getByRole('button', { name: 'Enviar pregunta' }).click()
  await expect(page.locator('.solver-assistant-bubble')).toContainText('Ambas imágenes')
  expect(payload?.images).toHaveLength(2)
})

function onePagePdf() {
  const stream = 'BT /F1 16 Tf 72 700 Td (La celula contiene un nucleo) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n` })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf)
}

test('a real PDF opens its workspace, contextual Nexo and study mode', async ({ page }) => {
  let questionPayload: Record<string, unknown> | undefined
  await page.route('**/api/ai/solve', route => {
    const payload = route.request().postDataJSON()
    if (payload.task === 'artifact') return route.fulfill({ json: { text: JSON.stringify({ cards: Array.from({ length: 6 }, (_, index) => ({ front: `¿Qué contiene la célula? ${index + 1}`, back: 'Un núcleo.', sourcePage: 1, concept: 'célula', difficulty: 'easy' })) }) } })
    questionPayload = payload
    return route.fulfill({ json: { text: 'El núcleo es parte de la célula según la página 1.' } })
  })
  await login(page)
  await page.goto('/courses')
  await page.getByRole('button', { name: /Nuevo curso/ }).first().click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nombre del curso').fill('Biología PDF')
  await dialog.getByRole('button', { name: 'Crear curso' }).click()
  await page.getByRole('button', { name: /Agregar material/ }).first().click()
  dialog = page.getByRole('dialog')
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'celula.pdf', mimeType: 'application/pdf', buffer: onePagePdf() })
  await expect(page).toHaveURL(/\/materials\/[^/]+\/workspace$/)
  await expect(page.getByRole('heading', { name: 'celula' }).first()).toBeVisible()
  await expect(page.locator('.material-document iframe')).toBeVisible()
  if (page.viewportSize()!.width > 700) {
    await page.locator('.material-layout-menu summary').click()
    await page.getByRole('group', { name: 'Proporción entre documento y Nexo' }).getByRole('button', { name: '70/30' }).click()
    await page.locator('.material-layout-menu summary').click()
    await expect(page.getByRole('button', { name: '70/30' })).toHaveAttribute('aria-pressed', 'true')
    await page.locator('.material-layout-menu summary').click()
  }
  if (page.viewportSize()!.width <= 700) await page.getByRole('tab', { name: 'Nexo IA' }).click()
  await expect(page.locator('.material-topic')).toContainText('La celula contiene un nucleo')
  await expect(page.locator('.material-minimum-summary')).toContainText('La celula contiene un nucleo')
  await page.locator('.material-nexo-head').getByRole('button', { name: 'Chat' }).click()
  await page.getByRole('textbox', { name: 'Preguntar sobre este material' }).fill('¿Qué contiene la célula?')
  await page.getByRole('button', { name: 'Preguntar a Nexo' }).click()
  await expect(page.locator('.material-chat-answer')).toContainText('página 1')
  expect(questionPayload?.courseId).toBeTruthy()
  expect(questionPayload?.materialId).toBeTruthy()
  expect(questionPayload?.context).toContain('página 1')
  await page.locator('.material-nexo-head').getByRole('button', { name: 'Contenido' }).click()
  await page.getByRole('button', { name: /Flashcards/ }).last().click()
  await expect(page).toHaveURL(/\/study\/flashcards$/)
  await page.getByRole('button', { name: 'Generar flashcards con Nexo' }).click()
  await expect(page.locator('.flashcard')).toBeVisible()
  const courseId = page.url().match(/\/courses\/([^/]+)/)?.[1]
  expect(courseId).toBeTruthy()
  await page.goto(`/courses/${courseId}/library`)
  await expect(page.locator('.course-artifact-group')).toContainText('Resumen')
  await expect(page.locator('.course-artifact-group')).toContainText('Flashcards')
  await page.locator('.course-artifact-group').getByRole('button', { name: 'Resumen' }).click()
  await expect(page.locator('.study-content .material-minimum-summary')).toContainText('La celula contiene un nucleo')
  await page.goto(`/courses/${courseId}/library`)
  await page.locator('.course-artifact-group').getByRole('button', { name: 'Flashcards' }).click()
  await expect(page.locator('.flashcard')).toBeVisible()
})

test('feedback can be submitted from the compact modal', async ({ page }) => {
  let payload: Record<string, unknown> | undefined
  await page.route('**/rest/v1/feedback_entries', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [] })
    payload = route.request().postDataJSON()
    return route.fulfill({ status: 201, json: [] })
  })
  await login(page)
  await page.getByRole('button', { name: 'Enviar retroalimentación' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ayúdanos a mejorar Nexo' })
  await dialog.getByRole('button', { name: 'Algo falló' }).click()
  await dialog.getByRole('button', { name: '4 estrellas' }).click()
  await dialog.getByRole('textbox', { name: 'Tu comentario' }).fill('El botón de práctica no respondió una vez.')
  await dialog.getByRole('button', { name: 'Enviar comentario' }).click()
  await expect(dialog.getByRole('heading', { name: '¡Gracias!' })).toBeVisible()
  expect(payload).toMatchObject({ feedback_type: 'bug', rating: 4, page_context: '/' })
})

test('admin feedback route keeps its authorization gate and status action', async ({ page }) => {
  await login(page)
  await page.goto('/nexo-ops/feedback-console')
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()

  const feedback = { id: 'feedback-1', user_id: user.id, feedback_type: 'idea', rating: 5, message: 'Me gustaría practicar más.', page_context: '/progress', status: 'new', created_at: '2026-09-01T12:00:00Z' }
  let updatedStatus: string | undefined
  await page.route('**/rest/v1/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/profiles') && url.searchParams.get('select') === 'is_admin') return route.fulfill({ json: { is_admin: true } })
    if (url.pathname.endsWith('/profiles')) return route.fulfill({ json: [{ id: user.id, username: 'estudiante', full_name: 'Estudiante Nexo' }] })
    if (url.pathname.endsWith('/feedback_entries') && route.request().method() === 'PATCH') {
      updatedStatus = route.request().postDataJSON().status
      return route.fulfill({ json: [] })
    }
    if (url.pathname.endsWith('/feedback_entries')) return route.fulfill({ json: [feedback] })
    return route.fulfill({ json: [] })
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Comentarios de Nexo' })).toBeVisible()
  await expect(page.locator('.admin-feedback-card')).toContainText('Me gustaría practicar más.')
  await page.locator('.admin-feedback-card select').selectOption('reviewing')
  await expect.poll(() => updatedStatus).toBe('reviewing')
})

test('main workspaces fit common desktop widths', async ({ page }) => {
  await login(page)
  for (const width of [1200, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of ['/', '/courses', '/resolver', '/corrector', '/progress']) {
      await page.goto(route)
      await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible()
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(scrollWidth, `${route} at ${width}px`).toBeLessThanOrEqual(width + 1)
    }
  }
})

test('course Nexo retrieves relevant material and a study session survives refresh', async ({ page }) => {
  let payload: Record<string, unknown> | undefined
  const sessionEvents: string[] = []
  await page.route('**/rest/v1/study_session_events**', route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      sessionEvents.push(...(Array.isArray(body) ? body : [body]).map(item => String(item.activity_type)))
    }
    return route.fulfill({ status: 201, json: [] })
  })
  await page.route('**/api/ai/solve', route => {
    payload = route.request().postDataJSON()
    return route.fulfill({ json: { text: 'La membrana regula el intercambio de sustancias.' } })
  })
  await login(page)
  await page.goto('/courses/course-bio/ai')
  await expect(page.getByRole('heading', { name: 'Pregunta sobre todo el curso' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Preguntar sobre el curso' }).fill('¿Qué regula la membrana?')
  await page.getByRole('button', { name: 'Preguntar a Nexo' }).click()
  await expect(page.locator('.course-ai-thread')).toContainText('intercambio de sustancias')
  expect(payload?.courseId).toBe('course-bio')
  expect(payload?.context).toContain('Introducción a la célula')
  await page.getByRole('navigation', { name: 'Secciones de Biología' }).getByRole('button', { name: 'Práctica' }).click()
  await expect(page).toHaveURL(/\/courses\/course-bio\/practice$/)
  await page.getByRole('button', { name: '15 min' }).click()
  await page.getByRole('button', { name: 'Temas débiles' }).click()
  await page.getByRole('button', { name: 'Preparar sesión' }).click()
  await expect(page.locator('.study-session-plan li')).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Continúa tu sesión actual' })).toBeDisabled()
  await page.locator('.study-session-plan li').nth(2).getByRole('button', { name: 'Abrir' }).click()
  await page.locator('.flashcard').click()
  await page.getByRole('group', { name: '¿Cómo recordaste esta tarjeta?' }).getByRole('button', { name: 'Bien' }).click()
  await page.goto('/courses/course-bio/practice')
  await page.locator('.study-session-plan li').nth(1).getByRole('button', { name: 'Abrir' }).click()
  await page.locator('.quiz-card .options button').first().click()
  await page.goto('/courses/course-bio/practice')
  await page.locator('.study-session-plan li').first().getByRole('button', { name: 'Marcar hecho' }).click()
  await expect(page.locator('.study-session-plan')).toContainText('1/4 actividades terminadas')
  await page.reload()
  await expect(page.locator('.study-session-plan')).toContainText('1/4 actividades terminadas')
  for (let index = 0; index < 3; index += 1) await page.locator('.study-session-plan').getByRole('button', { name: 'Marcar hecho' }).first().click()
  await expect(page.getByRole('button', { name: 'Preparar sesión' })).toBeEnabled()
  await page.goto('/courses/course-bio/progress')
  await expect(page.locator('.progress-session-summary')).toContainText('1 sesiones completadas')
  await expect(page.locator('.progress-session-summary')).toContainText('4 actividades de sesión terminadas')
  await expect.poll(() => sessionEvents).toContain('flashcard_answer')
  await expect.poll(() => sessionEvents).toContain('quiz_answer')
  await expect.poll(() => sessionEvents).toContain('session_complete')
})

test('written questions are generated on demand and cached', async ({ page }) => {
  let calls = 0
  await page.route('**/api/ai/solve', route => {
    calls += 1
    const questions = Array.from({ length: 4 }, (_, index) => ({ question: `Explica la célula ${index + 1}`, keyPoints: ['El núcleo contiene ADN'], concept: 'célula', sourcePage: 1 }))
    return route.fulfill({ json: { text: JSON.stringify({ questions }) } })
  })
  await login(page)
  await page.goto('/courses/course-bio/materials/mat-cell/study/written')
  await page.getByRole('button', { name: 'Generar preguntas escritas con Nexo' }).click()
  await expect(page.getByRole('heading', { name: 'Explica la célula 1' })).toBeVisible()
  expect(calls).toBe(1)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Explica la célula 1' })).toBeVisible()
  expect(calls).toBe(1)
  await page.getByRole('button', { name: 'Regenerar con Nexo' }).click()
  await expect(page.getByRole('heading', { name: 'Explica la célula 1' })).toBeVisible()
  await expect.poll(() => calls).toBe(2)
})

test('exam mixes prepared question types and gives contextual written feedback', async ({ page }) => {
  await page.route('**/api/ai/solve', route => {
    const payload = route.request().postDataJSON()
    if (payload.task !== 'artifact') return route.fulfill({ json: { text: 'Incluiste el núcleo; falta relacionarlo con el ADN.' } })
    const result = payload.artifactType === 'multiple_choice'
      ? { questions: Array.from({ length: 4 }, (_, index) => ({ question: `Pregunta de elección ${index + 1}`, options: ['A', 'B', 'C', 'D'], correctOption: 0, explanation: 'Según el material.', sourcePage: 1, concept: 'célula' })) }
      : payload.artifactType === 'written_questions'
        ? { questions: Array.from({ length: 3 }, (_, index) => ({ question: `Explica el núcleo ${index + 1}`, keyPoints: ['Contiene ADN'], sourcePage: 1, concept: 'núcleo' })) }
        : { items: Array.from({ length: 3 }, (_, index) => ({ sentence: `El ____ contiene ADN ${index + 1}.`, answer: 'núcleo', sourcePage: 1, concept: 'núcleo' })) }
    return route.fulfill({ json: { text: JSON.stringify(result) } })
  })
  await login(page)
  await page.goto('/courses/course-bio/materials/mat-cell/study/exam')
  await page.getByRole('button', { name: 'Preparar opción múltiple' }).click()
  await page.getByRole('button', { name: 'Preparar preguntas escritas' }).click()
  await page.getByRole('button', { name: 'Preparar completar espacios' }).click()
  await page.getByRole('button', { name: 'Preparar simulacro' }).click()
  await expect(page.getByRole('heading', { name: 'Pregunta de elección 1' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Pregunta de elección 1' })).toBeVisible()
  await page.locator('.exam-options').getByRole('button', { name: 'A' }).click()
  await page.getByRole('button', { name: 'Siguiente →' }).click()
  await expect(page.getByRole('heading', { name: 'Explica el núcleo 1' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Tu respuesta' }).fill('El núcleo contiene ADN.')
  await page.getByRole('button', { name: 'Revisar con Nexo' }).click()
  await expect(page.locator('.guided-feedback').first()).toContainText('falta relacionarlo')
  await page.getByRole('button', { name: 'Lo comprendí · siguiente' }).click()
  await expect(page.getByRole('heading', { name: 'El ____ contiene ADN 1.' })).toBeVisible()
})

test('guided learning reviews the student explanation with material context', async ({ page }) => {
  let payload: Record<string, unknown> | undefined
  await page.route('**/api/ai/solve', route => {
    payload = route.request().postDataJSON()
    return route.fulfill({ json: { text: 'Entendiste la función del núcleo. Relaciónala también con el ADN.' } })
  })
  await login(page)
  await page.goto('/courses/course-bio/materials/mat-cell/study/learn')
  await expect(page.getByRole('heading', { name: 'Aprender con Nexo' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Explícalo con tus palabras' }).fill('El núcleo controla la célula.')
  await page.getByRole('button', { name: 'Revisar con Nexo' }).click()
  await expect(page.locator('.guided-feedback')).toContainText('Relaciónala también con el ADN')
  expect(payload?.courseId).toBe('course-bio')
  expect(payload?.materialId).toBe('mat-cell')
  expect(payload?.context).toContain('Introducción a la célula')
})

test('an interrupted artifact offers retry after refresh', async ({ page }) => {
  await login(page)
  await page.evaluate(id => {
    const key = `nexo-study-courses-v5:${id}`
    const courses = JSON.parse(localStorage.getItem(key) || '[]')
    const material = courses.find((course: { id: string }) => course.id === 'course-bio').materials.find((item: { id: string }) => item.id === 'mat-cell')
    material.artifacts = [{ id: crypto.randomUUID(), type: 'written_questions', status: 'processing',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), sourceMaterialId: material.id, payload: {}, version: 1 }]
    localStorage.setItem(key, JSON.stringify(courses))
  }, user.id)
  await page.goto('/courses/course-bio/materials/mat-cell/study/written')
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
})

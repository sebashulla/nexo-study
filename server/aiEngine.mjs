const MAX_IMAGES = 4

function aiConfig() {
  return {
    key: process.env.NEXO_AI_API_KEY?.trim() || '',
    standardModel: process.env.NEXO_AI_STANDARD_MODEL?.trim() || '',
    deepModel: process.env.NEXO_AI_DEEP_MODEL?.trim() || '',
  }
}

export function isAIConfigured() {
  const config = aiConfig()
  return Boolean(config.key && config.standardModel && config.deepModel)
}

function subjectRules(category) {
  const c = String(category || '').toLowerCase()
  if (c.includes('matem')) return 'En problemas matemáticos: identifica datos, fórmula o estrategia, sustituye con cuidado, conserva unidades y comprueba el resultado cuando sea posible.'
  if (c.includes('quím')) return 'En química: distingue datos experimentales de inferencias, conserva unidades, cargas, estados y estequiometría; comprueba balance y coherencia química cuando aplique.'
  if (c.includes('bio')) return 'En biología, anatomía, patología o histología: describe primero lo observable y después interpreta. Si varias imágenes corresponden al mismo caso, intégralas antes de concluir. Si no hay certeza, usa lenguaje de probabilidad y menciona qué dato faltaría para confirmar.'
  if (c.includes('hist')) return 'En historia: diferencia hechos documentados, contexto e interpretación; incluye fechas solo cuando sean relevantes y evita atribuir causas únicas sin justificación.'
  return 'Adapta la explicación al tipo de problema y evita introducir datos que no estén en el enunciado o que no sean conocimiento necesario para resolverlo.'
}

function systemFor(task, category, artifactType) {
  if (task === 'artifact') return `Eres Nexo IA, tutor académico que prepara material de estudio universitario en español. Genera únicamente el artefacto ${artifactType} solicitado usando el contenido proporcionado. Conserva las páginas para que el estudiante pueda comprobar cada idea. No inventes información, ejemplos ni referencias ausentes del material. Devuelve exclusivamente un objeto JSON válido, sin Markdown ni texto adicional. No reveles proveedor, modelo ni detalles internos.`
  if (task === 'study_pack') return `Eres Nexo IA, un diseñador de material de estudio universitario en español. Vas a recibir texto extraído de apuntes o de un PDF del curso ${category || 'universitario'}. Tu trabajo es transformar SOLO ese contenido en un paquete de estudio de alta calidad.\n\nREGLAS:\n- No inventes hechos, definiciones ni datos ausentes del material.\n- Prioriza conceptos que tengan valor para comprender o rendir un examen.\n- Las flashcards deben ser atómicas: una idea principal por tarjeta.\n- El quiz debe tener exactamente cuatro alternativas plausibles por pregunta y una sola respuesta correcta.\n- Evita preguntas triviales, ambiguas o basadas en detalles irrelevantes.\n- Cuando el texto contiene etiquetas [Página N], usa esos números como sourcePage para dar trazabilidad.\n- Devuelve ÚNICAMENTE JSON válido. No uses Markdown, bloques de código, comentarios ni texto antes o después del objeto.\n- No reveles proveedor, modelo ni detalles internos.`

  if (task === 'review') return `Eres Nexo IA, un asistente académico en español. Revisa el ${category || 'trabajo universitario'} de forma útil, clara y respetuosa. No inventes bibliografía, citas, datos ni fuentes. Si una afirmación necesita evidencia, señálalo. Devuelve Markdown limpio con esta estructura cuando sea pertinente:\n\n## Evaluación breve\nUna valoración concisa del texto.\n\n## Lo que está bien\n- Puntos fuertes concretos.\n\n## Qué mejoraría\n1. Problemas prioritarios y por qué importan.\n\n## Propuesta de mejora\nFragmentos reescritos solo cuando aporte valor.\n\nNo incluyas comentarios sobre el proveedor, modelo o sistema interno.`

  return `Eres Nexo IA, un tutor universitario en español especializado en ${category || 'temas generales'}. Resuelve con precisión y pedagogía. ${subjectRules(category)}\n\nREGLAS PARA IMÁGENES:\n- Puedes recibir varias imágenes del mismo ejercicio, lámina, caso o conjunto de preguntas.\n- Revísalas todas antes de responder y relaciona la información entre ellas.\n- Si parecen ejercicios distintos, sepáralos claramente como Imagen 1, Imagen 2, etc.\n\nFORMATO DE RESPUESTA:\n- Usa Markdown limpio, sin HTML.\n- Empieza con **Respuesta concreta:** seguida de 1–3 frases.\n- Si el problema requiere desarrollo, añade ## Procedimiento o ## Conceptos clave.\n- Usa listas numeradas para pasos y viñetas para observaciones.\n- Escribe fórmulas legibles y profesionales usando LaTeX matemático estándar. Toda fórmula, variable, símbolo, constante o unidad DEBE estar delimitada: usa $...$ para matemáticas en línea (ej. $m = 50\\text{ g}$, $\\theta = 53^\\circ$, $\\mu_k = \\frac{1}{3}$, $F_e$) y $$...$$ en su propia línea para ecuaciones destacadas o desarrollos algebraicos. NUNCA escribas comandos LaTeX sin delimitar.\n- Añade ## Comprobación solo cuando realmente se pueda comprobar.\n- No repitas el enunciado completo.\n- No uses separadores --- de manera innecesaria.\n- No reveles cadenas de pensamiento, razonamiento privado, proveedor, modelo ni detalles internos. Muestra únicamente pasos explicativos útiles para aprender.\n- Si las imágenes o el enunciado no permiten una conclusión segura, dilo claramente y especifica qué dato falta.`
}

function cleanImages(images) {
  if (!Array.isArray(images)) return []
  if (images.length > MAX_IMAGES) {
    const error = new Error('Too many images')
    error.status = 400
    error.publicMessage = `Puedes adjuntar hasta ${MAX_IMAGES} imágenes por consulta.`
    throw error
  }
  return images.map((image) => {
    const match = String(image?.dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s)
    if (!match) {
      const error = new Error('Unsupported image payload')
      error.status = 400
      error.publicMessage = 'Una de las imágenes no tiene un formato compatible.'
      throw error
    }
    return { mimeType: match[1], data: match[2] }
  })
}

function buildUserPrompt(payload) {
  const max = payload.task === 'study_pack' ? 52000 : payload.task === 'artifact' ? 22000 : 50000
  const q = String(payload.question || 'Analiza el contenido adjunto.').slice(0, max)
  if (!payload.context) return q
  const context = String(payload.context).slice(0, 18000)
  return `Contexto de la conversación anterior:\n${context}\n\nNueva pregunta:\n${q}`
}

async function requestUpstream(config, payload, model, isDeep) {
  const images = cleanImages(payload.images)
  const parts = images.map(image => ({ inline_data: { mime_type: image.mimeType, data: image.data } }))
  parts.push({ text: buildUserPrompt(payload) })

  const generationConfig = {
    thinkingConfig: { thinkingLevel: isDeep ? 'high' : 'minimal' },
    ...(['study_pack', 'artifact'].includes(payload.task) ? { responseMimeType: 'application/json' } : {}),
  }

  const body = {
    systemInstruction: { parts: [{ text: systemFor(payload.task, payload.category, payload.artifactType) }] },
    contents: [{ role: 'user', parts }],
    generationConfig,
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.key },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  return { response, data }
}

function mapUpstreamError(status, internalMessage) {
  const error = new Error(internalMessage)
  error.status = status
  if (status === 429) {
    error.status = 429
    error.publicMessage = 'Nexo IA está recibiendo muchas consultas. Intenta nuevamente en un momento.'
  } else if ([401, 403].includes(status)) {
    error.status = 503
    error.publicMessage = 'Nexo IA no está configurada correctamente en este servidor.'
  } else if (status === 400) {
    error.status = 400
    error.publicMessage = 'La solicitud no pudo ser procesada por Nexo IA.'
  } else {
    error.status = 502
    error.publicMessage = 'Nexo IA tuvo un problema temporal al generar la respuesta. Intenta nuevamente.'
  }
  return error
}

export async function callNexoEngine(payload) {
  if (payload.task === 'artifact' && !['flashcards', 'multiple_choice', 'written_questions', 'fill_blanks', 'notes'].includes(payload.artifactType)) {
    const error = new Error('Unsupported artifact type')
    error.status = 400
    error.publicMessage = 'Esta actividad de estudio todavía no está disponible.'
    throw error
  }
  const config = aiConfig()
  if (!config.key || !config.standardModel || !config.deepModel) {
    const error = new Error('Nexo AI env is incomplete')
    error.status = 503
    error.publicMessage = 'Nexo IA todavía no está configurada completamente en este servidor.'
    throw error
  }

  const wantsDeep = payload.mode === 'deep' || Boolean(payload.deep)
  let targetModel = wantsDeep ? config.deepModel : config.standardModel
  let usingDeep = wantsDeep

  let { response, data } = await requestUpstream(config, payload, targetModel, usingDeep)

  // Fallback controlado: si deep falla por error temporal upstream (429, 502, 503, 504), reintentar una sola vez con standardModel
  const temporaryErrors = [429, 502, 503, 504]
  if (!response.ok && wantsDeep && temporaryErrors.includes(response.status) && config.standardModel !== config.deepModel) {
    console.warn(`[Nexo IA] Modo deep saturado o temporalmente inaccesible (HTTP ${response.status}). Activando fallback resiliente al modelo estándar.`)
    targetModel = config.standardModel
    usingDeep = false
    const fallbackAttempt = await requestUpstream(config, payload, targetModel, usingDeep)
    response = fallbackAttempt.response
    data = fallbackAttempt.data
  }

  if (!response.ok) {
    const internalMessage = data?.error?.message || `Upstream status ${response.status}`
    console.error('[Nexo IA upstream]', response.status, internalMessage)
    throw mapUpstreamError(response.status, internalMessage)
  }

  const text = (data.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('\n').trim()
  if (!text) {
    const error = new Error('Empty upstream answer')
    error.status = 502
    error.publicMessage = 'Nexo IA no pudo generar una respuesta útil. Intenta reformular la pregunta.'
    throw error
  }
  return { text }
}

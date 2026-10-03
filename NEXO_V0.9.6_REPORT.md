# Nexo Study V0.9.6 — Conversations, memory y Learning Graph

Fecha: 3 de octubre de 2026. Repositorio de trabajo: `nexo-study-mvp`, rama `main`. Baseline: `ecb8fa8b24d4ed82b46e163c1e78edf2e18b4222` (V0.9.5).

## 1. Estado general

✅ VERIFIED — El núcleo implementa conversaciones privadas por contexto, evidencia separada del chat, memoria por concepto y el circuito respuesta → evidencia → recomendación → práctica → nueva evidencia. Conserva Resolver → Guardar en curso, PDF, fuentes, biblioteca, actividad, sesiones y administración. No se añadieron funciones externas ni se modificaron logo, paleta o fuentes.

⚠️ PARTIAL — La implementación requiere aplicar `010_conversations_learning_evidence.sql` al proyecto Supabase. Este trabajo no acredita despliegue de esa migración ni aislamiento HTTP en el proyecto real. Safari/WebKit no pudo iniciar en este Windows; tampoco se verificó un teclado físico de iPhone. Los límites se detallan en las secciones 16, 18 y 24.

La versión actual es **0.9.6**, actualizada después de completar la validación funcional. El push se realiza después del build, tests y revisión del diff; subir código no aplica migraciones automáticamente.

## 2. Baseline V0.9.5

✅ VERIFIED — Se leyó el reporte V0.9.5, los componentes relevantes, repositorios, flujo de práctica, Auth, cliente Supabase, pruebas y SQL 001–009 antes de implementar. La última migración real era 009; 010 estaba libre.

Build previo: TypeScript + Vite, exit 0, 139 módulos, 3.76 s. Main: 360.70 kB / 110.26 kB gzip. CSS: 184.47 kB / 38.16 kB gzip. Hubo un aviso de timing de CSS en esa ejecución.

Baseline ejecutado con éxito: 4 pruebas de sincronización/Resolver (14.7 s), 25 de cohesión/navegación/visual (1.0 min) y 1 del motor IA. Son 29 pruebas Playwright más 1 del motor; no se afirma baseline completo de todos los proyectos. Una ejecución inicial más amplia se interrumpió y no cuenta como aprobada.

## 3. Auditoría del backend

✅ VERIFIED — Se reutilizan `courses`, `materials`, `material_chunks`, `material_topics`, `study_artifacts`, `study_progress`, `learning_state`, `study_sessions`, `study_session_events`, `study_folders`, `folder_courses` y `saved_solutions`. Se mantienen los contratos de PDF de 007/008 y de soluciones privadas de 009.

Se añaden solamente `conversation_threads`, `conversation_messages` y `concept_evidence`, más campos en `learning_state`. No se duplicaron catálogos de temas, progreso o sesiones. No se cambiaron migraciones históricas ni se ejecutó un DROP destructivo.

Auth sigue en Supabase. Las nuevas tablas académicas tienen ownership directo, sin excepción de lectura para admin. Las FKs compuestas validan dueño/curso/material y dueño/thread/message en PostgreSQL; el RPC calcula `user_id` desde `auth.uid()`.

## 4. Arquitectura de conversations

✅ VERIFIED — `conversationRepository` separa persistencia de UI; `useConversation` controla selección, pendientes, caché y reconciliación. General usa workspace NULL; cada espacio puede tener su chat general; curso/material conservan sus IDs. El contexto se muestra discretamente.

“Nuevo chat” limpia la selección, pero no crea una fila remota vacía. El primer mensaje crea thread y mensaje en una transacción. El título se deriva del primer texto, sin llamada IA adicional. Los IDs estables, timestamps del servidor y comprobación de identidad permiten reintentar sin duplicar. Un thread ya sincronizado y después eliminado no se recrea silenciosamente desde una pestaña antigua. La ubicación de chats de curso/material sigue la pertenencia del curso; su workspace no se fija en el RPC. Si se elimina un espacio, la FK solo limpia workspace_id y conserva conversación/mensajes, que pueden seguir desde General.

Historial: 25 threads por página, búsqueda por título, agrupación Hoy/Ayer/Anteriores, renombrar, archivar, restaurar y eliminar con confirmación. Messages: últimas 40 filas, cursor compuesto timestamp/ID y carga inversa. “Limpiar historial” conserva el flujo anterior y elimina por lotes el contexto elegido; no descarga todo el historial de la cuenta.

La caché guarda 25 resúmenes y las últimas 40 filas de tres threads recientes, además de todos los pendientes. Los adjuntos usan IndexedDB local y `conversation-images` privado. Se persiste primero metadata con paths planificados; `attachmentsReady` solo se confirma después de subir los archivos. El borrado recorre todas las páginas de mensajes para limpiar sus imágenes antes de eliminar el thread.

## 5. Arquitectura de memory

✅ VERIFIED — Chat history y learning memory son capas separadas. `learningMemory` prepara contexto limitado; `learningGraphRepository` registra/reintenta evidencia y carga estados. `learning_state` es la proyección recalculable; no se copia el contenido entero de las conversaciones a una tabla paralela de memoria.

Los estados anteriores se conservan en `legacy_baseline` y se muestran como registros previos sin inventar su desglose. Un cliente antiguo no puede sobrescribir un estado gestionado por evidencia. El perfil ofrece “Datos y memoria de Nexo”, detalle de señales, borrado individual y reinicio de curso tras confirmación.

Eliminar una conversación elimina sus señales de chat y cachés asociadas; conserva evidencia independiente de quiz/flashcards. Archivar conserva mensajes y señales. Reiniciar un curso elimina su evidencia y baseline, dejando estado desconocido; conserva materiales, chats, actividad y sesiones. Las operaciones no muestran éxito si el servidor falla.

⚠️ PARTIAL — La extracción de preguntas usa coincidencias de conceptos conocidos; no implementa clasificación semántica de preferencias, subconceptos o errores conceptuales. No se presenta esa precisión como disponible.

## 6. Learning Graph

✅ VERIFIED — Modelo ligero: curso → material → concepto → evidencia → estado. Los conceptos se derivan de temas, artefactos preparados, study packs y memoria existente, con claves normalizadas por material. No hay D3, Cytoscape, React Flow ni un grafo visual decorativo.

La API incluye `recordEvidence`, `getConceptState`, `getWeakConcepts`, `getRecommendedConcepts`, `getCourseLearningSummary` y `courseConcepts`. La puntuación usa la recurrencia existente: mezcla de confianza anterior y resultado con factor `0.36 × peso`. Familiar requiere al menos 2 prácticas y confianza ≥0.53; dominio estable, al menos 3 y ≥0.82. Es una estimación de estudio, no un diagnóstico.

Las preguntas y actividad sin respuesta no suman intentos. El estado “Sin datos suficientes” prevalece cuando no hay práctica. Un solo error identifica una oportunidad de repaso; una sola tarjeta no declara dominio absoluto.

## 7. Modelo de evidence

✅ VERIFIED — Cada señal tiene UUID, dueño, curso/material, clave/etiqueta de concepto, tipo/origen, resultado y fecha del servidor. El servidor impone peso y relaciones; `concept_evidence` no concede UPDATE. Insertar/eliminar recalcula el estado con bloqueo por concepto.

| Origen | Resultado | Peso | Efecto |
| --- | --- | --- | --- |
| Quiz / completar | Correcto o incorrecto | 1 | Intento y estado académico |
| Flashcard | No sabía / difícil / bien / fácil | 1 | Intento y estado académico |
| Escrito/examen escrito | Autoevaluación explícita después de orientación | 0.5 | Intento de menor peso, identificado como autoevaluación |
| Chat útil sobre concepto conocido | Pregunta | 0 | Última interacción; sin dominio ni debilidad deducida |
| Sesión | Visto | 0 | Esquema preparado; no se genera evidencia conceptual ficticia |

Un retry reutiliza el UUID y verifica identidad, tipo, origen y contexto. La aplicación aplica la señal inmediatamente y sustituye después la proyección por el resultado del servidor. El replay de una señal pendiente ya aplicada localmente no vuelve a contar el intento al recargar offline.

## 8. Resolver V2

✅ VERIFIED — Conversaciones generales/por espacio persistentes, selección recuperable, imágenes privadas, borrador, retry, historial temporal y “Practicar esto”. Se mantienen categorías, razonamiento reforzado, ResponseRenderer, Copiar y Guardar en curso con imágenes.

Se importan historiales locales v1/v4/v3 una vez mediante IDs deterministas. Los originales se conservan durante la importación; una eliminación explícita limpia también la copia antigua asociada. Los datos de imágenes disponibles se migran a IndexedDB y al bucket privado. No se vuelcan indiscriminadamente `ai_queries` ni se duplican nuevas conversaciones en esa tabla.

⚠️ PARTIAL — Algunos historiales antiguos nunca guardaron bytes de imágenes. No pueden recuperarse imágenes inexistentes. Si solo había contador, no se simula que exista un adjunto restaurable.

## 9. Course AI

✅ VERIFIED — Conversaciones por curso con historial, mensajes/borradores restaurables, fuentes, memoria acotada y práctica explícita. La recuperación usa únicamente los materiales del curso. El contexto introductorio se puede abrir/cerrar; al conversar libera espacio para mensajes. El último mensaje desplaza el thread dentro de su región de scroll.

Se consultan hasta 200 temas, detectando truncamiento con una fila adicional. Los resúmenes y estados usan datos académicos reales; no se etiqueta “hola” como señal de desconocimiento. En móvil, al recibir mensajes se alinea el panel bajo la cabecera y se reserva más altura para leer la respuesta manteniendo composer accesible; la navegación de curso permanece arriba y puede recuperarse al desplazar la página.

## 10. Material AI

✅ VERIFIED — Chat persistente por material, fuentes con página, drafts e historial. Se conserva el visor PDF y el contenido agrupado en secciones; no se reemplaza por un chat independiente.

Las acciones de página siguen usando esa página. Un error con `sourcePage` abre Nexo con curso/material/concepto/pregunta/opción elegida/respuesta correcta/explicación y página concreta. Pulsar una fuente abre o selecciona la página correspondiente. Las respuestas no muestran IDs internos.

Al abrir normalmente el workspace se conserva la entrada Contenido; al elegir Chat se restaura la conversación seleccionada. Las aperturas desde búsqueda o práctica contextual activan Chat.

## 11. Search

✅ VERIFIED — La búsqueda global incluye conversaciones privadas activas, junto con cursos, materiales, temas, artefactos y soluciones existentes. Abrir un resultado recupera su contexto y thread. La búsqueda del historial también permite consultar archivados.

Se consultan títulos con límite de resultados, sin descargar mensajes de toda la cuenta. Los filtros de dueño/espacio y RLS son independientes. No se añadió indexación externa. No se acreditó un benchmark de búsqueda con miles de threads en Supabase real.

## 12. Recommendations

✅ VERIFIED — Home conserva Continuar y limita las acciones de Hoy a dos. La prioridad usa errores reales recientes, tarjetas difíciles y evidencia por concepto; después contempla conceptos consultados sin práctica, prácticas antiguas y análisis parcial. Las sesiones pendientes conservan prioridad para continuar el trabajo iniciado.

Se muestran conteos y fechas derivados de datos existentes. Practicar abre generación explícita de tres preguntas sobre la idea usando un material elegido. El JSON se valida y el artefacto se guarda antes de declarar lista la práctica. Si falla generación o guardado, se mantiene un error con retry; no hay una práctica simulada ni generación automática de fondo.

## 13. Progress

✅ VERIFIED — Se mantienen Actividad y Dominio separados y se añade lista de conceptos del curso: Sin datos suficientes, En aprendizaje, Familiar, Dominio estable. “Sin datos” no se convierte en 0% de dominio. Los porcentajes de actividad anteriores siguen indicando actividad.

Detalle de concepto: evidencia paginada de 20 filas, origen/resultado/peso, última práctica y acciones Practicar/Preguntar. Las señales confirmadas eliminadas remotamente no se resucitan desde caché cuando la consulta remota tiene éxito. La caché offline se identifica y no representa toda la historia.

## 14. Mobile

✅ VERIFIED — La matriz Chromium cubre 320×640, 360×800, 375×667, 390×844, 393×852 y 430×932; también tablet 768×1024 y desktop 1366×768, 1440×900, 1920×1080. Las diez superficies: Home, Resolver vacío, chat activo, historial abierto, Course AI, Material AI, Progress, Concept detail, search y account/memory.

Revisión personal de 100 capturas mediante hojas de contacto y varias imágenes originales. Se comprobaron identidad, mensajes/fuentes legibles, acciones, sheet temporal y ausencia de overflow horizontal. Se corrigieron el encabezado grande en Course AI a 320 px, el texto de historial que se recortaba en Material AI y el salto de línea del nombre Nexo IA en Resolver.

Se conserva la navegación móvil actual. Historial/memoria son diálogos temporales; no se añade otra barra permanente. Los controles nuevos de interacción móvil tienen mínimo 44 px. La prueba de visualViewport lógico valida composer y acciones por encima del teclado simulado.

⚠️ PARTIAL — No se verificó teclado físico, Safari/iOS ni tablet WebKit, por el fallo de inicio del runtime descrito en 18.

## 15. Accessibility

✅ VERIFIED — Se reutiliza Dialog nativo: foco al abrir, navegación de teclado, Escape y retorno al disparador. Historial tiene búsqueda etiquetada, estados de sincronización anunciados, controles con nombres accesibles y operaciones bloqueadas durante escrituras relevantes. Composer preserva texto y usa tamaño móvil de 16 px.

No se afirma auditoría WCAG completa ni prueba con lector de pantalla físico. Las pruebas automatizadas verifican foco/teclado y dimensiones, no toda la accesibilidad del producto.

## 16. Security / RLS

✅ VERIFIED LOCAL — Las migraciones 001–010 se ejecutaron en PostgreSQL WASM (PGlite 0.5.8), con esquemas mínimos de Auth/Storage y rol `authenticated`. 010 se aplicó dos veces. Pasaron 36 comprobaciones de SQL real: ownership, FKs, permisos, RPCs, pesos, idempotencia, baseline, cascadas, reset y restricciones de Storage a nivel SQL. Incluye conservación y escritura de conversación después de borrar su espacio.

Se probó lectura/escritura/búsqueda cruzada entre A/B; A tenía el flag admin obtenido por 006. Ese flag no permitió leer contenido académico de B. También se comprobaron funciones internas no invocables, evidence sin UPDATE y rechazo de curso/material ajenos.

⚠️ PARTIAL SUPABASE LIVE — PostgreSQL local no verifica PostgREST, sesiones del proyecto real, API Storage, configuración de buckets ni URLs firmadas reales. Playwright simula HTTP y tampoco acredita RLS real. No se ejecutó el script live por falta de dos sesiones ordinarias de un proyecto de prueba autorizado.

Procedimiento exacto y comandos: [sql/SECURITY_VALIDATION.md](sql/SECURITY_VALIDATION.md). Script actualizado: `scripts/validate-academic-security.mjs`; cubre ambos sentidos, SELECT/INSERT/UPDATE/DELETE, títulos, append/record/reset y tres buckets. Nunca usar service_role para atribuir éxito a RLS.

## 17. Performance

✅ VERIFIED — Sin nuevas dependencias de frontend. Historial, memoria, detalle y práctica usan lazy loading. La recuperación de conversación y evidencia es paginada; los borradores se guardan separados del historial. No se añadió polling ni Realtime.

| Medida (kB de Vite) | V0.9.5 | V0.9.6 | Diferencia |
| --- | ---: | ---: | ---: |
| Main JS | 360.70 | 375.13 | +14.43 |
| Main gzip | 110.26 | 114.95 | +4.69 |
| CSS | 184.47 | 191.16 | +6.69 |
| CSS gzip | 38.16 | 39.19 | +1.03 |

Main aumenta aproximadamente 4.0%; gzip, 4.3%. Chunks nuevos: NexoPracticeDialog 2.29/1.07 kB gzip; MemoryViewer 3.14/1.48; ConceptDetail 3.59/1.63; learningGraph 3.77/1.58; conversationRepository 5.77/2.10; ConversationHistory 6.29/2.42; ConversationTools 16.96/6.19 (incluye lógica compartida de conversación/importación).

Build final 0.9.6: exit 0, 153 módulos, 413 ms de Vite. CourseAiPage queda en 6.50/2.80 kB gzip.

Los presupuestos de prompt son caracteres: memoria 1800, extractos anteriores 1000, últimos ocho mensajes 6000, fuentes 13500, contexto de práctica 1800. Los mensajes individuales del contexto reciente se recortan a 1800. Son límites explícitos, no un conteo exacto de tokens. Los extractos solo describen preguntas cargadas; no fingen resumir toda una conversación larga.

## 18. Tests

✅ VERIFIED — Suite amplia Chromium: `npx playwright test --project=desktop --project=android --project=small-phone --workers=2`, exit 0. **245 passed (10.9m), 40 skipped**. Las 40 omisiones son las dos matrices de 10 tamaños, ejecutadas una vez en desktop y omitidas en los otros dos proyectos; no son fallos ocultos. Después se ajustaron el espacio de lectura de Course AI en móvil y la relación workspace del chat. Rerun de las suites afectadas: `npx playwright test tests/persistent-learning.spec.ts tests/memory-visual.spec.ts tests/workspaces.spec.ts tests/visual-workflows.spec.ts --project=desktop --project=android --project=small-phone --workers=2`, exit 0: **109 passed (5.4m), 20 skipped** (la matriz visual se ejecuta una sola vez). Estas cifras son ejecuciones con solapamiento, no 354 casos únicos. No hay fallos pendientes de Chromium en esas ejecuciones.

✅ VERIFIED — 15 pruebas de regresión corregidas pasaron en desktop/Android/small-phone (1.5 min). El test final del motor IA pasó en 0.9.6: 1/1 (141.9 ms). SQL local final: 36/36. Se verificó sintaxis del script de seguridad live, sin ejecutarlo contra el proyecto real.

Se añadieron 16 pruebas funcionales en `persistent-learning.spec.ts` y 10 de matriz visual. Además de los 20 escenarios exigidos, cubren paginación con 29 threads/83 messages, borradores sin threads vacíos, importación antigua única, pendientes con imágenes, dos pestañas reales compartiendo thread, señal offline sin doble conteo al hidratar y respuesta IA inválida con retry sin duplicar usuario.

| Escenarios obligatorios | Evidencia de prueba |
| --- | --- |
| 1–4, 18–19: crear/reload, dos chats, renombrar, archivar/eliminar, selección y desaparición | Pruebas 1–3 del spec persistente, historial y borrado |
| 5, 20: aislamiento A/B | Mock de dos identidades + SQL local; Supabase live PARTIAL |
| 6–8: curso/material/fuentes | Scope almacenado, metadata y apertura contextual |
| 9–11: quiz/card/recomendación | Loop completo y tarjeta difícil; evidencia/estado/Home comprobados |
| 12: ausencia de evidencia | Estado desconocido y cálculo puro sin falso dominio |
| 13: búsqueda | Título remoto y apertura en curso/material correctos |
| 14–17: móvil/teclado/320/historial desktop | Foco, Escape, visualViewport lógico y matriz de diez tamaños |

Fallos intermedios documentados: búsqueda móvil intentaba usar un botón desktop oculto; se corrigió el helper. React StrictMode borraba un draft restaurado y podía repetir importación; se corrigieron ambos. Una ejecución sufrió HMR al modificar un hook mientras corrían pruebas; se repitió con código estable. Pruebas anteriores esperaban sidebar permanente, heading único y POST directo a learning_state; se actualizaron a los contratos reales, manteniendo comprobaciones de datos persistidos. La suite amplia anterior se interrumpió y no cuenta como validación completa.

⚠️ PARTIAL — WebKit 2359 falla antes de cargar la app: `browserType.launch: Target page, context or browser has been closed`; Playwright.exe termina con código 3236495362. Se reprodujo fuera de la suite con `node --input-type=module -e "import { webkit } from '@playwright/test'; const browser = await webkit.launch(); await browser.close();"`. El binario está instalado; no se atribuye una causa sin evidencia. Los proyectos iphone/tablet no se sustituyeron por Chromium para simular éxito.

Para reproducir Chromium: `npx playwright test --project=desktop --project=android --project=small-phone --workers=2`. Para SQL, instalar el runtime aislado con `npm install --prefix node_modules/.cache/nexo-sql-runtime --no-package-lock --no-save @electric-sql/pglite@0.5.8` y ejecutar `npm run test:schema`. Esta dependencia de QA permanece fuera del bundle y del lockfile principal.

## 19. Bugs encontrados

Durante implementación/QA se detectaron: pérdida del assistant cuando llegaba durante flush; refresh que podía reemplazar mensajes nuevos; selección vieja reaplicada al recuperar foco; sincronización entre pestañas que podía provocar ping-pong; draft eliminado por StrictMode; importación antigua duplicada; limpieza de adjuntos solo de la página cargada; un thread borrado recreado desde tab antigua; doble intento al hidratar evidencia offline; caché de evidencia confirmada que podía ocultar borrado remoto; práctica enfocada que podía sustituir el quiz ordinario; respuesta vacía interpretada como éxito; encabezado móvil Course AI excesivo y etiquetas recortadas.

La revisión SQL final detectó además que una FK de workspace con cascade habría borrado chats de cursos conservados al eliminar el espacio. Se cambió a SET NULL exclusivamente en workspace_id y se probó conservación/escritura. Las pruebas antiguas también mostraron supuestos que dejaron de corresponder al contrato: escritura directa de learning_state y sidebar de historial permanente. Se distinguen esos fallos de las regresiones funcionales anteriores.

## 20. Bugs corregidos

✅ VERIFIED — Flush reconsulta pendientes hasta vaciar; refresh combina mensajes añadidos durante fetch; selección inicial se consume una vez; firmas storage ignoran selección; drafts comparan cambios reales de selección; importación usa promise/IDs estables; borrado pagina todos los mensajes; RPC exige thread existente para clientes sincronizados; replay usa IDs pendientes; consulta exitosa de señales mezcla solo pendientes; artefactos de concepto tienen scope distinto; callAI rechaza respuesta vacía y distingue red/timeout/rate limit; CSS móvil y scroll del thread se corrigieron.

Cada corrección relevante tiene cobertura funcional, SQL o visual según corresponda. La validación final no incluye cambios de código por HMR durante la ejecución.

## 21. Migraciones

✅ VERIFIED LOCAL — Nuevo archivo `sql/010_conversations_learning_evidence.sql`, aditivo, transaccional y repetible. Las migraciones 001–009 no se editaron. El siguiente número libre es 011.

Aplicar después de 009, primero en proyecto de prueba, repetir 010 y ejecutar validación A/B. Preserva datos previos mediante baseline, añade índices de contexto/paginación/evidencia y crea el bucket privado conversation-images. RPCs públicos permitidos: append_conversation_message, record_concept_evidence y reset_course_learning_memory. Funciones internas de recálculo/touch sin EXECUTE público.

## 22. Archivos nuevos

- `NEXO_V0.9.6_REPORT.md`
- `scripts/test-learning-schema.mjs`
- `sql/010_conversations_learning_evidence.sql`
- `src/ConceptDetail.tsx`, `src/ConversationHistory.tsx`, `src/ConversationTools.tsx`, `src/MemoryViewer.tsx`, `src/NexoPracticeDialog.tsx`
- `src/hooks/useConversation.ts`, `src/hooks/useConversationDraft.ts`
- `src/lib/conversationRepository.ts`, `src/lib/conversationTypes.ts`, `src/lib/learningGraph.ts`, `src/lib/learningGraphRepository.ts`, `src/lib/learningMemory.ts`, `src/lib/legacyConversations.ts`
- `src/memory.css`
- `tests/helpers/learningFixture.ts`, `tests/memory-visual.spec.ts`, `tests/persistent-learning.spec.ts`

## 23. Archivos modificados

- `package.json`, `package-lock.json`: versión y comando de SQL QA, sin dependencias frontend nuevas.
- `scripts/validate-academic-security.mjs`, `sql/README.md`, `sql/SECURITY_VALIDATION.md`.
- `src/AccountUtilities.tsx`, `src/App.tsx`, `src/CourseAiPage.tsx`, `src/CourseLibrary.tsx`, `src/ExamRunner.tsx`, `src/GlobalSearch.tsx`, `src/MaterialWorkspace.tsx`, `src/PageArtifactView.tsx`, `src/PracticeViews.tsx`, `src/ProgressPage.tsx`, `src/ResolverPage.tsx`, `src/StudyMethodPage.tsx`, `src/main.tsx`, `src/types.ts`.
- `src/lib/aiClient.ts`, `src/lib/artifactScope.ts`, `src/lib/learningRepository.ts`, `src/lib/learningState.ts`, `src/lib/productIntelligence.ts`.
- `tests/helpers/academicMock.ts`, `tests/helpers/navigation.ts`, `tests/mobile-focus.spec.ts`, `tests/resolver-chat.spec.ts`, `tests/visual-workflows.spec.ts`, `tests/workspaces.spec.ts`.

No se incluyen `.env`, dist, logs, capturas, test-results, playwright-report ni runtime aislado de QA. `src/styles.css` conserva exactamente el contenido del baseline; los estilos nuevos están en memory.css. El caché generado tsconfig.tsbuildinfo no forma parte del cambio.

## 24. Limitaciones reales

- ⚠️ PARTIAL: migración/privacidad y Storage HTTP en Supabase real requieren validación A/B; código publicado no implica backend desplegado.
- ⚠️ PARTIAL: Safari/iOS, tablet WebKit y teclado físico no verificados. La matriz tablet de Chromium no sustituye Safari.
- ⚠️ PARTIAL: no hay memoria semántica de preferencias ni diagnóstico automático de errores/subconceptos. Solo conceptos conocidos y señales explícitas.
- La restauración automática de selección es local por navegador; otro dispositivo obtiene las conversaciones y elige desde historial.
- Sin Realtime: otra pestaña/dispositivo obtiene cambios al recuperar foco, abrir o refrescar. La pestaña que responde actualiza inmediatamente Home/Progress.
- Los extractos previos cubren únicamente mensajes cargados. La ventana de prompt omite deliberadamente historia más antigua; no existe un resumen remoto completo persistido.
- La consulta de actualización por curso limita estados a 300; los temas a 200 con aviso de truncamiento. No se validó una cuenta de escala masiva ni se implementó paginación completa de estados para ese caso.
- El detalle offline muestra caché reciente de hasta 120 señales, no historial completo. Los pendientes se conservan sin ese recorte.
- Si localStorage agota cuota, el borrador permanece solo en memoria de esa sesión; IndexedDB/localStorage bloqueados limitan recuperación offline. La app no puede garantizar persistencia sin almacenamiento local disponible.
- Bytes de imágenes ausentes de formatos antiguos no son recuperables.
- Borrar un curso fuera del flujo de limpieza puede dejar objetos Storage huérfanos: FK elimina filas, no blobs. No se añadió servicio externo de limpieza. Borrar un espacio conserva threads y sus adjuntos. Si Storage borra algunos archivos y luego falla, el thread se conserva con error y la operación se puede reintentar.
- Los paths de imagen se suben con upsert false en la app; las policies permiten CRUD del propietario. No se afirma inmutabilidad total de archivos frente a un dueño que llama la API directamente.
- La práctica enfocada requiere un material con contexto preparado y que el servicio IA devuelva JSON válido. No se muestra práctica lista si falla IA o persistencia.
- Los tests de UI usan respuestas IA controladas y no acreditan calidad pedagógica del proveedor real.

## 25. Pendientes

1. Aplicar 010 en proyecto de prueba y luego en el proyecto de destino tras validar; ejecutar procedimiento live con A/B, incluyendo admin y Storage.
2. Resolver el inicio de WebKit en este host o ejecutar iphone/tablet en un host compatible; verificar teclado físico iOS.
3. Evaluar, con casos reales, extracción semántica opcional de conceptos/subconceptos y preferencias. Mantenerla fuera del producto hasta poder mostrar evidencia y borrado fiables.
4. Si una cuenta supera los límites actuales, añadir paginación de estados y medir búsqueda de títulos en Supabase; no aumentar el contexto IA indiscriminadamente.

## 26. Resultado literal de npm run build

Exit code: **0**. Salida íntegra del build final de versión 0.9.6:

```text

> nexo-study-mvp@0.9.6 build
> tsc -b && vite build

vite v8.3.0 building client environment for production...
transforming...
✓ 153 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                           1.07 kB │ gzip:   0.51 kB
dist/assets/KaTeX_Size3-Regular-CTq5MqoE.woff             4.42 kB
dist/assets/KaTeX_Size4-Regular-Dl5lxZxV.woff2            4.92 kB
dist/assets/KaTeX_Size2-Regular-Dy4dx90m.woff2            5.20 kB
dist/assets/KaTeX_Size1-Regular-mCD8mA8B.woff2            5.46 kB
dist/assets/KaTeX_Size4-Regular-BF-4gkZK.woff             5.98 kB
dist/assets/KaTeX_Size2-Regular-oD1tc_U0.woff             6.18 kB
dist/assets/KaTeX_Size1-Regular-C195tn64.woff             6.49 kB
dist/assets/KaTeX_Caligraphic-Regular-Di6jR-x-.woff2      6.90 kB
dist/assets/KaTeX_Caligraphic-Bold-Dq_IR9rO.woff2         6.91 kB
dist/assets/KaTeX_Size3-Regular-DgpXs0kz.ttf              7.58 kB
dist/assets/KaTeX_Caligraphic-Regular-CTRA-rTL.woff       7.65 kB
dist/assets/KaTeX_Caligraphic-Bold-BEiXGLvX.woff          7.71 kB
dist/assets/KaTeX_Script-Regular-D3wIWfF6.woff2           9.64 kB
dist/assets/KaTeX_SansSerif-Regular-DDBCnlJ7.woff2       10.34 kB
dist/assets/KaTeX_Size4-Regular-DWFBv043.ttf             10.36 kB
dist/assets/KaTeX_Script-Regular-D5yQViql.woff           10.58 kB
dist/assets/KaTeX_Fraktur-Regular-CTYiF6lA.woff2         11.31 kB
dist/assets/KaTeX_Fraktur-Bold-CL6g_b3V.woff2            11.34 kB
dist/assets/KaTeX_Size2-Regular-B7gKUWhC.ttf             11.50 kB
dist/assets/KaTeX_SansSerif-Italic-C3H0VqGB.woff2        12.02 kB
dist/assets/KaTeX_SansSerif-Bold-D1sUS0GD.woff2          12.21 kB
dist/assets/KaTeX_Size1-Regular-Dbsnue_I.ttf             12.22 kB
dist/assets/KaTeX_SansSerif-Regular-CS6fqUqJ.woff        12.31 kB
dist/assets/KaTeX_Caligraphic-Regular-wX97UBjC.ttf       12.34 kB
dist/assets/KaTeX_Caligraphic-Bold-ATXxdsX0.ttf          12.36 kB
dist/assets/KaTeX_Fraktur-Regular-Dxdc4cR9.woff          13.20 kB
dist/assets/KaTeX_Fraktur-Bold-BsDP51OF.woff             13.29 kB
dist/assets/KaTeX_Typewriter-Regular-CO6r4hn1.woff2      13.56 kB
dist/assets/manrope-latin-800-normal-BfWYOv1c.woff2      13.64 kB
dist/assets/KaTeX_SansSerif-Italic-DN2j7dab.woff         14.11 kB
dist/assets/dm-sans-latin-600-normal-Aqo67rzb.woff2      14.14 kB
dist/assets/manrope-latin-600-normal-4f0koTD-.woff2      14.17 kB
dist/assets/dm-sans-latin-400-normal-CW0RaeGs.woff2      14.20 kB
dist/assets/manrope-latin-700-normal-BZp_XxE4.woff2      14.21 kB
dist/assets/dm-sans-latin-500-normal-B9HHJjqV.woff2      14.30 kB
dist/assets/dm-sans-latin-700-normal-DvUfVpUG.woff2      14.34 kB
dist/assets/KaTeX_SansSerif-Bold-DbIhKOiC.woff           14.40 kB
dist/assets/KaTeX_Typewriter-Regular-C0xS9mPB.woff       16.02 kB
dist/assets/KaTeX_Math-BoldItalic-CZnvNsCZ.woff2         16.40 kB
dist/assets/KaTeX_Math-Italic-t53AETM-.woff2             16.44 kB
dist/assets/KaTeX_Script-Regular-C5JkGWo-.ttf            16.64 kB
dist/assets/KaTeX_Main-BoldItalic-DxDJ3AOS.woff2         16.78 kB
dist/assets/KaTeX_Main-Italic-NWA7e6Wa.woff2             16.98 kB
dist/assets/manrope-latin-800-normal-uHUdIJgA.woff       17.91 kB
dist/assets/dm-sans-latin-600-normal-BmdmIIQ2.woff       18.32 kB
dist/assets/dm-sans-latin-400-normal-BwCSEQnW.woff       18.35 kB
dist/assets/manrope-latin-600-normal-BqgrALkZ.woff       18.38 kB
dist/assets/manrope-latin-700-normal-DGRFkw-m.woff       18.41 kB
dist/assets/dm-sans-latin-700-normal-CUSSCpQX.woff       18.50 kB
dist/assets/dm-sans-latin-500-normal-Dr3UlScf.woff       18.52 kB
dist/assets/KaTeX_Math-BoldItalic-iY-2wyZ7.woff          18.66 kB
dist/assets/KaTeX_Math-Italic-DA0__PXp.woff              18.74 kB
dist/assets/KaTeX_Main-BoldItalic-SpSLRI95.woff          19.41 kB
dist/assets/KaTeX_SansSerif-Regular-BNo7hRIc.ttf         19.43 kB
dist/assets/KaTeX_Fraktur-Regular-CB_wures.ttf           19.57 kB
dist/assets/KaTeX_Fraktur-Bold-BdnERNNW.ttf              19.58 kB
dist/assets/KaTeX_Main-Italic-BMLOBm91.woff              19.67 kB
dist/assets/KaTeX_SansSerif-Italic-YYjJ1zSn.ttf          22.36 kB
dist/assets/KaTeX_SansSerif-Bold-CFMepnvq.ttf            24.50 kB
dist/assets/KaTeX_Main-Bold-Cx986IdX.woff2               25.32 kB
dist/assets/KaTeX_Main-Regular-B22Nviop.woff2            26.27 kB
dist/assets/KaTeX_Typewriter-Regular-D3Ib7_Hf.ttf        27.55 kB
dist/assets/KaTeX_AMS-Regular-BQhdFMY1.woff2             28.07 kB
dist/assets/KaTeX_Main-Bold-Jm3AIy58.woff                29.91 kB
dist/assets/KaTeX_Main-Regular-Dr94JaBh.woff             30.77 kB
dist/assets/KaTeX_Math-BoldItalic-B3XSjfu4.ttf           31.19 kB
dist/assets/KaTeX_Math-Italic-flOr_0UB.ttf               31.30 kB
dist/assets/KaTeX_Main-BoldItalic-DzxPMmG6.ttf           32.96 kB
dist/assets/KaTeX_AMS-Regular-DMm9YOAa.woff              33.51 kB
dist/assets/KaTeX_Main-Italic-3WenGoN9.ttf               33.58 kB
dist/assets/KaTeX_Main-Bold-waoOVXN0.ttf                 51.33 kB
dist/assets/KaTeX_Main-Regular-ypZvNtVU.ttf              53.58 kB
dist/assets/KaTeX_AMS-Regular-DRggAlZN.ttf               63.63 kB
dist/assets/pdf.worker.min-Dswkl-cV.mjs               1,265.41 kB
dist/assets/index-ByRiseK-.css                          191.16 kB │ gzip:  39.19 kB
dist/assets/StudyTextarea-ChrlCK-a.js                     0.42 kB │ gzip:   0.31 kB
dist/assets/SaveSolutionDialog-CJn5kFfL.js                2.07 kB │ gzip:   1.00 kB
dist/assets/NexoPracticeDialog-CZT7jqrF.js                2.29 kB │ gzip:   1.07 kB
dist/assets/SavedSolutionDialog-Cv_1702h.js               2.45 kB │ gzip:   1.10 kB
dist/assets/CorrectorPage-BbGn8rS6.js                     2.67 kB │ gzip:   1.13 kB
dist/assets/MemoryViewer-B-1bttJe.js                      3.14 kB │ gzip:   1.48 kB
dist/assets/ConceptDetail-CkuGNzZR.js                     3.59 kB │ gzip:   1.63 kB
dist/assets/learningGraph-DTLJp9jj.js                     3.77 kB │ gzip:   1.58 kB
dist/assets/CoursePracticePage-CMc46W04.js                3.78 kB │ gzip:   1.50 kB
dist/assets/AdminFeedbackPage-B-lxA8vP.js                 4.41 kB │ gzip:   1.71 kB
dist/assets/FoldersPage-9H0KdG1U.js                       4.75 kB │ gzip:   1.72 kB
dist/assets/conversationRepository-C1LF_znm.js            5.77 kB │ gzip:   2.10 kB
dist/assets/ConversationHistory-CZOfQYUQ.js               6.29 kB │ gzip:   2.42 kB
dist/assets/CourseAiPage-Ch0F1zIm.js                      6.50 kB │ gzip:   2.80 kB
dist/assets/ResolverPage-DFz5AVo0.js                      7.24 kB │ gzip:   2.91 kB
dist/assets/ProgressPage-BtNSG0pT.js                      7.29 kB │ gzip:   2.34 kB
dist/assets/GlobalSearch-rx5su97W.js                      7.47 kB │ gzip:   3.02 kB
dist/assets/jsx-runtime-Dk72oS4N.js                       8.77 kB │ gzip:   3.33 kB
dist/assets/StudyMethodPage-Du9wddIB.js                  16.05 kB │ gzip:   4.69 kB
dist/assets/AuthPage-Dp66kHL0.js                         16.88 kB │ gzip:   5.26 kB
dist/assets/ConversationTools-DIQfvmly.js                16.96 kB │ gzip:   6.19 kB
dist/assets/MaterialWorkspace-DV4gknGp.js                23.76 kB │ gzip:   7.88 kB
dist/assets/supabase-DjkFSsay.js                        214.91 kB │ gzip:  55.31 kB
dist/assets/ResponseRenderer-BAh0-6bn.js                264.76 kB │ gzip:  79.30 kB
dist/assets/index-Crn6_7ip.js                           375.13 kB │ gzip: 114.95 kB
dist/assets/pdf-C48aHX9t.js                             430.93 kB │ gzip: 129.03 kB

✓ built in 413ms
```

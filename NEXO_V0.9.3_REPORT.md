# NEXO STUDY V0.9.3
# COHESION + LEARNING LOOP REPORT

Fecha de entrega: 1 de octubre de 2026, America/Lima.

Esta fase conecta el núcleo existente. Se conservaron branding, logo, paleta, tipografías, Auth, rutas y PDF Engine 2.0. No se añadieron servicios externos ni funciones de la siguiente fase. Se auditó y completó el trabajo que ya estaba presente en el checkout; los cambios anteriores se conservaron.

## Estado

✅ indica implementación comprobada localmente. ⚠ PARTIAL indica una limitación concreta o validación pendiente; no equivale a funcionamiento comprobado en producción.

| Área | Estado | Evidencia y alcance |
| --- | --- | --- |
| Build | ✅ | TypeScript y Vite completan `npm run build`. Salida literal al final. |
| Saved Solutions | ✅ / ⚠ PARTIAL | Guardar respuesta en curso existente o nuevo; deduplicación, lectura sin regeneración y eliminación probadas con servidor simulado. Requiere aplicar 009 en Supabase real. |
| Private solution attachments | ⚠ PARTIAL | Flujo privado, múltiples imágenes, metadatos, signed URLs y rollback probados con mocks. Falta confirmar Storage y sus políticas con cuentas reales. |
| Library | ✅ | Un panel con filtros: Todo, Materiales, Apuntes, Flashcards, Práctica, Exámenes, Soluciones. Recursos por página vuelven a abrir su artefacto. |
| Mobile | ⚠ PARTIAL | Layout, navegación y flujos comprobados en Chromium. Safari/WebKit no arranca en este Windows; falta validar iOS físico y teclado virtual. |
| Content accordions | ✅ | Una sección abierta a la vez, también en desktop; temas expandibles y síntesis de hasta 360 caracteres. |
| Adaptive Home | ✅ | Actividad real del material activa Continuar/Hoy; usuario sin actividad conserva el hero. Recupera señales de Supabase sin cargar todos los documentos. |
| Progress | ✅ | Actividad y dominio separados. Sin tres intentos evaluables se muestra “Sin datos suficientes”; un 0% real solo aparece con evidencia. Conceptos débiles y actividad reciente. |
| Page actions | ✅ / ⚠ PARTIAL | Preguntar, resumir, 3–5 tarjetas y cinco preguntas sobre la página seleccionada; contexto limitado y caché de artefactos. El scroll interno del visor nativo no sincroniza automáticamente el selector. |
| Today | ✅ | Máximo tres acciones, reglas locales: sesión pendiente, conceptos débiles, errores, material abierto sin práctica y continuar último material. |
| Search | ✅ | Ctrl/Cmd+K agrupa cursos, materiales, temas y soluciones; consultas remotas diferidas. |
| Learning loop | ✅ / ⚠ PARTIAL | Quiz, tarjetas, completar espacios, examen y autoevaluación escrita actualizan el estado React compartido y las pantallas sin refresh. La práctica conversada de una SavedSolution aún no genera resultados evaluables. |
| Security | ⚠ PARTIAL | Migración, políticas y procedimiento A/B preparados. Ninguna validación RLS real fue ejecutada. |

## Auditoría y reutilización

Se revisaron `App`, `ResolverPage`, `MaterialWorkspace`, `CourseOverview`, `CourseAiPage`, `ProgressPage`, `GlobalSearch`, `StudyMethodPage`, tipos, router, estilos, repositorio, contexto, learning state, product intelligence, study progress y migraciones 007–008.

Se reutilizan `learningRepository`, `learningState`, `studyProgress`, `studySessions`, recuperación contextual, generador de artefactos y el endpoint IA existente. `PracticeViews` permite utilizar la misma práctica en el material y en artefactos de página. No hay un segundo motor ni Redux.

## Bugs encontrados y corregidos

- Resolver perdía el acceso a adjuntos después de recargar: IndexedDB conserva las imágenes no guardadas por usuario/espacio/turno; localStorage guarda solamente el chat ligero. Si faltan imágenes, Guardar informa el problema y no omite adjuntos silenciosamente.
- Guardados repetidos podían duplicar soluciones: `source_key` y su UNIQUE por propietario/curso permiten reutilizar la respuesta guardada.
- Un fallo de subida podía dejar una solución aparentemente lista: primero se crea `saving`, luego se suben archivos y se confirma `ready`. La limpieza conserva un registro pendiente si no logra retirar adjuntos; Biblioteca y búsqueda excluyen `saving`.
- El progreso local podía sobrescribir uno remoto más reciente si la lectura tardaba más que el debounce: la hidratación de señales termina antes de habilitar escrituras. Reintentar vuelve a hidratar antes de guardar. Prueba con demora de 1,3 segundos y caché antigua.
- Una revisión escrita fallida mostraba autoevaluación y podía registrar comprensión: las acciones solo aparecen después de una respuesta válida de Nexo. Continuar ahora dice “Lo comprendí · siguiente” y expresa la autoevaluación.
- Completar espacios permitía editar la respuesta ya comprobada y cambiar el feedback sin actualizar el registro: se bloquea el input hasta pasar al siguiente ejercicio.
- El 0% de dominio sin práctica daba una conclusión falsa: ahora se exige evidencia y se diferencia de actividad.
- Recursos de página podían mezclarse con los generales: el alcance `payload.scope.page` se conserva y los selectores generales excluyen los recursos por página.
- Un helper de QA elegía navegación móvil si comprobaba visibilidad durante la carga de escritorio: ahora usa el viewport y espera el control correcto.
- Algunas capturas podían tomar el fallback de carga: QA espera la pantalla lista antes de fotografiarla.
- Resolver vacío reservaba la columna del historial en escritorio y comprimía el composer: el layout solo activa historial cuando hay conversaciones; QA comprueba que el chat ocupe al menos el 95% del ancho disponible.
- El selector flotante de espacio tapaba los breadcrumbs del material en móvil: en estudio intensivo queda accesible desde el drawer, sin superponerse al documento.

## UX changes

Guardar aparece discretamente en cada respuesta de Resolver. El selector permite elegir un curso o crearlo; al completar, abre Biblioteca y la solución original. Pregunta, respuesta, imágenes privadas, fecha y curso se conservan sin nueva llamada IA.

El header móvil conserva menú, título y cuenta. Búsqueda, espacio y beta siguen accesibles desde navegación. El drawer usa `min(320px, 84vw)`, backdrop, Escape, cierre al navegar, bloqueo del body y ocultación de bottom nav. El perfil ofrece Configuración y Cerrar sesión.

Sugerencias de Resolver tienen scroll local y snap; composer y navegación respetan safe area. Material y Nexo IA son pestañas separadas en móvil. Content usa Resumen, Temas, Aprender, Practicar y Evaluar, con solo una sección principal abierta. No se muestra el texto bruto como síntesis.

Home propone el último material estudiado y hasta tres acciones útiles. Progreso muestra qué reforzar y un registro reciente compacto. Las recomendaciones no consumen IA.

## Nuevos componentes

- `SaveSolutionDialog`, `SavedSolutionDialog`: guardado y lectura de soluciones.
- `CourseLibrary`, `AdaptiveHome`: archivo del curso y continuación.
- `PageArtifactView`, `PracticeViews`: recursos por página con la práctica existente.
- Helpers `resolverAttachments`, `artifactScope`, `pageActions`: adjuntos locales, alcance y validación de rangos.

## Migraciones, RLS y Storage

Se agregó `sql/009_saved_solutions.sql`. Tabla con FK compuesta al curso del propietario, timestamps, índice por curso/fecha, UNIQUE para deduplicación y CHECK de metadatos de adjuntos. RLS owner-only sin excepción de admin. El bucket `solution-images` es privado, con políticas de subida/lectura ligadas al propietario y solución. Se generan signed URLs por diez minutos.

Los adjuntos guardan únicamente `storagePath`, `mimeType`, `name`, `bytes`. Hasta cuatro imágenes de 3 MB por archivo; nunca base64 o blobs en Postgres. Ruta: `userId/courseId/solutions/solutionId/archivo`. La eliminación retira los archivos antes de la fila.

El diff confirma que migraciones 001–008, Auth, router y `styles.css` permanecen intactos. El pulido visual se concentra en las reglas existentes de `responsive.css`.

`sql/SECURITY_VALIDATION.md` y `scripts/validate-academic-security.mjs` permiten probar User A y User B en ambos sentidos: lectura, escritura, modificación, borrado, descargas privadas, emisión de signed URLs y ausencia de descarga pública. El script no usa service_role, crea fixtures propios y limpia solamente esos fixtures. Su sintaxis pasa `node --check`.

No estaban configuradas las cuatro variables de prueba requeridas. No se aplicó la migración ni se afirmó que RLS o Storage real estuvieran validados.

## Tests

Resultados:

- `npm run build`: ✅ TypeScript strict y Vite; salida literal al final.
- `npm run test:engine`: ✅ 1/1, resumen por página aceptado por el endpoint existente.
- `npm run test:e2e -- --project=desktop --project=android --project=small-phone`: 149/150 en 5,6 minutos. El único fallo era el helper de tests que confundía carga de escritorio con navegación móvil; corregido.
- Reejecución del caso fallido, QA visual, navegación y conversación de Resolver después de los últimos ajustes: ✅ 12/12 en 1,2 minutos, en desktop, Android y teléfono pequeño. Los 150 casos de Chromium tienen ejecución aprobada entre la batería y las reejecuciones; no se afirma que la primera batería estuviera totalmente verde.
- La primera suite completa, con iphone/tablet, terminó con 149/240 aprobados: 90 fallos de arranque WebKit y un timeout de QA con cinco viewports. El timeout tiene un presupuesto específico de 90 segundos y pasa; WebKit continúa PARTIAL.
- `node --check scripts/validate-academic-security.mjs` y `git diff --check`: ✅.

Logs locales: `qa-v0.9.3-build.log`, `qa-v0.9.3-chromium.log`, `qa-v0.9.3-followup.log`, `qa-v0.9.3-final.log`. La suite final vuelve a generar capturas reales después de esperar la carga; se inspeccionaron Resolver desktop/móvil y Material Workspace.

Cobertura añadida: guardado en curso y creación de curso, dos imágenes privadas, persistencia local ligera, deduplicación, rollback, reabrir Biblioteca, búsqueda de soluciones, aislamiento del contexto de página, artefactos cacheados, respuesta errónea y actualización de Course Overview/Home/Hoy/Progress, recuperación de actividad en navegador nuevo, hidratación lenta, fallo de revisión escrita, prioridad determinista de Hoy, dominio sin evidencia y rangos inválidos.

PDF QA cubre 4 páginas, 100 páginas, 402 páginas, textual, escaneado, mixto y extracción fallida. “Preparar más” ofrece siguientes 40, siguientes 80, rango y todo pendiente; solo prepara páginas que faltan. No reanaliza un libro completo automáticamente.

## Performance

Startup consulta catálogo ligero y señales académicas; cuerpos, chunks y artefactos se cargan por curso/material. SavedSolutions se consultan al abrir Biblioteca o buscar, nunca todas al inicio. Las búsquedas remotas tienen debounce; los recursos de página se cachean. No se usa IA para recomendaciones, Hoy, progreso ni selección de práctica.

Vite conserva un aviso de chunk principal superior a 500 kB: 625,61 kB / 189,01 kB gzip. Build pasa; la optimización adicional de bundles queda pendiente.

## Mobile QA

La batería comprueba 393×852, 430×932, 768×1024, 1440×900 y 1920×1080, además de los proyectos Android y teléfono de 320×640. Verifica overflow, separación composer/bottom nav, drawer, Escape, backdrop, accordions y filtros. Capturas en `test-results`; informe navegable de Playwright en `playwright-report`.

WebKit instalado se cierra incluso en una prueba de arranque aislada, antes de abrir Nexo, con exitCode 3236495362. No se sustituyó WebKit por Chromium para afirmar validación Safari. La suite completa que incluye iphone/tablet no está verde por ese bloqueo del runtime.

## Limitaciones PARTIAL

1. **SavedSolution → práctica evaluada:** la acción inicia un chat con la solución como contexto. Todavía no registra intentos o dominio porque el esquema de learning state está vinculado a materiales. La interfaz lo dice expresamente; no se duplica la solución como material para simular persistencia.
2. **Página del visor PDF:** las acciones usan el selector explícito de página y envían solo esa página. El visor PDF nativo dentro del iframe no expone su posición de scroll a React; no se afirma que Nexo detecte automáticamente la página visible.
3. **Escaneados:** se conserva análisis parcial. Si una página no tiene texto preparado, sus acciones informan que debe prepararse o analizarse visualmente. Un análisis visual de varias páginas produce un fragmento de rango y no permite atribuirlo con certeza a una página individual; no se usa ese rango para fingir contexto de una página.
4. **Autoevaluación escrita:** la revisión da orientación y el estudiante confirma comprensión. No se presenta como calificación automática objetiva. Tarjetas también dependen de autoevaluación.
5. **Sincronización entre dispositivos:** persistencia en Supabase y recuperación al abrir/reintentar; la actualización inmediata se verifica dentro de la app actual. No se implementó una suscripción Realtime ni resolución transaccional de ediciones simultáneas entre dispositivos.
6. **Artefactos offline:** se conserva la copia local y se muestra error si falla su subida. No se agregó una cola universal de publicación de todos los artefactos/chunks offline.
7. **Borrado externo de curso:** la FK elimina filas, pero Storage requiere limpiar prefijos para evitar huérfanos. No se añadió un servicio externo de limpieza.
8. **Safari/iOS y Supabase real:** pendientes por los límites de validación descritos.

## Qué falta validar en Supabase real

Aplicar 009 dos veces en un proyecto de prueba; ejecutar el script con A/B; confirmar buckets privados, CHECKs, caso admin, deduplicación, subida interrumpida/recuperación, borrado, expiración y renovación de signed URLs. Repetir el ciclo completo en dos navegadores usando el backend y proveedor IA reales. Los mocks comprueban flujo y contratos, no la calidad pedagógica del modelo ni sus permisos efectivos.

## Siguiente fase recomendada

Primero validar 009, Storage y RLS con dos cuentas, y completar QA Safari/iOS físico. Después cerrar la práctica evaluable desde SavedSolutions dentro del esquema académico existente. No se implementó esa siguiente fase.

## Resultado literal de npm run build

```text

> nexo-study-mvp@0.9.3 build
> tsc -b && vite build

vite v8.3.0 building client environment for production...
transforming...
✓ 122 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                           0.98 kB │ gzip:   0.49 kB
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
dist/assets/index-BGDgZ9Ti.css                          168.73 kB │ gzip:  35.57 kB
dist/assets/CorrectorPage-DP7btUEG.js                     2.58 kB │ gzip:   1.09 kB
dist/assets/CoursePracticePage-9zO9Trpw.js                3.48 kB │ gzip:   1.36 kB
dist/assets/AdminFeedbackPage-D6SURYUa.js                 4.41 kB │ gzip:   1.71 kB
dist/assets/CourseAiPage-DXKwkDPG.js                      4.80 kB │ gzip:   2.19 kB
dist/assets/jsx-runtime-Dk72oS4N.js                       8.77 kB │ gzip:   3.33 kB
dist/assets/StudyMethodPage-twieMe-9.js                  15.23 kB │ gzip:   4.43 kB
dist/assets/ResolverPage-lP_lWGC-.js                     16.37 kB │ gzip:   5.85 kB
dist/assets/AuthPage-CNgJXISO.js                         16.88 kB │ gzip:   5.26 kB
dist/assets/MaterialWorkspace-DECryN1w.js                20.62 kB │ gzip:   6.83 kB
dist/assets/supabase-DjkFSsay.js                        214.91 kB │ gzip:  55.31 kB
dist/assets/pdf-LxdBvHgC.js                             430.93 kB │ gzip: 129.03 kB
dist/assets/index-CumfbCC3.js                           625.61 kB │ gzip: 189.01 kB

✓ built in 529ms
[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
```

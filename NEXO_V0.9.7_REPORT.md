# NEXO STUDY V0.9.7 — Universal Knowledge + Source Hub

Fecha: 2026-10-03. Base: V0.9.6, commit `612dc25a3b276f12bd6e61955535547a536ec0d6`.

## 1. Estado general

✅ VERIFIED en el entorno local: captura unificada, normalización, originales privados mediante el contrato existente, lectores, Biblioteca, práctica y actualización inmediata de evidencia/Home. Se mantiene el logo, la paleta y la navegación de Nexo. Versión 0.9.7.

⚠️ PARTIAL en producción: no se aplicaron SQL 010/011 al Supabase remoto ni se ejecutó la prueba HTTP A/B con cuentas reales. No hay un proyecto de prueba autorizado con credenciales suficientes en esta sesión. YouTube automático y Safari/iPhone también permanecen PARTIAL. Los mocks no demuestran autorización remota ni calidad del modelo real.

## 2. Baseline V0.9.6

✅ VERIFIED: repositorio inicialmente limpio en `main`; remoto `https://github.com/sebashulla/nexo-study.git`; migraciones 001–010 existentes y 011 disponible. Se leyeron los reportes 0.9.5/0.9.6 y se auditó App, Home, cursos, Library, PDF, conversaciones, memoria, Graph, Auth/RLS/Storage y pruebas.

Build de base: 153 módulos, main 375.13 kB / 114.95 kB gzip, CSS 191.16 kB / 39.19 kB gzip. Suite dirigida de base: 44 pruebas aprobadas. La suite amplia posterior reveló expectativas antiguas de demos y formularios; se documentan abajo.

## 3. Pendientes cerrados

✅ VERIFIED localmente: un solo flujo de agregar material, cuenta nueva sin datos de demostración, menú de cuenta secundario, curso/destino explícito, contenido dividido en unidades, citas tipadas, invalidación de recursos al editar, búsqueda excluyendo archivados y borrado con cola durable antes de eliminar metadatos.

⚠️ PARTIAL: 010/011 remotas, RLS real y Storage HTTP A/B. El validador remoto se amplió para las cuatro clases de objetos, RPCs y cleanup; solo se comprobó su sintaxis. No se usó una cuenta administradora como sustituto de dos usuarios comunes.

## 4. Source architecture

✅ VERIFIED: `materials` conserva la identidad del recurso. `sourceType` distingue pdf/image/docx/pptx/text/web/youtube/note. `sourceModel`, `sourceProcessing` y `sourceRepository` separan normalización, extracción y persistencia. No hay tablas por formato.

`Source → Extraction → NormalizedDocument → material_chunks/material_topics → study_artifacts → concept_evidence/learning_state → Home`.

PDF mantiene su procesamiento progresivo existente y comparte los consumidores académicos. Web y YouTube pasan por un endpoint backend autenticado; Office/texto se extraen en el navegador.

## 5. NormalizedDocument

✅ VERIFIED: título, texto, unidades ordenadas, bloques semánticos, metadatos de origen, advertencia y estado parcial. El ordinal numérico existente de página representa página, diapositiva, sección o segmento. Heading/timestamp permiten mostrar referencias correctas sin cambiar las relaciones académicas.

Límites: 300 000 caracteres y 500 unidades para fuentes nuevas; headings de 180 caracteres. La RPC valida forma/ordinal/referencias, aplica CAS por `sourceRevision` y actualiza contenido, chunks, temas y resumen en una transacción. Conserva evidencia; invalida recursos derivados del contenido anterior.

## 6. Add Source UX

✅ VERIFIED: un mismo `AddSourceDialog` desde Home, curso, Biblioteca y Workspace, con Subir/Pegar/YouTube/Apuntes. Curso preseleccionado al entrar desde él; obligatorio desde Home/Biblioteca; creación de curso en el propio formulario. Título sugerido y editable.

Guardar crea primero el registro remoto pendiente y abre el Workspace; extracción sigue mientras se navega. Estado inline sin porcentajes inventados. En móvil se presenta como bottom sheet con controles de al menos 44 px.

## 7. PDF

✅ VERIFIED en Chromium: visor, original privado, páginas físicas, texto/chunks, primer pase acotado, análisis parcial, reintento, página escaneada seleccionada, fuentes y acciones sobre la página. Las pruebas incluyen PDFs de 402 y 100 páginas, escaneados, mixtos y extracción fallida. No se reemplazó PDF Engine 2.0.

## 8. Images

✅ VERIFIED para ingesta/persistencia/UI con respuesta multimodal controlada: PNG/JPG/WEBP validan extensión, MIME y firma; original privado; lectura explícita al guardar usa el contrato multimodal existente. Una respuesta ilegible o mal formada produce error/reintento, no contenido ficticio.

⚠️ PARTIAL: precisión de extracción del modelo real sobre fotografías/pizarras no verificada sin una operación real del proveedor. No se añadió OCR pesado.

## 9. DOCX

✅ VERIFIED con archivos ZIP reales de prueba: encabezados/estilos, párrafos, listas y tablas como texto semántico. Se estudia el contenido sin reproducir Word visualmente. Parser lazy y descompresión nativa; archivo corrupto, formato equivocado, DTD/entidades y expansión excesiva se rechazan.

⚠️ PARTIAL para imágenes, fórmulas gráficas y diseños especiales dentro de Office: no se transcriben automáticamente. Un documento sin texto produce un error explicativo y permite exportar a PDF/TXT.

## 10. PPTX

✅ VERIFIED: orden de `presentation.xml`/relaciones, títulos, texto y notas del presentador; no se ordenan slides por nombre de archivo. Diapositivas vacías conservan su ordinal y generan estado parcial. Citas muestran Diapositiva N y abren esa unidad.

⚠️ PARTIAL: no se renderiza la apariencia original de la slide ni se interpreta automáticamente texto dentro de imágenes/gráficos.

## 11. Text

✅ VERIFIED: TXT/Markdown UTF-8 y texto pegado, título editable, headings, unidades de lectura y pipeline académico común. Archivos binarios/UTF-8 inválido se rechazan. Sin editor pesado ni dependencia nueva para texto.

## 12. Web

✅ VERIFIED: backend separado `/api/sources/process`, extracción HTML semántica, scripts/styles/navegación/iframes/elementos ocultos eliminados. Se preserva URL original. Prueba de red real sobre `https://www.w3.org/TR/FileAPI/`: título File API, 56 unidades y 53 919 caracteres extraídos mediante `safeSourceFetch`.

⚠️ PARTIAL para sitios que necesitan JavaScript, login, anti-bot, compresión obligatoria o HTML no útil; muestran error y permiten pegar texto. El endpoint desplegado con Auth/Supabase real no se comprobó. Esta prueba de módulo backend no equivale a desplegar el servicio. No se exportan HTML original, cookies ni headers del sitio como respuesta de proxy.

## 13. YouTube

✅ VERIFIED: enlaces HTTPS canónicos, video id, metadatos oEmbed cuando están disponibles, transcripción manual con timestamps, lector y enlace al instante correspondiente. Contrato de proveedor autorizado probado con transcript mock y límites/orden temporal.

⚠️ PARTIAL: no hay un proveedor de captions autorizado configurado. La API oficial de descarga requiere permisos OAuth sobre el video; no se añadió scraping ni descarga de video. En este estado muestra exactamente «No encontramos una transcripción disponible.» y ofrece pegar transcripción. El recurso permanece parcial sin inventar conceptos del video.

Fuente técnica: [YouTube captions.download](https://developers.google.com/youtube/v3/docs/captions/download).

## 14. Notes

✅ VERIFIED: título/cuerpo, headings Markdown, autosave con debounce de 800 ms, borrador por usuario/material y CAS remoto. Edición actualiza contexto/temas e invalida recursos antiguos. Un error conserva el borrador. Un borrador de otra revisión requiere elección explícita.

✅ VERIFIED: Guardar como apunte desde Resolver/Nexo es una acción explícita que abre el mismo flujo y crea un recurso con curso. No se convierten automáticamente respuestas en materiales.

⚠️ PARTIAL: la resolución de conflictos simultáneos en dos dispositivos reales no fue comprobada; CAS rechaza revisiones antiguas. No hay edición colaborativa.

## 15. Library V2

✅ VERIFIED: biblioteca global del usuario y biblioteca del curso comparten filtros Todos/PDF/Documentos/Imágenes/Web/YouTube/Apuntes/Flashcards/Prácticas/Soluciones. Móvil presenta un botón Filtros; escritorio chips compactos. Busca título, curso, tipo, temas y títulos de conversaciones con consultas acotadas. Archivados se consultan mediante opción explícita.

Catalogación lee metadatos; abre detalle al entrar en un recurso. Las filas usan los tokens visuales existentes, sin fondo gris del navegador.

## 16. Course V3

✅ VERIFIED: Continuar → Materiales → Práctica reciente → recomendaciones con evidencia. Tarjetas informan tipo/unidades y estado. Renombrar usa RPC con revisión; archivar/restaurar no destruye evidencia; eliminar informa exactamente el cascade y usa cleanup.

⚠️ PARTIAL: mover un material entre cursos no se implementó. Requiere migrar conjuntamente objetos privados, conversaciones, relaciones, evidencia y sesiones con una estrategia de rollback. No hay una acción simulada. Mover cursos entre espacios conserva el comportamiento previo.

## 17. Material readers

✅ VERIFIED: shell del Workspace existente y lectores lazy para documentos, slides, artículos, transcripciones, imágenes y apuntes; PDF conserva su visor. Ancho de lectura 68ch, TOC acotado, una unidad visible y anterior/siguiente. Preguntar sobre una sección alimenta el chat de material con esa unidad. En móvil se mantiene Material/Nexo.

Práctica, tarjetas, preguntas escritas, completar y simulacro usan referencias tipadas y botones para abrir la fuente. Citas inventadas fuera del contexto se rechazan antes de guardar un artefacto. Selección arbitraria de texto → Nexo se difiere (P2); preguntar sobre la sección sí funciona.

## 18. Nexo retrieval

✅ VERIFIED local: reutiliza chunks y RPC de búsqueda existentes, ahora excluyendo archivados/eliminación/fuentes sin contenido utilizable. Contexto de generación: hasta seis chunks muestreados / 15 000 caracteres. Course AI conserva sus presupuestos y recuperación selectiva, sin enviar todo el curso ni introducir vectores obligatorios.

No se ofrecen quizzes/tarjetas sintéticos como si fueran recursos generados: práctica exige un artefacto listo o paquete previo de Nexo IA. El resumen mínimo inicial es extractivo; no prueba generación de IA.

## 19. Learning Graph integration

✅ VERIFIED con repositorio/IA controlados: ingesta DOCX → quiz → respuesta incorrecta → `concept_evidence`/`learning_state` → fuente de la sección → Home recomienda reforzar el concepto. Las superficies comparten el estado de sesión, y los tests anteriores cubren memoria/conversaciones, práctica focalizada y Progreso sin confundir falta de evidencia con 0% de dominio.

⚠️ PARTIAL: no se afirma persistencia A/B remota ni calidad pedagógica de respuestas reales a partir de mocks.

## 20. Mobile

✅ VERIFIED en Chromium y proyectos táctiles: matriz 320×640, 360×800, 375×667, 390×844, 393×852, 430×932, 768×1024, 1366×768, 1440×900, 1920×1080. Diez superficies por tamaño generan 100 capturas de fuentes. Se inspeccionaron visualmente las diez hojas de contacto y la lectura ampliada, además de comprobaciones de overflow; se revisó Biblioteca tras corregir su contraste.

Un único drawer móvil, texto de lectura de 16 px, TOC corto, bottom sheet y acciones táctiles. Las capturas son recursos de QA, no materiales reales del usuario ni evidencia de calidad de IA.

⚠️ PARTIAL: Safari/iPhone nativo depende del resultado de WebKit descrito en Tests. La emulación táctil Chromium no sustituye Safari.

## 21. Accessibility

✅ VERIFIED: labels, entrada de archivo por teclado, dropzone que no depende de arrastrar, Tab/Shift+Tab atrapados en diálogo, Escape y devolución de foco, aria-live discreto y errores asociados mediante aria-describedby. Se corrigió el escape de Tab desde el último control del diálogo nativo.

⚠️ PARTIAL: no se realizó una auditoría completa con lector de pantalla real.

## 22. Security

✅ VERIFIED local: Auth requerida en endpoint; buckets privados, paths por usuario/curso/material, signed URLs de 600 s; extensión/MIME/magic bytes y tamaños en cliente, MIME/tamaño de bucket en SQL. ZIP/XML con límites/CRC32 y sin ejecutar macros/entidades. Texto renderizado como contenido, no HTML activo. Los definer RPCs validan `auth.uid()` y ownership; permisos internos revocados y search_path definido.

⚠️ PARTIAL: políticas y triggers reales de Supabase/Storage todavía deben aplicarse y probarse con dos cuentas comunes. Los tests PostgreSQL usan roles/RLS reales en un motor aislado con esquema Storage de prueba, sin sustituir HTTP Storage real.

## 23. SSRF protection

✅ VERIFIED: solo HTTP/HTTPS y puertos estándar; sin credenciales en URL; bloqueo de redes privadas, loopback, link-local, metadata, multicast, rangos reservados, IPv4 mapeado/NAT64/transición y DNS mezclado. DNS se valida completo y se fija la IP al conectar; se verifica la IP del socket. Cada redirect revalida URL/DNS. Máximo tres redirects, 10 s, 2 MB, headers 16 KB y HTML con 50 000 nodos útiles. No es un proxy de respuesta arbitraria; devuelve el documento normalizado autenticado.

Se rechaza compresión HTTP no identity; alguna representación IPv6 pública equivalente puede rechazarse por comparación estricta. Es una limitación de acceso, no un fallback a una red privada.

## 24. Storage cleanup

✅ VERIFIED local: `begin_academic_cleanup` bloquea parent y congela escrituras, descubre objetos reales de cuatro buckets y guarda manifest durable. Cliente elimina blobs por lotes de 100; `finish_academic_cleanup` verifica de nuevo que no quedan objetos, luego realiza cascade de metadatos. Fallo mantiene registro/estado para reintentar. La UI muestra cola pendiente, y tombstones impiden resurrección por caché tardía.

Material elimina sus conversaciones asociadas, chunks, temas, artefactos y evidencia; conserva soluciones y conversaciones generales/otras del curso. Curso elimina su contenido académico y objetos asociados. Se explica en el diálogo. La limpieza local es best-effort cuando el navegador niega almacenamiento. También se limpian borradores y cachés de conversaciones/adjuntos de los scopes eliminados.

⚠️ PARTIAL: compatibilidad/permisos para crear el trigger sobre `storage.objects` deben confirmarse en el proyecto de prueba Supabase. La cola depende de que un cliente vuelva a abrir Nexo/reintente; no se añadió worker externo. Después de cleanup no puede reutilizarse el mismo id tombstonado.

## 25. Performance

✅ VERIFIED: Office/parser y cada lector se cargan bajo demanda. parse5 es backend; no entra al bundle frontend. Catálogo no descarga todo el texto del curso. Las fuentes procesan una sola operación por material y pueden navegar mientras trabaja.

| Bundle | V0.9.6 | V0.9.7 | Cambio |
|---|---:|---:|---:|
| Main | 375.13 kB | 381.63 kB | +6.50 kB (+1.73%) |
| Main gzip | 114.95 kB | 116.77 kB | +1.82 kB (+1.58%) |
| CSS | 191.16 kB | 199.14 kB | +7.98 kB |
| CSS gzip | 39.19 kB | 40.53 kB | +1.34 kB |

168 módulos. Chunks lazy: Office 6.51/2.96 kB gzip; procesamiento 3.65/1.73; SourceReader 2.96/1.21; DocumentReader 1.98/0.86; TranscriptReader 1.94/0.93; NoteReader 3.53/1.50; Library 5.86/2.59; AddSourceDialog 6.75/2.60. No hay parse5 en los assets frontend.

⚠️ PARTIAL: no hay benchmark de dispositivos físicos lentos ni p95 de producción. IndexedDB conserva originales pendientes cuando hay cuota; si el navegador niega almacenamiento y la subida falla, después de recargar puede requerir elegir el archivo nuevamente. El estado de error lo permite. Manifiestos de cleanup y lista histórica de tombstones pueden crecer; no se ocultan objetos para ahorrar tamaño.

## 26. Tests

✅ VERIFIED:

- `npm run build`: exit 0, versión 0.9.7, 168 módulos.
- `npm run test:sources`: 45 pruebas aprobadas de SSRF, DNS pinning/redirects, HTML y contrato YouTube.
- `npm run test:schema`: 60 checks PostgreSQL aprobados; migraciones 001–011 + repetición 010/011, roles A/B, RLS y cleanup en esquema aislado.
- `npm run test:engine`: contrato del motor existente aprobado (1 prueba).
- `source-engine.spec.ts`: 3 pruebas por proyecto Chromium (9 ejecuciones): extracción Office real, ZIP/XML/expansión y citas/normalización.
- Suite amplia: `npx playwright test --project=desktop --project=android --project=small-phone`: 384 casos, **322 aprobados, 60 omitidos y 2 fallidos** en 11.8 minutos. Los 60 son matrices de diez tamaños ejecutadas una sola vez en escritorio; los recorridos táctiles se mantienen.
- Repetición de los dos casos fallidos: **2 aprobados** (creación/curso/móvil en desktop y PDF mixto en Android). PDF mixto: además **3 repeticiones consecutivas aprobadas**.
- Citas desde búsqueda, Biblioteca del curso y artefactos: **6 aprobadas** (PPTX/YouTube × desktop/android/320).
- Recuperación de ingesta interrumpida y citas: **9 aprobadas** antes de la suite amplia; el nuevo caso de recuperación también pasa dentro de ella.
- La primera suite amplia de desarrollo había dado 254 aprobados/55 fallidos/60 omitidos: contenía supuestos de demos, formulario anterior y controles/citas antiguas. Se repararon y se volvieron a ejecutar; no se presentan aquellos fallos como aprobación.

⚠️ PARTIAL: reproducibilidad sin intermitencias de la suite amplia bajo este servidor de desarrollo Windows. Uno de los últimos fallos quedó esperando el módulo `@react-refresh` durante el login inicial; el otro perdió la selección de la pestaña Nexo en la prueba PDF mixta. Pasan al repetir, pero no se declara que la ejecución amplia completa tuvo cero fallos.

⚠️ PARTIAL: WebKit 2359 en Windows falla **antes de iniciar la página**, exit code 3236495362, tanto en `iphone` como `tablet` (dos lanzamientos fallidos). No se sustituye esa evidencia por Chromium. Supabase remoto/Storage HTTP y proveedor de IA real no se probaron.

Los mocks académicos modelan revisión atómica, archive/rename, cola/manifest/cascade y originales privados; no constituyen validación Supabase remota. Fixtures de cursos/demos son explícitos únicamente en pruebas; una cuenta nueva de producción arranca vacía.

Cobertura solicitada de ingesta:

| Caso | Evidencia |
|---|---|
| 1 PDF conservado | pdf-engine-v2 y visual-workflows: real PDF, 402/100 páginas, scan/mixed/retry |
| 2 DOCX | universal-sources: upload privado, texto normalizado y reload |
| 3 PPTX | universal-sources + source-engine: orden y notas |
| 4 TXT | universal-sources: UTF-8 + reader tras reload |
| 5 imagen | original PNG privado + extracción multimodal mock |
| 6 pegar texto | título editable, unidades y Library/Search |
| 7 URL válida | módulo backend en red real W3C y contrato extractArticle |
| 8 URL privada | backend: IPv4/IPv6/DNS privados |
| 9 redirect privado | backend: no se ejecuta segunda petición |
| 10 YouTube transcript mock | backend proveedor autorizado y UI timestamp |
| 11 sin transcript | parcial honesto + pegar manualmente |
| 12 curso obligatorio | Home/Library sin submit hasta destino |
| 13 abrir material | uploads y creación inline abren Workspace |
| 14 flashcards DOCX | generación, cita inválida rechazada y retry con sección real |
| 15 sección correcta | DOCX quiz → fuente exacta y contexto por unidad |
| 16 slide | artefacto citado abre Diapositiva 2 |
| 17 timestamp | artefacto citado abre unidad 12:42 y link t=762 |
| 18 eliminar | archive/restore y eliminación explícita |
| 19 cleanup | SQL: blobs primero, cascade, retry, stale revision/tombstone |
| 20 upload retry | fallo de original conserva un material, retry sin duplicar |

UX: Home → curso inline → source → workspace; curso preseleccionado; Library filtros → reader; Ctrl K → material; bottom sheet; reader → Nexo; guardar respuesta → apunte → flashcards. La Biblioteca del curso conserva el ordinal al abrir un tema remoto; la misma prueba comprueba sección/slide/timestamp desde Ctrl K y desde Biblioteca. QA excluye los duplicados de matrices visuales en android/small-phone, manteniendo allí las interacciones táctiles.

## 27. Bugs encontrados

Durante QA se detectaron: demos al iniciar cuenta vacía; título sugerido detenido tras el primer carácter; creación inline con estado de curso todavía no disponible; borrado sin coordinación con uploads/caché; búsqueda incluyendo archivados; recursos de práctica de fallback aparentando estar listos; estilos de Library dependientes de wrapper anterior; escape de Tab; citas de simulacro genéricas; detalles remotos que volvían a poner una operación interrumpida en procesamiento; referencias de IA a unidades inexistentes. Tests viejos asumían formularios, mayúsculas, demos y controles exclusivos de Study Focus.

## 28. Bugs corregidos

✅ VERIFIED mediante checks dirigidos: cuenta vacía, título editable, curso inline disponible al guardar, cola durable/tombstones/revisiones, exclusión de archivados, gates de artefactos, tokens de Biblioteca, trap del diálogo, citas de todos los métodos y rechazo de unidades fuera del contexto y recuperación de ingesta interrumpida sin sobrescribir una revisión local más reciente, además de conservar unidades en la navegación de la Biblioteca del curso. Tests actualizados para interacción real con filtros colapsados, pasos del Source Hub y fixtures explícitos. No se cambió una expectativa de datos reales por contenido ficticio de producto.

## 29. Migraciones

✅ VERIFIED en PostgreSQL aislado: 001–011, repetición de 010/011, 60 checks de RLS/ownership/RPCs, formato normalizado, revisiones, archive, búsquedas y cleanup. `011_universal_sources.sql` es aditiva/transaccional; `materials.source_type` se amplía, `study-sources` queda privado y `academic_cleanup_jobs` añade estado durable. No hay tablas específicas por formato.

⚠️ PARTIAL para ejecución remota. Orden pendiente: proyecto de prueba autorizado → 010 → validación A/B → repetición → 011 → A/B/Storage/cleanup → repetición → solo después proyecto destino autorizado. Si falla el permiso del trigger Storage, investigar en prueba; no omitir silenciosamente la protección.

## 30. Archivos nuevos

- `NEXO_V0.9.7_REPORT.md`
- `api/sources/process.js`
- `server/safeSourceFetch.mjs`
- `server/sourceExtraction.mjs`
- `server/sourceExtraction.test.mjs`
- `sql/011_universal_sources.sql`
- `src/AddSourceDialog.tsx`
- `src/DeleteAcademicDialog.tsx`
- `src/LibraryV2.tsx`
- `src/SourceReader.tsx`
- `src/lib/officeExtraction.ts`
- `src/lib/sourceFileCache.ts`
- `src/lib/sourceModel.ts`
- `src/lib/sourceProcessing.ts`
- `src/lib/sourceRepository.ts`
- `src/readers/ArticleReader.tsx`
- `src/readers/DocumentReader.tsx`
- `src/readers/ImageStudyView.tsx`
- `src/readers/NoteReader.tsx`
- `src/readers/SlideReader.tsx`
- `src/readers/TranscriptReader.tsx`
- `src/sources.css`
- `tests/helpers/sourceFixtures.ts`
- `tests/helpers/studyFixtures.ts`
- `tests/source-engine.spec.ts`
- `tests/source-responsive.spec.ts`
- `tests/universal-sources.spec.ts`

## 31. Archivos modificados

- `package-lock.json`
- `package.json`
- `scripts/test-learning-schema.mjs`
- `scripts/validate-academic-security.mjs`
- `server.mjs`
- `sql/README.md`
- `sql/SECURITY_VALIDATION.md`
- `src/AccountMenu.tsx`
- `src/AccountUtilities.tsx`
- `src/AdaptiveHome.tsx`
- `src/App.tsx`
- `src/CourseAiPage.tsx`
- `src/CourseCard.tsx`
- `src/CourseLibrary.tsx`
- `src/CourseOverview.tsx`
- `src/Dialog.tsx`
- `src/ExamRunner.tsx`
- `src/FoldersPage.tsx`
- `src/GlobalSearch.tsx`
- `src/MaterialCard.tsx`
- `src/MaterialWorkspace.tsx`
- `src/PracticeViews.tsx`
- `src/ResolverPage.tsx`
- `src/StudyMethodPage.tsx`
- `src/lib/artifactPrompts.ts`
- `src/lib/conversationTypes.ts`
- `src/lib/learningContext.ts`
- `src/lib/learningGraphRepository.ts`
- `src/lib/learningRepository.ts`
- `src/lib/materialTitles.ts`
- `src/lib/productIntelligence.ts`
- `src/lib/router.ts`
- `src/main.tsx`
- `src/types.ts`
- `tests/cohesion.spec.ts`
- `tests/helpers/academicMock.ts`
- `tests/helpers/navigation.ts`
- `tests/learning-sync.spec.ts`
- `tests/navigation-polish.spec.ts`
- `tests/pdf-engine-v2.spec.ts`
- `tests/product-ux.spec.ts`
- `tests/resolver-chat.spec.ts`
- `tests/responsive-auth.spec.ts`
- `tests/visual-workflows.spec.ts`
- `tests/workspaces.spec.ts`

## 32. Dependencias añadidas

✅ VERIFIED: `parse5@8.0.1` (MIT, aproximadamente 337 099 bytes desempaquetados; transitive `entities@8`). Resuelve parsing HTML semántico y robusto en backend; import dinámico, sin coste en main frontend. Se justificó antes de instalar; no existía parser HTML backend equivalente. No se añadieron librerías Office/OCR/editor/vector DB. `npm audit --omit=dev` informó 0 vulnerabilidades en esta revisión. Descompresión nativa se usa bajo límites; navegadores incompatibles muestran un error.

Fuentes: [parse5 MIT](https://github.com/inikulin/parse5), [Compression Streams](https://compression.spec.whatwg.org/), [Open XML slides](https://learn.microsoft.com/en-us/office/open-xml/presentation/how-to-get-all-the-text-in-a-slide-in-a-presentation).

PGlite se instaló únicamente bajo `node_modules/.cache/nexo-sql-runtime` para QA aislado; no se añade a package/lock ni al producto.

## 33. Limitaciones

⚠️ PARTIAL: Supabase HTTP/RLS/Storage en proyecto real; proveedor transcript YouTube; calidad multimodal/modelo real; Safari/iPhone; imágenes/gráficos de Office; movimiento de materiales; sitio dinámico/privado; concurrencia de dos dispositivos reales; lectura de pantalla completa y rendimiento físico. P2: seleccionar texto arbitrario y microanimaciones se difieren.

No se agregó podcast, calendario, comunidad, gamificación, grabación, pagos ni funciones externas. No hay funcionalidad simulada para suplir las limitaciones anteriores.

## 34. Pendientes

1. Disponer de proyecto Supabase de prueba autorizado y dos sesiones comunes A/B, aplicar/repetir 010/011 y ejecutar `npm run test:security:live` con las variables descritas en SECURITY_VALIDATION. Verificar los cuatro buckets mediante HTTP antes de aplicar al destino.
2. Verificar Safari/iPhone en un host con WebKit operativo o dispositivo real; comprobar soporte de deflate-raw o mostrar el fallback existente a PDF/TXT.
3. Integrar captions únicamente mediante proveedor autorizado y permisos reales si se quiere transcripción automática. Mientras tanto, manual funciona y automático se declara parcial.
4. Para movimiento de materiales, diseñar migración conjunta con integridad y rollback antes de ofrecer la acción.

Entrega en `main`, con el mensaje `feat: add universal knowledge sources and study workspace`. La respuesta de entrega identifica el commit y confirma su hash remoto. Se revisaron archivos staged y `git diff --check`; se excluyen .env, logs, test-results, playwright-report, dist, capturas, tsconfig.tsbuildinfo generado y runtime de QA.

## 35. Resultado literal npm run build

```text
> nexo-study-mvp@0.9.7 build
> tsc -b && vite build

vite v8.3.0 building client environment for production...
transforming...
✓ 168 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                           1.30 kB │ gzip:   0.56 kB
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
dist/assets/index-CtXr3GYX.css                          199.14 kB │ gzip:  40.53 kB
dist/assets/SlideReader-BYo64qX3.js                       0.23 kB │ gzip:   0.18 kB
dist/assets/StudyTextarea-zcfr8mQn.js                     0.45 kB │ gzip:   0.32 kB
dist/assets/ArticleReader-CaV3ufvo.js                     0.50 kB │ gzip:   0.36 kB
dist/assets/CourseLibrary-BuA73ytT.js                     0.52 kB │ gzip:   0.31 kB
dist/assets/sourceFileCache-ijErM7TH.js                   0.60 kB │ gzip:   0.35 kB
dist/assets/ImageStudyView-Co8AWZEP.js                    0.99 kB │ gzip:   0.55 kB
dist/assets/jsx-runtime-Cx0BB4qO.js                       1.08 kB │ gzip:   0.61 kB
dist/assets/imageUtils-BA_MTd-O.js                        1.52 kB │ gzip:   0.88 kB
dist/assets/resolverAttachments-D8KD588q.js               1.53 kB │ gzip:   0.59 kB
dist/assets/DeleteAcademicDialog-BdmfKrVf.js              1.59 kB │ gzip:   0.81 kB
dist/assets/aiClient-B_xXzeBU.js                          1.69 kB │ gzip:   0.89 kB
dist/assets/TranscriptReader-BSOEuLfL.js                  1.94 kB │ gzip:   0.93 kB
dist/assets/DocumentReader-B4PyuzUj.js                    1.98 kB │ gzip:   0.86 kB
dist/assets/SaveSolutionDialog-BOeeV1Y8.js                2.09 kB │ gzip:   1.02 kB
dist/assets/NexoPracticeDialog-B2beJuFm.js                2.32 kB │ gzip:   1.09 kB
dist/assets/SavedSolutionDialog-D8XPV6c3.js               2.48 kB │ gzip:   1.12 kB
dist/assets/CorrectorPage-CoHBZ4wO.js                     2.69 kB │ gzip:   1.14 kB
dist/assets/SourceReader-B9m82L54.js                      2.96 kB │ gzip:   1.21 kB
dist/assets/MemoryViewer-M3flsUCx.js                      3.26 kB │ gzip:   1.54 kB
dist/assets/NoteReader-CZivz-C2.js                        3.53 kB │ gzip:   1.50 kB
dist/assets/ConceptDetail-BAP2ghZC.js                     3.62 kB │ gzip:   1.64 kB
dist/assets/sourceProcessing-CgI5kSbC.js                  3.65 kB │ gzip:   1.73 kB
dist/assets/learningGraph-DTLJp9jj.js                     3.77 kB │ gzip:   1.58 kB
dist/assets/CoursePracticePage-XW3XNTpT.js                3.81 kB │ gzip:   1.51 kB
dist/assets/AdminFeedbackPage-CYagt6nl.js                 4.44 kB │ gzip:   1.72 kB
dist/assets/FoldersPage-CRwAZuXj.js                       4.87 kB │ gzip:   1.77 kB
dist/assets/conversationRepository-C1LF_znm.js            5.77 kB │ gzip:   2.10 kB
dist/assets/LibraryV2-Db-wjQFZ.js                         5.86 kB │ gzip:   2.59 kB
dist/assets/sourceModel-igzwP52X.js                       6.21 kB │ gzip:   2.82 kB
dist/assets/ConversationHistory-CVwC6Br-.js               6.32 kB │ gzip:   2.43 kB
dist/assets/officeExtraction-CVG4DQpv.js                  6.51 kB │ gzip:   2.96 kB
dist/assets/AddSourceDialog-sPZXLbbh.js                   6.75 kB │ gzip:   2.60 kB
dist/assets/CourseAiPage-B0RZrdup.js                      7.05 kB │ gzip:   3.00 kB
dist/assets/ProgressPage-Dr3rCoSY.js                      7.40 kB │ gzip:   2.40 kB
dist/assets/ResolverPage-zH9TBzyf.js                      7.52 kB │ gzip:   3.01 kB
dist/assets/GlobalSearch-Sk0lRTJI.js                      7.85 kB │ gzip:   3.13 kB
dist/assets/react-IDFlRUvQ.js                             7.87 kB │ gzip:   3.00 kB
dist/assets/ConversationTools-C6DBAsgD.js                14.84 kB │ gzip:   5.37 kB
dist/assets/StudyMethodPage-pi_gCzHR.js                  16.60 kB │ gzip:   4.82 kB
dist/assets/AuthPage-y-uVekDS.js                         16.91 kB │ gzip:   5.28 kB
dist/assets/MaterialWorkspace-C2GiysR2.js                24.82 kB │ gzip:   8.28 kB
dist/assets/supabase-DjkFSsay.js                        214.91 kB │ gzip:  55.31 kB
dist/assets/ResponseRenderer-C9wVUuYz.js                264.79 kB │ gzip:  79.33 kB
dist/assets/index-OVcPq0Fz.js                           381.63 kB │ gzip: 116.77 kB
dist/assets/pdf-DztAAPJx.js                             430.93 kB │ gzip: 129.03 kB

✓ built in 529ms
```

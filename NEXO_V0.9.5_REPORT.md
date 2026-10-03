# NEXO STUDY V0.9.5
## MOBILE EXPERIENCE + STUDY FOCUS REPORT

Fecha: 2 de octubre de 2026. Base: V0.9.4, `c7d4243`.

## 1. Estado general

V0.9.5 implementada y revisada. Build EXIT 0, diff limpio y matriz de los diez viewports aprobada. La suite completa y sus reejecuciones se detallan en la sección 19; no se presenta una ejecución completa sin fallos que no ocurrió. La validación física de iOS y Supabase live permanece PARTIAL.

La fase conserva la identidad visual, rutas, contratos IA, Auth, repositorio académico, PDF Engine 2.0, RLS y migraciones. No incorpora servicios, tablas, dependencias ni funciones externas. Los cambios se concentran en presentación móvil, navegación contextual y estudio.

Criterios de aceptación dentro del alcance comprobable (véanse pruebas y límites):

- [x] branding correcto expanded
- [x] branding correcto collapsed
- [x] branding correcto drawer
- [x] sin logos duplicados
- [x] mobile header simplificado
- [x] una sola navegación móvil
- [x] breadcrumbs móviles reducidos
- [x] Material/Nexo cómodo
- [x] Material/Nexo sticky
- [x] Focus Mode implementado
- [x] Flashcards mobile adaptado
- [x] Quiz mobile secuencial
- [x] Course Study simplificado
- [x] Resolver mobile mejorado
- [x] Corrector mobile mejorado
- [x] Progress mobile adaptado
- [x] sin overflow desde 320 px
- [x] objetivos táctiles de estudio y navegación ≥44 px
- [x] keyboard/focus funcional en emulación
- [x] sin regresiones desktop reproducidas
- [x] npm run build EXIT 0
- [x] git diff --check limpio
- [x] las doce vistas solicitadas revisadas personalmente
- [x] reporte generado

## 2. Baseline V0.9.4

Se revisaron el reporte V0.9.4, su diff y los componentes pertinentes antes de modificar. Se ejecutaron build y suite completa sobre el commit original.

- Build: EXIT 0; main 363,55 kB / 111,43 kB gzip; CSS 175,84 kB / 36,71 kB gzip.
- Suite inicial: 273 aprobadas y dos timeouts en WebKit, en los recorridos extensos de responsive/accordions y capturas de navegación. No se declara un baseline 275/275.
- Se conservaron split desktop, drawer único, account utilities, búsqueda con teclado, recomendaciones deterministas, guardado de soluciones y separación actividad/dominio.

## 3. Problemas encontrados

BrandLogo compacto renderizaba isotipo y wordmark juntos. Los métodos heredaban varias capas de navegación y el catálogo de materiales en teléfono. Quiz mostraba todas las preguntas. El selector Material/Nexo utilizaba la altura del header del documento como offset, aunque ese header se desplazaba. Corrector conservaba un editor demasiado alto y Resolver imponía altura vacía. El retorno de foco del drawer ocurría mientras `main` aún estaba inert; WebKit tampoco enfoca automáticamente los botones abiertos con toque.

La implementación inicial de Focus con portal se reemplazó por un árbol estable: cambiar de breakpoint no debe remontar una práctica y perder una respuesta en curso.

## 4. Decisiones UX

Browse conserva la navegación general. Material Workspace conserva split desktop y exclusión Material/Nexo en teléfono. Study Focus ocupa el viewport visible, tiene un scroll propio, bloquea el body y vuelve al material/curso con un botón explícito. Las ramas ajenas al ejercicio quedan inert y se restauran al salir.

Se mantienen los tabs horizontales controlados del curso como alternativa permitida al menú Más: todas las secciones y sus rutas siguen disponibles. Los menús de curso/material y de estudio usan Dialog como hoja inferior móvil y PopupMenu en escritorio. El menú de cuenta conserva su agrupación y autorización de administración.

## 5. Adaptive branding

Expandido: un solo asset completo. Colapsado y tablet compacta: únicamente el isotipo, sin Beta. Drawer: un solo logo completo. Header móvil: menú, contexto y avatar. La selección de asset depende de estado y media query; no se obtiene ocultando un segundo logo con CSS. Los PNG originales permanecen intactos.

## 6. Mobile shell

Se conserva una única navegación por drawer, backdrop, safe areas, Escape, cierre por navegación y al pasar a desktop, foco contenido y bloqueo de scroll compartido. El drawer contiene navegación global, espacio, búsqueda, ayuda, configuración y acceso al usuario. Feedback y logout se encuentran en AccountMenu, sin filas duplicadas en el drawer.

## 7. Mobile header

Header de 64 px más safe-area superior, sticky, título contextual y avatar de 44 px. La búsqueda permanente se oculta en teléfono; sigue accesible en drawer y con Ctrl/Cmd+K. Desktop mantiene búsqueda y cuenta. El curso muestra su nombre; el título largo se trunca dentro del header y permanece completo en la página.

## 8. Context navigation

Desktop mantiene Cursos → curso → material. Teléfono muestra un único regreso al curso o a Cursos. Study Focus tiene su propio regreso al material/curso. El catálogo de otros materiales no ocupa la parte superior del estudio móvil.

## 9. Focus Mode

Compartido por flashcards, quiz, recursos de página, tutor local existente, aprendizaje guiado, escrito, completar espacios, simulacro y sesión preparada. Header con título, contador real y opciones cuando existen acciones. Los controles de preparar una sesión no se repiten durante la sesión activa; el simulacro agrupa preparación/regeneración en un disclosure móvil.

El árbol de la tarea conserva su posición entre breakpoints. No se introduce un motor académico alternativo: callbacks de actividad, recall, respuestas, sesiones y persistencia siguen siendo los existentes. Apuntes y resumen siguen en Browse.

## 10. Flashcards

Tarjeta ocupa aproximadamente el 90–93% del ancho del teléfono. Pregunta/respuesta, reveal por botón y teclado, anterior/siguiente y tracking se conservan. Ratings de 52 px en 2×2; navegación visualmente secundaria. Fuente y contador reales. Sin swipe. Las flechas de navegación ignoran inputs y menús para no cambiar tarjetas mientras se opera una hoja de acciones.

## 11. Quiz

Teléfono presenta una pregunta por vez, opciones verticales, corrección y explicación inmediata, fuente si existe y Continuar/Ver resultado. Reiniciar elimina las respuestas de esta práctica como antes. Desktop conserva la lista completa. Una prueba recorre las tres preguntas, falla la primera, verifica feedback y la escritura de learning_state, reinicia y vuelve al material.

## 12. Material Workspace

Se mantienen PDF Engine 2.0, análisis parcial, preparación bajo demanda, caché, contexto por página, fuentes, acciones y Chat/Contenido. El switcher móvil se ancla debajo del header global. PDF y Nexo se excluyen visualmente; contenido mantiene un accordion abierto en teléfono y resumen acotado. Las cuatro acciones sobre la página continúan enviando el contexto limitado existente.

Tabs cuentan con roles, estado seleccionado, relación tab/panel y navegación ArrowLeft/ArrowRight/Home/End. Desktop mantiene resize, 70/30, 60/40, 50/50 y Nexo abierto/cerrado. La matriz prueba los tres presets en 768, 1366, 1440 y 1920 px.

## 13. Resolver

Se elimina el mínimo artificial de altura móvil y se compacta el estado vacío, con tres sugerencias. El composer permanece sticky con safe-area y ajuste de visualViewport cuando aparece teclado lógico. Se conservan categorías, razonamiento, imágenes, errores, reintento, historial y guardado al curso. No se añade persistencia remota completa de conversaciones.

## 14. Corrector

Editor móvil de altura inicial menor y crecimiento acotado; font-size 16 px. CTA sticky ajustada al viewport y conteo de palabras. Resultado continúa como artículo independiente bajo el editor, sin overlay. Desktop mantiene el textarea amplio. La revisión utiliza el contrato IA existente y conserva mensajes de error.

## 15. Progress

Métricas móviles en dos columnas; se conservan actividad, dominio con evidencia, weak concepts, actividad reciente y sesiones. Sin práctica suficiente: dominio “— / Sin datos suficientes”, no 0% inventado. La actividad sí expresa el uso registrado. La suite de cohesión verifica actualización sin refresh de Home y Progress después de error o autoevaluación.

Home activo mantiene Continuar, siguiente paso, sesión y cursos. Subir material pasa al final en móvil para que la acción principal llegue antes. Home nuevo conserva su mensaje y primera carga, con hero de menor altura y sin ilustración ocupando área de estudio.

## 16. Accessibility

Se conservan skip link, aria-current, expanded/haspopup, focus-visible, teclado de búsqueda y Escape de overlays. Hojas son dialogs nativos y usan el bloqueo de scroll existente. Se corrige devolución de foco después de retirar inert/cerrar el dialog; no se roba foco si la acción abrió otro dialog. Focus tiene regreso etiquetado y fondo inert. Card es un botón nativo. Controles de estudio y navegación móvil tienen objetivos de al menos 44 px; ratings 52 px. Reduced motion existente permanece.

No se afirma certificación WCAG ni auditoría automática completa de contraste.

## 17. Responsive QA

Matriz: 320×640, 360×800, 375×667, 390×844, 393×852, 430×932, 768×1024, 1366×768, 1440×900, 1920×1080. Home, cursos, curso, workspace, Resolver, Corrector, Progress, flashcards y Quiz comprueban scrollWidth ≤ viewport sin tolerancia en la matriz nueva.

La matriz se ejecuta una vez en Chromium; las interacciones de foco, hoja, Quiz y teclado lógico se ejecutan en los cinco proyectos, incluidos WebKit iPhone y tablet. Los recorridos responsive originales se conservan. Las pruebas de layout usan navegación interna para no abortar guardados en el backend sintético durante recargas; las pruebas específicas de reload/Auth/persistencia siguen utilizando reload.

Las capturas locales se guardan dentro de test-results, ignorado por Git. Revisión visual personal: branding expandido/colapsado, drawer, Home nuevo/activo, Material y Nexo, frente/reverso de flashcards a 320 y 393, Quiz, Resolver, Corrector y Progress. Capturas finales: test-results/v095-final-captures. Se verificó también apertura real de AccountMenu desde Corrector. Chromium headless omite intermitentemente el pintado del avatar en screenshots sucesivos aunque el botón tiene geometría, estilos y hit testing correctos: se conservaron ambas capturas sin retocar imágenes; la captura adicional test-results/v095-capture-inspect/header-paint-diagnostic-inspect-default-capture-desktop/disabled.png muestra el avatar y fue revisada personalmente. No se atribuye este comportamiento a iOS real.

## 18. Performance

Main final medido: 360,70 kB / 110,26 kB gzip frente a 363,55 / 111,43 baseline. PDF.js, ResponseRenderer/KaTeX, GlobalSearch, Progress y Workspace continúan fuera del main eager. Supabase continúa en chunk compartido. No se cambió chunkSizeWarningLimit. CSS final: 184,47 kB / 38,16 kB gzip frente a 175,84 / 36,71 baseline. Incluye la capa móvil reutilizando tokens y fuentes existentes. Sin nuevas dependencias.

## 19. Tests

Resultados medidos; los fallos y reruns permanecen explícitos:

- Baseline completo: 273 pass, 2 fail.
- Primera prueba móvil: 27 pass, 6 fail (rutas de pruebas que buscaban controles reubicados).
- Primera matriz: 2 pass, 11 fail (foco drawer, fixture ambigua y assertion de touch aplicada a desktop).
- Matriz/casos desktop siguiente: 25 pass, 1 fail (contenido corto a 430 px aún no había alcanzado posición sticky).
- Primera suite completa tras implementación: 290 pass, 10 fail, 40 duplicados de matriz omitidos. Encontró retorno de foco de hojas WebKit, dos recorridos sin salir de Focus, caso sticky y timeout aislado PDF tablet.
- Después de correcciones: 21 casos small-phone pass, 10 duplicados de matriz omitidos. Incluye borrador escrito y posición Quiz conservados al redimensionar.
- Suite completa de cierre (qa-v0.9.5-complete-e2e.log): 300 pass, 5 fail, 40 duplicados de matriz omitidos, 11,5 min. Cuatro fallos pertenecían a la nueva fixture sticky; uno a un click de búsqueda en WebKit tablet. Todos los otros recorridos, incluido PDF de 100 páginas tablet que había tenido timeout, pasaron.
- La primera reparación de fixture aún omitía material_topics: 44 pass, 6 fail, 40 skip en el subset mobile-focus/product-ux. Se corrigió la persistencia del mock, sin modificar código productivo ni tolerancia del anclaje.
- Matriz reparada: 14/14 pass en Chromium. Después se fortaleció la captura con comprobación del avatar en viewport: 49 pass, 1 fail, 40 skip; el nuevo fallo fue una captura desktop al conservar scroll por la navegación sintética del test. Se encuadró la parte superior antes de capturar, conservando la assertion.
- Cierre definitivo de matriz y Focus (qa-v0.9.5-final-captures.log): 14/14 pass, 26,4 s; todos los diez tamaños, sticky 63–65 px, split desktop, flashcard por teclado, Quiz, hoja y borrador escrito.
- Las cuatro interacciones nuevas pasan en los cinco proyectos. El subset product-ux pasa en los cinco proyectos; búsqueda tablet se repitió cinco veces adicionales: 5/5 pass, 13,3 s. El click fallido de la suite completa no se reprodujo; no se afirma una corrección de Search, que no fue modificado.
- Test engine final: 1/1. Build final EXIT 0 y git diff --check EXIT 0.

No se aumentaron timeouts, eliminaron verificaciones de persistencia ni ocultaron errores. Los tests adaptan acciones a Focus/drawer/tabs reales. Se añaden pruebas de los bugs reproducibles, keyboard layout lógico, recorrido secuencial del Quiz y preservación al redimensionar.

## 20. Bugs corregidos

Logo duplicado; drawer que perdía retorno de foco al intentar enfocar main inert; retorno de hojas en WebKit táctil; offsets sticky dependientes de un header que ya se desplazó; selector de pregunta móvil sin flujo Continuar; editor demasiado alto; altura vacía en Resolver; controles ajenos a la sesión; riesgo de remount y pérdida de borrador al cambiar breakpoint.

La fixture persiste diez temas en material_topics, además de chunks y artefactos, y abre un tema antes de comprobar el anclaje. La assertion sticky utiliza una sección con contenido suficiente: en una página corta el scroll máximo puede acabar antes, aunque el selector siga accesible. Los timeouts originales se registran sin convertirlos en éxito.

## 21. Archivos nuevos

ContextNavigation; useMediaQuery; useVisualViewport; StudyFocusShell/useStudyProgress; StudyTextarea; tabKeyboard; mobile.css; mobile-focus.spec.ts y este reporte.

## 22. Archivos modificados

App, BrandLogo, AdaptiveHome, PracticeViews, StudyMethodPage, ExamRunner, PageArtifactView, CoursePracticePage, CorrectorPage, MaterialWorkspace, PopupMenu, CourseCard, MaterialCard y main. Package y lockfile actualizan la versión, sin dependencias nuevas. Tests existentes adaptan affordances móviles, conservando su cobertura. tsconfig.tsbuildinfo es un archivo ya versionado generado por el build.

App crece moderadamente: la lógica nueva de viewport, foco y editor se extrae a módulos reutilizables. No se modifica el backend ni SQL.

## 23. Limitaciones reales

- PARTIAL: validación en iPhone físico/teclado virtual real. Se implementó visualViewport y se prueba reducción lógica; WebKit emulado no demuestra hardware iOS.
- PARTIAL heredado: RLS, storage privado y escritura multiusuario en Supabase real. La suite utiliza mocks, no sustituye la validación live documentada en sql/SECURITY_VALIDATION.md. No se afirma RLS real validado.
- Las capturas de la matriz de material con fixture sin original muestran el texto disponible; el visor iframe y carga/extracción de un PDF real tienen pruebas separadas.
- En WebKit se observó una advertencia de importación de módulo del servidor Vite durante recargas, también presente en baseline. No se declara consola universalmente limpia ni se atribuye ese aviso a producción. El click aislado de búsqueda tablet pasó en reejecuciones, incluido 5/5 adicional; no se demostró su causa.
- Las capturas headless pueden omitir temporalmente el avatar; se conserva evidencia de dos frames y la verificación funcional, sin retoque de imágenes. La comprobación de pintado en dispositivo físico queda incluida en la validación PARTIAL de iOS.
- No hay nuevo swipe, adjuntos Course/Material AI, historial remoto completo, archivo de cursos ni mover/eliminar materiales transaccionalmente.

## 24. Pendientes

No quedan cambios de implementación pendientes en esta fase. Continúan PARTIAL la validación física de teclado/safe areas/pintado móvil y Supabase real, más los pendientes de backend V0.9.4. Se conservan los logs locales para investigar los incidentes aislados de WebKit. No se implementa la siguiente fase. El diff fue revisado; .env, dist, screenshots, playwright-report y logs permanecen fuera del commit.

## 25. Resultado literal de npm run build

```text
> nexo-study-mvp@0.9.5 build
> tsc -b && vite build

vite v8.3.0 building client environment for production...
transforming...
✓ 139 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                           1.06 kB │ gzip:   0.51 kB
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
dist/assets/index-D08Ukzaj.css                          184.47 kB │ gzip:  38.16 kB
dist/assets/StudyTextarea-DhEoEeya.js                     0.45 kB │ gzip:   0.32 kB
dist/assets/jsx-runtime-BkSabwWG.js                       0.96 kB │ gzip:   0.55 kB
dist/assets/SaveSolutionDialog-CIBEHSbH.js                2.09 kB │ gzip:   1.02 kB
dist/assets/SavedSolutionDialog-D5-HVcmv.js               2.48 kB │ gzip:   1.12 kB
dist/assets/CorrectorPage-BplHcgHw.js                     2.70 kB │ gzip:   1.14 kB
dist/assets/CoursePracticePage-DQsXNyIn.js                3.81 kB │ gzip:   1.51 kB
dist/assets/ChatComposer-W-nHUCYR.js                      3.93 kB │ gzip:   1.95 kB
dist/assets/AdminFeedbackPage-BGBf_0To.js                 4.44 kB │ gzip:   1.72 kB
dist/assets/CourseAiPage-C0ki0ip8.js                      4.66 kB │ gzip:   2.14 kB
dist/assets/FoldersPage-D4g_DD4t.js                       4.77 kB │ gzip:   1.74 kB
dist/assets/ProgressPage-DvlXiiE7.js                      5.45 kB │ gzip:   1.80 kB
dist/assets/GlobalSearch-BRTnxae4.js                      6.70 kB │ gzip:   2.75 kB
dist/assets/react-Biqg-U6H.js                             7.87 kB │ gzip:   3.00 kB
dist/assets/ResolverPage-CfSkmni_.js                     13.43 kB │ gzip:   4.74 kB
dist/assets/StudyMethodPage-CwTvQ_fx.js                  15.87 kB │ gzip:   4.64 kB
dist/assets/AuthPage-CqLoYZL8.js                         16.91 kB │ gzip:   5.28 kB
dist/assets/MaterialWorkspace-D_Za8UET.js                21.81 kB │ gzip:   7.21 kB
dist/assets/supabase-DjkFSsay.js                        214.91 kB │ gzip:  55.31 kB
dist/assets/ResponseRenderer-4mZAxeDY.js                264.79 kB │ gzip:  79.32 kB
dist/assets/index-sJJjq0fb.js                           360.70 kB │ gzip: 110.26 kB
dist/assets/pdf-BulPo6Dp.js                             430.93 kB │ gzip: 129.03 kB

✓ built in 1.68s
```

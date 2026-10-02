# NEXO STUDY V0.9.4 — NAVIGATION & PRODUCT POLISH REPORT

Fecha: 2 de octubre de 2026. Base: V0.9.3, commit `6a6b951`.

La revisión ordena la navegación y las opciones secundarias del núcleo existente. Se mantienen logo, tipografías, paleta violeta/azul, arquitectura académica, autenticación y migraciones. No se añadieron servicios externos ni funciones de podcast, calendario, comunidad, gamificación o grabación.

## 1. Auditoría inicial

Se revisaron App, estilos originales y responsive, navegación y rutas, Auth, workspace memberships, repositorio académico, perfiles, feedback, búsqueda, Resolver, Home, curso, Biblioteca, Progreso y Material Workspace antes de intervenir. Se tomó un build de referencia y se revisaron las pruebas existentes.

La V0.9.3 ya tenía sidebar colapsable persistente, drawer, breadcrumbs, AdaptiveHome, recomendaciones basadas en actividad, separación actividad/dominio, sesiones, acciones de página, accordions, split redimensionable, almacenamiento de soluciones y composer con imágenes en Resolver. También existían lazy imports para Resolver, Corrector, MaterialWorkspace, CourseAiPage, AdminFeedbackPage y métodos de estudio. Se conservaron estas capacidades.

El chunk principal medido era 625,61 kB minificado / 189,01 kB gzip, con aviso de tamaño. Supabase ya estaba en un chunk compartido; PDF.js ya usaba import dinámico.

## 2. Problemas UX encontrados

- Header con disponibilidad de IA, búsqueda, avatar y Beta compitiendo por espacio.
- Feedback flotante y selector lateral de espacios desconectados de la jerarquía de navegación.
- Drawer y navegación inferior simultáneos en móvil, con compensaciones de padding y composer para esa barra.
- Perfil con pocas utilidades, sin agrupación clara ni entrada contextual a la administración.
- Tarjetas de curso demasiado anchas; tabs con el peso visual de acciones principales.
- Composers repetidos en tres pantallas, con diferencias en estructura y espaciado.
- Search sin navegación completa por teclado, recientes ni entrada a conversaciones persistidas de Resolver y recursos académicos.
- Home con acciones de peso parecido; un recurso completo de Biblioteca podía abrir el workspace sin seleccionar su contenido.
- Dismiss por pérdida de foco incompatible con la secuencia de eventos táctiles de WebKit; bloqueo de scroll que no contemplaba overlays anidados.

## 3. Arquitectura anterior

| Nivel | Implementación anterior |
| --- | --- |
| Global | Sidebar, header y bottom navigation con entradas superpuestas |
| Contexto | Breadcrumbs y selector flotante de espacio |
| Acciones | Botones dentro de páginas, Feedback flotante y utilidades del header |

Los datos y rutas académicas estaban conectados; la presentación mezclaba responsabilidades.

## 4. Arquitectura nueva

| Nivel | Ubicación | Entradas |
| --- | --- | --- |
| Navegación global | Sidebar en escritorio; drawer único en móvil | Inicio, Mis cursos, Resolver, Corrector, Progreso |
| Contexto académico | Selector dentro del sidebar; línea contextual móvil y breadcrumbs | Espacio, curso, material y página seleccionada |
| Acciones | Página, tarjeta o composer correspondiente | Continuar, subir material, practicar, preguntar, guardar y menú `…` |
| Utilidades personales | Avatar con grupos separados | Perfil, configuración, apariencia, comentarios, ayuda y sesión |

Header desktop: título, búsqueda y avatar. Header móvil: abrir navegación, título y avatar; Buscar está en el drawer y disponible con Ctrl/Cmd+K. El curso conserva Resumen, Materiales, Nexo, Biblioteca, Práctica y Progreso como navegación contextual.

Decisión de reutilización: Espacios abre el explorador existente dentro del Dialog compartido, con selección, creación, traslado y eliminación de espacios reales. Se evita duplicar una lista rápida y otra gestión del mismo catálogo. Administración y Feedback recibido llevan a la consola administrativa existente; no se creó un módulo administrativo ficticio.

## 5. Componentes reutilizados

Se conservaron BrandLogo, Icon y sus SVG, NavButton, Dialog nativo, FoldersPage, useWorkspaces, CourseOverview, AdaptiveHome, ProgressPage, CourseLibrary, PracticeViews, ResponseRenderer, PageArtifactView, SaveSolutionDialog y SavedSolutionDialog. Se reutilizaron preparación de imágenes, contratos IA, signed URLs privadas, eventos académicos, recuperación de sesiones, cache de recursos y cálculo de recomendaciones/progreso.

AuthContext, migraciones, RLS, backend IA y assets del branding no fueron modificados. Los nuevos guardados usan las tablas y políticas existentes; esta fase no requiere una migración adicional.

## 6. Componentes nuevos

| Componente | Responsabilidad real |
| --- | --- |
| PopupMenu | Menú compartido con teclado, Escape, click fuera y cierre al navegar |
| AccountMenu | Identidad y grupos de utilidades según rol leído del perfil |
| AccountUtilities | Guardado de nombre en profiles, estado de sincronización, preferencias locales y guía |
| ChatComposer | Textarea, resize, envío, IME y controles opcionales de imágenes/razonamiento |
| CourseCard / MaterialCard | Tarjetas compactas y acciones contextuales |
| AcademicItemDialog | Editar curso, moverlo a un espacio existente y renombrar material |
| EmptyState | Extracción y reutilización del estado vacío existente |
| useBodyScrollLock | Bloqueo de scroll compartido que soporta overlays anidados |
| navigation.css | Jerarquía, densidad y ajustes responsive sobre los estilos actuales |

El composer muestra adjuntos donde existe su procesamiento: Resolver. Course AI y Material AI mantienen su capacidad textual actual. No se agregan botones de adjuntos sin un contrato funcional.

## 7. Elementos eliminados o reubicados

- Eliminados del DOM: bottom navigation, Feedback flotante, selector flotante lateral y chip permanente de disponibilidad IA.
- Feedback pasa al avatar y al drawer, manteniendo feedback_entries, categorías y puntuación. Información técnica se envía únicamente al marcar la opción; por defecto page_context y user_agent son null.
- Espacio actual pasa al sidebar y al contexto móvil; se conserva el explorador y sus acciones.
- Beta se muestra una sola vez, discretamente junto al branding de navegación.
- Opciones secundarias de curso/material pasan a `…`. No aparecen acciones sin implementación.
- Se retiraron reglas obsoletas de los controles flotantes y navegación inferior. No se hizo una reescritura total del CSS histórico.

## 8. Cambios desktop

Sidebar expandido o compacto con preferencia local y etiquetas/tooltip accesibles. Contenedor general máximo 1360 px; Resolver, Corrector y workspace usan el ancho requerido por sus herramientas. Grid de cursos máximo 1120 px, dos columnas en desktop y tres desde 1500 px. Tarjetas muestran nombre, materiales y última actividad real o preparación para empezar.

Home distingue ausencia de actividad y estudio activo. Usuario nuevo tiene Subir primer material como acción principal; usuario activo ve Continuar, luego siguiente paso y preparar sesión. Otras recomendaciones se despliegan progresivamente. Se conserva el acceso a cursos y subida sin duplicar botones principales. El porcentaje del Home se llama Actividad; no se presenta como dominio del estudiante.

Tabs de curso usan texto y subrayado activo. Material Workspace mantiene redimensionamiento y preferencia persistida, con presets Material/Nexo 70/30, 60/40 y 50/50. Resolver pierde la presentación inicial después del primer turno y conserva historial, imágenes, reintento y Guardar en curso.

## 9. Cambios mobile

Una única navegación principal en drawer, ancho min(84vw, 320px), backdrop, cierre al navegar/click fuera/Escape, foco contenido, fondo inert, body scroll bloqueado y safe areas. Al ampliar la ventana a desktop se cierra el drawer para evitar un fondo inerte. Espacios funciona desde el contexto y desde el drawer.

Material y Nexo son paneles excluyentes; dentro de Nexo se conserva Chat/Contenido con accordions. El composer compartido usa texto de 16 px en móvil y las reservas para la bottom nav fueron retiradas de la interfaz activa.

Se revisaron capturas de Home, menú de cuenta, Search, cursos, Resolver y Material Workspace en 320×640, 375×667, 393×852, 430×932, 768×1024, 1366×768, 1440×900 y 1920×1080. La batería verifica scrollWidth, columnas y exclusión de paneles. Capturas finales de los ocho tamaños se guardan en test-results/navigation-final; HTML de la última ejecución en playwright-report (artefactos locales ignorados por Git). Los logs qa-v0.9.4-*.log conservan las salidas de cada ejecución. Para recrear las capturas: npx playwright test tests/navigation-polish.spec.ts --grep "visual QA" --project desktop --output test-results/navigation-final.

## 10. Accessibility

Menús con role menu/menuitem, aria-haspopup/expanded, navegación ↑/↓/Home/End y Escape que devuelve foco. Search usa combobox/listbox, aria-activedescendant, selección con flechas, Enter y Escape; las acciones rápidas siguen accesibles con Tab. Ctrl+K y Cmd+K conservan el acceso global.

Dialog nativo conserva focus trap, fondo inerte y cierre con Escape; el drawer tiene gestión de foco y safe areas. Se mantienen skip link, focus-visible y aria-current de navegación. Controles móviles revisados tienen objetivos táctiles de al menos 44 px. Se mantienen colores y contraste de la identidad existente; no se declara una certificación WCAG ni una auditoría exhaustiva con lector de pantalla.

Transiciones principales de 180 ms, prefers-reduced-motion y preferencia local adicional para reducir movimiento. El resize del separador conserva teclado y valores ARIA.

## 11. Performance antes/después

| Recurso | Antes min / gzip | Después min / gzip | Cambio |
| --- | --- | --- | --- |
| Chunk principal JS | 625,61 / 189,01 kB | 363,55 / 111,43 kB | −41,9% / −41,0% |
| Entrada JS: main + Supabase | 840,52 / 244,32 kB | 578,46 / 166,74 kB | −31,2% / −31,8% |
| CSS global | 168,73 / 35,57 kB | 175,84 / 36,71 kB | +7,11 / +1,14 kB |
| PDF.js diferido | 430,93 / 129,03 kB | 430,93 / 129,03 kB | Sin cambio |
| Supabase compartido | 214,91 / 55,31 kB | 214,91 / 55,31 kB | Sin cambio |
| ResponseRenderer diferido | Incluido en main | 264,76 / 79,29 kB | Fuera de entrada |

Lazy-loading adicional: ProgressPage, GlobalSearch, FoldersPage y ambos diálogos de soluciones. Se conserva el lazy-loading de las herramientas existentes. El JavaScript de ResponseRenderer y KaTeX deja de formar parte del chunk principal y se cargan con las pantallas que los necesitan.

La comparación de entrada incluye main más Supabase referenciado por el HTML, excluye CSS, fuentes y recursos posteriores. No equivale a una medición de Lighthouse, red móvil o tiempo hasta interacción. PDF.js y su worker siguen fuera de la entrada y se solicitan al preparar/usar PDFs. No se cambió el límite de aviso de Vite para ocultar bundles grandes.

Search hace debounce de 250 ms, ignora respuestas obsoletas, mantiene resultados locales si falla una consulta remota y consulta metadatos de artefactos, sin cargar cuerpos completos del catálogo. La hidratación inicial de sesión/datos sigue teniendo estado de arranque; al cargar páginas diferidas se conserva el shell con skeleton local. IA mantiene los turnos visibles y la preparación PDF conserva el visor disponible.

## 12. Tests ejecutados

| Verificación | Resultado |
| --- | --- |
| npm run build | Exit 0, TypeScript + Vite sin errores ni aviso de chunk |
| npm run test:engine | 1/1 aprobado |
| npm run test:e2e, primera suite completa | 274/275; fallo WebKit de recarga en backend simulado investigado y recorrido corregido |
| Recorrido tablet corregido, repeat-each 3 | 3/3 aprobados |
| npm run test:e2e, segunda suite completa | 273/275 en 11,7 min; 2 timeouts en caso de PDF escaneado (Android y 320 px) |
| PDF escaneado, ambos proyectos, tres repeticiones, workers 2 | 6/6 aprobados en 14,4 s |
| Suite PDF completa, cinco proyectos, workers 4 | 30/30 aprobados en 1,1 min |
| Nuevos casos de navegación dentro de la segunda suite | 25/25 aprobados (cinco casos × cinco proyectos) |
| Capturas finales: navigation-polish visual QA, desktop | 1/1 aprobado, ocho viewports en 37,8 s; revisión visual final |
| git diff --check y git diff --cached --check | Exit 0, incluidos archivos nuevos |

Los 275 casos tuvieron resultados aprobados entre el lote completo y la revalidación PDF. **No se declara una ejecución completa 275/275 limpia**: la estabilidad del lote paralelo sigue PARTIAL por los dos timeouts que no reaparecieron en la revalidación. No se aumentaron timeouts, no se borraron assertions y no se activaron retries para ocultarlos. Una traza terminó antes de mostrar login; la otra mostró Material activo al esperar un control del panel Nexo. No se atribuye una causa definitiva sin reproducción.

Cobertura conservada: autenticación y recuperación, sesión/cierre, ownership y sync simulados, Resolver con varias imágenes y reintento, Guardar en curso con deduplicación/rollback, Biblioteca, topics y fuentes de página, artefactos cacheados, actividad/dominio, práctica, Hoy, sesiones, recuperación tras borrar datos locales, espacios y movimientos, escenarios de PDF Engine simulado de 402 páginas, escaneado, mixto, extracción fallida y preparación por lotes; además, un PDF real en visual-workflows prueba visor, Nexo contextual y modo de estudio.

Cinco casos nuevos por proyecto cubren: grupos/rol real del perfil y guardado de nombre; administración y denegación de ruta; búsqueda por teclado/recientes/recurso de página/conversación persistida; edición/traslado de cursos y PATCH de título de material sin reescribir contenido; revisión de ocho viewports y bloqueo anidado del scroll.

Las pruebas de Supabase y proveedor IA usan mocks locales. WebKit automatizado valida comportamiento del motor; no demuestra Safari físico, teclado virtual de iOS ni calidad de respuestas del proveedor IA real. No se sustituyó WebKit por Chromium para etiquetar resultados como iOS.

## 13. Resultado npm run build

Comando: `npm run build` (tsc -b y Vite 8.3.0). Exit code 0. Sin errores TypeScript ni aviso de chunks superiores a 500 kB. Salida completa de la compilación final:

```text
> nexo-study-mvp@0.9.4 build
> tsc -b && vite build

vite v8.3.0 building client environment for production...
transforming...
✓ 132 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                           0.90 kB │ gzip:   0.47 kB
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
dist/assets/index-Dfe8nxs0.css                          175.84 kB │ gzip:  36.71 kB
dist/assets/SaveSolutionDialog-DgN5ALI1.js                2.03 kB │ gzip:   0.98 kB
dist/assets/SavedSolutionDialog-BvMn2CGr.js               2.41 kB │ gzip:   1.08 kB
dist/assets/CorrectorPage-jRCuQ75u.js                     2.59 kB │ gzip:   1.09 kB
dist/assets/CoursePracticePage--H6zWmz8.js                3.47 kB │ gzip:   1.36 kB
dist/assets/ChatComposer-zytr-Yqu.js                      3.87 kB │ gzip:   1.91 kB
dist/assets/AdminFeedbackPage-DIaYPkQj.js                 4.37 kB │ gzip:   1.68 kB
dist/assets/CourseAiPage-B3f7eNH1.js                      4.59 kB │ gzip:   2.11 kB
dist/assets/FoldersPage-BYodEdn1.js                       4.71 kB │ gzip:   1.70 kB
dist/assets/ProgressPage-CbUugEqO.js                      5.41 kB │ gzip:   1.78 kB
dist/assets/GlobalSearch-YjOP92VB.js                      6.63 kB │ gzip:   2.69 kB
dist/assets/ResolverPage-Cz2Zo7So.js                     13.36 kB │ gzip:   4.70 kB
dist/assets/StudyMethodPage-CNZz0c0A.js                  15.24 kB │ gzip:   4.44 kB
dist/assets/AuthPage-DuQQ3wEq.js                         16.84 kB │ gzip:   5.24 kB
dist/assets/MaterialWorkspace-CrtNiR7a.js                20.52 kB │ gzip:   6.85 kB
dist/assets/supabase-DjkFSsay.js                        214.91 kB │ gzip:  55.31 kB
dist/assets/ResponseRenderer-cAp63MFy.js                264.76 kB │ gzip:  79.29 kB
dist/assets/index-CN09rc_a.js                           363.55 kB │ gzip: 111.43 kB
dist/assets/pdf-CEcbwBIG.js                             430.93 kB │ gzip: 129.03 kB

✓ built in 2.08s
```

## 14. Bugs encontrados/corregidos

1. **Menú que no ejecutaba acciones en WebKit táctil:** pointerdown mueve el foco al main antes del click. Cerrar por blur desmontaba el menuitem. Ahora click fuera y Escape gestionan el cierre; Tab se comprueba después de mover foco. Cuenta, edición y renombrado pasan en WebKit.
2. **Scroll liberado por el overlay incorrecto:** al abrir Espacios encima del drawer y cerrar la navegación, el bloqueo anterior podía restaurar overflow prematuramente. El hook cuenta locks independientes y restaura el valor previo al cerrar el último.
3. **Drawer activo al pasar a escritorio:** se cierra al cambiar el breakpoint, liberando inert y scroll.
4. **Resumen completo de Biblioteca sin selección visible:** Search y Biblioteca comparten apertura de artefactos; resumen completo se muestra como Material completo y recurso de página conserva su alcance.
5. **Menús de tarjeta interceptados por selectores ambiguos en pruebas:** se acotaron búsquedas al botón de tarjeta y roles menuitem; se conservaron los flujos SPA para comprobar actualización inmediata sin recargar.
6. **Beta invadiendo controles de navegación:** badge discreto debajo del logo, con ocultación en sidebar compacto.
7. **Home y objetivos táctiles en 320 px:** lema con salto de línea, singular de material corregido y estrellas de comentarios con ancho mínimo de 44 px.
8. **Prueba de layouts WebKit con recargas en vuelo:** la traza confirmó un error nativo del fetch al destruir la página con guardados del backend simulado pendientes. El recorrido de layouts usa History/PopState dentro de la app y mantiene la comprobación estricta de cero pageerrors; los casos independientes de sesión/recarga se conservan. Se hicieron tres repeticiones de tablet, todas aprobadas. Los mocks incluyen cabeceras CORS explícitas.
9. **Captura de menú durante transición:** screenshots desactivan animaciones para revisar el estado final, sin eliminar transiciones de la app.

## 15. Pendientes reales

| Estado | Pendiente | Motivo |
| --- | --- | --- |
| PARTIAL | Archivar/eliminar cursos desde `…` | No hay flujo transaccional de archivo y limpieza conjunta de contexto, artefactos, progreso y Storage. No se exponen acciones simuladas. |
| PARTIAL | Mover/eliminar materiales desde `…` | Requiere trasladar relaciones y prefijos privados o limpiar recursos de manera recuperable. Renombrar y descargar original sí están implementados. |
| PARTIAL | Búsqueda de todas las conversaciones | Resolver tiene persistencia local por cuenta/espacio y se busca por título. Course/Material chat no tienen historial persistido independiente; no se inventan resultados ni sincronización entre dispositivos. |
| PARTIAL | Adjuntos en Course/Material AI | Composer compartido listo para opciones, pero sus contratos actuales son de texto. Imágenes siguen funcionando en Resolver. |
| PARTIAL | Validación Supabase real | Faltan proyecto de prueba y credenciales A/B para el script de seguridad. Validar migración 009 existente, RLS, Storage, perfil/admin, búsquedas y rename contra el backend real. |
| PARTIAL | Estabilidad de la suite completa paralela | Dos timeouts en PDF escaneado no reaparecieron en 6 repeticiones ni en la suite PDF 30/30. Reproducibilidad del lote completo pendiente; no se presenta como todo verde. |
| PARTIAL | Safari/iOS físico | WebKit automatizado pasa; teclado virtual, viewport visual, safe areas de dispositivo y lector de pantalla necesitan QA físico. |

Siguen aplicando los límites de V0.9.3: práctica desde SavedSolution abre chat contextual pero todavía no registra dominio; página visible del iframe PDF se elige explícitamente; análisis visual de un rango no se atribuye falsamente a una página; escrito/tarjetas usan autoevaluación; no hay Realtime entre dispositivos ni cola offline universal de artefactos. Ver NEXO_V0.9.3_REPORT.md para contratos y validación pendiente.

Search muestra un máximo de 40 destinos; consultas remotas de temas, soluciones y recursos tienen límites de resultados y no buscan dentro del texto completo de conversaciones.

Descarga original se ofrece únicamente cuando existe PDF local o storagePath; se usa signed URL privada y se muestra fallo real si no está disponible. Perfil edita solo full_name: ni username, email ni rol se simulan como editables. Si falla el guardado, el formulario conserva el texto para reintentar.

## 16. Archivos modificados

Nuevos:

- src/PopupMenu.tsx
- src/AccountMenu.tsx
- src/AccountUtilities.tsx
- src/ChatComposer.tsx
- src/CourseCard.tsx
- src/MaterialCard.tsx
- src/AcademicItemDialog.tsx
- src/EmptyState.tsx
- src/hooks/useBodyScrollLock.ts
- src/navigation.css
- tests/helpers/navigation.ts
- tests/navigation-polish.spec.ts
- NEXO_V0.9.4_REPORT.md

Actualizados:

- src/App.tsx, src/AdaptiveHome.tsx
- src/WorkspaceSwitcher.tsx, src/Dialog.tsx
- src/FeedbackWidget.tsx, src/GlobalSearch.tsx, src/Icon.tsx
- src/ResolverPage.tsx, src/CourseAiPage.tsx, src/MaterialWorkspace.tsx
- src/CourseLibrary.tsx, src/PageArtifactView.tsx
- src/lib/learningRepository.ts
- src/main.tsx, src/styles.css, src/responsive.css
- tests/cohesion.spec.ts, tests/learning-sync.spec.ts, tests/pdf-engine-v2.spec.ts
- tests/product-ux.spec.ts, tests/resolver-chat.spec.ts, tests/responsive-auth.spec.ts
- tests/visual-workflows.spec.ts, tests/workspaces.spec.ts
- package.json, package-lock.json, tsconfig.tsbuildinfo

Las capturas, logs de QA, dist y playwright-report permanecen fuera del commit. Se mantienen las migraciones existentes y no se modifican secretos o archivos de entorno.

# Migraciones de Nexo Study

Ejecuta los archivos **en orden** desde Supabase → SQL Editor. Una migración aplicada no se edita: cualquier cambio nuevo debe ir en el siguiente número.

1. `001_profiles.sql` — perfil base ligado a Supabase Auth.
2. `002_ai_queries.sql` — historial de Resolver/Corrector por usuario.
3. `003_profile_onboarding.sql` — `@username` único y datos de personalización del onboarding.
4. `004_study_folders.sql` — carpetas y asignación de cursos.
5. `005_feedback_admin.sql` — feedback privado, flag `is_admin`, endurecimiento de permisos y RLS de administración.
6. `006_owner_admin.sql` — convierte exclusivamente a `@sebasshulla` en administrador de la beta.
7. `007_learning_workspace.sql` — cursos, materiales, fragmentos y temas por página, recursos de estudio, progreso, memoria de aprendizaje, sesiones y bucket privado para PDF.
8. `008_pdf_engine_v2.sql` — elimina el límite de 250 páginas, separa el estado de análisis del visor y añade búsqueda acotada de fragmentos.

9. `009_saved_solutions.sql` — soluciones de Resolver guardadas en curso e imágenes privadas.
10. `010_conversations_learning_evidence.sql` — conversaciones, adjuntos privados, evidencia y cálculo sobre learning_state.
11. `011_universal_sources.sql` — fuentes universales, originales privados y limpieza recuperable.
12. `012_repair_pdf_and_source_schema.sql` — recuperación de 008 incompleta, claves de contexto UUID antiguas y 011 fallida; incluye la instalación de 010/011.

## Regla de migraciones

No edites una migración que ya ejecutaste en producción. El siguiente cambio de base de datos debe crearse como `011_...sql`.

## Datos académicos de V0.9

Aplica `007_learning_workspace.sql` antes de habilitar la sincronización en producción. La aplicación conserva los cursos y el progreso que ya existan en el navegador; al iniciar sesión, importa los registros que falten y combina la copia remota con la local usando los identificadores existentes. Si la migración o la red no están disponibles, continúa con la copia local y muestra un aviso de sincronización. Esta copia local no contiene el archivo PDF: para volver a abrir el original en otro dispositivo es necesario que el bucket privado y la subida hayan funcionado.

Los PDF se guardan en `study-pdfs` bajo `userId/courseId/materialId/original.pdf`. El bucket es privado y sus políticas, igual que las tablas académicas, solo permiten acceder al propietario autenticado. Verifica en un proyecto de prueba que un usuario no pueda consultar cursos, materiales ni archivos de otro usuario antes de aplicar la migración al proyecto principal.

## Verificación de V0.9.1

Antes de producción, aplica 007 y después 008 en un proyecto de prueba. Verifica con las consultas de `README.md` que `page_count` no tiene límite superior, que las nueve tablas académicas mantienen RLS y que `study-pdfs` sigue privado. Prueba el aislamiento con dos sesiones autenticadas diferentes: SQL Editor usa privilegios elevados y no demuestra RLS de un usuario normal.

## Administrador

`006_owner_admin.sql` espera que ya exista exactamente una cuenta con username `sebasshulla` (sin `@` en la base de datos). Si no la encuentra, la migración falla intencionalmente para no promover una cuenta equivocada.

## Verificación V0.9.6

Aplicar 010 después de 009. La migración es aditiva y repetible; preserva intentos anteriores en `legacy_baseline`. No cambia contratos PDF ni las políticas de administración. Threads/messages/evidence tienen RLS exclusivo del dueño; un admin no dispone de excepción académica. General usa workspace NULL para el espacio General; curso/material usan FKs compuestas de propiedad. Su ubicación sigue la pertenencia del curso. Eliminar un espacio limpia únicamente workspace_id en los threads; conserva mensajes, evidencia y adjuntos.

Validación local: `npm run test:schema` ejecuta las doce migraciones en PostgreSQL WASM con esquemas mínimos Auth/Storage. Instalar primero el runtime aislado indicado en `scripts/test-learning-schema.mjs`. Ese test no prueba Supabase real. La comprobación pendiente con sesiones A/B, incluyendo RPCs y Storage HTTP, está en [SECURITY_VALIDATION.md](SECURITY_VALIDATION.md).

El frontend puede conservar pendientes y avisar si 010 no está aplicada. Eso no convierte conversaciones locales en persistencia entre dispositivos. No habilitar la versión en producción como plenamente sincronizada hasta aplicar 010 y ejecutar la validación A/B.

## Verificación V0.9.7

Aplicar `011_universal_sources.sql` después de 010, primero en un proyecto de prueba autorizado; repetir 010 y 011 para comprobar idempotencia. No usar SQL Editor ni service_role como prueba de aislamiento. `npm run test:schema` comprueba 001–012 en PostgreSQL local con Auth/Storage mínimos; no confirma el comportamiento del servicio Storage real. Si 008 quedó incompleta o 011 falló, seguir la recuperación 012 descrita abajo.

011 reutiliza materials/chunks/topics/artifacts y el contrato de ordinales de unidad. Amplía source_type a PDF, imagen, DOCX, PPTX, texto, web, YouTube y apunte; agrega el bucket privado study-sources y una cola persistente academic_cleanup_jobs. La metadata incluye sourceRevision, archivedAt, processingError y source (URL, MIME, original, referencias de unidad). El original privado usa userId/courseId/materialId/original.ext; las URLs firmadas duran 600 segundos.

`commit_source_document` sustituye documento, unidades, chunks y temas en una transacción con revisión esperada; invalida recursos antiguos y conserva evidencia de práctica. Archive y rename avanzan la revisión. La búsqueda ignora fuentes archivadas/en eliminación. `begin_academic_cleanup` captura los objetos reales y bloquea escrituras; el cliente borra Storage; `finish_academic_cleanup` verifica ausencia de objetos antes de borrar filas. Un fallo conserva el job y las filas para reintentar. Tombstones completos evitan que una copia vieja del navegador recree filas.

Los triggers sobre storage.objects están comprobados en PostgreSQL local. Su instalación y efectos en Supabase Storage HTTP permanecen PARTIAL hasta correr el script A/B. No aplicar a producción afirmando que Storage ya fue validado. Las fuentes nuevas fallan con un aviso y conservan el material pendiente si falta 011; no se simula persistencia entre dispositivos.

## Recuperación 012: 008 incompleta y 011 con `uuid = text`

El error `42701: document_kind already exists` confirma que esa columna ya estaba creada. No demuestra que el resto de 008 esté completo: pueden faltar las otras columnas, la función de normalización, el índice o el backfill. 008 histórica no es repetible por su `ADD COLUMN` sin `IF NOT EXISTS`.

El error `42883: operator does not exist: uuid = text`, en `academic_blob_manifest` al comparar `conversation_threads.course_id` con `course_key`, señala otra diferencia de esquema: el contexto del curso está en UUID, mientras 007/010 y el cliente actual usan claves académicas de texto. La captura permite identificar esa incompatibilidad; no permite comprobar todo el esquema remoto. `CREATE TABLE IF NOT EXISTS` de 010 conserva los tipos de una tabla preexistente. Una 008 incompleta por sí sola no cambia `conversation_threads.course_id`.

**Para recuperarlo:**

1. Confirmar que 001–007 y 009 están aplicadas. No borrar tablas, conversaciones ni archivos para volver a empezar.
2. Abrir un snippet nuevo en Supabase → SQL Editor, llamado `Migration 012`.
3. Copiar **todo** [012_repair_pdf_and_source_schema.sql](012_repair_pdf_and_source_schema.sql), desde el primer comentario hasta el `select ... migration_status` final. No seleccionar solo unas líneas al pulsar Run.
4. Ejecutar una vez. La última fila debe indicar `012 complete: PDF metadata, text context keys, conversations and universal sources repaired`.
5. Ejecutar [diagnostics/verify_012_recovery.sql](diagnostics/verify_012_recovery.sql). Las claves de curso/material deben ser `text`, los IDs de propietario/conversación/mensaje deben seguir en `uuid`, las seis funciones deben aparecer `OK`, los cuatro buckets privados y las cinco tablas con RLS activado.
6. Recargar Nexo y comprobar el curso/material existente, la conversación y una fuente nueva. La prueba de privacidad real con dos cuentas sigue en [SECURITY_VALIDATION.md](SECURITY_VALIDATION.md).

**No hace falta volver a ejecutar 008, 010 ni 011 después:** 012 completa los prerrequisitos PDF y contiene las versiones auditadas de 010 y 011 dentro de una única transacción. También puede ejecutarse sobre un esquema ya completo y repetirse. Los SQL anteriores se conservan sin editar.

Si aparece `25P02: current transaction is aborted`, ejecutar por separado `ROLLBACK;` para salir de la transacción fallida y volver a ejecutar **012 completa**. Si falla por clave foránea, tipo inesperado o dependencia personalizada, la recuperación se revierte: conservar el error y el diagnóstico del esquema para resolver esa diferencia; no eliminar filas ni usar `CASCADE` como atajo.

La conversión afecta exclusivamente `course_id`/`material_id` de conversaciones, evidencia y jobs existentes cuando son UUID o varchar. Conserva el valor mediante `::text`, guarda/restaura las FKs afectadas, valida las relaciones compuestas de propietario y conserva owners/threads/messages/workspaces como UUID. Si hay una referencia huérfana o de otro propietario, la FK falla y se revierte **todo**; no se inventa una vinculación ni se elimina contenido. Se preservan análisis inicializados, páginas analizadas, contenido, revisiones, evidencia, archivos y jobs pendientes/completos. Solo se completa el estado PDF que seguía en sus valores iniciales, siguiendo la correspondencia de 008.

Validación: `npm run test:migrations` reproduce ambos errores y comprueba las ocho combinaciones de columnas de 008, instalación de 010/011 ausentes, repetición, conservación de datos, FKs entrantes, RPCs, aislamiento A/B y rollback de casos no seguros en PostgreSQL WASM. Es una prueba local con Auth/Storage mínimos; **la ejecución en Supabase real y Storage HTTP continúa PARTIAL** hasta aplicar y verificar allí.

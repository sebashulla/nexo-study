# Migraciones de Nexo Study

Ejecuta los archivos desde Supabase → SQL Editor. Una migración aplicada no se edita: cualquier cambio nuevo debe ir en el siguiente número. **Instalación nueva: 001–010, después 014.** 014 incluye la instalación corregida de 011/012/013. Para recuperar una 008 incompleta o una 011/012/013 fallida, seguir los pasos de recuperación 014 al final.

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
11. `011_universal_sources.sql` — diseño histórico de fuentes universales; usar 014 para instalarlo en Storage actual.
12. `012_repair_pdf_and_source_schema.sql` — primera recuperación histórica; no resuelve la colisión de `owner_id` del Storage actual. Usar 014.
13. `013_repair_storage_owner_shadowing.sql` — corrige el parámetro `owner_id`, pero depende de tablas temporales entre sentencias. Usar 014.
14. `014_atomic_source_recovery.sql` — recuperación de PDF/conversaciones/fuentes en una sola sentencia, sin tablas temporales; conserva los datos existentes y corrige los permisos de funciones auxiliares.

## Regla de migraciones

No edites una migración que ya ejecutaste en producción. El siguiente cambio de base de datos debe crearse con un número nuevo.

## Datos académicos de V0.9

Aplica `007_learning_workspace.sql` antes de habilitar la sincronización en producción. La aplicación conserva los cursos y el progreso que ya existan en el navegador; al iniciar sesión, importa los registros que falten y combina la copia remota con la local usando los identificadores existentes. Si la migración o la red no están disponibles, continúa con la copia local y muestra un aviso de sincronización. Esta copia local no contiene el archivo PDF: para volver a abrir el original en otro dispositivo es necesario que el bucket privado y la subida hayan funcionado.

Los PDF se guardan en `study-pdfs` bajo `userId/courseId/materialId/original.pdf`. El bucket es privado y sus políticas, igual que las tablas académicas, solo permiten acceder al propietario autenticado. Verifica en un proyecto de prueba que un usuario no pueda consultar cursos, materiales ni archivos de otro usuario antes de aplicar la migración al proyecto principal.

## Verificación de V0.9.1

Antes de producción, aplica 007 y después 008 en un proyecto de prueba. Verifica con las consultas de `README.md` que `page_count` no tiene límite superior, que las nueve tablas académicas mantienen RLS y que `study-pdfs` sigue privado. Prueba el aislamiento con dos sesiones autenticadas diferentes: SQL Editor usa privilegios elevados y no demuestra RLS de un usuario normal.

## Administrador

`006_owner_admin.sql` espera que ya exista exactamente una cuenta con username `sebasshulla` (sin `@` en la base de datos). Si no la encuentra, la migración falla intencionalmente para no promover una cuenta equivocada.

## Verificación V0.9.6

Aplicar 010 después de 009. La migración es aditiva y repetible; preserva intentos anteriores en `legacy_baseline`. No cambia contratos PDF ni las políticas de administración. Threads/messages/evidence tienen RLS exclusivo del dueño; un admin no dispone de excepción académica. General usa workspace NULL para el espacio General; curso/material usan FKs compuestas de propiedad. Su ubicación sigue la pertenencia del curso. Eliminar un espacio limpia únicamente workspace_id en los threads; conserva mensajes, evidencia y adjuntos.

Validación local: `npm run test:schema` ejecuta 001–010 y la recuperación 014 en PostgreSQL WASM con Auth/Storage mínimos que incluyen `storage.objects.owner_id text`. Los fallos históricos se reproducen en `npm run test:migrations`. Instalar primero el runtime aislado indicado en `scripts/test-learning-schema.mjs`. Estos tests no prueban Supabase real. La comprobación pendiente con sesiones A/B, incluyendo RPCs y Storage HTTP, está en [SECURITY_VALIDATION.md](SECURITY_VALIDATION.md).

El frontend puede conservar pendientes y avisar si 010 no está aplicada. Eso no convierte conversaciones locales en persistencia entre dispositivos. No habilitar la versión en producción como plenamente sincronizada hasta aplicar 010 y ejecutar la validación A/B.

## Verificación V0.9.7

Aplicar `014_atomic_source_recovery.sql`, que instala las definiciones corregidas de fuentes universales, primero en un proyecto de prueba autorizado; repetir 014 para comprobar idempotencia. No usar SQL Editor ni service_role como prueba de aislamiento. `npm run test:schema` comprueba 001–010 + 014 en PostgreSQL local con Auth/Storage mínimos; no confirma el comportamiento del servicio Storage HTTP real.

011 reutiliza materials/chunks/topics/artifacts y el contrato de ordinales de unidad. Amplía source_type a PDF, imagen, DOCX, PPTX, texto, web, YouTube y apunte; agrega el bucket privado study-sources y una cola persistente academic_cleanup_jobs. La metadata incluye sourceRevision, archivedAt, processingError y source (URL, MIME, original, referencias de unidad). El original privado usa userId/courseId/materialId/original.ext; las URLs firmadas duran 600 segundos.

`commit_source_document` sustituye documento, unidades, chunks y temas en una transacción con revisión esperada; invalida recursos antiguos y conserva evidencia de práctica. Archive y rename avanzan la revisión. La búsqueda ignora fuentes archivadas/en eliminación. `begin_academic_cleanup` captura los objetos reales y bloquea escrituras; el cliente borra Storage; `finish_academic_cleanup` verifica ausencia de objetos antes de borrar filas. Un fallo conserva el job y las filas para reintentar. Tombstones completos evitan que una copia vieja del navegador recree filas.

Los triggers sobre storage.objects están comprobados en PostgreSQL local. Su instalación y efectos en Supabase Storage HTTP permanecen PARTIAL hasta correr el script A/B. No aplicar a producción afirmando que Storage ya fue validado. Las fuentes nuevas fallan con un aviso y conservan el material pendiente si faltan las funciones instaladas por 014; no se simula persistencia entre dispositivos.

## Recuperación 014: ejecución atómica, Storage y 008 incompleta

El error `42701: document_kind already exists` confirma que esa columna ya estaba creada. No demuestra que el resto de 008 esté completo: pueden faltar las otras columnas, la función de normalización, el índice o el backfill. 008 histórica no es repetible por su `ADD COLUMN` sin `IF NOT EXISTS`.

El diagnóstico inicial de 012 atribuyó `42883: operator does not exist: uuid = text` a posibles claves de contexto UUID. **Ese error no demuestra que `conversation_threads.course_id` sea UUID.** Al incluir la columna `storage.objects.owner_id text` del esquema de Storage, se reproduce el mismo error incluso con las claves académicas correctas en texto. En una función SQL, PostgreSQL da prioridad a una columna del mismo nombre que un argumento: `t.user_id=owner_id` se interpreta como `t.user_id=o.owner_id`, comparando UUID con texto. Esto explica que 012 siguiera fallando en `academic_blob_manifest`. Los tests iniciales omitían esa columna y no cubrieron la causa real. Ver [esquema oficial de Supabase](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/storage/schema/design.mdx) y [resolución de argumentos SQL en PostgreSQL](https://www.postgresql.org/docs/16/xfunc-sql.html#XFUNC-SQL-FUNCTION-ARGUMENTS).

013 corrigió esa colisión, pero conservó otra dependencia defectuosa: guardaba el catálogo de columnas y claves foráneas en tablas temporales `ON COMMIT DROP` para leerlo en sentencias posteriores. El error `42P01: relation "nexo_012_context_columns" does not exist` confirma que esa tabla ya no estaba disponible. Los tests reproducen el error al ejecutar ese fragmento con autocommit. La captura no permite determinar qué límite de transacción o sesión ocurrió en SQL Editor. Ver [tablas temporales y ON COMMIT en PostgreSQL](https://www.postgresql.org/docs/current/sql-createtable.html).

014 elimina esa dependencia: todo el archivo es una sola sentencia `DO`; las referencias de catálogo se guardan en variables JSONB locales. No necesita tablas temporales ni que el cliente conserve una transacción entre consultas. Un fallo, incluso al final, revierte la sentencia completa. La marca de instalación se escribe dentro de la misma sentencia; no hay un `SELECT` final que anuncie éxito incondicionalmente.

014 conserva la firma de `academic_blob_manifest`, pero usa `$1`, `$2`, `$3` para propietario, curso y material. **No convierte `storage.objects.owner_id` a UUID ni modifica columnas del servicio Storage.** También revoca permisos explícitos de `anon`/`authenticated` sobre ocho funciones internas; los RPCs autenticados conservan sus permisos y comprobaciones. La reparación de tipos de contexto se aplica únicamente si esas columnas realmente son UUID/varchar; las que ya son texto conservan su tipo.

El SVG aportado muestra las tres columnas PDF, las columnas de evidencia de `learning_state` y `academic_cleanup_jobs` ya creadas. 014 contempla ese estado parcial. El SVG solo detalla once tablas y no exporta las definiciones de RLS, funciones, triggers, Storage ni el contenido de las filas; por eso la verificación posterior consulta el catálogo real.

**Para recuperarlo:**

1. Confirmar que 001–007 y 009 están aplicadas. No borrar tablas, conversaciones ni archivos para volver a empezar.
2. Abrir un snippet nuevo en Supabase → SQL Editor, llamado `Migration 014`.
3. Copiar **todo** [014_atomic_source_recovery.sql](014_atomic_source_recovery.sql), desde el primer comentario hasta `$nexo_014_atomic$;`. Ejecutar el archivo completo.
4. El resultado normal de esta sentencia es **Success. No rows returned**. No esperar la fila constante de éxito de las recuperaciones anteriores.
5. Ejecutar por separado [diagnostics/verify_014_recovery.sql](diagnostics/verify_014_recovery.sql). Debe devolver **nueve filas, todas `OK`**: marca atómica, argumentos de Storage, tipos académicos, RPCs, permisos internos, buckets privados, RLS, claves de propiedad y guards de limpieza. `REVISAR` significa que la instalación no está verificada. Esta consulta es de solo lectura y no muestra contenido académico.
6. Recargar Nexo y comprobar el curso/material existente, la conversación y una fuente nueva. La prueba de privacidad real con dos cuentas sigue en [SECURITY_VALIDATION.md](SECURITY_VALIDATION.md).

**Ejecutar solo 014 para recuperarlo. No volver a ejecutar 008/010/011/012/013 después:** la recuperación ya incluye las definiciones necesarias; las anteriores pueden reintroducir fallos o permisos antiguos. 014 completa los prerrequisitos de 008 y contiene las definiciones de 010/011 corregidas. Puede ejecutarse sobre un esquema ya completo y repetirse. Los SQL históricos se conservan sin editar.

Si aparece `25P02: current transaction is aborted`, ejecutar por separado `ROLLBACK;` para salir de la transacción fallida y volver a ejecutar **014 completa**. Si falla por clave foránea, tipo inesperado, permisos o dependencia personalizada, la recuperación se revierte: conservar el error y el diagnóstico del esquema para resolver esa diferencia; no eliminar filas ni usar `CASCADE` como atajo.

La conversión afecta exclusivamente `course_id`/`material_id` de conversaciones, evidencia y jobs existentes cuando son UUID o varchar. Conserva el valor mediante `::text`, guarda/restaura las FKs afectadas, valida las relaciones compuestas de propietario y conserva owners/threads/messages/workspaces como UUID. Si hay una referencia huérfana o de otro propietario, la FK falla y se revierte **todo**; no se inventa una vinculación ni se elimina contenido. Se preservan análisis inicializados, páginas analizadas, contenido, revisiones, evidencia, archivos y jobs pendientes/completos. Solo se completa el estado PDF que seguía en sus valores iniciales, siguiendo la correspondencia de 008.

Validación: `npm run test:migrations` pasa 22 casos en PostgreSQL WASM. Reproduce ambos errores, prueba 014 con autocommit, una transacción externa y un `search_path` distinto; comprueba un fallo inyectado al final y el rollback completo sin intervención del cliente. Cubre permisos por defecto de Supabase, las ocho combinaciones de columnas de 008, repetición, conservación de materiales/mensajes/archivos/jobs, FKs entrantes, RPCs, aislamiento local A/B y casos no seguros. También recupera una 012 previamente instalada que empieza a fallar cuando aparece la columna de Storage y un estado parcialmente aplicado de 013. `npm run test:schema` pasa 60 comprobaciones. **La ejecución en Supabase real y Storage HTTP continúa PARTIAL** hasta aplicar y verificar allí.

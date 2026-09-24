# Migraciones de Nexo Study

Ejecuta los archivos **en orden** desde Supabase → SQL Editor. Una migración aplicada no se edita: cualquier cambio nuevo debe ir en el siguiente número.

1. `001_profiles.sql` — perfil base ligado a Supabase Auth.
2. `002_ai_queries.sql` — historial de Resolver/Corrector por usuario.
3. `003_profile_onboarding.sql` — `@username` único y datos de personalización del onboarding.
4. `004_study_folders.sql` — carpetas y asignación de cursos.
5. `005_feedback_admin.sql` — feedback privado, flag `is_admin`, endurecimiento de permisos y RLS de administración.
6. `006_owner_admin.sql` — convierte exclusivamente a `@sebasshulla` en administrador de la beta.
7. `007_learning_workspace.sql` — cursos, materiales, fragmentos y temas por página, recursos de estudio, progreso, memoria de aprendizaje, sesiones y bucket privado para PDF.

## Regla de migraciones

No edites una migración que ya ejecutaste en producción. El siguiente cambio de base de datos debe crearse como `008_...sql`, después `009_...sql`, etc.

## Datos académicos de V0.9

Aplica `007_learning_workspace.sql` antes de habilitar la sincronización en producción. La aplicación conserva los cursos y el progreso que ya existan en el navegador; al iniciar sesión, importa los registros que falten y combina la copia remota con la local usando los identificadores existentes. Si la migración o la red no están disponibles, continúa con la copia local y muestra un aviso de sincronización. Esta copia local no contiene el archivo PDF: para volver a abrir el original en otro dispositivo es necesario que el bucket privado y la subida hayan funcionado.

Los PDF se guardan en `study-pdfs` bajo `userId/courseId/materialId/original.pdf`. El bucket es privado y sus políticas, igual que las tablas académicas, solo permiten acceder al propietario autenticado. Verifica en un proyecto de prueba que un usuario no pueda consultar cursos, materiales ni archivos de otro usuario antes de aplicar la migración al proyecto principal.

## Administrador

`006_owner_admin.sql` espera que ya exista exactamente una cuenta con username `sebasshulla` (sin `@` en la base de datos). Si no la encuentra, la migración falla intencionalmente para no promover una cuenta equivocada.

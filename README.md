# Nexo Study · Beta V0.9.1

Nexo Study organiza cursos, materiales y sesiones alrededor de Nexo IA. El Learning Workspace abre un PDF inmediatamente, mantiene el visor separado de su análisis y permite estudiar o preguntar con referencias a páginas. Resolver, Corrector, feedback, Auth y los espacios de estudio siguen disponibles.

## Learning Workspace

- Rutas de curso: `/courses/:courseId` y las secciones `/materials`, `/ai`, `/library`, `/practice` y `/progress`.
- Material: `/courses/:courseId/materials/:materialId/workspace`; métodos: `/study/:mode`.
- En escritorio, PDF y Nexo comparten un panel ajustable. En móvil se muestran como pestañas Material y Nexo IA.
- El chat de curso recupera fragmentos relevantes del curso; el chat de material se limita al documento. Las referencias conservan la página física para abrirla en el visor.
- Flashcards, preguntas, apuntes y simulacros se preparan bajo demanda. Los artefactos listos se guardan y reutilizan; regenerar requiere una acción explícita.
- Las sesiones de práctica se pueden planificar, activar y completar. Los resultados y eventos académicos mínimos se guardan sin contenido de las respuestas.

## Motor PDF 2.0

El archivo se muestra en el visor del navegador mientras PDF.js lee metadatos y texto. `pageCount` proviene de `pdf.numPages`, aunque todas las páginas sean imágenes o falle la extracción. Un total aún desconocido se muestra como “Calculando páginas…”.

La primera pasada procesa hasta 80 páginas en lotes de 10. Un PDF de más páginas queda en estado **partial**, conserva el número físico total y ofrece **Analizar más páginas**. El progreso visible representa páginas realmente inspeccionadas. Salir del material o abrir otro PDF cancela la extracción en curso. El visor sigue utilizable si el análisis falla.

Nexo distingue documentos con texto, escaneados y mixtos según las páginas inspeccionadas. Un PDF escaneado no se trata como archivo inválido: se puede elegir la página actual o un rango de hasta cuatro páginas y pedir un análisis visual explícito. No hay OCR automático ni envío masivo de imágenes.

Límite actual de archivo: **25 MiB**. El límite anterior de 250 páginas se elimina con la migración 008. Los PDF pueden tener más páginas; su análisis inicial sigue acotado para controlar memoria y costos.

## Persistencia y privacidad

Supabase Auth identifica al estudiante. `007_learning_workspace.sql` crea cursos, materiales, fragmentos, temas, artefactos, progreso, memoria, sesiones, eventos y el bucket privado `study-pdfs`. `008_pdf_engine_v2.sql` elimina el límite de páginas, añade el estado de análisis y una búsqueda acotada de fragmentos. Las políticas académicas son de propietario; `is_admin` no concede lectura del material de otros estudiantes.

El PDF original usa la ruta `userId/courseId/materialId/original.pdf` y se abre con URL firmada. Para PDF nuevos, el servidor guarda metadatos en `materials` y texto recuperable en `material_chunks`; no vuelve a guardar todas las páginas completas en `materials.content` y `materials.pages`. TXT y MD siguen usando `content`. Los registros antiguos siguen siendo legibles.

El inicio de sesión descarga cursos y metadatos ligeros. Al abrir un curso se cargan sus materiales y progreso; al abrir un material, sus fragmentos, temas y artefactos. Nexo consulta solo fragmentos relevantes por pregunta. La caché del navegador conserva el trabajo local e importa cursos que aún no existan en el servidor. Una sincronización fallida muestra **Reintentar sincronización**.

### Migraciones antes de producción

Aplica los SQL de `sql/` **en orden**, sin editar migraciones ya ejecutadas: 001 → 006, luego `007_learning_workspace.sql` y `008_pdf_engine_v2.sql`. La migración 006 requiere la cuenta propietaria indicada en [sql/README.md](sql/README.md). Las migraciones 007 y 008 aún requieren verificación en el Supabase real del proyecto.

Después de aplicar 007 y 008, comprueba en SQL Editor:

```sql
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'materials'
  and column_name in ('page_count', 'document_kind', 'analysis_status', 'analyzed_pages');

select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.materials'::regclass and contype = 'c';

select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('courses', 'materials', 'material_chunks', 'material_topics',
    'study_artifacts', 'study_progress', 'learning_state', 'study_sessions', 'study_session_events');

select id, public, file_size_limit from storage.buckets where id = 'study-pdfs';
```

Para comprobar RLS y Storage, usa **dos sesiones autenticadas distintas** por la API o la aplicación: crea un curso y PDF con A; confirma que B no pueda listar, leer, modificar ni borrar esos registros y archivos. SQL Editor usa privilegios elevados y no demuestra el aislamiento de las sesiones autenticadas.

## Desarrollo y despliegue

```bash
npm install
npm run dev
npm run dev:api
npm run build
npm run test:e2e
```

Copia `.env.example` a `.env.local` para desarrollo. `.env` y `.env.local` están ignorados. El frontend solo recibe las variables públicas `VITE_SUPABASE_*`; la clave de Nexo IA permanece en el servidor. Configura en Vercel las variables públicas de Supabase, las variables de validación de sesión del servidor y `NEXO_AI_*`. `vercel.json` conserva las rutas SPA. Añade las URL de retorno de recuperación de contraseña a Supabase Auth.

## Limitaciones conocidas

- La migración y RLS no se han validado todavía contra el proyecto Supabase real.
- El análisis visual de escaneos es manual y se limita a cuatro páginas por solicitud; no reconstruye automáticamente el texto de un libro entero.
- El análisis inicial de un PDF largo cubre 80 páginas. El estudiante puede ampliar la cobertura desde el workspace.
- El visor PDF es el visor nativo del navegador; su comportamiento exacto al saltar a `#page=N` depende del navegador.
- Los PDFs anteriores a la optimización pueden conservar texto duplicado en columnas antiguas. La migración 008 no elimina contenido existente.

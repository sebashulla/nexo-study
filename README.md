# Nexo Study · Beta V0.8

V0.8 convierte la zona de estudio en una navegación real por rutas y conecta los PDFs con la generación automática de material mediante Nexo IA.

## Novedades principales

- Rutas separadas para las áreas principales de la app:
  - `/courses`
  - `/courses/:courseId`
  - `/courses/:courseId/materials/:materialId`
  - `/folders`
  - `/resolver`
  - `/corrector`
  - `/study`
  - `/progress`
- Cada curso tiene su propia página y cada material abre una sesión de estudio independiente.
- Al guardar un PDF, Nexo IA genera automáticamente:
  - resumen de ideas clave,
  - palabras/conceptos importantes,
  - hasta 12 flashcards,
  - hasta 10 preguntas de quiz/simulacro,
  - referencias de página cuando el texto extraído permite identificarlas.
- Antes de generar, el estudiante puede indicar el enfoque: equilibrado, comprender, memorizar o examen.
- También puede indicar nivel: esencial, universitario o avanzado.
- PDFs largos usan un muestreo distribuido por páginas para no analizar solamente el inicio del documento.
- Si Nexo IA falla temporalmente, el sistema conserva un paquete local de respaldo para que el estudiante no quede bloqueado.
- La migración `006_owner_admin.sql` convierte únicamente a `@sebasshulla` en administrador de la beta.

## Variables de entorno

Copia `.env.example` como `.env.local`:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_SUPABASE_ANON_KEY

NEXO_AI_API_KEY=TU_CLAVE
NEXO_AI_STANDARD_MODEL=gemini-3.5-flash-lite
NEXO_AI_DEEP_MODEL=gemini-3.8-flash
```

`.env.local` está excluido por `.gitignore`.

## Supabase

Ejecuta las migraciones en orden:

1. `001_profiles.sql`
2. `002_ai_queries.sql`
3. `003_profile_onboarding.sql`
4. `004_study_folders.sql`
5. `005_feedback_admin.sql`
6. `006_owner_admin.sql`

La migración 006 exige que la cuenta `@sebasshulla` ya exista. Si no existe exactamente una coincidencia, falla de forma segura.

## Cómo funciona PDF → estudio

1. El navegador extrae texto del PDF página por página mediante PDF.js.
2. Nexo construye una muestra distribuida del documento con etiquetas `[Página N]`.
3. Esa muestra se envía al backend autenticado `/api/ai/solve` con la tarea interna `study_pack`.
4. Nexo IA devuelve JSON estructurado para flashcards y quiz.
5. El frontend valida el resultado antes de usarlo.
6. El paquete queda guardado dentro del material en el almacenamiento local actual.

> Los cursos, materiales y el avance de estudio todavía están en `localStorage`. Una próxima migración puede llevarlos a Supabase para sincronización completa entre dispositivos. La cuenta, la definición de espacios y la pertenencia de cursos a cada espacio usan Supabase.

## Espacios de estudio

El selector de la derecha activa un solo espacio a la vez. **General** contiene los cursos sin carpeta; cada espacio creado contiene únicamente los cursos asignados allí. Inicio, Mis cursos, Estudiar y Progreso muestran el contenido del espacio activo. Los cursos nuevos se crean dentro de ese espacio y los enlaces directos a un curso activan automáticamente el espacio que le corresponde.

En **Espacios** puedes crear uno, traer cursos existentes, moverlos entre espacios o eliminar un espacio. Al eliminarlo, sus cursos regresan a General. El avance se calcula a partir de resúmenes abiertos, tarjetas reveladas y preguntas respondidas; sigue al curso cuando se mueve. El historial visible de Resolver también se guarda por espacio en este navegador.

Como cursos y avance siguen siendo locales al navegador, cambiar de dispositivo no sincroniza estos datos todavía.

## Consola privada de feedback

Ruta interna:

```text
/nexo-ops/feedback-console
```

La seguridad real depende de `profiles.is_admin` + RLS de Supabase. La URL por sí sola no concede acceso.

## Desarrollo local

```bash
npm install
npm run dev
```

## Comprobación de interfaz

La interfaz se adapta a escritorio, tabletas y navegadores móviles iOS y Android. El acceso, recuperación de contraseña y registro se comprueban con respuestas simuladas de Supabase, sin crear cuentas ni enviar correos reales:

```bash
npx playwright install chromium webkit
npm run test:e2e
```

Las pruebas recorren las secciones principales en Chrome, Safari/WebKit, un iPhone, un Android y una pantalla de 320 px. Para probar un inicio de sesión real, configura Supabase y utiliza una cuenta de prueba del proyecto.

Para que los enlaces de recuperación vuelvan a la aplicación, añade `http://localhost:5173/reset-password` y `https://TU-DOMINIO/reset-password` a las URL de redirección permitidas en Supabase Auth.

Los cursos y materiales todavía se guardan en el navegador. Aunque la interfaz se adapta a ambos sistemas móviles, este contenido no se sincroniza entre dispositivos.

En otro terminal para Nexo IA:

```bash
npm run dev:api
```

## Vercel

`vercel.json` contiene rewrites para las rutas SPA nuevas. Configura en Vercel las dos variables públicas de Supabase y las tres variables privadas de Nexo IA antes del deploy.

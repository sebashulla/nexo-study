# V0.9.3 — validación reproducible de privacidad

**Estado:** preparado, pendiente de ejecutar en Supabase real. Los tests de Playwright simulan el servidor; no validan RLS, SQL ni permisos de Storage.

## Preparación

1. Usar un proyecto de prueba con migraciones 001–008 ya aplicadas. Aplicar `009_saved_solutions.sql` en SQL Editor; volver a aplicarla para comprobar idempotencia. No editar migraciones históricas.
2. Confirmar en Storage que `study-pdfs` y `solution-images` tienen **Public desactivado**. Este último admite PNG/JPEG/WebP y hasta 3 MB por archivo.
3. Crear dos cuentas confirmadas diferentes, User A y User B. Iniciar sesión en la app en dos perfiles de navegador separados.
4. Obtener los `access_token` de esas sesiones (DevTools → Application → Local Storage → sesión de Supabase). Son credenciales temporales: no pegarlos en issues, capturas, Git ni logs. Si expiran, iniciar sesión de nuevo.
5. Ejecutar desde la raíz en PowerShell con Node disponible. Usar exclusivamente la clave `anon`/publishable; **nunca service_role ni una secret key**.

```powershell
$env:NEXO_TEST_SUPABASE_URL = 'https://TU-PROYECTO.supabase.co'
$env:NEXO_TEST_ANON_KEY = 'CLAVE-PUBLICA'
$env:NEXO_TEST_USER_A_TOKEN = 'ACCESS-TOKEN-A'
$env:NEXO_TEST_USER_B_TOKEN = 'ACCESS-TOKEN-B'
node scripts/validate-academic-security.mjs
Remove-Item Env:NEXO_TEST_USER_A_TOKEN, Env:NEXO_TEST_USER_B_TOKEN
```

El script crea recursos temporales con prefijo `security-<uuid>` para cada propietario. Valida ambos sentidos A→B y B→A. Al terminar intenta eliminar solo sus propios fixtures, primero archivos y después curso. Un fallo de limpieza deja un identificador para localizar únicamente esos fixtures. No ejecutarlo en una base donde no tengas autorización para crear contenido de prueba.

## Qué verifica el script

- El propietario puede crear y leer sus cursos, materiales, chunks, artefactos y soluciones.
- El otro usuario no puede leer, insertar con un `user_id` ajeno, actualizar ni eliminar esas filas. UPDATE/DELETE pueden devolver `200 []`: también se comprueba que la fila sigue intacta con la sesión del dueño.
- Ambos propietarios pueden subir/descargar PDF e imágenes propios y crear signed URLs.
- El otro usuario no puede descargar objetos, crear signed URLs ni escribir en la ruta ajena; un intento de eliminación no retira el archivo.
- La URL pública permanente no permite descargar ninguno de los dos tipos de archivo.
- No usa SQL elevado ni claves que eviten RLS. Opcional: repetir con User A marcado admin para comprobar que tampoco tiene excepción sobre contenido académico privado.

Una signed URL válida es una credencial temporal: quien la reciba puede usarla hasta que expire. La comprobación de aislamiento exige que el otro usuario **no pueda emitir** una URL para archivos ajenos; no exige que una URL ya compartida deje de funcionar.

## Pruebas manuales adicionales

1. Con A: Resolver → adjuntar dos imágenes → responder → Guardar → elegir curso → Biblioteca → Soluciones. Recargar y abrir. Deben mantenerse pregunta, respuesta e imágenes sin nueva llamada IA.
2. Repetir Guardar con la misma respuesta y curso: debe existir una sola fila (`user_id, course_id, source_key`). Guardar en otro curso es una copia intencional distinta.
3. En `saved_solutions.attachments`, comprobar solo `storagePath`, `mimeType`, `name`, `bytes`: sin data URLs ni blobs. Los paths comienzan por `userId/courseId/solutions/solutionId/`.
4. Con B: sustituir el id/ruta por uno de A y repetir consultas autenticadas REST/Storage. No obtener contenido privado.
5. Intentar guardar metadatos con path de otro propietario, MIME no permitido, campos extra, más de cuatro imágenes o bytes >3 MB. El CHECK debe rechazarlo.
6. Simular desconexión durante subida: nunca mostrar éxito sin fila `ready`. Una subida fallida limpia archivos y fila; si también falla la limpieza, la fila queda `saving`, excluida de Biblioteca/búsqueda. Tras 10 minutos, reintentar Guardar recupera la fila pendiente y limpia su prefijo antes de un nuevo intento. Revisar esa recuperación con Storage real.
7. Eliminar solución: se retiran sus archivos antes de la fila. Si falla Storage se conserva la fila y aparece error. Si falla el borrado de la fila tras retirar archivos, reintentar; validar que Storage acepta eliminar un path ya ausente.
8. Eliminar un curso por una operación externa puede dejar objetos huérfanos: la FK elimina filas, no archivos de Storage. Limpiar los prefijos propios antes de borrar el curso. No se agregó un servicio automático de limpieza.

## Evidencia que falta registrar

- Proyecto/fecha y éxito de aplicar 009 dos veces.
- Salida completa del script con ambos usuarios; ningún token.
- Confirmación de privacidad de los buckets, CHECKs y caso admin.
- Guardado, recarga, deduplicación, borrado y recuperación de subida parcial con red real.
- Signed URLs a 10 minutos, expiración y renovación al reabrir la solución.

No marcar Security o Private attachments como validación real completa sin esta evidencia.

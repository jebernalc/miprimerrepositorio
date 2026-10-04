# SOLVEX — App de Cotizaciones para Servicios Técnicos

Aplicación web de **SOLVEX SYSTEM J.B. S.A.S.** para generar cotizaciones de servicios técnicos en Estaciones de Servicio.

## Archivo principal

- `index.html`: aplicación completa lista para GitHub Pages.

El logotipo, los estilos y la lógica están integrados en el HTML. La aplicación utiliza servicios públicos externos para calcular rutas y cargar el motor de generación de PDF, por lo que esas funciones requieren conexión a Internet.

## Funciones

- Cotización por horas de servicio.
- Horas adicionales con tarifa independiente.
- Ítems de instalación y capacitación.
- Gastos de viaje calculados por kilometraje.
- Descuento, IVA y total automático.
- Generación de PDF con bloque de firmas alineado (firma manuscrita capturada en pantalla de quien elabora, con nombre, cargo, fecha y hora; recuadro para firma y sello del cliente).
- Recuadro de firma en pantalla (dedo, lápiz o mouse), obligatorio para generar el PDF, imprimir o enviar por WhatsApp.
- **Asistente de voz con IA (v1.4.0)**: botón flotante 🎙 en la pantalla. Dicte "cliente…, NIT…, estación…, ciudad…, teléfono…, correo…, dirección…, tres horas, dos sondas, viaje a…" y cada dato se coloca ordenado en su caja (NIT con dígito de verificación, teléfonos y direcciones formateados). Diga "busca en internet el NIT y el teléfono de la estación …" para que se busquen y distribuyan los datos. Con una clave de API de Claude (⚙ en el panel, se guarda solo en el dispositivo) el motor entiende dictados complejos y busca en la web; sin clave usa el motor local y OpenStreetMap (dirección/teléfono; el NIT requiere IA). Comandos: "deshacer", "generar PDF", "enviar por WhatsApp". Verifique siempre los datos encontrados.
- Envío por WhatsApp al número del cliente: en la app Android (v1.2.0) abre el chat de ese número con el PDF ya adjunto, solo falta presionar Enviar. En el navegador abre el chat del número y deja el PDF descargado para adjuntarlo (los navegadores no permiten adjuntar archivos por enlace).
- Importación y exportación de cotizaciones en JSON.
- Almacenamiento local en cada navegador.

## Publicación rápida en GitHub Pages

1. Crear un repositorio nuevo en GitHub.
2. Subir `index.html` y `README.md` a la raíz del repositorio.
3. Abrir **Settings → Pages**.
4. En **Build and deployment**, seleccionar **Deploy from a branch**.
5. Seleccionar la rama **main** y la carpeta **/(root)**.
6. Presionar **Save**.
7. Esperar la publicación y abrir **Visit site**.

La dirección tendrá normalmente esta estructura:

`https://USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`

## Lista de pruebas para alta dirección

1. Abrir el enlace en computador y celular.
2. Confirmar que el ícono SOLVEX sea visible.
3. Verificar los datos empresariales y medios de pago.
4. Seleccionar entre 0 y 4 horas y validar el total automático.
5. Probar horas adicionales con una tarifa diferente.
6. Agregar cantidades de Sondas, Equipos y Capacitación.
7. Probar 10 km en modo solo ida y confirmar 10 km facturados.
8. Cambiar a ida y regreso y confirmar 20 km facturados.
9. Generar y revisar el PDF.
10. Probar la descarga y apertura de WhatsApp.

## Privacidad

Los datos de las cotizaciones se guardan en el almacenamiento local del navegador utilizado. No se incluye una base de datos central ni se sincronizan cotizaciones entre dispositivos.

## Responsable

**SOLVEX SYSTEM J.B. S.A.S.**  
Ingeniería tecnológica integral para Estaciones de Servicio.

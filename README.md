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
- Generación de PDF.
- Envío y apertura de WhatsApp.
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

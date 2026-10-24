# ☀️ Lumora

Un sol animado que flota en una esquina de cualquier web y convierte "algo no anda" en un ticket de soporte completo: captura de pantalla anotada o grabación, pasos para reproducir, errores de consola, requests fallidos, datos del usuario y del navegador. Todo enviado a la herramienta de tickets que ya usa el cliente.

```html
<script src="https://app.lumora.app/lumora.js" data-key="pk_…" async></script>
```

## Qué incluye

| Pieza | Qué hace |
|---|---|
| **Widget** (`packages/widget`) | Script embebible de 1 línea (~25 KB gzip), aislado en Shadow DOM. Sol flotante con animación (rayos que giran, parpadea, se "preocupa" cuando la página tira un error y ofrece reportarlo). Captura de pantalla sin permisos (render del DOM) con fallback a compartir pestaña, editor para resaltar / dibujar / ocultar datos privados, grabación de pantalla (con voz opcional) que se transcribe a pasos con marca de tiempo, formulario según el template del cliente, y transparencia: el usuario ve y puede desactivar qué datos técnicos se envían. Español e inglés, modo oscuro, accesible con teclado, responsive. |
| **Servidor** (`packages/server`) | API multi-tenant (Node 22 + Express 5 + SQLite nativo). Cuentas, sitios, keys públicas con dominios permitidos, rate limiting, límites por plan aplicados del lado del servidor, almacenamiento de adjuntos con links firmados que expiran, credenciales de integraciones cifradas (AES-256-GCM), Stripe (checkout, portal, webhook firmado). |
| **Back office** (`packages/dashboard`) | React. Instalación con snippet, bandeja de reportes con detalle (captura, video, pasos, consola, red, entorno, entregas), configuración del widget con preview en vivo, editor del template del ticket, qué datos capturar, integraciones con "probar conexión", configuración del sitio y plan/facturación. |
| **Demo** (`demo/`) | App falsa con botones para romper cosas (JS error, promise rechazada, 500, 404…) para probar el widget. |

### Integraciones de tickets

Webhook (firmado con HMAC) · Slack · E-mail (SMTP) · Jira Cloud · Zendesk · Freshdesk · GitHub Issues · Linear · Salesforce Service Cloud (Case + archivos vía External Client App).
El ticket se arma con un template Markdown (variables como `{{steps}}`, `{{console}}`, `{{fields.category}}`) que se convierte al formato de cada herramienta (wiki de Jira, HTML de Zendesk/Freshdesk, mrkdwn de Slack, texto plano en Salesforce). Las secciones vacías se eliminan solas.

### Planes (mensuales)

| | **Starter** $19 | **Pro** $49 | **Business** $149 |
|---|---|---|---|
| Sitios / reportes por mes | 1 / 100 | 3 / 1.000 | 25 / 10.000 |
| Captura + anotación, consola, entorno | ✓ | ✓ | ✓ |
| Grabación de pantalla → pasos | — | 2 min | 10 min |
| Requests fallidos, últimas acciones del usuario | — | ✓ | ✓ |
| Integraciones | Webhook, Slack, e-mail | + Jira, Zendesk, Freshdesk, GitHub, Linear | + Salesforce |
| Destinos por sitio | 1 | 2 | 10 + ruteo por categoría |
| Template personalizado, sin marca "Powered by" | — | ✓ | ✓ |
| Pasos y resumen escritos con IA, reglas para ocultar elementos | — | — | ✓ |

Las cuentas nuevas empiezan con 14 días de Pro. Los planes están definidos en un solo lugar: `packages/shared/src/plans.ts`.

## Correrlo localmente

Requiere Node 22.5+.

```bash
npm install
npm run dev          # compila widget + dashboard y levanta el servidor en http://localhost:3000
```

1. Abrí http://localhost:3000/app, creá una cuenta.
2. En **Install** → "Try it on a demo page", rompé algo y hacé clic en el sol.
3. El reporte aparece en **Reports**; conectá un destino en **Integrations** para que además se reenvíe.

Sin `STRIPE_SECRET_KEY` la facturación queda en modo demo: podés cambiar de plan libremente para probar cada tier. Ver `.env.example` para todas las variables.

```bash
npm test             # tests unitarios + de API
npm run typecheck
npm run build && npm start   # build de producción
docker build -t lumora . && docker run -p 3000:3000 -v lumora-data:/data -e LUMORA_SECRET=… lumora
```

## Cómo se instala en el sitio del cliente

```html
<!-- 1. La única línea obligatoria -->
<script src="https://TU-DOMINIO/lumora.js" data-key="pk_…" async></script>

<!-- 2. Opcional: identificar al usuario y agregar contexto (funciona aunque el script no haya cargado aún) -->
<script>
  window.Lumora = window.Lumora || function () { (Lumora.q = Lumora.q || []).push(arguments) };
  Lumora('identify', { id: user.id, email: user.email, name: user.name, plan: user.plan });
  Lumora('metadata', { release: '2.4.1' });
</script>
```

API: `Lumora('open' | 'screenshot' | 'record' | 'close' | 'hide' | 'show' | 'destroy')`.

## Privacidad y seguridad

- Lo que el usuario escribe nunca se envía por defecto (los pasos dicen "Escribir en el campo Email"); contraseñas y campos de tarjeta siempre se enmascaran.
- E-mails, números de tarjeta, JWT, bearer tokens y parámetros sensibles de URL se limpian antes de salir del navegador.
- Selectores CSS configurables se tapan en las capturas y no se registran como pasos (Business).
- Nunca se capturan bodies ni headers de requests.
- La key del widget es pública por diseño; los dominios permitidos y el rate limiting evitan abuso. Las restricciones del plan se re-aplican en el servidor.
- Los secretos de integraciones se cifran en reposo y nunca vuelven al navegador.

## Arquitectura

```
packages/
  shared/     tipos, planes, settings por defecto, generador de pasos, redacción (usado por los 3)
  widget/     lumora.js (TypeScript → IIFE con esbuild)
  server/     Express + node:sqlite; conectores en src/connectors/
  dashboard/  React (esbuild), servido en /app
demo/         página de prueba, servida en /demo
```

## Próximos pasos sugeridos

- **AppExchange**: publicar un paquete gestionado de Salesforce con un componente LWC/Experience Cloud que cargue el widget y un flujo de OAuth en lugar de "Consumer key/secret", más la revisión de seguridad de Salesforce. El conector de Case ya está.
- Más destinos: Intercom, HubSpot, Freshservice, ServiceNow, Azure DevOps, ClickUp.
- Equipo / roles en el back office, SSO para Business, retención configurable de adjuntos, almacenamiento en S3.
- Dashboard en español (el widget ya es bilingüe).
- Pasar SQLite a Postgres cuando haya varias instancias del servidor.

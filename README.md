# ☀️ Lumora

Una nebulosa animada que flota en una esquina de cualquier web y convierte "algo no anda" en un ticket de soporte completo: captura de pantalla anotada o grabación, pasos para reproducir, errores de consola, requests fallidos, datos del usuario y del navegador. Todo enviado a la herramienta de tickets que ya usa el cliente.

```html
<script src="https://app.lumora.app/lumora.js" data-key="pk_…" async></script>
```

## El core

Lumora resuelve una cosa muy cara para los equipos de soporte: las reuniones y los ida y vuelta para entender qué le pasó a un usuario. El usuario hace clic en la nebulosa, muestra el problema (captura o grabación) y Lumora arma el ticket completo en la herramienta que el equipo ya usa:

1. **Widget de una línea** que funciona en cualquier web app.
2. **Captura automática**: consola, requests fallidos, entorno y los pasos del usuario. Siempre se adjunta; al usuario solo se le informa.
3. **Grabación de pantalla → pasos escritos** con marca de tiempo (y opcionalmente reescritos con IA).
4. **Ticket según template** en Jira, Azure DevOps, GitHub, GitLab, Linear, Zendesk, ServiceNow, Salesforce y más.

Arriba de eso, el plan Business suma el **Support Center**: dashboard de métricas y un repositorio de reportes cuyo estado se sincroniza desde la herramienta de tickets.

## Qué incluye

| Pieza | Qué hace |
|---|---|
| **Widget** (`packages/widget`) | Script embebible (~30 KB gzip), aislado en Shadow DOM. **Logo nebulosa**: una galaxia amarilla pastel que gira lentamente sobre su centro, se expande al abrir el panel (que emerge desde ella), se contrae al cerrar y, al enviar un reporte, muestra un agradecimiento con un destello de estrellas antes de volver a su esquina. Avisa con un anillo suave cuando la página tira un error. Captura de pantalla sin permisos con editor (resaltar, dibujar, ocultar datos), grabación de pantalla con pasos automáticos, formulario según el template. Estilo tipo Apple (vidrio esmerilado, controles segmentados), modo oscuro, español e inglés, respeta "reducir movimiento". |
| **Servidor** (`packages/server`) | API multi-tenant (Node 22 + Express 5 + SQLite nativo). Límites por plan aplicados en el servidor, adjuntos con links firmados, credenciales cifradas (AES-256-GCM), Stripe, **sincronización de estado** (sondeo periódico + webhooks entrantes), **agrupación de reportes similares** en issues y métricas. |
| **Back office** (`packages/dashboard`) | React, estilo Apple. **Overview** (métricas), **Reports** (repositorio con estados, filtros y vista agrupada por issue) y **Settings** con pestañas: Install, Widget, Ticket template, Data capture, Integrations, General. Plan y facturación aparte. |
| **Demo** (`demo/`) | App falsa con botones para romper cosas, para probar el widget. |

### Support Center (Business)

- **Overview**: reportes del período y variación, abiertos ahora, tiempo mediano de resolución, % con errores, gráfico diario de reportes vs. resueltos (con tooltip y vista de tabla), top issues, páginas donde la gente se traba, categorías, navegadores y forma de reporte. Los gráficos usan una paleta validada para daltonismo y contraste, en claro y oscuro.
- **Reports**: estados *Open / In progress / Resolved* con contadores, búsqueda, filtros (categoría, tipo de captura, página, navegador, fecha, con errores, con grabación, entrega fallida) que quedan en la URL para compartir, y vista **agrupada por issue**: reportes con el mismo error (aunque cambien IDs o números) se juntan, con cantidad de personas afectadas, primera y última vez visto.
- **Estado sincronizado**: cada reporte muestra el estado real del ticket vinculado ("In Review", "Pending", "Resolved"…). Lumora consulta las herramientas cada 2 minutos (`LUMORA_SYNC_INTERVAL_SEC`) y cada integración tiene una URL de webhook secreta para actualizaciones instantáneas. Sin ticket vinculado, el estado se cambia a mano.

### Integraciones (19)

| Tipo | Herramientas | Sincroniza estado |
|---|---|---|
| Issue / defect trackers | Jira, Azure DevOps, GitHub Issues, GitLab, Linear, ClickUp, Asana, Shortcut, YouTrack, Trello | ✓ |
| Help desks | Zendesk, Freshdesk, HubSpot | ✓ |
| Enterprise service management | Salesforce Service Cloud, ServiceNow, Freshservice | ✓ |
| Mensajería y automatización | Webhook (firmado HMAC), Slack, E-mail | — |

El ticket se arma con un template Markdown (`{{steps}}`, `{{console}}`, `{{fields.category}}`…) convertido al formato de cada herramienta. Las secciones vacías se eliminan solas.

### Planes (mensuales)

| | **Starter** $19 | **Pro** $59 | **Business** $179 |
|---|---|---|---|
| Apps / reportes por mes | 1 / 150 | 5 / 1.500 | 25 / 15.000 |
| Captura + anotación, consola, red, entorno, pasos | ✓ | ✓ | ✓ |
| Grabación → pasos escritos | 1 min | 5 min + voz | 10 min + voz |
| Issue trackers (Jira, Azure DevOps, GitHub, GitLab, Linear…) | ✓ | ✓ | ✓ |
| Help desks (Zendesk, Freshdesk, HubSpot) | — | ✓ | ✓ |
| Salesforce, ServiceNow, Freshservice | — | — | ✓ |
| Destinos por app | 1 | 3 | 10 + ruteo por categoría |
| Template personalizado, sin marca | — | ✓ | ✓ |
| Historial de reportes | 30 días | 90 días | 2 años |
| **Support Center** (dashboard, estado sincronizado, issues agrupados) | — | — | ✓ |
| Pasos y resumen con IA, reglas para ocultar elementos | — | — | ✓ |

Las cuentas nuevas empiezan con 14 días de Pro. Todo está definido en `packages/shared/src/plans.ts`.

## Correrlo localmente

Requiere Node 22.5+.

```bash
npm install
npm run dev          # compila widget + dashboard y levanta el servidor en http://localhost:3000
```

1. Abrí http://localhost:3000/app, creá una cuenta.
2. En **Settings → Install** → "Try it on a demo page", rompé algo y hacé clic en la nebulosa.
3. El reporte aparece en **Reports**; conectá un destino en **Settings → Integrations** para crear el ticket en tu herramienta.

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

- Los datos técnicos se adjuntan siempre (lo define el administrador en **Data capture**); el widget le explica al usuario qué se incluye.
- Lo que el usuario escribe nunca se envía por defecto (los pasos dicen "Escribir en el campo Email"); contraseñas y campos de tarjeta siempre se enmascaran.
- E-mails, números de tarjeta, JWT, bearer tokens y parámetros sensibles de URL se limpian antes de salir del navegador.
- Selectores CSS configurables se tapan en las capturas y no se registran como pasos (Business).
- Nunca se capturan bodies ni headers de requests.
- La key del widget es pública por diseño; los dominios permitidos y el rate limiting evitan abuso. Las restricciones del plan se re-aplican en el servidor.
- Los secretos de integraciones se cifran en reposo y nunca vuelven al navegador.

## Arquitectura

```
packages/
  shared/     tipos, planes, settings por defecto, generador de pasos, redacción, logo nebulosa (usado por los 3)
  widget/     lumora.js (TypeScript → IIFE con esbuild)
  server/     Express + node:sqlite; conectores en src/connectors/, sincronización en src/sync.ts,
              Support Center en src/routes/center.ts
  dashboard/  React (esbuild), servido en /app
demo/         página de prueba, servida en /demo
```

## Próximos pasos sugeridos

- **AppExchange**: publicar un paquete gestionado de Salesforce con un componente LWC/Experience Cloud que cargue el widget y un flujo de OAuth en lugar de "Consumer key/secret", más la revisión de seguridad de Salesforce. El conector de Case ya está.
- Probar cada conector contra una cuenta real (hoy están verificados con tests que simulan las APIs).
- Support Center: asignación a agentes, notas internas, vistas guardadas, alertas cuando un issue crece, métricas entre todas las apps.
- Más destinos: monday.com, Intercom, Notion, Azure Boards on-premise.
- Equipo / roles en el back office, SSO para Business, retención configurable de adjuntos, almacenamiento en S3.
- Back office en español (el widget ya es bilingüe).
- Pasar SQLite a Postgres cuando haya varias instancias del servidor.

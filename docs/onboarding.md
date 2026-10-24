# Experiencia de onboarding Lumora

Objetivo: que un cliente pase de "me registré" a "recibí mi primer ticket completo en Jira" en menos de 10 minutos, sin hablar con nadie, y que entienda qué le da su plan. Es parte del producto premium: el mismo cuidado que el widget.

## 1. Recorrido del cliente

| Momento | Qué pasa | Estado |
|---|---|---|
| **Registro** | Cuenta + primera app creadas, 14 días de Pro. E-mail de bienvenida con el snippet y un link para seguir el setup. Se abre el **Setup wizard**. | ✅ |
| **Setup wizard** (4 pasos) | 1. Tu app (nombre y dominio permitido). 2. Instalar (snippet por stack + detección en vivo cuando el widget carga en su sitio). 3. Conectar tu herramienta (Jira, GitHub…, con prueba de conexión). 4. Enviar un reporte de prueba (detección en vivo del primer ticket + celebración). Se puede saltear y retomar. | ✅ |
| **Checklist "Getting started"** | Tarjeta en el Overview con los 4 pasos y su progreso hasta completarlos. | ✅ |
| **Tour guiado** | Diálogos que señalan cada sección (Overview, Reports, Settings, Plan & billing, Help) y explican qué hace. Cambia según el plan. Se ofrece al terminar el setup y desde Help. | ✅ |
| **Pago confirmado** | Stripe confirma → el plan se activa (webhook) → al volver del checkout el back office espera la confirmación ("Confirming your payment…") y se actualiza solo → modal "Welcome to Pro/Business" con lo que se desbloqueó y botón al tour. E-mail de confirmación (Stripe envía el recibo). | ✅ |
| **Cambio de extras** | Mismo modal con lo nuevo (ej. AI Powered). | ✅ |
| **Olvidé mi contraseña** | Link en el login → e-mail con link de un solo uso (1 hora) → nueva contraseña y adentro. | ✅ |
| **Setup sin terminar** | Si lo saltea, un banner y el checklist del Overview lo invitan a retomarlo. | ✅ |
| **Fin de la prueba** | Aviso 3 días antes (banner) y e-mail; al vencer baja a Free sin romper el widget. | Banner ✅ · e-mail: pendiente (job diario) |

## 2. Ayuda

| Dónde | Qué | Estado |
|---|---|---|
| **Help** en la barra lateral | Panel con guías: instalar, cada integración, webhooks de estado, AI Powered, privacidad; "Volver a hacer el tour"; contacto con soporte. | ✅ |
| **Ayuda contextual en cada integración** | "¿Cómo obtengo esto?" paso a paso por herramienta, y cuando el test falla, el error traducido a qué revisar (token inválido, permisos, proyecto inexistente…). | ✅ |
| **Webhooks de estado** | Botón "Configurar automáticamente" cuando la herramienta lo permite; si no, guía manual con la URL para copiar. Indicador de salud: último evento recibido. | ✅ Automático: GitHub, GitLab, Jira (cuenta admin), Trello, Asana · Guía manual: el resto |
| **Contacto** | Link a soporte (e-mail configurable con `LUMORA_SUPPORT_EMAIL`). | ✅ |

## 3. E-mails transaccionales

Se envían por SMTP (`SMTP_URL`); sin SMTP se registran en el log para no bloquear el flujo.

- Bienvenida (registro).
- Plan activado / cambiado (webhook de Stripe).
- Restablecer contraseña.
- Pendiente: aviso de fin de prueba, resumen semanal de reportes (Business), alerta cuando un issue crece.

## 4. Ideas para después

- Videos cortos (10–20 s) dentro de las guías.
- Instalación asistida para WordPress/Shopify (plugin) y Salesforce (paquete de AppExchange).
- Invitar al equipo durante el setup (requiere usuarios múltiples por cuenta).
- Chat de soporte dentro del back office.

# 🎬 Creator Studio — Project State & Context Map

> **Última actualización:** 21 de Agosto, 2026  
> **Versión del Core:** 0.1.0 (Tauri v2 + Vite + Python Render Engine)

---

## 📌 1. Visión General
**Creator Studio** es una aplicación de escritorio de alto rendimiento diseñada para la creación, edición y exportación automatizada de **video-tutoriales cinematográficos a 1080p**. Combina una interfaz gráfica interactiva con un motor de grabación web integrado y un pipeline de renderizado multiproceso en Python acelerado por GPU.

---

## 🚀 2. Estado Actual del Sistema (100% Operativo)

| Módulo | Estado | Capacidades Clave |
| :--- | :---: | :--- |
| **Editor Interactivo (Studio)** | ✅ Activo | Canvas 1080p WYSIWYG, timeline reordenable por Drag & Drop, atajos de teclado (`Ctrl+D`, `Space`, `Ctrl+S`), duplicación/borrado de pasos, inspector tipográfico y reubicación libre de subtítulos/mockup en canvas. |
| **Grabador Web Integrado** | ✅ Activo | Ventana WebView2 secundaria aislada, HUD interactivo flotante, captura nativa limpia (oculta HUD automáticamente vía `requestAnimationFrame` + GDI `CAPTUREBLT`), extracción semántica de subtítulos y calibración automática de `clickCoords` y zoom. |
| **Motor de Render MP4** | ✅ Activo | Python (`render_engine.py`) con `ProcessPoolExecutor`, interpolación afín cúbica (`ease_out_cubic`), crossfade suave entre capturas (0.45s), sombras gaussianas difusas, sincronización palabra por palabra (`marks`) y detección automática de encoders GPU (`h264_nvenc`, `h264_qsv`, `h264_amf`, `libx264`). |
| **Ecosistema de Datos** | ✅ Activo | Esquema JSON normalizado `(0.0 - 1.0)` con paridad total $1:1$ entre el visor web y el renderizador final. Retrocompatibilidad transparente de proyectos. |

---

## 🗺️ 3. Mapa de Archivos del Proyecto (Codebase Map)

```text
Creator App/
├── src/                                  # FRONTEND (TypeScript + Vite + CSS)
│   ├── main.ts                           # Lógica central del editor, timeline, canvas, inspector e IPC
│   ├── types.ts                          # Interfaces canónicas de datos (ProjectData, StepItem, etc.)
│   ├── style.css                         # Diseño Noir-Tech / Glassmorphism, layout y temas
│   └── index.html                        # Contenedor raíz de la aplicación web
│
├── src-tauri/                            # BACKEND NATIVO (Rust + Tauri 2)
│   ├── src/lib.rs                        # Comandos nativos (FS, diálogos, grabador web, spawn de Python)
│   ├── src/main.rs                       # Entrypoint de ejecución de Tauri
│   ├── capabilities/                     # Permisos y seguridad modular
│   │   ├── default.json                  # Capability para ventana "main" (acceso a FS y comandos locales)
│   │   └── remote.json                   # Capability para ventana "web_recorder" (orígenes web externos)
│   └── tauri.conf.json                   # Configuración del empaquetador y ventanas Tauri
│
├── render_engine.py                      # MOTOR DE RENDERIZADO (Python + Pillow + FFmpeg)
│                                         # Orquestación de fotogramas, tipografías, zoom y exportación MP4
│
├── public/                               # ASSETS ESTÁTICOS Y RECURSOS
│   └── assets/
│       ├── creator_bg.webp               # Fondo oficial de alta resolución del canvas
│       └── timeline.json                 # Proyecto de demostración / plantilla base
│
├── .agents/skills/                       # SKILLS Y CONOCIMIENTO EXPERTO DEL AGENTE
│   └── creator-studio-expert/SKILL.md    # Guía técnica de arquitectura, IPC y trampas de integración
│
└── docs/archive/                         # HISTÓRICO Y DOCUMENTACIÓN DETALLADA
    ├── CONTEXTO_RENDERIZADO_CREATOR_STUDIO.md  # Especificación matemática del renderizador
    ├── SPEC_DRIVEN_DEVELOPMENT.md              # Documentación de metodología SDD inicial
    └── FUTURAS_OPTIMIZACIONES_ROADMAP.md       # Hoja de ruta histórica de fases y niveles
```

---

## 🔗 4. Documentos de Referencia Rápida
- **Guía de Arquitectura e Integración Técnica:** Consulte [`.agents/skills/creator-studio-expert/SKILL.md`](.agents/skills/creator-studio-expert/SKILL.md).
- **Detalles Profundos del Pipeline Gráfico:** Consulte [`docs/archive/CONTEXTO_RENDERIZADO_CREATOR_STUDIO.md`](docs/archive/CONTEXTO_RENDERIZADO_CREATOR_STUDIO.md).
- **Hoja de Ruta Histórica:** Consulte [`docs/archive/FUTURAS_OPTIMIZACIONES_ROADMAP.md`](docs/archive/FUTURAS_OPTIMIZACIONES_ROADMAP.md).

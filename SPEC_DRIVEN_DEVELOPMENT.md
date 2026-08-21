# 📋 Spec-Driven Development (SDD): Creator Studio
*Documento vivo de arquitectura, especificaciones técnicas y roadmap de evolución continua.*

---

## 📌 1. Visión del Producto
**Creator Studio** es una aplicación de escritorio profesional y ligera (construida con **Tauri + Rust + Frontend Web Moderno**) diseñada para crear, editar y renderizar tutoriales interactivos y videos explicativos con estética moderna (*Glassmorphism, mockups elegantes de navegador, zoom & pan dinámico, subtítulos palabra por palabra y cursor animado*).

### Modos Principales de Creación:
1. **Modo Manual (Crear desde cero):** Arrastrar capturas de pantalla, definir puntos de clic/zoom, escribir subtítulos y dejar que el estudio calcule los tiempos o ajustarlos manualmente.
2. **Modo Grabación Web Integrada:** Navegar en una ventana embebida interactiva donde cada clic genera automáticamente una captura de alta resolución, títulos semánticos y coordenadas exactas.

---

## 🏛️ 2. Principios de Arquitectura Técnica

### A. Lienzo Virtual Nativo 1920×1080 (Zero-Drift WYSIWYG)
- **Resolución Interna Fija:** Todas las posiciones, tamaños de tipografía, paddings y mockups se definen internamente en un canvas virtual de 1920 × 1080 px.
- **Auto-Scaling en UI:** La ventana del editor aplica `transform: scale(k)` para encajar en cualquier monitor sin alterar las coordenadas absolutas.
- **Paridad 1:1 con Render:** El motor de video toma exactamente las coordenadas del stage sin conversiones ni factores de distorsión.

### B. Core Desktop (Tauri + Rust)
- **Tauri 2.x:** WebView nativo ultraliviano (<15MB RAM/disco).
- **Rust Backend:** 
  - Gestión de archivos de proyecto (project.json, imágenes, audio).
  - Grabador web nativo con inyección de scripts y captura acelerada por hardware.
  - Orquestación del pipeline de renderizado a MP4 (Full HD 30/60 FPS).

### C. Frontend UI (Editor & Player)
- **Stage Preview:** Reproductor interactivo con controles de reproducción (Play/Pause, Scrubbing, Loop).
- **Timeline de Pasos:** Pista horizontal de bloques de pasos con drag & drop para reordenar y manijas laterales para redimensionar duración en milisegundos.
- **Inspector Lateral de Paso:**
  - Selector de imagen / captura.
  - Switch de Zoom & Pan con selector de punto de enfoque.
  - Editor de subtítulos y distribución automática/manual de marcas de tiempo (*word marks*).
  - Coordenadas de clic interactivo.

---

## 🗄️ 3. Especificación del Modelo de Datos (project.json)

`json
{
  "": "./schema.json",
  "version": "1.0.0",
  "title": "Tutorial Sin Título",
  "settings": {
    "resolution": { "width": 1920, "height": 1080 },
    "fps": 30,
    "theme": "mac_dark",
    "background": "assets/creator_bg.webp",
    "zoomFactor": 1.20,
    "clickAnimationDurationMs": 1100
  },
  "steps": [
    {
      "id": "step-1",
      "type": "click",
      "title": "Paso 1: Abrir menú",
      "screenshot": "assets/step_1.webp",
      "duration": 4500,
      "pageTitle": "MiPlataforma.com",
      "clickCoords": { "x": 0.85, "y": 0.18 },
      "enableZoom": true,
      "boundingBox": { "x": 0.80, "y": 0.15, "width": 0.10, "height": 0.06 },
      "transcript": "Haz clic en el botón superior derecho.",
      "audio": null,
      "marks": [
        { "text": "Haz", "startMs": 200, "endMs": 500 },
        { "text": "clic", "startMs": 500, "endMs": 800 },
        { "text": "en", "startMs": 800, "endMs": 1000 },
        { "text": "el", "startMs": 1000, "endMs": 1200 },
        { "text": "botón", "startMs": 1200, "endMs": 1700 },
        { "text": "superior", "startMs": 1700, "endMs": 2300 },
        { "text": "derecho.", "startMs": 2300, "endMs": 3000 }
      ]
    }
  ]
}
`

---

## 🚀 4. Roadmap de Implementación (Fases de Desarrollo)

- [x] **Fase 1: Setup Inicial del Entorno y Assets Base**
  - [x] Crear estructura de carpetas en `Creator App`.
  - [x] Copiar y organizar assets base reutilizables (`assets/` con fuentes TTF, fondo oficial, mockup base, cursores).
  - [x] Inicializar proyecto Frontend (Vite + TypeScript + CSS Glassmorphism modular).

- [x] **Fase 2: Motor del Canvas Virtual 1080p & Reproductor Base**
  - [x] Implementar contenedor `Stage1080p` con auto-escalado responsivo `CSS transform: scale()`.
  - [x] Renderizar Mockup de navegador y captura con proporciones exactas (*Zero-Stretch*).
  - [x] Implementar motor de animación de Zoom & Pan con clamping matemático.
  - [x] Implementar renderizador de subtítulos con resaltado dinámico de palabras (`marks`).

- [x] **Fase 3: Interfaz de Edición (Timeline & Inspector)**
  - [x] Timeline horizontal de bloques de pasos interactivos con indicador de tiempo.
  - [x] Panel Inspector para editar textos, duración, coordenadas de clic y switch de zoom.
  - [x] Módulo de auto-distribución de timestamps de palabras al editar el texto.

- [ ] **Fase 4: Gestor de Proyectos y Captura Avanzada**
  - [x] Grabador Web Integrado con captura acelerada por hardware y eventos en tiempo real.
  - [ ] Drag & Drop de imágenes locales para reemplazar o crear nuevos pasos al vuelo.
  - [ ] Selector visual de clic interactivo arrastrando el cursor directamente sobre el mockup.

- [x] **Fase 5: Integración con Tauri & Render Pipeline Local**
  - [x] Configurar Tauri v2 en el workspace de Rust (`src-tauri/Cargo.toml`, `tauri.conf.json`).
  - [x] Comandos IPC (`save_project`, `load_project_file`, `check_ffmpeg_installed`, `start_render_job`).
  - [x] Integración de persistencia dual (descarga directa en Web / guardado nativo a disco en Tauri).
  - [x] Interfaz de progreso de renderizado de video MP4 con FFmpeg.

---

## 📝 5. Registro de Decisiones y Cambios
*Este apartado se actualizará conforme evolucionemos el código y surjan nuevas ideas o mejoras.*

- **2026-08-18:** Definición inicial de arquitectura con Lienzo Virtual 1080p y migración planificada a Tauri.
- **2026-08-18 (Versión Beta UI):** Creada la versión Beta del editor web (`Creator App/src/main.ts`, `style.css`, `types.ts`). Servidor Vite corriendo en `http://localhost:5173`. Soporte para previsualización 1080p nativa, inspector lateral interactivo, edición de subtítulos, zoom toggle, auto-sincronización de palabras y timeline dinámico.
- **2026-08-19 (Ciclo Dual de Captura por Paso & Transiciones Suaves):** 
  1. *Estado Panorámico Inicial:* La captura se muestra completa al 100% (*Zero-Stretch*) mientras se lee la primera parte de la locución.
  2. *Estado de Foco & Clic:* A los ~700ms se inicia la transición suave al 120% con clamping matemático hacia el objetivo, el cursor viaja al punto de acción y a los ~1200ms se dispara la onda expansiva (*ripple*) de clic.
  3. *Transición Cinematográfica:* Reemplazado el corte duro entre pasos por un Crossfade con micro-escala (`scale: 0.985 -> 1.0`) y entrada flotante de subtítulos (`subtitleSlideUp`), eliminando cualquier parpadeo agresivo.
- **2026-08-19 (Paso 0 de Intro y Encabezado Editorial Limpio):**
  1. *Paso 0 (Intro 3s):* Título principal limpio en tipografía grande centrado con el fondo degradado oscuro de estudio (*"Encuentra las actividades del libro en PuntajeNacional"*). Se removieron insignias adicionales para máxima elegancia.
  2. *Encabezado Superior Derecho (Pasos 1 al 7):* El título se sitúa en la esquina superior derecha como texto plano sutil estilo cabecera/cornisa de libro (*Running Header*), sin fondos ni bordes distractores.

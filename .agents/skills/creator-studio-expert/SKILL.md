---
name: creator-studio-expert
description: >-
  Guía experta de arquitectura e integración de Creator Studio (Tauri 2, TypeScript, Rust, Python Render Engine). Usar al trabajar en UI, comandos IPC, grabador web, coordenadas de canvas, subtítulos o pipeline de renderizado MP4.
---

# 🎬 Creator Studio — Guía de Arquitectura e Integración Experta

Este documento sirve como mapa de navegación técnico y compendio de advertencias críticas para el desarrollo de **Creator Studio**. No impone restricciones de estilo o diseño; su objetivo es preservar la estabilidad y la sincronización entre las tres capas tecnológicas del sistema (**TypeScript**, **Rust** y **Python**).

---

## 🏛️ 1. Arquitectura de 3 Capas

- **Frontend Web (TypeScript + Vite):**
  - Lienzo virtual de 1920x1080 con autoescalado WYSIWYG.
  - Eventos de interacción (Pointer Events) para reordenar timeline, mover subtítulos y ajustar mockup.
  - Sincronización palabra por palabra de subtítulos (*word marks*) y cursor animado.
- **Core de Escritorio (Tauri 2 + Rust):**
  - Gestión del sistema de archivos local (`project.json`, exportación de imágenes y assets).
  - Grabador Web (`web_recorder`): ventana nativa secundaria aislada que inyecta scripts de monitoreo.
  - Captura acelerada por hardware mediante GDI/Win32 (`CAPTUREBLT`).
  - Orquestación de procesos de renderizado y detección de encoders GPU.
- **Motor Gráfico & Render (Python + Pillow + FFmpeg):**
  - Pipeline multiproceso (`ProcessPoolExecutor`) de fotogramas a 30/60 FPS.
  - Renderizado por capas con interpolación cúbica suave (`ease_out_cubic`), desenfoque gaussiano y sombras de texto.
  - Encoders acelerados por hardware (`h264_nvenc`, `h264_qsv`, `h264_amf`) con fallback a `libx264`.

---

## ⚠️ 2. Trampas Técnicas Críticas (Gotchas de Integración)

### A. Capacidades y Seguridad en Tauri 2.x
- **Aislamiento de Ventanas:** Si un archivo de capability contiene la clave `"remote"`, Tauri asume un contexto restringido y desactiva comandos locales de la ventana principal.
  - `src-tauri/capabilities/default.json` debe aplicar **únicamente** a la ventana `"main"`.
  - `src-tauri/capabilities/remote.json` debe aplicar **únicamente** a la ventana `"web_recorder"` para orígenes remotos.

### B. Comunicación desde Páginas Web Externas
- Sitios web de terceros bloquean llamadas directas a `invoke()` por CSP.
- El script inyectado (`INJECTED_RECORDER_SCRIPT`) debe comunicarse siempre emitiendo eventos con `window.__TAURI__.event.emit()` (`recorder-step`, `recorder-undo`, `recorder-finish`), los cuales se escuchan en el setup de Rust.

### C. Captura Gráfica Limpia (Clean Paint Timing)
- Al capturar con GDI (`BitBlt` + `CAPTUREBLT`), cualquier elemento visual en pantalla quedará grabado.
- Para evitar que el HUD o efectos de clic aparezcan en la captura:
  1. Ocultar el HUD (`display: none`).
  2. Sincronizar un ciclo de refresco con `requestAnimationFrame` y micro-delay (~80ms) para que WebView2 repinte la ventana limpia.
  3. Ejecutar la captura en Rust.
  4. Restaurar el HUD.

---

## 📐 3. Estandarización de Coordenadas y Datos (1:1)

Para mantener paridad total entre la previsualización interactiva y el render MP4:

1. **Coordenadas Normalizadas (0.0 a 1.0):**
   - `clickCoords: { x, y }` define el punto relativo de acción sobre la captura.
   - `subtitlePos: { x, y }` define la posición en el canvas 1080p.
2. **Centro de Enfoque de Zoom:**
   - Si existe `boundingBox`, se utiliza su punto medio.
   - Si no existe `boundingBox`, se toman automáticamente las `clickCoords`.
   - Se aplica siempre *clamping* matemático: `minLimit = (1.0 - zoomFactor) * 100`.
3. **Marcas de Subtítulos (Word Marks):**
   - Estructura: `{ text, startMs, endMs }`. Se autogeneran con `autoGenerateMarks` si el paso no contiene timestamps individuales.

---

## 🔄 4. Principio de Evolución y Retrocompatibilidad

- El fondo predeterminado es `assets/creator_bg.webp`.
- Al cargar proyectos antiguos, resolver automáticamente alias históricos (`guideless_bg` -> `creator_bg`) sin interrumpir la experiencia.
- Nuevas funciones (formatos verticales 9:16, exportación GIF, nuevos filtros) deben mantener el formato estándar `project.json` como fuente de verdad.

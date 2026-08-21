# 🚀 Creator Studio — Hoja de Ruta y Futuras Optimizaciones (Roadmap)

Este documento recopila las ideas, propuestas y mejoras arquitectónicas diseñadas colaborativamente para las próximas iteraciones de **Creator Studio**, organizadas y priorizadas según su **facilidad técnica y esfuerzo de implementación** (desde mejoras inmediatas en el Studio hasta nuevas capacidades avanzadas de captura autónoma).

---

## 📑 Tabla de Contenidos
1. [Nivel 1: Esfuerzo Bajo (Quick Wins / UX Inmediata)](#1-nivel-1-esfuerzo-bajo-quick-wins--ux-inmediata)
2. [Nivel 2: Esfuerzo Medio (Personalización Visual y Libertad en el Canvas)](#2-nivel-2-esfuerzo-medio-personalización-visual-y-libertad-en-el-canvas)
3. [Nivel 3: Esfuerzo Medio-Alto (Aceleración de Render y Exportación Multiformato)](#3-nivel-3-esfuerzo-medio-alto-aceleración-de-render-y-exportación-multiformato)
4. [Nivel 4: Esfuerzo Alto (Módulo de Navegador Embebido y Auto-Grabación de Recorridos)](#4-nivel-4-esfuerzo-alto-módulo-de-navegador-embebido-y-auto-grabación-de-recorridos)

---

## 1. Nivel 1: Esfuerzo Bajo (Quick Wins / UX Inmediata) — ✅ IMPLEMENTADO
*Mejoras que aprovechan la arquitectura existente de TypeScript, Tauri y CSS sin alterar radicalmente el motor de renderizado.*

### A. Reordenamiento Drag & Drop de Pasos en el Timeline — ✅
* **Concepto:** Permitir arrastrar y soltar las tarjetas del timeline para cambiar el orden de los pasos del tutorial de forma visual e intuitiva.
* **Implementación:** Implementado con Pointer Events de baja latencia en `src/main.ts`, feedback visual de inserción y sincronización automática del array `project.steps` en disco.

### B. Atajos de Teclado y Productividad — ✅
* **Concepto & Implementado:**
  * `Ctrl + D`: Duplicar el paso seleccionado actualmente.
  * `Barra Espaciadora`: Reproducir / Pausar la previsualización del timeline.
  * `←` / `→`: Saltar al paso anterior o siguiente.
  * `Ctrl + S`: Guardado instantáneo del proyecto a disco.

### C. Detección Inteligente de Encoders GPU — ✅
* **Concepto & Implementado:** Auto-detección en tiempo de ejecución de NVIDIA `h264_nvenc`, Intel `h264_qsv` y AMD `h264_amf` con fallback optimizado a `libx264`.

---

## 2. Nivel 2: Esfuerzo Medio (Personalización Visual y Libertad en el Canvas) — ✅ IMPLEMENTADO
*Transformación de Creator Studio en un lienzo de diseño visual interactivo y flexible.*

### A. Control Tipográfico y Estilos de Texto — ✅
* **Selector de Fuentes:** Menú desplegable para elegir fuentes (Inter, Plus Jakarta Sans, System UI).
* **Propiedades Visuales:** Controles para tamaño de fuente, color de texto, peso tipográfico, color de subtítulos y radio de curvatura (`borderRadius`).

### B. Posicionamiento Libre de Textos y Subtítulos (Drag & Drop en Canvas) — ✅
* **Concepto & Implementado:** Arrastre libre con mouse en tiempo real (`Pointer Events`) sobre la caja de subtítulos en el canvas del Studio.
* **Sincronización:** Coordenadas normalizadas `subtitlePos: { x, y }` guardadas por paso y replicadas $1:1$ en `render_engine.py` con sombras gaussianas difusas.

### C. Reubicación y Redimensión de Mockup por Paso — ✅
* **Concepto & Implementado:** Controles de Offset X, Offset Y y Escala (0.5x a 1.4x) configurables de forma completamente independiente para cada paso.
* **Paridad:** Sincronización $1:1$ en Pillow layout (`render_engine.py`) respetando dimensiones, traslaciones y escalado de sombras.

---

## 3. Nivel 3: Esfuerzo Medio-Alto (Aceleración de Render y Exportación Multiformato) (NO ES NECESARIO TODAVÍA)
*Optimizaciones de cómputo y adaptación a redes sociales.*

### A. Exportación en Ratio Vertical 9:16 (Shorts / Reels / TikTok)
* **Concepto:** Selector de formato de exportación: **Horizontal 16:9 (1920x1080)** o **Vertical 9:16 (1080x1920)**.
* **Adaptación:** El motor reescala automáticamente el fondo y centra el mockup en formato vertical con los subtítulos apilados simétricamente.

### B. Exportación a GIF Animado Optimizado
* **Concepto:** Botón secundario para exportar el tutorial como GIF liviano con paleta de color optimizada para incluir en READMEs de GitHub, Notion o documentación web.

---

## 4. Nivel 4: Esfuerzo Alto (Módulo de Navegador Embebido y Auto-Grabación de Recorridos) — ✅ IMPLEMENTADO
*La innovación disruptiva para eliminar por completo la fricción de tomar capturas manuales.*

### A. Navegador Web Interno para Grabación de Flujos ("Navegador Web Integrado") — ✅
* **Concepto & Implementado:**
  1. En la Landing de Creator Studio, el usuario presiona **"🌐 Capturar desde Web / URL"**.
  2. Ingresa una URL objetivo (ej. `https://mi-aplicacion.com`) y selecciona el directorio de destino.
  3. Se abre una ventana WebView2 nativa independiente (`web_recorder`) con un HUD interactivo flotante (`REC`, contador de pasos, captura manual, deshacer, pausar y finalizar).
  4. **Captura Limpia y Automática por Clic:**
     - Al interactuar con la página, el HUD se oculta momentáneamente para tomar la captura 100% limpia sin superposiciones mediante aceleración gráfica de Windows (`CAPTUREBLT`).
     - Se registran las coordenadas normalizadas exactas $(X, Y)$ del clic.
     - Se extrae el texto del elemento cliqueado como sugerencia semántica de subtítulo y título.

### B. Botón "Finalizar Grabación" y Auto-Ensamblaje Instantáneo — ✅
* **Concepto & Implementado:**
  * Al hacer clic en el botón destacado **"✨ Finalizar Grabación"**:
    1. El navegador embebido se cierra de forma segura.
    2. Las capturas se guardan y optimizan automáticamente en la carpeta `assets/screenshots/` del proyecto.
    3. Se genera el `project.json` con todos los pasos ordenados, los cursores (`clickCoords`) ya calibrados, el zoom enfocado al punto de acción y marcas de subtítulos (`marks`) sincronizadas.
    4. La aplicación abre de inmediato el **Editor de Creator Studio** con el tutorial montado y listo para reproducir, retocar o exportar a MP4.
* **Impacto:** Permite crear tutoriales completos de inicio a fin en menos de **1 minuto**.

---

## 📊 Matriz de Priorización y Estado

| Característica | Complejidad | Impacto en UX | Estado | Componentes Afectados |
| :--- | :---: | :---: | :---: | :--- |
| **1. Reordenamiento Drag & Drop de Pasos** | 🟢 Baja | ⭐⭐⭐⭐ | ✅ Implementado | `src/main.ts`, Timeline CSS |
| **2. Atajos de Teclado y Duplicar Pasos** | 🟢 Baja | ⭐⭐⭐⭐ | ✅ Implementado | `src/main.ts` |
| **3. Aceleración GPU (NVENC / FFmpeg)** | 🟡 Media | ⭐⭐⭐⭐ | ✅ Implementado | `render_engine.py` |
| **4. Selector de Fuentes, Colores y Estilos** | 🟡 Media | ⭐⭐⭐⭐⭐ | ✅ Implementado | `src/main.ts`, `render_engine.py` |
| **5. Subtítulos y Mockups Arrastrables / Escala** | 🟡 Media | ⭐⭐⭐⭐⭐ | ✅ Implementado | `src/main.ts`, Canvas CSS, Pillow Math |
| **6. Navegador Embebido con Auto-Grabación Web** | 🔴 Alta | ⭐⭐⭐⭐⭐⭐ | ✅ Implementado | Tauri WebView2, Rust IPC, `src/main.ts` |
| **7. Exportación 9:16 (Shorts/Reels) y GIF** | 🟡 Media-Alta | ⭐⭐⭐⭐ | ⏳ Pendiente | `render_engine.py` |

---

> 💡 **Nota:** Fases 1, 2 y 4 completadas y verificadas con paridad $1:1$ DOM $\leftrightarrow$ Grabador Web $\leftrightarrow$ Python Render.

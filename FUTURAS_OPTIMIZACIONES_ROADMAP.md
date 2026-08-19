# 🚀 Creator Studio — Hoja de Ruta y Futuras Optimizaciones (Roadmap)

Este documento recopila las ideas, propuestas y mejoras arquitectónicas diseñadas colaborativamente para las próximas iteraciones de **Creator Studio**, organizadas y priorizadas según su **facilidad técnica y esfuerzo de implementación** (desde mejoras inmediatas en el Studio hasta nuevas capacidades avanzadas de captura autónoma).

---

## 📑 Tabla de Contenidos
1. [Nivel 1: Esfuerzo Bajo (Quick Wins / UX Inmediata)](#1-nivel-1-esfuerzo-bajo-quick-wins--ux-inmediata)
2. [Nivel 2: Esfuerzo Medio (Personalización Visual y Libertad en el Canvas)](#2-nivel-2-esfuerzo-medio-personalización-visual-y-libertad-en-el-canvas)
3. [Nivel 3: Esfuerzo Medio-Alto (Aceleración de Render y Exportación Multiformato)](#3-nivel-3-esfuerzo-medio-alto-aceleración-de-render-y-exportación-multiformato)
4. [Nivel 4: Esfuerzo Alto (Módulo de Navegador Embebido y Auto-Grabación de Recorridos)](#4-nivel-4-esfuerzo-alto-módulo-de-navegador-embebido-y-auto-grabación-de-recorridos)

---

## 1. Nivel 1: Esfuerzo Bajo (Quick Wins / UX Inmediata)
*Mejoras que aprovechan la arquitectura existente de TypeScript, Tauri y CSS sin alterar radicalmente el motor de renderizado.*

### A. Reordenamiento Drag & Drop de Pasos en el Timeline
* **Concepto:** Permitir arrastrar y soltar las tarjetas del timeline para cambiar el orden de los pasos del tutorial de forma visual e intuitiva.
* **Implementación:** Eventos nativos HTML5 Drag & Drop en `src/main.ts` que reorganicen el array `projectData.steps` y sincronicen el `project.json`.

### B. Atajos de Teclado y Productividad
* **Concepto:**
  * `Ctrl + D`: Duplicar el paso seleccionado actualmente.
  * `Barra Espaciadora`: Reproducir / Pausar la previsualización del timeline.
  * `←` / `→`: Saltar al paso anterior o siguiente.
  * `Ctrl + Z` / `Ctrl + Y`: Historial de deshacer / rehacer para cambios rápidos.

### C. Presets y Plantillas de Tutorial
* **Concepto:** Poder guardar la configuración visual favorita (fondos, fuentes, colores de subtítulo y sombras) como una "Plantilla" para reutilizarla con un solo clic en nuevos proyectos.

---

## 2. Nivel 2: Esfuerzo Medio (Personalización Visual y Libertad en el Canvas)
*Transformación de Creator Studio en un lienzo de diseño visual interactivo y flexible.*

### A. Control Tipográfico y Estilos de Texto
* **Selector de Fuentes:** Menú desplegable para elegir fuentes locales y Google Fonts integradas (Inter, Plus Jakarta Sans, Outfit, Roboto, JetBrains Mono, Space Grotesk).
* **Propiedades Visuales:** Controles para tamaño de fuente, color de texto, peso tipográfico, color y opacidad de la caja glassmorphic de subtítulos.

### B. Posicionamiento Libre de Textos y Subtítulos (Drag & Drop en Canvas)
* **Concepto:** Poder arrastrar con el mouse el bloque de subtítulos o el encabezado superior a cualquier parte del lienzo si la captura de pantalla tapa información relevante.
* **Sincronización:** Guardar coordenadas relativas `subtitlePos: { x, y }` en cada paso y aplicarlas tanto en el DOM como en `render_engine.py` (Pillow).

### C. Reubicación y Redimensión de Mockup por Paso
* **Concepto:** Permitir que en pasos específicos el mockup se pueda achicar, mover a un lateral o centrar, dejando espacio para anotaciones o títulos explicativos grandes.
* **Paridad:** Actualizar las matrices de cálculo del viewport en Python para leer la escala y traslación de cada paso (`mockupScale`, `mockupPosition`).

### D. Efectos de Cursor y Punteros
* **Selector de Punteros:** Elegir entre cursor clásico de flecha, puntero circular macOS o cursor minimalista.
* **Efectos:** Estela de movimiento (*trail*), velocidad de interpolación ajustable y diferentes animaciones de onda al hacer clic.

---

## 3. Nivel 3: Esfuerzo Medio-Alto (Aceleración de Render y Exportación Multiformato)
*Optimizaciones de cómputo y adaptación a redes sociales.*

### A. Aceleración por Hardware en Codificación (GPU NVENC / QSV / AMF)
* **Concepto:** Detección automática en Rust/Python de tarjetas gráficas dedicadas NVIDIA (`h264_nvenc`), Intel (`h264_qsv`) o AMD (`h264_amf`).
* **Impacto:** Reduce el tiempo de exportación final de video de 30-45 segundos a menos de 5-10 segundos con mínimo consumo de CPU.

### B. Exportación en Ratio Vertical 9:16 (Shorts / Reels / TikTok)
* **Concepto:** Selector de formato de exportación: **Horizontal 16:9 (1920x1080)** o **Vertical 9:16 (1080x1920)**.
* **Adaptación:** El motor reescala automáticamente el fondo y centra el mockup en formato vertical con los subtítulos apilados simétricamente.

### C. Exportación a GIF Animado Optimizado
* **Concepto:** Botón secundario para exportar el tutorial como GIF liviano con paleta de color optimizada para incluir en READMEs de GitHub, Notion o documentación web.

---

## 4. Nivel 4: Esfuerzo Alto (Módulo de Navegador Embebido y Auto-Grabación de Recorridos)
*La innovación disruptiva para eliminar por completo la fricción de tomar capturas manuales.*

### A. Navegador Web Interno para Grabación de Flujos ("Guideless Mode Integrado")
* **Concepto:**
  1. En la Landing de Creator Studio, el usuario presiona **"🌐 Capturar desde Web / URL"**.
  2. Ingresa una URL objetivo (ej. `https://mi-aplicacion.com`).
  3. Se abre un navegador WebView integrado con una barra flotante superior (*Puntos capturados: X*).
  4. **Captura Automática por Clic:** Cada vez que el usuario hace clic en un botón o enlace de la página:
     - Se toma una captura instantánea en alta resolución.
     - Se detectan y guardan las coordenadas relativas exactas $(X, Y)$ del clic.
     - Se extrae el texto del elemento cliqueado como sugerencia automática de subtítulo.

### B. Botón "Finalizar Grabación" y Auto-Ensamblaje Instantáneo
* **Concepto:**
  * Al hacer clic en el botón destacado **"Finalizar Grabación"**:
    1. El navegador embebido se cierra.
    2. Las capturas se guardan automáticamente en la carpeta `assets/` del nuevo proyecto.
    3. Se genera el `project.json` con todos los pasos ordenados y los cursores ya calibrados en los lugares exactos donde el usuario hizo clic.
    4. La aplicación abre de inmediato el **Editor de Creator Studio** con el tutorial montado y listo para exportar o retocar.
* **Impacto:** Permite crear tutoriales completos de inicio a fin en menos de **1 minuto**.

---

## 📊 Matriz de Priorización Resumida

| Característica | Complejidad | Impacto en UX | Componentes Afectados |
| :--- | :---: | :---: | :--- |
| **1. Reordenamiento Drag & Drop de Pasos** | 🟢 Baja | ⭐⭐⭐⭐ | `src/main.ts`, Timeline CSS |
| **2. Atajos de Teclado y Duplicar Pasos** | 🟢 Baja | ⭐⭐⭐⭐ | `src/main.ts` |
| **3. Selector de Fuentes, Colores y Estilos** | 🟡 Media | ⭐⭐⭐⭐⭐ | `src/main.ts`, `render_engine.py` |
| **4. Subtítulos y Mockups Arrastrables** | 🟡 Media | ⭐⭐⭐⭐⭐ | `src/main.ts`, Canvas CSS, Pillow Math |
| **5. Aceleración GPU (NVENC / FFmpeg)** | 🟡 Media | ⭐⭐⭐⭐ | `render_engine.py` |
| **6. Exportación 9:16 (Shorts/Reels) y GIF** | 🟡 Media-Alta | ⭐⭐⭐⭐ | `render_engine.py` |
| **7. Navegador Embebido con Auto-Grabación** | 🔴 Alta | ⭐⭐⭐⭐⭐⭐ | Tauri WebView2, Rust IPC, `src/main.ts` |

---

> 💡 **Nota para futuras sesiones:** Esta hoja de ruta debe consultarse al iniciar nuevas etapas de desarrollo para seleccionar las tareas según el alcance y tiempo disponible.

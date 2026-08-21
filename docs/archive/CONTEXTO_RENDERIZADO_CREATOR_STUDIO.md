# 🎬 Creator Studio (v1.0.0) — Documento de Contexto y Arquitectura Integral

Este documento constituye la **fuente de verdad técnica y operativa** de **Creator Studio**. Ha sido diseñado para que cualquier desarrollador o agente de Inteligencia Artificial que retome el proyecto en futuras iteraciones comprenda de inmediato la arquitectura completa, las decisiones de diseño, los protocolos de sincronización, la estructura multi-proyecto y el pipeline de renderizado de alto rendimiento.

---

## 📑 Tabla de Contenidos
1. [Visión General y Propósito](#1-visión-general-y-propósito)
2. [Stack Tecnológico y Estructura del Proyecto](#2-stack-tecnológico-y-estructura-del-proyecto)
3. [Arquitectura del Sistema & Flujos de Trabajo](#3-arquitectura-del-sistema--flujos-de-trabajo)
   - [A. Flujo Multi-Proyecto y Landing Hub](#a-flujo-multi-proyecto-y-landing-hub)
   - [B. Edición e Interactividad en el Studio](#b-edición-e-interactividad-en-el-studio)
   - [C. Pipeline de Renderizado Turbo (Python + UV + FFmpeg)](#c-pipeline-de-renderizado-turbo-python--uv--ffmpeg)
4. [Capa Nativa Rust / Tauri (IPC y Empaquetado)](#4-capa-nativa-rust--tauri-ipc-y-empaquetado)
5. [Motor de Renderizado (`render_engine.py`)](#5-motor-de-renderizado-render_enginepy)
   - [Fórmulas y Calibración Pixel-Perfect (1:1)](#fórmulas-y-calibración-pixel-perfect-11)
   - [Evolución de Versiones del Engine (V20 a V25)](#evolución-de-versiones-del-engine-v20-a-v25)
6. [Diseño UI/UX Noir-Tech Glassmorphic](#6-diseño-uiux-noir-tech-glassmorphic)
7. [Guía Rápida de Comandos y Compilación](#7-guía-rápida-de-comandos-y-compilación)
8. [Reglas Clave para Futuras Iteraciones de IA](#8-reglas-clave-para-futuras-iteraciones-de-ia)

---

## 1. Visión General y Propósito

**Creator Studio** es una aplicación de escritorio nativa orientada a la creación, edición y exportación acelerada de videotutoriales interactivos con calidad de producción profesional.

* **Objetivo Visual:** Paridad absoluta **WYSIWYG** (*What You See Is What You Get*) a **1080p Full HD (1920×1080 @ 30/60 FPS)**.
* **Modelo Operativo:** Multi-proyecto aislado basado en carpetas locales independientes (`project.json` + carpeta `assets/`).
* **Experiencia de Usuario:** Interfaz oscura *Noir-Tech* con efectos de desenfoque *Glassmorphism*, monitor de renderizado en tiempo real y flujo silencioso sin ventanas de consola secundarias.

```mermaid
graph TD
    Landing[Landing Hub: Crear o Abrir Proyecto] -->|Carga de proyecto| Studio[Editor Creator Studio: TypeScript + Vite]
    Studio -->|Edición interactiva & Timeline| State[Estado Reactivo & Persistencia project.json]
    Studio -->|Botón Renderizar MP4| TauriIPC[Backend Rust Tauri 2.0]
    TauriIPC -->|Spawn Asíncrono no Bloqueante| UV[Acelerador uv + Python 3.12]
    UV -->|Multiprocesamiento CPU Workers| Engine[render_engine.py]
    Engine -->|Piped Raw RGB24 Frames| FFmpeg[FFmpeg libx264 CRF 17]
    Engine -->|Logs [PROGRESO] % en vivo| TauriIPC
    TauriIPC -->|Evento render-progress| Modal[Modal Glassmorphic con Barra y Shimmer]
    FFmpeg -->|output_tutorial.mp4| Output[Video Final MP4 Full HD]
```

---

## 2. Stack Tecnológico y Estructura del Proyecto

### Tecnologías:
* **Frontend:** TypeScript, Vite 8, HTML5, CSS3 Glassmorphism (sin frameworks pesados para latencia cero).
* **Backend Nativo:** Tauri v2.11 (Rust 2021) con plugins de diálogo y eventos.
* **Motor de Renderizado:** Python 3 (Pillow + Multiprocessing + ProcessPoolExecutor) ejecutado a través del gestor ultrarrápido **`uv`**.
* **Codificador de Video:** FFmpeg (`libx264`, `yuv420p`, `crf 17`, `preset faster`).

### Árbol de Archivos Principal:
```text
Creator App/
├── index.html                   # Entry point HTML
├── package.json                 # Configuración de npm y scripts
├── render_engine.py             # Motor de renderizado multiproceso V25
├── CONTEXTO_RENDERIZADO_CREATOR_STUDIO.md # Este documento
├── public/
│   └── assets/                  # Fuentes (Plus Jakarta Sans, Inter), bg e iconos
├── src/
│   ├── main.ts                  # Lógica del Studio, Landing, timeline y eventos
│   ├── style.css                # Estilos globales, Glassmorphism, animaciones y modales
│   └── types.ts                 # Interfaces TypeScript (ProjectData, StepItem, etc.)
└── src-tauri/
    ├── Cargo.toml               # Dependencias Rust (tauri, serde, etc.)
    ├── tauri.conf.json          # Configuración de Tauri, bundle y recursos
    ├── capabilities/
    │   └── default.json         # Permisos IPC (dialog, core:event, etc.)
    └── src/
        └── lib.rs               # Backend Rust: gestión de archivos e invocación asíncrona
```

---

## 3. Arquitectura del Sistema & Flujos de Trabajo

### A. Flujo Multi-Proyecto y Landing Hub
* La aplicación siempre inicializa en una pantalla de bienvenida limpia (**Landing Hub**).
* **Crear Nuevo Proyecto:** 
  1. El usuario selecciona una carpeta vacía o dedicada.
  2. Rust inicializa un archivo `project.json` base y la subcarpeta `assets/`.
  3. Copia el fondo por defecto `creator_bg.webp` dentro del proyecto.
* **Abrir Proyecto Existente:**
  1. El usuario selecciona cualquier archivo `project.json` o `timeline.json`.
  2. La aplicación lee los datos y resuelve dinámicamente las rutas de las capturas relativas a la carpeta del proyecto.
* **Cerrar Proyecto:** Botón `⬅ Volver` que guarda cambios y retorna al Landing Hub sin dejar estados residuales.

### B. Edición e Interactividad en el Studio
* **Viewport Interactivo:** El mockup emula un navegador macOS flotante ($1540\text{px}$ de ancho).
* **Calibración Directa de Clics:** Al hacer clic directamente sobre el mockup, se calculan y guardan las coordenadas relativas normalizadas ($0.0$ a $1.0$).
* **Timeline Tracks:** Pistas de tiempo que representan cada paso, duración en segundos, subtítulo y marcas de sincronización palabra por palabra.
* **Gestión de Pasos:** Posibilidad de importar nuevas capturas (`png`, `jpg`, `webp`) y botón para **eliminar pasos** (`🗑️ Eliminar Paso`) con confirmación y protección mínima de 1 paso.

---

## 4. Capa Nativa Rust / Tauri (IPC y Empaquetado)

El archivo [`src-tauri/src/lib.rs`](file:///C:/Users/WLADI/Desktop/IMAGENES%20MANUALES/TEST/Creator%20App/src-tauri/src/lib.rs) coordina la interacción con el sistema operativo:

### Comandos Clave en Rust:
1. `create_blank_project`: Genera el andamiaje del proyecto en la carpeta seleccionada.
2. `load_project_file`: Carga y parsea el archivo de proyecto.
3. `save_project`: Guarda el `project.json` en disco de forma segura.
4. `import_step_screenshot`: Copia capturas externas dentro de la carpeta `assets/` del proyecto.
5. `set_project_background`: Asigna y copia la imagen de fondo global.
6. `read_file_as_base64`: Provee acceso a imágenes locales sin bloqueos de seguridad WebView.
7. `start_render_job` (Asíncrono no bloqueante):
   - **Localizador de Recursos:** Resuelve la ruta de `render_engine.py` tanto en modo desarrollo como en el paquete empaquetado `.exe` (`resource_dir()`, carpeta adyacente o carpeta raíz).
   - **Detección Automática de `uv`:** Si `uv` está disponible en el sistema, ejecuta `uv run --with pillow python -u ...`; de lo contrario, hace fallback a `python -u`.
   - **Ocultamiento de Consola en Windows:** Configura la bandera de proceso `CREATE_NO_WINDOW (0x08000000)` para ejecución 100% invisible.
   - **Ejecución Asíncrona:** Utiliza `std::thread::spawn` y canales `mpsc` para que el renderizado corra en un hilo separado, impidiendo que la ventana de la aplicación entre en estado *(No responde)*.
   - **Streaming de Progreso:** Captura el `stdout` en tiempo real y emite eventos `render-progress` a la interfaz.

---

## 5. Motor de Renderizado (`render_engine.py`)

### Fórmulas y Calibración Pixel-Perfect (1:1):
* **Resolución Lienzo:** $1920 \times 1080$ píxeles.
* **Mockup:** Ancho $1540\text{px}$, Altura Viewport $703.42\text{px}$ (relación $2.1893$), Cabecera $44\text{px}$, Altura Total $747.42\text{px}$.
* **Posición Canvas:** $X = 190.0\text{px}$, $Y \approx 138.29\text{px}$.
* **Recorte de Esquinas de Mockup:** Radio de curvatura de $12\text{px}$ aplicado con máscara alfa (`putalpha`) sobre todo el mockup para garantizar que las capturas internas no sobresalgan en las esquinas inferiores.
* **Encabezado Superior (Watermark):** Centrado vertical perfecto con compensación de caja tipográfica (`bbox[1]`) y padding simétrico.
* **Sombras Gaussianas Reales:** `ImageFilter.GaussianBlur(radius=28)` para mockup, `radius=18` para subtítulos y `radius=4` para glow de palabras activas.
* **Transición Fluida entre Pasos:** Crossfade de $0.45\text{s}$ con interpolación cúbica suave (`ease_in_out_cubic`).

### Evolución de Versiones del Engine:
* **V20-V22:** Migración a Vite, coordenadas de cursor desacopladas del zoom, sombras gaussianas.
* **V23:** Crossfades fluidos, animación de stage-enter y auto-guardado previo a render.
* **V24:** Soporte dinámico multi-proyecto mediante argumentos CLI `--project-dir` y `--output`.
* **V25 (Actual en v1.0.0):** Máscara de esquinas redondeadas $12\text{px}$ en mockup, tipografía centrada en watermark, streaming sin buffer (`-u` / `PYTHONUNBUFFERED`) y compatibilidad completa con binarios empaquetados.

---

## 6. Diseño UI/UX Noir-Tech Glassmorphic

* **Paleta de Colores:** Fondo Slate Oscuro (`#030712` / `#0f172a`), bordes sutiles con translucidez (`rgba(255, 255, 255, 0.1)`), acentos Azul Neón (`#3b82f6` / `#60a5fa`).
* **Modal de Progreso de Render:**
  - Desplegado automático con fondo desenfocado (*backdrop-filter: blur(14px)*).
  - Barra de progreso con gradiente y animación de brillo (*shimmer*).
  - Indicadores numéricos en tiempo real del porcentaje (0% a 100%) y fotogramas totales procesados (ej. `Fotogramas: 312/786`).

---

## 7. Guía Rápida de Comandos y Compilación

### Modo Desarrollo:
```bash
# Iniciar la aplicación en modo desarrollo local
npx tauri dev
```

### Compilar Ejecutable Standalone (.exe):
```bash
# Compilar el binario optimizado para producción
npx tauri build
```
* **Ubicación del Instalador NSIS:** `src-tauri/target/release/bundle/nsis/Creator Studio_1.0.0_x64-setup.exe`
* **Ubicación del Ejecutable Directo:** `src-tauri/target/release/Creator Studio.exe`

---

## 8. Reglas Clave para Futuras Iteraciones de IA

1. **Memoria de Rutas en Tauri:**
   - Nunca asumas rutas relativas basadas en `std::env::current_dir()` para archivos auxiliares (`render_engine.py`, assets); utiliza siempre la búsqueda por candidatos con `app.path().resource_dir()`.
2. **Procesos Pesados en Rust:**
   - Cualquier invocación a procesos externos (`Command`) debe ser asíncrona (`async fn` con `std::thread::spawn` o canales `mpsc`), jamás bloqueante en el hilo principal de Tauri.
3. **Flujo de Eventos IPC:**
   - Para que los eventos `emit` / `listen` funcionen en el `.exe` final, deben estar declarados en `src-tauri/capabilities/default.json` (`core:event:default`, `core:event:allow-listen`, `core:event:allow-emit`).
4. **Respetar la Directiva de Commits del Usuario:**
   - No realizar commits en Git hasta que las nuevas funciones hayan sido expresamente probadas y el usuario lo solicite.

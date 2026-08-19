import './style.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import type { ProjectData, StepItem } from './types';

class CreatorStudio {
  private project: ProjectData = {
    title: 'Mi Tutorial Interactivo',
    settings: {
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      theme: 'mac_dark',
      background: '/assets/guideless_bg.webp',
      zoomFactor: 1.20,
      clickAnimationDurationMs: 1100,
      headerStyle: {
        text: 'Encuentra las actividades del libro en PuntajeNacional',
        fontSize: 22,
        color: '#ffffff',
        hasShadow: true,
        shadowColor: 'rgba(0, 0, 0, 0.95)',
        hasBackground: true,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backgroundPadding: 10,
        borderRadius: 8,
      },
    },
    steps: [],
  };

  private currentStepIndex: number = 0;
  private currentTimeMs: number = 0;
  private isPlaying: boolean = false;
  private animFrameId: number | null = null;
  private lastTimestamp: number = 0;

  private stageEl!: HTMLElement;

  constructor() {
    this.init();
  }

  private async init() {
    this.unregisterOldServiceWorkers();
    await this.loadInitialProject();
    this.renderLayout();
    this.setupResizeObserver();
    this.bindEvents();
    this.updateStageContent();
    this.updateInspector();
  }

  private unregisterOldServiceWorkers() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          reg.unregister();
        }
      });
    }
  }

  private async loadInitialProject() {
    let loadedFromLocal = false;
    try {
      const localSaved = localStorage.getItem('creator_studio_project');
      if (localSaved) {
        const raw = JSON.parse(localSaved);
        const stepsData = Array.isArray(raw) ? raw : (raw.steps || []);
        if (raw.settings?.headerStyle) {
          this.project.settings.headerStyle = raw.settings.headerStyle;
        }
        if (stepsData.length > 0) {
          this.project.steps = stepsData;
          loadedFromLocal = true;
        }
      }
    } catch (e) {
      console.warn('LocalStorage parse error:', e);
    }

    if (!loadedFromLocal) {
      try {
        const cacheBuster = `?t=${Date.now()}`;
        let res = await fetch(`/assets/timeline.json${cacheBuster}`, { cache: 'no-store' });
        if (!res.ok) {
          res = await fetch(`/timeline.json${cacheBuster}`, { cache: 'no-store' });
        }
        if (res.ok) {
          const raw = await res.json();
          const stepsData = Array.isArray(raw) ? raw : (raw.steps || []);
          if (raw.settings?.headerStyle) {
            this.project.settings.headerStyle = raw.settings.headerStyle;
          }

          const loadedSteps = stepsData.map((item: any, i: number) => {
            let shot = item.screenshot;
            if (shot) {
              shot = shot.replace(/^\/+/, '').replace(/^assets\//, '');
              shot = `assets/${shot}`;
            } else {
              shot = 'assets/screenshot_1.webp';
            }
            return {
              id: item.id || `step-${i + 1}`,
              type: item.type || 'click',
              title: item.title || `Paso ${i + 1}`,
              transcript: item.transcript || '',
              audio: item.audio || null,
              screenshot: shot,
              duration: item.duration || 4500,
              pageTitle: item.pageTitle || 'PuntajeNacional.cl',
              enableZoom: item.type !== 'section',
              boundingBox: item.boundingBox || { x: 0.5, y: 0.5, width: 0.1, height: 0.05 },
              clickCoords: item.clickCoords || { x: 0.5, y: 0.5 },
              marks: item.marks || [],
            };
          });
          this.project.steps = loadedSteps;
        }
      } catch (e) {
        console.warn('Could not load timeline.json, using default template', e);
      }
    }

    if (this.project.steps.length === 0) {
      this.addNewStep();
    }
  }

  private renderLayout() {
    let app = document.getElementById('app');
    if (!app) {
      app = document.createElement('div');
      app.id = 'app';
      document.body.appendChild(app);
    }
    app.innerHTML = `
      <div class="app-container">
        <!-- Top Bar -->
        <header class="top-bar">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">✨</span>
              <span style="font-family: 'Plus Jakarta Sans'; font-weight: 700; font-size: 15px; letter-spacing: -0.3px;">Creator Studio</span>
              <span style="font-size: 10px; background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 2px 6px; border-radius: 4px; font-weight: 600; border: 1px solid rgba(96, 165, 250, 0.3);">BETA</span>
            </div>
            <div style="height: 16px; width: 1px; background: var(--bg-panel-border);"></div>
            <input id="project-title-input" value="${this.project.title}" style="background: transparent; border: 1px solid transparent; color: var(--text-main); font-size: 13px; font-weight: 500; padding: 3px 8px; border-radius: 4px; outline: none;" placeholder="Nombre del tutorial..." />
          </div>

          <div style="display: flex; align-items: center; gap: 10px;">
            <button id="btn-toggle-fullscreen" class="btn-glass" title="Pantalla Completa (F11)">
              <span>⛶</span>
            </button>
            <button id="btn-add-step" class="btn-glass">
              <span>➕</span> Añadir Paso
            </button>
            <button id="btn-save-project" class="btn-glass">
              <span>💾</span> Guardar
            </button>
            <button id="btn-render-video" class="btn-primary">
              <span>🎬</span> Renderizar MP4
            </button>
          </div>
        </header>

        <!-- Main Workspace (Viewport & Inspector) -->
        <main class="main-content">
          <section class="viewport-area" id="viewport-container">
            <button id="btn-exit-canvas-fullscreen" class="exit-fullscreen-floating-btn" title="Salir de Pantalla Completa (Esc)">
              <span>✕</span> Salir de Pantalla Completa
            </button>

            <!-- Floating Player Controls for Fullscreen Mode -->
            <div class="fullscreen-controls-bar">
              <button id="btn-fs-prev" class="btn-glass" style="padding: 6px 12px;">⏮</button>
              <button id="btn-fs-play" class="btn-primary" style="padding: 6px 16px;">▶ Play</button>
              <button id="btn-fs-next" class="btn-glass" style="padding: 6px 12px;">⏭</button>
              <span id="fs-time-display" style="font-family: monospace; font-size: 13px; color: #fff; margin-left: 6px;">00:00.0 / 00:00.0</span>
            </div>

            <div class="stage-wrapper" id="stage-wrapper">
              <div id="virtual-stage" style="background-image: url('${this.project.settings.background}');">
                <div id="stage-content" style="width: 100%; height: 100%; position: relative;"></div>
              </div>
            </div>
          </section>

          <!-- Right Inspector Panel -->
          <aside class="inspector-panel" id="inspector-panel"></aside>
        </main>

        <!-- Bottom Timeline -->
        <footer class="timeline-bar">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <button id="btn-prev-step" class="btn-glass" style="padding: 4px 8px;">⏮</button>
              <button id="btn-play-pause" class="btn-primary" style="padding: 4px 12px;">▶ Play</button>
              <button id="btn-next-step" class="btn-glass" style="padding: 4px 8px;">⏭</button>
              <span id="time-display" style="font-family: monospace; font-size: 12px; color: var(--text-muted);">00:00.0 / 00:00.0</span>
            </div>

            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 11px; color: var(--text-muted);">Escala Canvas:</span>
              <span id="scale-indicator" style="font-size: 11px; font-weight: 600; color: #60a5fa;">100%</span>
            </div>
          </div>

          <!-- Horizontal Steps Track -->
          <div id="steps-track-container" style="display: flex; gap: 8px; overflow-x: auto; flex: 1; padding-bottom: 4px; align-items: center;"></div>
        </footer>
      </div>
    `;

    this.stageEl = document.getElementById('virtual-stage')!;
  }

  private setupResizeObserver() {
    const updateScale = () => {
      const container = document.getElementById('viewport-container');
      if (!container || !this.stageEl) return;

      const padding = 48;
      const availW = container.clientWidth - padding;
      const availH = container.clientHeight - padding;

      const scale = Math.min(availW / 1920, availH / 1080, 1.0);
      this.stageEl.style.transform = `scale(${scale})`;

      const indicator = document.getElementById('scale-indicator');
      if (indicator) {
        indicator.textContent = `${Math.round(scale * 100)}%`;
      }
    };

    window.addEventListener('resize', updateScale);
    setTimeout(updateScale, 50);
  }

  private bindEvents() {
    const titleInput = document.getElementById('project-title-input') as HTMLInputElement;
    titleInput?.addEventListener('input', (e) => {
      this.project.title = (e.target as HTMLInputElement).value;
    });

    const playBtn = document.getElementById('btn-play-pause');
    playBtn?.addEventListener('click', () => this.togglePlay());

    document.getElementById('btn-add-step')?.addEventListener('click', () => this.addNewStep());

    const toggleFullscreen = async () => {
      try {
        const isCurrentlyFull = document.body.classList.toggle('canvas-fullscreen');
        
        // Sincronizar también con la ventana nativa o navegador
        if ((window as any).__TAURI_INTERNALS__) {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const win = getCurrentWindow();
          await win.setFullscreen(isCurrentlyFull);
        } else {
          if (isCurrentlyFull && !document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else if (!isCurrentlyFull && document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
        }

        // Forzar actualización inmediata del cálculo de escala de video
        setTimeout(() => {
          const container = document.getElementById('viewport-container');
          if (!container || !this.stageEl) return;
          const availW = isCurrentlyFull ? window.innerWidth : (container.clientWidth - 48);
          const availH = isCurrentlyFull ? window.innerHeight : (container.clientHeight - 48);
          const scale = Math.min(availW / 1920, availH / 1080);
          this.stageEl.style.transform = `scale(${scale})`;
          const indicator = document.getElementById('scale-indicator');
          if (indicator) indicator.textContent = `${Math.round(scale * 100)}%`;
        }, 100);
      } catch (err) {
        console.warn('Fullscreen toggle failed:', err);
      }
    };

    document.getElementById('btn-toggle-fullscreen')?.addEventListener('click', toggleFullscreen);
    document.getElementById('btn-exit-canvas-fullscreen')?.addEventListener('click', toggleFullscreen);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'F11' || (e.key === 'Escape' && document.body.classList.contains('canvas-fullscreen'))) {
        e.preventDefault();
        toggleFullscreen();
      }
    });

    document.getElementById('btn-prev-step')?.addEventListener('click', () => {
      if (this.currentStepIndex > 0) this.selectStep(this.currentStepIndex - 1);
    });

    document.getElementById('btn-next-step')?.addEventListener('click', () => {
      if (this.currentStepIndex < this.project.steps.length - 1) this.selectStep(this.currentStepIndex + 1);
    });

    document.getElementById('btn-fs-play')?.addEventListener('click', () => this.togglePlay());
    document.getElementById('btn-fs-prev')?.addEventListener('click', () => {
      if (this.currentStepIndex > 0) this.selectStep(this.currentStepIndex - 1);
    });
    document.getElementById('btn-fs-next')?.addEventListener('click', () => {
      if (this.currentStepIndex < this.project.steps.length - 1) this.selectStep(this.currentStepIndex + 1);
    });

    const showToast = (message: string, durationMs: number = 3000) => {
      let toast = document.getElementById('app-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'app-toast';
        toast.className = 'toast-notification';
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => {
        toast?.classList.remove('show');
      }, durationMs);
    };

    document.getElementById('btn-save-project')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const fullProjectData = {
        settings: this.project.settings,
        steps: this.project.steps
      };
      const payload = JSON.stringify(fullProjectData, null, 2);
      
      // 1. Guardado en memoria local inmediato
      try {
        localStorage.setItem('creator_studio_project', payload);
      } catch (err) {
        console.warn('LocalStorage error:', err);
      }

      // 2. Feedback visual inmediato
      showToast('✅ Proyecto guardado en memoria y disco');

      // 3. Escritura a disco delegada a Rust de forma asíncrona segura
      setTimeout(async () => {
        try {
          await invoke('save_project', { projectJson: payload });
        } catch (err) {
          console.warn('Tauri invoke save_project background notice:', err);
        }
      }, 50);
    });

    // Escuchar progreso en tiempo real emitido por el motor nativo
    try {
      listen<string>('render-progress', (event) => {
        const payload = event.payload;
        const btn = document.getElementById('btn-render-video') as HTMLButtonElement;
        if (btn && btn.disabled) {
          const match = payload.match(/(\d+%)/);
          if (match) {
            btn.innerHTML = `<span class="spin-icon">⚡</span> Renderizando (${match[1]})...`;
          }
        }
      });
    } catch (e) {
      console.warn('Listener de render-progress no disponible fuera de Tauri', e);
    }

    document.getElementById('btn-render-video')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-render-video') as HTMLButtonElement;

      try {
        // 1. Abrir diálogo nativo para elegir dónde guardar el video
        let chosenPath: string | null = null;
        try {
          chosenPath = await save({
            title: 'Guardar video renderizado',
            defaultPath: 'tutorial_render.mp4',
            filters: [{
              name: 'Video MP4',
              extensions: ['mp4']
            }]
          });
        } catch (dialogErr) {
          console.warn('Diálogo no disponible o cancelado, usando ruta por defecto', dialogErr);
        }

        // Si el usuario canceló el diálogo
        if (chosenPath === null) {
          showToast('ℹ️ Renderizado cancelado por el usuario');
          return;
        }

        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<span class="spin-icon">⚡</span> Guardando ajustes y preparando render...';
        }

        // Sincronizar automáticamente en disco antes de iniciar render
        const fullProjectData = {
          settings: this.project.settings,
          steps: this.project.steps
        };
        const payload = JSON.stringify(fullProjectData, null, 2);
        try {
          localStorage.setItem('creator_studio_project', payload);
          await invoke('save_project', { projectJson: payload });
        } catch (e) {
          console.warn('Auto-save prior to render warning:', e);
        }

        showToast('🚀 Renderizando video Full HD 1080p con máxima calidad y velocidad UV...', 5000);

        const result = await invoke<string>('start_render_job', {
          outputPath: chosenPath
        });
        showToast(`🎉 ${result}`, 8000);
      } catch (err) {
        console.error('Error al renderizar video:', err);
        showToast(`❌ Error en renderizado: ${err}`, 8000);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>🎬</span> Renderizar MP4';
        }
      }
    });
  }

  private selectStep(index: number) {
    if (index < 0 || index >= this.project.steps.length) return;
    this.currentStepIndex = index;
    this.currentTimeMs = 0;
    this.updateStageContent();
    this.updateInspector();
    this.renderTimelineTracks();
  }

  private togglePlay() {
    this.isPlaying = !this.isPlaying;
    const playBtn = document.getElementById('btn-play-pause');
    const fsPlayBtn = document.getElementById('btn-fs-play');
    const label = this.isPlaying ? '⏸ Pausa' : '▶ Play';
    if (playBtn) playBtn.innerHTML = label;
    if (fsPlayBtn) fsPlayBtn.innerHTML = label;

    if (this.isPlaying) {
      // Si estamos en el final del último paso, reiniciar al paso 1 al pulsar play
      const currentStep = this.project.steps[this.currentStepIndex];
      if (this.currentStepIndex === this.project.steps.length - 1 && currentStep && this.currentTimeMs >= currentStep.duration) {
        this.selectStep(0);
      }
      this.lastTimestamp = performance.now();
      this.tick();
    } else if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private tick = () => {
    if (!this.isPlaying) return;

    const now = performance.now();
    const delta = now - this.lastTimestamp;
    this.lastTimestamp = now;

    this.currentTimeMs += delta;
    const step = this.project.steps[this.currentStepIndex];

    if (step && this.currentTimeMs >= step.duration) {
      if (this.currentStepIndex < this.project.steps.length - 1) {
        this.selectStep(this.currentStepIndex + 1);
      } else {
        // Detener reproducción al llegar al final del tutorial
        this.currentTimeMs = step.duration;
        this.isPlaying = false;
        const playBtn = document.getElementById('btn-play-pause');
        const fsPlayBtn = document.getElementById('btn-fs-play');
        if (playBtn) playBtn.innerHTML = '▶ Play';
        if (fsPlayBtn) fsPlayBtn.innerHTML = '▶ Play';
        if (this.animFrameId) {
          cancelAnimationFrame(this.animFrameId);
          this.animFrameId = null;
        }
        this.updateStagePlayback(this.currentTimeMs);
        this.updateTimeDisplay();
        return;
      }
    }

    this.updateStagePlayback(this.currentTimeMs);
    this.updateTimeDisplay();
    this.animFrameId = requestAnimationFrame(this.tick);
  };

  private updateTimeDisplay() {
    const step = this.project.steps[this.currentStepIndex];
    if (!step) return;
    const currentSec = (Math.min(this.currentTimeMs, step.duration) / 1000).toFixed(1);
    const totalSec = (step.duration / 1000).toFixed(1);
    const timeDisplay = document.getElementById('time-display');
    const fsTimeDisplay = document.getElementById('fs-time-display');
    const text = `Paso ${this.currentStepIndex + 1}/${this.project.steps.length} — ${currentSec}s / ${totalSec}s`;
    if (timeDisplay) timeDisplay.textContent = text;
    if (fsTimeDisplay) fsTimeDisplay.textContent = text;
  }

  private renderWatermarkHeader(): string {
    const h = this.project.settings.headerStyle || {
      text: 'Encuentra las actividades del libro en PuntajeNacional',
      fontSize: 22,
      color: '#ffffff',
      hasShadow: true,
      shadowColor: 'rgba(0, 0, 0, 0.95)',
      hasBackground: true,
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      backgroundPadding: 10,
      borderRadius: 8,
    };

    const bgCss = h.hasBackground ? `background: ${h.backgroundColor}; padding: 6px ${h.backgroundPadding}px; border-radius: ${h.borderRadius}px; border: 1px solid rgba(255,255,255,0.15); backdrop-filter: blur(8px);` : `background: transparent; padding: 0; border: none;`;
    const shadowCss = h.hasShadow ? `text-shadow: 0 2px 8px ${h.shadowColor};` : `text-shadow: none;`;

    return `
      <div id="top-watermark-header" class="top-right-watermark" style="font-size: ${h.fontSize}px; color: ${h.color}; ${shadowCss} ${bgCss}">
        ${h.text}
      </div>
    `;
  }

  private updateStageContent() {
    const stageContent = document.getElementById('stage-content');
    if (!stageContent) return;

    const step = this.project.steps[this.currentStepIndex];
    if (!step) {
      stageContent.innerHTML = `<div style="display: flex; height: 100%; align-items: center; justify-content: center; color: var(--text-muted);">No hay pasos creados</div>`;
      return;
    }

    const isIntro = step.type === 'section';

    if (isIntro) {
      // Pantalla de Intro Cinematográfica Minimalista con Fade-in Suave
      stageContent.innerHTML = `
        <div class="intro-container">
          <h1 class="intro-title-text">
            ${step.transcript || 'Encuentra las actividades del libro en PuntajeNacional'}
          </h1>
        </div>
      `;
    } else {
      const currentImg = document.getElementById('step-screenshot') as HTMLImageElement | null;
      const currentMockup = document.getElementById('mockup-window');

      // Si ya existe el mockup renderizado en el DOM, actualizamos la imagen internamente
      if (currentMockup && currentImg) {
        const newSrc = (step.screenshot || 'assets/screenshot_1.webp').replace(/^\/+/, '');
        const urlBar = document.getElementById('mockup-url-bar');
        if (urlBar) urlBar.textContent = `🔒 ${step.pageTitle || 'https://plataforma.com'}`;

        currentImg.src = newSrc;
        currentImg.style.opacity = '1';

        // Actualizar subtítulo
        const subBox = document.getElementById('subtitle-box');
        const subText = document.getElementById('subtitle-text');
        if (subText) subText.textContent = step.transcript;
        if (subBox) {
          subBox.classList.remove('step-subtitle-enter');
          void subBox.offsetWidth; // reflow trigger
          subBox.classList.add('step-subtitle-enter');
        }

        // Actualizar watermark header si existe con todos los estilos reactivos
        const wm = document.getElementById('top-watermark-header');
        if (wm && this.project.settings.headerStyle) {
          const h = this.project.settings.headerStyle;
          wm.textContent = h.text;
          wm.style.fontSize = `${h.fontSize}px`;
          wm.style.color = h.color;
          wm.style.textShadow = h.hasShadow ? `0 2px 8px ${h.shadowColor}` : 'none';
          if (h.hasBackground) {
            wm.style.background = h.backgroundColor;
            wm.style.padding = `6px ${h.backgroundPadding}px`;
            wm.style.borderRadius = `${h.borderRadius}px`;
            wm.style.border = '1px solid rgba(255,255,255,0.15)';
            wm.style.backdropFilter = 'blur(8px)';
          } else {
            wm.style.background = 'transparent';
            wm.style.padding = '0';
            wm.style.border = 'none';
            wm.style.backdropFilter = 'none';
          }
        }
      } else {
        // Inicialización del Mockup con animación de entrada y encabezado superior configurable
        stageContent.innerHTML = `
          <div class="mockup-stage-enter" style="width: 100%; height: 100%; position: relative;">
            ${this.renderWatermarkHeader()}

            <div style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; padding: 24px 60px 80px 60px;">
              <div style="width: 1540px; height: calc(1540px / 2.1893 + 44px); position: relative;">
                ${this.renderMockupBrowser(step, true)}
              </div>
            </div>
            ${this.renderSubtitleOverlay(step)}
          </div>
        `;
      }
    }

    this.updateStagePlayback(this.currentTimeMs);
    this.renderTimelineTracks();
  }

  private renderMockupBrowser(step: StepItem, hasZoom: boolean): string {
    const imgSrc = (step.screenshot || 'assets/screenshot_1.webp').replace(/^\/+/, '');
    return `
      <div id="mockup-window" style="width: 100%; height: 100%; background: #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.12); display: flex; flex-direction: column; transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1);">
        <div style="height: 44px; background: rgba(15, 23, 42, 0.95); border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; padding: 0 16px; gap: 14px; z-index: 20; flex-shrink: 0;">
          <div style="display: flex; gap: 6px;">
            <div style="width: 12px; height: 12px; border-radius: 50%; background: #ef4444;"></div>
            <div style="width: 12px; height: 12px; border-radius: 50%; background: #f59e0b;"></div>
            <div style="width: 12px; height: 12px; border-radius: 50%; background: #10b981;"></div>
          </div>
          <div id="mockup-url-bar" style="flex: 1; max-width: 480px; height: 26px; background: rgba(0,0,0,0.35); border-radius: 6px; border: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; padding: 0 12px; font-size: 12px; color: var(--text-muted); font-family: monospace;">
            🔒 ${step.pageTitle || 'https://plataforma.com'}
          </div>
        </div>
        <div id="mockup-viewport" style="flex: 1; position: relative; overflow: hidden; background: #0b0f19;">
          <img id="step-screenshot" class="screenshot-img" src="${imgSrc}" onerror="this.onerror=null; this.src='assets/screenshot_1.webp';" />
          <div id="ripple-container" style="position: absolute; inset: 0; pointer-events: none; z-index: 12;"></div>
          <div id="mockup-cursor" style="position: absolute; width: 30px; height: 30px; pointer-events: none; z-index: 15; transform: translate(-2px, -2px); display: ${hasZoom ? 'block' : 'none'}; transition: left 0.9s cubic-bezier(0.22, 1, 0.36, 1), top 0.9s cubic-bezier(0.22, 1, 0.36, 1);">
            <svg viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0 4px 10px rgba(0,0,0,0.8));">
              <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L5.5 3.21z" fill="#000000" stroke="#ffffff" stroke-width="1.5"/>
            </svg>
          </div>
        </div>
      </div>
    `;
  }

  private renderSubtitleOverlay(step: StepItem): string {
    return `
      <div id="subtitle-box" class="step-subtitle-enter" style="position: absolute; bottom: 54px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 20px 40px rgba(0,0,0,0.7); padding: 14px 36px; border-radius: 0px; max-width: 1100px; text-align: center; z-index: 30;">
        <span id="subtitle-text" style="font-family: 'Inter'; font-size: 26px; font-weight: 500; color: rgba(255,255,255,0.7); line-height: 1.3;">
          ${step.transcript}
        </span>
      </div>
    `;
  }

  private updateStagePlayback(timeMs: number) {
    const step = this.project.steps[this.currentStepIndex];
    if (!step) return;

    // 1. Subtítulos y marcas de palabras sincronizadas
    const subTextEl = document.getElementById('subtitle-text');
    if (subTextEl && step.marks && step.marks.length > 0) {
      const html = step.marks.map((m) => {
        const isActive = timeMs >= m.startMs && timeMs <= m.endMs;
        if (isActive) {
          return `<span style="color: #ffffff; font-weight: 700; text-shadow: 0 0 12px rgba(255,255,255,0.6);">${m.text}</span>`;
        }
        return `<span>${m.text}</span>`;
      }).join(' ');
      subTextEl.innerHTML = html;
    }

    const cursor = document.getElementById('mockup-cursor');
    const img = document.getElementById('step-screenshot') as HTMLElement;
    const mockupWindow = document.getElementById('mockup-window') as HTMLElement;
    const rippleContainer = document.getElementById('ripple-container');

    // 2. Transición temporal:
    // Estado A: Vista panorámica completa al inicio (t < zoomTriggerMs)
    // Estado B: Zoom + Enfoque hacia el clic cuando se activa la acción (t >= zoomTriggerMs)
    const zoomTriggerMs = 700;
    const isZoomState = step.enableZoom && timeMs >= zoomTriggerMs && step.type !== 'section';

    if (cursor && step.clickCoords) {
      if (timeMs < zoomTriggerMs) {
        // En reposo panorámico el cursor descansa centrado o fuera
        cursor.style.left = `50%`;
        cursor.style.top = `60%`;
        cursor.style.opacity = '0.5';
      } else {
        // Se mueve suavemente a la coordenada objetivo del clic
        cursor.style.left = `${step.clickCoords.x * 100}%`;
        cursor.style.top = `${step.clickCoords.y * 100}%`;
        cursor.style.opacity = '1';
      }
    }

    // 3. Efecto Ripple cuando ocurre el impacto del clic (~1200ms a 1800ms)
    if (rippleContainer && step.clickCoords) {
      const clickTimeMs = 1200;
      if (timeMs >= clickTimeMs && timeMs < clickTimeMs + 650 && isZoomState) {
        if (!rippleContainer.querySelector('.click-ripple')) {
          const ripple = document.createElement('div');
          ripple.className = 'click-ripple';
          ripple.style.left = `${step.clickCoords.x * 100}%`;
          ripple.style.top = `${step.clickCoords.y * 100}%`;
          rippleContainer.appendChild(ripple);
          setTimeout(() => ripple.remove(), 600);
        }
      }
    }

    // 4. Transformación de la captura: Vista Completa -> Zoom 20% con Clamping Matemático
    if (img) {
      if (isZoomState && step.boundingBox) {
        const z = this.project.settings.zoomFactor;
        const cx = step.boundingBox.x + step.boundingBox.width / 2;
        const cy = step.boundingBox.y + step.boundingBox.height / 2;

        let tx = (0.5 - cx * z) * 100;
        let ty = (0.5 - cy * z) * 100;

        const minLimit = (1.0 - z) * 100;
        tx = Math.max(minLimit, Math.min(0, tx));
        ty = Math.max(minLimit, Math.min(0, ty));

        img.style.transform = `scale(${z}) translate(${tx / z}%, ${ty / z}%)`;
        if (mockupWindow) mockupWindow.style.transform = 'scale(1.025)';
      } else {
        // Estado A: Captura 100% visible sin recortes
        img.style.transform = 'scale(1) translate(0%, 0%)';
        if (mockupWindow) mockupWindow.style.transform = 'scale(1)';
      }
    }
  }

  private updateInspector() {
    const panel = document.getElementById('inspector-panel');
    if (!panel) return;

    const step = this.project.steps[this.currentStepIndex];
    if (!step) {
      panel.innerHTML = `<div style="padding: 20px; color: var(--text-muted); font-size: 13px;">Selecciona un paso para editar sus propiedades.</div>`;
      return;
    }

    panel.innerHTML = `
      <div style="padding: 16px 20px; border-bottom: 1px solid var(--bg-panel-border);">
        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #60a5fa; font-weight: 700;">Inspector de Paso</span>
        <h2 style="font-family: 'Plus Jakarta Sans'; font-size: 16px; font-weight: 700; margin-top: 4px;">Paso ${this.currentStepIndex + 1}: ${step.title || 'Sin título'}</h2>
      </div>

      <div style="padding: 20px; display: flex; flex-direction: column; gap: 18px; flex: 1;">
        <div>
          <label style="font-size: 12px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 6px;">⏱ Duración del Paso (milisegundos)</label>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input type="number" id="step-duration-input" value="${step.duration}" step="100" min="500" style="flex: 1; background: rgba(0,0,0,0.3); border: 1px solid var(--bg-panel-border); color: #fff; padding: 8px 12px; border-radius: 6px; outline: none; font-size: 13px;" />
            <span style="font-size: 12px; color: var(--text-muted);">${(step.duration / 1000).toFixed(1)}s</span>
          </div>
        </div>

        <div>
          <label style="font-size: 12px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 6px;">📝 Texto de Subtítulo / Locución</label>
          <textarea id="step-transcript-input" rows="3" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--bg-panel-border); color: #fff; padding: 10px 12px; border-radius: 6px; outline: none; font-size: 13px; resize: vertical; line-height: 1.4;">${step.transcript}</textarea>
          <button id="btn-auto-marks" class="btn-glass" style="margin-top: 6px; width: 100%; justify-content: center; font-size: 11px;">
            ⚡ Auto-sincronizar marcas de palabras
          </button>
        </div>

        <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; border: 1px solid var(--bg-panel-border);">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div style="font-size: 13px; font-weight: 600;">🔍 Zoom & Centrado Dinámico</div>
              <div style="font-size: 11px; color: var(--text-muted);">Acercamiento 20% sobre el objetivo</div>
            </div>
            <input type="checkbox" id="step-zoom-switch" ${step.enableZoom ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;" />
          </div>
        </div>

        <div>
          <label style="font-size: 12px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 6px;">🎯 Coordenadas del Clic (Normalizadas 0..1)</label>
          <div style="display: flex; gap: 10px;">
            <div style="flex: 1;">
              <span style="font-size: 10px; color: var(--text-muted);">X:</span>
              <input type="number" id="click-x-input" value="${step.clickCoords ? step.clickCoords.x.toFixed(3) : 0.5}" step="0.01" min="0" max="1" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--bg-panel-border); color: #fff; padding: 6px 10px; border-radius: 6px; outline: none; font-size: 12px;" />
            </div>
            <div style="flex: 1;">
              <span style="font-size: 10px; color: var(--text-muted);">Y:</span>
              <input type="number" id="click-y-input" value="${step.clickCoords ? step.clickCoords.y.toFixed(3) : 0.5}" step="0.01" min="0" max="1" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--bg-panel-border); color: #fff; padding: 6px 10px; border-radius: 6px; outline: none; font-size: 12px;" />
            </div>
          </div>
        </div>

        <!-- Sección de Encabezado Superior Personalizable -->
        <div style="background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: 8px; border: 1px solid var(--bg-panel-border); display: flex; flex-direction: column; gap: 12px;">
          <div style="font-size: 12px; font-weight: 700; color: #60a5fa; text-transform: uppercase; letter-spacing: 0.5px;">
            🏷 Encabezado Superior
          </div>

          <div>
            <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">Texto del Encabezado:</label>
            <input type="text" id="hdr-text-input" value="${this.project.settings.headerStyle?.text || 'Encuentra las actividades del libro en PuntajeNacional'}" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--bg-panel-border); color: #fff; padding: 6px 10px; border-radius: 6px; outline: none; font-size: 12px;" />
          </div>

          <div style="display: flex; gap: 10px; align-items: center;">
            <div style="flex: 1;">
              <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">Tamaño (px):</label>
              <input type="number" id="hdr-size-input" value="${this.project.settings.headerStyle?.fontSize || 22}" min="12" max="60" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--bg-panel-border); color: #fff; padding: 6px 8px; border-radius: 6px; outline: none; font-size: 12px;" />
            </div>
            <div style="width: 70px;">
              <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">Color Texto:</label>
              <input type="color" id="hdr-color-input" value="${this.project.settings.headerStyle?.color || '#ffffff'}" style="width: 100%; height: 32px; background: transparent; border: 1px solid var(--bg-panel-border); border-radius: 6px; cursor: pointer;" />
            </div>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 4px;">
            <span style="font-size: 12px; color: #fff;">Sombra de texto</span>
            <input type="checkbox" id="hdr-shadow-switch" ${this.project.settings.headerStyle?.hasShadow ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;" />
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">
            <span style="font-size: 12px; color: #fff;">Fondo rectangular</span>
            <input type="checkbox" id="hdr-bg-switch" ${this.project.settings.headerStyle?.hasBackground ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;" />
          </div>

          <div id="hdr-bg-options" style="display: ${this.project.settings.headerStyle?.hasBackground ? 'flex' : 'none'}; flex-direction: column; gap: 8px; padding-left: 6px; border-left: 2px solid #3b82f6;">
            <div style="display: flex; gap: 10px; align-items: center;">
              <div style="flex: 1;">
                <label style="font-size: 10px; color: var(--text-muted); display: block; margin-bottom: 2px;">Color de Fondo:</label>
                <input type="color" id="hdr-bgcolor-input" value="#0f172a" style="width: 100%; height: 28px; background: transparent; border: 1px solid var(--bg-panel-border); border-radius: 4px; cursor: pointer;" />
              </div>
              <div style="flex: 1;">
                <label style="font-size: 10px; color: var(--text-muted); display: block; margin-bottom: 2px;">Extensión / Padding (px):</label>
                <input type="number" id="hdr-padding-input" value="${this.project.settings.headerStyle?.backgroundPadding || 14}" min="4" max="40" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--bg-panel-border); color: #fff; padding: 4px 6px; border-radius: 4px; outline: none; font-size: 11px;" />
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top: auto; padding-top: 16px;">
          <button id="btn-delete-step" class="btn-glass" style="width: 100%; justify-content: center; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">
            🗑 Eliminar Paso
          </button>
        </div>
      </div>
    `;

    this.bindInspectorEvents(step);
  }

  private bindInspectorEvents(step: StepItem) {
    document.getElementById('step-duration-input')?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (!isNaN(val) && val >= 500) {
        step.duration = val;
        this.renderTimelineTracks();
      }
    });

    document.getElementById('step-transcript-input')?.addEventListener('input', (e) => {
      step.transcript = (e.target as HTMLTextAreaElement).value;
      this.updateStageContent();
    });

    document.getElementById('btn-auto-marks')?.addEventListener('click', () => {
      this.autoGenerateMarks(step);
      this.updateStageContent();
      alert('Marcas de tiempo calculadas proporcionalmente para cada palabra.');
    });

    document.getElementById('step-zoom-switch')?.addEventListener('change', (e) => {
      step.enableZoom = (e.target as HTMLInputElement).checked;
      this.updateStageContent();
    });

    document.getElementById('click-x-input')?.addEventListener('input', (e) => {
      if (!step.clickCoords) step.clickCoords = { x: 0.5, y: 0.5 };
      step.clickCoords.x = parseFloat((e.target as HTMLInputElement).value) || 0.5;
      this.updateStagePlayback(this.currentTimeMs);
    });

    const yInput = document.getElementById('click-y-input') as HTMLInputElement | null;
    yInput?.addEventListener('input', (e) => {
      if (!step.clickCoords) step.clickCoords = { x: 0.5, y: 0.5 };
      step.clickCoords.y = parseFloat((e.target as HTMLInputElement).value) || 0.5;
      this.updateStagePlayback(this.currentTimeMs);
    });

    // Invertir flechas de teclado: Flecha Arriba = Mover cursor hacia ARRIBA (restar Y), Flecha Abajo = Mover cursor hacia ABAJO (sumar Y)
    yInput?.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const stepDelta = e.shiftKey ? 0.05 : 0.01;
        if (!step.clickCoords) step.clickCoords = { x: 0.5, y: 0.5 };
        
        if (e.key === 'ArrowUp') {
          // Mover hacia ARRIBA en pantalla
          step.clickCoords.y = Math.max(0, +(step.clickCoords.y - stepDelta).toFixed(3));
        } else {
          // Mover hacia ABAJO en pantalla
          step.clickCoords.y = Math.min(1, +(step.clickCoords.y + stepDelta).toFixed(3));
        }
        
        yInput.value = step.clickCoords.y.toFixed(3);
        this.updateStagePlayback(this.currentTimeMs);
      }
    });

    // Controles de Encabezado Superior en tiempo real
    const updateHeader = () => {
      if (!this.project.settings.headerStyle) {
        this.project.settings.headerStyle = {
          text: 'Encuentra las actividades del libro en PuntajeNacional',
          fontSize: 22,
          color: '#ffffff',
          hasShadow: true,
          shadowColor: 'rgba(0, 0, 0, 0.95)',
          hasBackground: true,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          backgroundPadding: 14,
          borderRadius: 8,
        };
      }
      const wm = document.getElementById('top-watermark-header');
      if (wm) {
        const h = this.project.settings.headerStyle;
        wm.textContent = h.text;
        wm.style.fontSize = `${h.fontSize}px`;
        wm.style.color = h.color;
        wm.style.textShadow = h.hasShadow ? `0 2px 8px ${h.shadowColor}` : 'none';
        if (h.hasBackground) {
          wm.style.background = h.backgroundColor;
          wm.style.padding = `6px ${h.backgroundPadding}px`;
          wm.style.borderRadius = `${h.borderRadius}px`;
          wm.style.border = '1px solid rgba(255,255,255,0.15)';
          wm.style.backdropFilter = 'blur(8px)';
        } else {
          wm.style.background = 'transparent';
          wm.style.padding = '0';
          wm.style.border = 'none';
          wm.style.backdropFilter = 'none';
        }
      }
    };

    document.getElementById('hdr-text-input')?.addEventListener('input', (e) => {
      if (!this.project.settings.headerStyle) updateHeader();
      this.project.settings.headerStyle!.text = (e.target as HTMLInputElement).value;
      updateHeader();
    });

    document.getElementById('hdr-size-input')?.addEventListener('input', (e) => {
      if (!this.project.settings.headerStyle) updateHeader();
      this.project.settings.headerStyle!.fontSize = parseInt((e.target as HTMLInputElement).value, 10) || 20;
      updateHeader();
    });

    document.getElementById('hdr-color-input')?.addEventListener('input', (e) => {
      if (!this.project.settings.headerStyle) updateHeader();
      this.project.settings.headerStyle!.color = (e.target as HTMLInputElement).value;
      updateHeader();
    });

    document.getElementById('hdr-shadow-switch')?.addEventListener('change', (e) => {
      if (!this.project.settings.headerStyle) updateHeader();
      this.project.settings.headerStyle!.hasShadow = (e.target as HTMLInputElement).checked;
      updateHeader();
    });

    document.getElementById('hdr-bg-switch')?.addEventListener('change', (e) => {
      if (!this.project.settings.headerStyle) updateHeader();
      const isChecked = (e.target as HTMLInputElement).checked;
      this.project.settings.headerStyle!.hasBackground = isChecked;
      const opts = document.getElementById('hdr-bg-options');
      if (opts) opts.style.display = isChecked ? 'flex' : 'none';
      updateHeader();
    });

    document.getElementById('hdr-bgcolor-input')?.addEventListener('input', (e) => {
      if (!this.project.settings.headerStyle) updateHeader();
      const hex = (e.target as HTMLInputElement).value;
      // Convertir hex a fondo con opacidad suave
      this.project.settings.headerStyle!.backgroundColor = hex;
      updateHeader();
    });

    document.getElementById('hdr-padding-input')?.addEventListener('input', (e) => {
      if (!this.project.settings.headerStyle) updateHeader();
      this.project.settings.headerStyle!.backgroundPadding = parseInt((e.target as HTMLInputElement).value, 10) || 12;
      updateHeader();
    });

    document.getElementById('btn-delete-step')?.addEventListener('click', () => {
      if (this.project.steps.length <= 1) {
        alert('No puedes eliminar el único paso restante.');
        return;
      }
      if (confirm(`¿Eliminar el paso ${this.currentStepIndex + 1}?`)) {
        this.project.steps.splice(this.currentStepIndex, 1);
        this.currentStepIndex = Math.max(0, this.currentStepIndex - 1);
        this.selectStep(this.currentStepIndex);
      }
    });
  }

  private autoGenerateMarks(step: StepItem) {
    const words = step.transcript.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      step.marks = [];
      return;
    }
    const totalMs = step.duration;
    const startDelay = 200;
    const endPadding = 400;
    const speakableMs = Math.max(500, totalMs - startDelay - endPadding);
    const msPerWord = speakableMs / words.length;

    step.marks = words.map((w, idx) => ({
      text: w,
      startMs: startDelay + idx * msPerWord,
      endMs: startDelay + (idx + 1) * msPerWord,
    }));
  }

  private renderTimelineTracks() {
    const trackContainer = document.getElementById('steps-track-container');
    if (!trackContainer) return;

    trackContainer.innerHTML = this.project.steps.map((st, i) => {
      const isActive = i === this.currentStepIndex;
      const widthPx = Math.max(100, (st.duration / 1000) * 35);
      return `
        <div class="track-step-block ${isActive ? 'active' : ''}" style="width: ${widthPx}px; flex-shrink: 0;" data-index="${i}">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; font-weight: 700; color: ${isActive ? '#93c5fd' : '#cbd5e1'};">#${i + 1}</span>
            <span style="font-size: 10px; color: var(--text-muted); font-family: monospace;">${(st.duration / 1000).toFixed(1)}s</span>
          </div>
          <div style="font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-muted);">
            ${st.transcript.slice(0, 18) || 'Sin texto'}...
          </div>
        </div>
      `;
    }).join('');

    trackContainer.querySelectorAll('.track-step-block').forEach((el) => {
      el.addEventListener('click', (e) => {
        const idx = parseInt((e.currentTarget as HTMLElement).getAttribute('data-index') || '0', 10);
        this.selectStep(idx);
      });
    });
  }

  private addNewStep() {
    const newIdx = this.project.steps.length;
    const newStep: StepItem = {
      id: `step-${Date.now()}`,
      type: 'click',
      title: `Paso ${newIdx + 1}`,
      transcript: 'Haz clic en el siguiente elemento para continuar.',
      screenshot: '/assets/screenshot_1.webp',
      duration: 4000,
      pageTitle: 'MiPlataforma.com',
      enableZoom: true,
      boundingBox: { x: 0.5, y: 0.5, width: 0.1, height: 0.05 },
      clickCoords: { x: 0.5, y: 0.5 },
      marks: [],
    };
    this.autoGenerateMarks(newStep);
    this.project.steps.push(newStep);
    this.selectStep(newIdx);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new CreatorStudio());
} else {
  new CreatorStudio();
}

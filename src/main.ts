import './style.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { ProjectData, StepItem } from './types';

class CreatorStudio {
  private projectDir: string = '';
  public isProjectLoaded: boolean = false;
  private project: ProjectData = {
    title: 'Mi Tutorial Interactivo',
    settings: {
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      theme: 'mac_dark',
      background: 'assets/guideless_bg.webp',
      zoomFactor: 1.20,
      clickAnimationDurationMs: 1100,
      headerStyle: {
        text: 'Tutorial Creator Studio',
        fontSize: 22,
        color: '#ffffff',
        hasShadow: false,
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
    this.setupGlobalRenderProgressListener();
    // Siempre iniciar en la Landing Screen limpia
    this.renderLandingWelcome();
  }

  private setupGlobalRenderProgressListener() {
    try {
      listen<string>('render-progress', (event) => {
        const payload = event.payload || '';
        console.log('[FRONTEND-PROGRESS]', payload);

        const progressBar = document.getElementById('render-progress-fill');
        const pctText = document.getElementById('render-progress-pct');
        const framesText = document.getElementById('render-progress-frames');
        const btn = document.getElementById('btn-render-video') as HTMLButtonElement;

        const match = payload.match(/\[PROGRESO\]\s*(\d+)%\s*(?:\((\d+\/\d+)\))?/);
        if (match) {
          const pct = match[1];
          const frames = match[2] || '';
          if (progressBar) progressBar.style.width = `${pct}%`;
          if (pctText) pctText.textContent = `${pct}%`;
          if (framesText && frames) framesText.textContent = `Fotogramas: ${frames}`;
          if (btn && btn.disabled) {
            btn.innerHTML = `<span class="spin-icon">⚡</span> Exportando (${pct}%)...`;
          }
        }
      });
    } catch (e) {
      console.warn('Error configurando listener de progreso:', e);
    }
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

  private renderLandingWelcome() {
    let app = document.getElementById('app');
    if (!app) {
      app = document.createElement('div');
      app.id = 'app';
      document.body.appendChild(app);
    }

    app.innerHTML = `
      <div class="landing-container">
        <!-- Ambient Glow -->
        <div class="landing-glow"></div>

        <div class="landing-card">
          <div class="landing-header">
            <div style="font-size: 40px; margin-bottom: 12px;">✨</div>
            <h1 class="landing-title">Creator Studio</h1>
            <p class="landing-subtitle">Editor de video tutorial interactivo con renderizado pixel-perfect a 1080p</p>
          </div>

          <div class="landing-actions">
            <!-- Crear Nuevo Proyecto -->
            <div id="card-new-project" class="landing-action-box">
              <div class="action-icon">➕</div>
              <div class="action-content">
                <div class="action-title">Crear Nuevo Proyecto</div>
                <div class="action-desc">Selecciona una carpeta para iniciar un tutorial desde cero con tus capturas.</div>
              </div>
            </div>

            <!-- Abrir Proyecto Existente -->
            <div id="card-open-project" class="landing-action-box">
              <div class="action-icon">📂</div>
              <div class="action-content">
                <div class="action-title">Abrir Proyecto Existente</div>
                <div class="action-desc">Abre un archivo project.json o la carpeta de un tutorial ya creado.</div>
              </div>
            </div>
          </div>

          <div class="landing-footer">
            <span>Versión 1.0.0 • Motor de Renderizado Nativo V24</span>
          </div>
        </div>
      </div>
    `;

    document.getElementById('card-new-project')?.addEventListener('click', () => this.handleNewProjectFlow());
    document.getElementById('card-open-project')?.addEventListener('click', () => this.handleOpenProjectFlow());
  }

  private async handleNewProjectFlow() {
    try {
      const chosenFolder = await open({
        directory: true,
        multiple: false,
        title: 'Seleccionar carpeta donde crear el nuevo proyecto'
      });

      if (!chosenFolder) return;
      const folderStr = Array.isArray(chosenFolder) ? chosenFolder[0] : chosenFolder;
      if (!folderStr) return;

      const projectName = prompt('Nombre del nuevo proyecto:', 'Mi Tutorial Interactivo') || 'Mi Tutorial Interactivo';
      
      await invoke<string>('create_blank_project', {
        projectDir: folderStr,
        projectTitle: projectName
      });

      this.projectDir = folderStr;
      localStorage.setItem('creator_studio_project_dir', folderStr);

      this.createNewBlankProjectState(projectName);
      this.saveProjectData();
      
      this.isProjectLoaded = true;
      this.renderLayout();
      this.setupResizeObserver();
      this.bindEvents();
      this.updateStageContent();
      this.updateInspector();

      this.showToast(`✨ Proyecto creado en: ${folderStr}`);
    } catch (e) {
      console.error('Error creando proyecto:', e);
      this.showToast(`❌ Error creando proyecto: ${e}`);
    }
  }

  private async handleOpenProjectFlow() {
    try {
      const chosen = await open({
        directory: false,
        multiple: false,
        title: 'Abrir archivo project.json o timeline.json',
        filters: [{ name: 'JSON Project', extensions: ['json'] }]
      });

      if (!chosen) return;
      const filePath = Array.isArray(chosen) ? chosen[0] : chosen;
      if (!filePath) return;

      const content = await invoke<string>('load_project_file', { filePath });
      const raw = JSON.parse(content);

      const parentDir = filePath.replace(/[\/\\][^\/\\]+$/, '');
      this.projectDir = parentDir;
      localStorage.setItem('creator_studio_project_dir', parentDir);

      this.project.title = raw.title || 'Tutorial Cargado';
      if (raw.settings) this.project.settings = { ...this.project.settings, ...raw.settings };
      this.project.steps = raw.steps || [];

      this.currentStepIndex = 0;
      this.currentTimeMs = 0;
      this.saveProjectData();

      this.isProjectLoaded = true;
      this.renderLayout();
      this.setupResizeObserver();
      this.bindEvents();
      this.updateStageContent();
      this.updateInspector();

      this.showToast(`📂 Proyecto cargado exitosamente`);
    } catch (e) {
      console.error('Error abriendo proyecto:', e);
      this.showToast(`❌ Error abriendo proyecto: ${e}`);
    }
  }

  private createNewBlankProjectState(title: string) {
    this.project = {
      title,
      settings: {
        resolution: { width: 1920, height: 1080 },
        fps: 30,
        theme: 'mac_dark',
        background: 'assets/guideless_bg.webp',
        zoomFactor: 1.20,
        clickAnimationDurationMs: 1100,
        headerStyle: {
          text: title,
          fontSize: 22,
          color: '#ffffff',
          hasShadow: false,
          shadowColor: 'rgba(0, 0, 0, 0.95)',
          hasBackground: true,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backgroundPadding: 10,
          borderRadius: 8,
        },
      },
      steps: [
        {
          id: 'step-intro',
          type: 'section',
          title: title,
          transcript: title,
          duration: 3000,
          marks: [],
        }
      ]
    };
    this.currentStepIndex = 0;
    this.currentTimeMs = 0;
  }

  private showToast(message: string, durationMs: number = 3000) {
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
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; cursor: pointer;" id="brand-logo" title="Volver al menú inicial">
              <span style="font-size: 18px;">✨</span>
              <span style="font-family: 'Plus Jakarta Sans'; font-weight: 700; font-size: 15px; letter-spacing: -0.3px;">Creator Studio</span>
              <span style="font-size: 10px; background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 2px 6px; border-radius: 4px; font-weight: 600; border: 1px solid rgba(96, 165, 250, 0.3);">PRO</span>
            </div>
            
            <div style="height: 16px; width: 1px; background: var(--bg-panel-border);"></div>

            <!-- Botones Multi-Proyecto -->
            <button id="btn-new-project" class="btn-glass" title="Crear un nuevo proyecto en una carpeta">
              <span>➕</span> Nuevo
            </button>
            <button id="btn-open-project" class="btn-glass" title="Abrir proyecto existente">
              <span>📂</span> Abrir
            </button>
            <button id="btn-close-project" class="btn-glass" title="Cerrar proyecto y volver a la pantalla de bienvenida">
              <span>🚪</span> Cerrar
            </button>

            <div style="height: 16px; width: 1px; background: var(--bg-panel-border);"></div>

            <input id="project-title-input" value="${this.project.title}" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08); color: var(--text-main); font-size: 13px; font-weight: 500; padding: 4px 10px; border-radius: 6px; outline: none; width: 240px;" placeholder="Título del tutorial..." />
            
            <span id="project-folder-label" style="font-size: 11px; color: var(--text-muted); font-family: monospace; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.projectDir || 'Proyecto en memoria'}">
              ${this.projectDir ? `📁 ${this.projectDir.split(/[\/\\]/).pop()}` : '📁 En memoria'}
            </span>
          </div>

          <div style="display: flex; align-items: center; gap: 10px;">
            <button id="btn-toggle-fullscreen" class="btn-glass" title="Pantalla Completa">
              <span>⛶</span>
            </button>
            <button id="btn-add-screenshot-step" class="btn-glass" style="border-color: rgba(59, 130, 246, 0.4); background: rgba(59, 130, 246, 0.1);">
              <span>🖼️</span> Añadir Paso con Captura
            </button>
            <button id="btn-save-project" class="btn-glass">
              <span>💾</span> Guardar
            </button>
            <button id="btn-render-video" class="btn-primary">
              <span>🎬</span> Renderizar MP4
            </button>
          </div>
        </header>

        <!-- Main Workspace -->
        <div class="main-content">
          <!-- Central 1080p Stage -->
          <div class="viewport-area">
            <div class="stage-wrapper">
              <div id="virtual-stage">
                <div id="stage-content" style="width: 100%; height: 100%; position: relative;"></div>
              </div>
            </div>
          </div>

          <!-- Right Property Inspector -->
          <aside class="inspector-panel" id="inspector-panel">
            <!-- Inspector content populated dynamically -->
          </aside>
        </div>

        <!-- Bottom Timeline Panel -->
        <footer class="timeline-panel">
          <div class="timeline-toolbar">
            <div style="display: flex; align-items: center; gap: 8px;">
              <button id="btn-play-pause" class="btn-glass" style="min-width: 80px;">▶ Play</button>
              <button id="btn-prev-step" class="btn-glass" title="Paso Anterior">⏮</button>
              <button id="btn-next-step" class="btn-glass" title="Siguiente Paso">⏭</button>
              <div style="height: 16px; width: 1px; background: var(--bg-panel-border); margin: 0 4px;"></div>
              <button id="btn-timeline-delete-step" class="btn-glass" style="color: #f87171; border-color: rgba(239, 68, 68, 0.35); background: rgba(239, 68, 68, 0.08);" title="Eliminar el paso actualmente seleccionado">
                <span>🗑️</span> Eliminar Paso
              </button>
              <div style="height: 16px; width: 1px; background: var(--bg-panel-border); margin: 0 4px;"></div>
              <span id="timeline-time-display" style="font-size: 12px; font-family: monospace; color: var(--text-muted);">00:00.00 / 00:00.00</span>
            </div>

            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11px; color: var(--text-muted);">Haz clic en el mockup para posicionar el cursor</span>
            </div>
          </div>

          <div class="timeline-tracks-area" id="steps-track-container">
            <!-- Step blocks dynamically rendered -->
          </div>
        </footer>
      </div>
    `;

    this.stageEl = document.getElementById('virtual-stage')!;
  }

  private setupResizeObserver() {
    const updateScale = () => {
      const wrapper = document.querySelector('.stage-wrapper');
      if (!wrapper || !this.stageEl) return;
      const rect = wrapper.getBoundingClientRect();
      const padding = 32;
      const availW = rect.width - padding * 2;
      const availH = rect.height - padding * 2;
      const scale = Math.min(availW / 1920, availH / 1080, 1.0);
      this.stageEl.style.transform = `scale(${scale})`;
    };

    window.addEventListener('resize', updateScale);
    setTimeout(updateScale, 50);
  }

  private async resolveAssetUrl(relOrAbs: string): Promise<string> {
    if (!relOrAbs) return '/assets/guideless_bg.webp';
    if (relOrAbs.startsWith('data:') || relOrAbs.startsWith('http')) return relOrAbs;

    // Si tenemos un directorio de proyecto activo en Tauri
    if (this.projectDir) {
      try {
        let fullPath = relOrAbs;
        if (!relOrAbs.includes(':') && !relOrAbs.startsWith('/') && !relOrAbs.startsWith('\\')) {
          fullPath = `${this.projectDir}/${relOrAbs.replace(/^\/+/, '')}`;
        }
        const b64 = await invoke<string>('read_file_as_base64', { filePath: fullPath });
        if (b64) return b64;
      } catch (e) {
        // Fallback local
      }
    }

    const clean = relOrAbs.replace(/^\/+/, '').replace(/^assets\//, '');
    return `/assets/${clean}`;
  }

  private bindEvents() {
    // Volver a Landing
    document.getElementById('btn-close-project')?.addEventListener('click', () => {
      this.saveProjectData(false);
      localStorage.removeItem('creator_studio_project');
      localStorage.removeItem('creator_studio_project_dir');
      this.projectDir = '';
      this.isProjectLoaded = false;
      this.renderLandingWelcome();
    });

    // Título del proyecto
    document.getElementById('project-title-input')?.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value;
      this.project.title = val;
      if (this.project.settings.headerStyle) {
        this.project.settings.headerStyle.text = val;
      }
      if (this.project.steps[0] && this.project.steps[0].type === 'section') {
        this.project.steps[0].title = val;
        this.project.steps[0].transcript = val;
      }
      this.updateStageContent();
      this.updateInspector();
    });

    // Crear Nuevo Proyecto
    document.getElementById('btn-new-project')?.addEventListener('click', () => this.handleNewProjectFlow());

    // Abrir Proyecto Existente
    document.getElementById('btn-open-project')?.addEventListener('click', () => this.handleOpenProjectFlow());

    // Añadir Paso con Captura (JPG/PNG)
    document.getElementById('btn-add-screenshot-step')?.addEventListener('click', async () => {
      await this.handleImportScreenshotStep();
    });

    // Pantalla completa
    document.getElementById('btn-toggle-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Playback
    document.getElementById('btn-play-pause')?.addEventListener('click', () => this.togglePlay());
    document.getElementById('btn-prev-step')?.addEventListener('click', () => {
      if (this.currentStepIndex > 0) this.selectStep(this.currentStepIndex - 1);
    });
    document.getElementById('btn-next-step')?.addEventListener('click', () => {
      if (this.currentStepIndex < this.project.steps.length - 1) this.selectStep(this.currentStepIndex + 1);
    });

    // Eliminar Paso desde Timeline
    document.getElementById('btn-timeline-delete-step')?.addEventListener('click', () => {
      this.deleteCurrentStep();
    });

    // Guardar Proyecto
    document.getElementById('btn-save-project')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.saveProjectData(true);
    });

    // Renderizar MP4 con Modal de Progreso
    document.getElementById('btn-render-video')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-render-video') as HTMLButtonElement;
      let modal = document.getElementById('render-progress-modal');
      
      if (!modal) {
        const modalHtml = `
          <div id="render-progress-modal" class="render-modal-backdrop">
            <div class="render-modal-card">
              <div class="render-modal-glow-bg"></div>
              <div class="render-modal-title">
                <span class="spin-icon">⚡</span> Renderizando Tutorial MP4
              </div>
              <div class="render-modal-subtitle">
                Motor Turbo UV en paralelo a 1080p 60fps / 30fps sin pérdidas
              </div>
              <div class="render-progress-track">
                <div id="render-progress-fill" class="render-progress-bar"></div>
              </div>
              <div class="render-stats-row">
                <span id="render-progress-pct" class="render-pct-text">0%</span>
                <span id="render-progress-frames" class="render-frames-text">Iniciando procesador...</span>
              </div>
            </div>
          </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('render-progress-modal');
      }

      const progressBar = document.getElementById('render-progress-fill');
      const pctText = document.getElementById('render-progress-pct');
      const framesText = document.getElementById('render-progress-frames');

      try {
        let defaultOutput = 'tutorial_render.mp4';
        if (this.projectDir) {
          defaultOutput = `${this.projectDir}/output_tutorial.mp4`;
        }

        let chosenPath: string | null = null;
        try {
          chosenPath = await save({
            title: 'Guardar video renderizado',
            defaultPath: defaultOutput,
            filters: [{ name: 'Video MP4', extensions: ['mp4'] }]
          });
        } catch (dialogErr) {
          console.warn('Diálogo no disponible o cancelado', dialogErr);
        }

        if (chosenPath === null) {
          this.showToast('ℹ️ Renderizado cancelado por el usuario');
          return;
        }

        if (progressBar) progressBar.style.width = '0%';
        if (pctText) pctText.textContent = '0%';
        if (framesText) framesText.textContent = 'Preparando fotogramas...';
        if (modal) modal.classList.add('show');

        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<span class="spin-icon">⚡</span> Exportando...';
        }

        await this.saveProjectData(false);

        const result = await invoke<string>('start_render_job', {
          projectDir: this.projectDir || undefined,
          outputPath: chosenPath
        });

        if (progressBar) progressBar.style.width = '100%';
        if (pctText) pctText.textContent = '100%';
        if (framesText) framesText.textContent = '¡Renderizado Completo!';

        setTimeout(() => {
          if (modal) modal.classList.remove('show');
          this.showToast(`🎉 ${result}`, 8000);
        }, 600);
      } catch (err) {
        console.error('Error al renderizar:', err);
        if (modal) modal.classList.remove('show');
        this.showToast(`❌ Error en renderizado: ${err}`, 8000);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>🎬</span> Renderizar MP4';
        }
      }
    });
  }

  private async handleImportScreenshotStep() {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: 'Seleccionar captura de pantalla del paso',
        filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      });

      if (!selected) return;
      const imgPath = Array.isArray(selected) ? selected[0] : selected;
      if (!imgPath) return;

      let relativePath = imgPath;
      if (this.projectDir) {
        relativePath = await invoke<string>('import_step_screenshot', {
          projectDir: this.projectDir,
          sourceImagePath: imgPath
        });
      }

      const newIdx = this.project.steps.length;
      const newStep: StepItem = {
        id: `step-${Date.now()}`,
        type: 'click',
        title: `Paso ${newIdx + 1}`,
        transcript: 'Haz clic en el elemento destacado para continuar.',
        screenshot: relativePath,
        duration: 4500,
        pageTitle: 'https://plataforma.com',
        enableZoom: true,
        boundingBox: { x: 0.42, y: 0.46, width: 0.16, height: 0.08 },
        clickCoords: { x: 0.50, y: 0.50 },
        marks: []
      };

      this.autoGenerateMarks(newStep);
      this.project.steps.push(newStep);
      this.selectStep(newIdx);
      this.saveProjectData(false);
      this.showToast(`🖼️ Paso ${newIdx + 1} añadido con captura`);
    } catch (e) {
      console.error('Error importando captura:', e);
      this.showToast(`❌ Error importando captura: ${e}`);
    }
  }

  private async saveProjectData(notify: boolean = false) {
    const fullProjectData = {
      title: this.project.title,
      settings: this.project.settings,
      steps: this.project.steps
    };
    const payload = JSON.stringify(fullProjectData, null, 2);

    try {
      localStorage.setItem('creator_studio_project', payload);
    } catch (e) {}

    try {
      let targetFile: string | undefined = undefined;
      if (this.projectDir) {
        targetFile = `${this.projectDir}/project.json`;
      }
      await invoke('save_project', { projectJson: payload, filePath: targetFile });
      if (notify) this.showToast('✅ Proyecto guardado en disco');
    } catch (err) {
      console.warn('Save notice:', err);
    }
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
    if (playBtn) playBtn.innerHTML = this.isPlaying ? '⏸ Pausa' : '▶ Play';

    if (this.isPlaying) {
      this.lastTimestamp = performance.now();
      this.playLoop();
    } else if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
  }

  private playLoop() {
    const loop = (now: number) => {
      if (!this.isPlaying) return;
      const dt = now - this.lastTimestamp;
      this.lastTimestamp = now;
      this.currentTimeMs += dt;

      const step = this.project.steps[this.currentStepIndex];
      if (step && this.currentTimeMs >= step.duration) {
        if (this.currentStepIndex < this.project.steps.length - 1) {
          this.selectStep(this.currentStepIndex + 1);
        } else {
          this.selectStep(0);
        }
      } else {
        this.updateStagePlayback(this.currentTimeMs);
        this.updateTimeDisplay();
      }

      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private updateTimeDisplay() {
    const display = document.getElementById('timeline-time-display');
    const step = this.project.steps[this.currentStepIndex];
    if (!display || !step) return;

    const curSec = (this.currentTimeMs / 1000).toFixed(2);
    const totSec = (step.duration / 1000).toFixed(2);
    display.textContent = `${curSec}s / ${totSec}s (Paso ${this.currentStepIndex + 1}/${this.project.steps.length})`;
  }

  private async updateStageContent() {
    const stageContent = document.getElementById('stage-content');
    if (!stageContent) return;

    const step = this.project.steps[this.currentStepIndex];
    if (!step) {
      stageContent.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted);">Sin pasos en el proyecto. Añade un paso con captura para comenzar.</div>`;
      return;
    }

    // Fondo global
    const bgUrl = await this.resolveAssetUrl(this.project.settings.background);
    if (this.stageEl) {
      this.stageEl.style.backgroundImage = `url('${bgUrl}')`;
    }

    if (step.type === 'section') {
      stageContent.innerHTML = `
        <div class="intro-container">
          <h1 class="intro-title-text">
            ${step.transcript || step.title || this.project.title}
          </h1>
        </div>
      `;
    } else {
      const currentImg = document.getElementById('step-screenshot') as HTMLImageElement | null;
      const currentMockup = document.getElementById('mockup-window');

      if (currentMockup && currentImg) {
        const resolvedSrc = await this.resolveAssetUrl(step.screenshot || '');
        const urlBar = document.getElementById('mockup-url-bar');
        if (urlBar) urlBar.textContent = `🔒 ${step.pageTitle || 'https://plataforma.com'}`;

        currentImg.src = resolvedSrc;
        currentImg.style.opacity = '1';

        const subText = document.getElementById('subtitle-text');
        if (subText) subText.textContent = step.transcript;

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
        const resolvedSrc = await this.resolveAssetUrl(step.screenshot || '');
        stageContent.innerHTML = `
          <div class="mockup-stage-enter" style="width: 100%; height: 100%; position: relative;">
            ${this.renderWatermarkHeader()}
            <div style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; padding: 24px 60px 80px 60px;">
              <div style="width: 1540px; height: calc(1540px / 2.1893 + 44px); position: relative;">
                ${this.renderMockupBrowser(step, resolvedSrc)}
              </div>
            </div>
            ${this.renderSubtitleOverlay(step)}
          </div>
        `;

        this.setupInteractiveViewportClick();
      }
    }

    this.updateStagePlayback(this.currentTimeMs);
    this.renderTimelineTracks();
  }

  private setupInteractiveViewportClick() {
    const vp = document.getElementById('mockup-viewport');
    if (!vp) return;

    vp.addEventListener('click', (e) => {
      const step = this.project.steps[this.currentStepIndex];
      if (!step || step.type === 'section') return;

      const rect = vp.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const clickY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      step.clickCoords = {
        x: +clickX.toFixed(3),
        y: +clickY.toFixed(3),
      };

      step.boundingBox = {
        x: Math.max(0, +(clickX - 0.08).toFixed(3)),
        y: Math.max(0, +(clickY - 0.04).toFixed(3)),
        width: 0.16,
        height: 0.08,
      };

      this.currentTimeMs = 1200;
      this.updateStagePlayback(this.currentTimeMs);
      this.updateInspector();
      this.showToast(`🎯 Clic fijado en X: ${step.clickCoords.x}, Y: ${step.clickCoords.y}`);
    });
  }

  private renderWatermarkHeader(): string {
    const h = this.project.settings.headerStyle || {
      text: this.project.title,
      fontSize: 22,
      color: '#ffffff',
      hasShadow: false,
      shadowColor: 'rgba(0,0,0,0.95)',
      hasBackground: true,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backgroundPadding: 10,
      borderRadius: 8
    };

    const bgStyle = h.hasBackground ? `background: ${h.backgroundColor}; padding: 6px ${h.backgroundPadding}px; border-radius: ${h.borderRadius}px; border: 1px solid rgba(255,255,255,0.15); backdrop-filter: blur(8px);` : 'background: transparent; padding: 0;';
    const shadowStyle = h.hasShadow ? `text-shadow: 0 2px 8px ${h.shadowColor};` : '';

    return `
      <div id="top-watermark-header" class="top-right-watermark" style="font-size: ${h.fontSize}px; color: ${h.color}; ${shadowStyle} ${bgStyle}">
        ${h.text}
      </div>
    `;
  }

  private renderMockupBrowser(step: StepItem, imgSrc: string): string {
    return `
      <div id="mockup-window" style="width: 100%; height: 100%; background: #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.12); display: flex; flex-direction: column;">
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
          <img id="step-screenshot" class="screenshot-img" src="${imgSrc}" />
          <div id="ripple-container" style="position: absolute; inset: 0; pointer-events: none; z-index: 12;"></div>
          <div id="mockup-cursor" style="position: absolute; width: 30px; height: 30px; pointer-events: none; z-index: 15; transform: translate(-2px, -2px); display: ${step.type !== 'section' ? 'block' : 'none'}; transition: left 0.9s cubic-bezier(0.22, 1, 0.36, 1), top 0.9s cubic-bezier(0.22, 1, 0.36, 1);">
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
    const rippleContainer = document.getElementById('ripple-container');

    const zoomTriggerMs = 700;
    const isZoomState = step.enableZoom && timeMs >= zoomTriggerMs && step.type !== 'section';

    if (cursor && step.clickCoords) {
      if (timeMs < zoomTriggerMs) {
        cursor.style.left = `50%`;
        cursor.style.top = `60%`;
        cursor.style.opacity = '0.5';
      } else {
        cursor.style.left = `${step.clickCoords.x * 100}%`;
        cursor.style.top = `${step.clickCoords.y * 100}%`;
        cursor.style.opacity = '1';
      }
    }

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
      } else {
        img.style.transform = 'scale(1) translate(0%, 0%)';
      }
    }
  }

  private updateInspector() {
    const panel = document.getElementById('inspector-panel');
    if (!panel) return;

    const step = this.project.steps[this.currentStepIndex];
    if (!step) {
      panel.innerHTML = `<div style="padding: 20px; color: var(--text-muted); font-size: 13px;">Sin pasos para editar.</div>`;
      return;
    }

    const isSection = step.type === 'section';

    panel.innerHTML = `
      <!-- Propiedades del Paso -->
      <div class="inspector-section">
        <div class="inspector-section-title">
          <span>⚙️</span> Propiedades del Paso #${this.currentStepIndex + 1}
        </div>

        <div class="inspector-field">
          <label class="inspector-label">Tipo de Paso</label>
          <select id="step-type-select" class="inspector-input">
            <option value="click" ${step.type === 'click' ? 'selected' : ''}>Paso con Clic & Mockup</option>
            <option value="section" ${step.type === 'section' ? 'selected' : ''}>Intro / Título de Sección</option>
          </select>
        </div>

        <div class="inspector-field">
          <label class="inspector-label">Duración (segundos)</label>
          <input id="step-duration-input" type="number" step="0.5" min="1" max="20" class="inspector-input" value="${(step.duration / 1000).toFixed(1)}" />
        </div>

        <div class="inspector-field">
          <label class="inspector-label">${isSection ? 'Título del Tutorial / Sección' : 'Subtítulo / Locución del Paso'}</label>
          <textarea id="step-transcript-input" class="inspector-textarea">${step.transcript || ''}</textarea>
        </div>

        ${!isSection ? `
          <div class="inspector-field">
            <label class="inspector-label">URL de la Barra del Navegador</label>
            <input id="step-url-input" class="inspector-input" value="${step.pageTitle || 'https://plataforma.com'}" />
          </div>

          <div style="background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; padding: 12px; margin-top: 12px;">
            <div style="font-size: 11px; font-weight: 700; color: #93c5fd; margin-bottom: 8px;">🎯 Coordenadas del Clic (Interactiva)</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <label style="font-size: 10px; color: var(--text-muted);">X (0.0 a 1.0)</label>
                <input id="step-click-x" type="number" step="0.01" class="inspector-input" value="${(step.clickCoords?.x ?? 0.5).toFixed(3)}" />
              </div>
              <div>
                <label style="font-size: 10px; color: var(--text-muted);">Y (0.0 a 1.0)</label>
                <input id="step-click-y" type="number" step="0.01" class="inspector-input" value="${(step.clickCoords?.y ?? 0.5).toFixed(3)}" />
              </div>
            </div>
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 6px;">💡 Haz clic directo en el mockup para calibrar.</div>
          </div>
        ` : ''}

        <div style="display: flex; gap: 8px; margin-top: 14px;">
          <button id="btn-auto-marks" class="btn-glass" style="flex: 1; justify-content: center;">
            <span>⚡</span> Auto-Sincronizar
          </button>
          <button id="btn-delete-step" class="btn-glass" style="color: #f87171; border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.1);" title="Eliminar este paso">
            <span>🗑️</span> Eliminar Paso
          </button>
        </div>
      </div>

      <!-- Ajustes Globales del Tutorial -->
      <div class="inspector-section">
        <div class="inspector-section-title">
          <span>🎨</span> Personalización Global
        </div>

        <div class="inspector-field">
          <label class="inspector-label">Texto Superior / Watermark</label>
          <input id="hdr-text-input" class="inspector-input" value="${this.project.settings.headerStyle?.text || this.project.title}" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;" class="inspector-field">
          <div>
            <label class="inspector-label">Tamaño (px)</label>
            <input id="hdr-size-input" type="number" min="12" max="36" class="inspector-input" value="${this.project.settings.headerStyle?.fontSize || 22}" />
          </div>
          <div>
            <label class="inspector-label">Color Texto</label>
            <input id="hdr-color-input" type="color" class="inspector-input" value="${this.project.settings.headerStyle?.color || '#ffffff'}" style="height: 38px; padding: 2px;" />
          </div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <span class="inspector-label" style="margin: 0;">Sombra de Texto</span>
          <input id="hdr-shadow-switch" type="checkbox" ${this.project.settings.headerStyle?.hasShadow ? 'checked' : ''} />
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <span class="inspector-label" style="margin: 0;">Fondo del Encabezado</span>
          <input id="hdr-bg-switch" type="checkbox" ${this.project.settings.headerStyle?.hasBackground ? 'checked' : ''} />
        </div>

        <div style="margin-top: 16px;">
          <button id="btn-change-global-bg" class="btn-glass" style="width: 100%; justify-content: center;">
            <span>🖼️</span> Cambiar Fondo Global del Video
          </button>
        </div>
      </div>
    `;

    this.bindInspectorEvents(step);
  }

  private bindInspectorEvents(step: StepItem) {
    // Tipo de paso
    document.getElementById('step-type-select')?.addEventListener('change', (e) => {
      step.type = (e.target as HTMLSelectElement).value as any;
      if (step.type === 'section') {
        step.enableZoom = false;
      } else {
        step.enableZoom = true;
        if (!step.screenshot) step.screenshot = 'assets/screenshot_1.webp';
      }
      this.updateStageContent();
      this.updateInspector();
    });

    // Duración
    document.getElementById('step-duration-input')?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (!isNaN(val) && val > 0) {
        step.duration = Math.round(val * 1000);
        this.autoGenerateMarks(step);
        this.renderTimelineTracks();
      }
    });

    // Transcript / Subtítulo
    document.getElementById('step-transcript-input')?.addEventListener('input', (e) => {
      step.transcript = (e.target as HTMLTextAreaElement).value;
      if (step.type === 'section') {
        step.title = step.transcript;
      }
      this.autoGenerateMarks(step);
      this.updateStageContent();
    });

    // URL
    document.getElementById('step-url-input')?.addEventListener('input', (e) => {
      step.pageTitle = (e.target as HTMLInputElement).value;
      const urlBar = document.getElementById('mockup-url-bar');
      if (urlBar) urlBar.textContent = `🔒 ${step.pageTitle}`;
    });

    // Clics manuales
    document.getElementById('step-click-x')?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (!isNaN(val) && step.clickCoords) {
        step.clickCoords.x = val;
        if (step.boundingBox) step.boundingBox.x = Math.max(0, val - step.boundingBox.width / 2);
        this.updateStagePlayback(this.currentTimeMs);
      }
    });

    document.getElementById('step-click-y')?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (!isNaN(val) && step.clickCoords) {
        step.clickCoords.y = val;
        if (step.boundingBox) step.boundingBox.y = Math.max(0, val - step.boundingBox.height / 2);
        this.updateStagePlayback(this.currentTimeMs);
      }
    });

    // Auto-marks
    document.getElementById('btn-auto-marks')?.addEventListener('click', () => {
      this.autoGenerateMarks(step);
      this.updateStagePlayback(this.currentTimeMs);
      this.showToast('⚡ Marcas de palabras sincronizadas');
    });

    // Eliminar paso
    document.getElementById('btn-delete-step')?.addEventListener('click', () => {
      this.deleteCurrentStep();
    });

    // Encabezado Superior
    document.getElementById('hdr-text-input')?.addEventListener('input', (e) => {
      if (!this.project.settings.headerStyle) return;
      this.project.settings.headerStyle.text = (e.target as HTMLInputElement).value;
      this.updateStageContent();
    });

    document.getElementById('hdr-size-input')?.addEventListener('input', (e) => {
      if (!this.project.settings.headerStyle) return;
      this.project.settings.headerStyle.fontSize = parseInt((e.target as HTMLInputElement).value, 10) || 22;
      this.updateStageContent();
    });

    document.getElementById('hdr-color-input')?.addEventListener('input', (e) => {
      if (!this.project.settings.headerStyle) return;
      this.project.settings.headerStyle.color = (e.target as HTMLInputElement).value;
      this.updateStageContent();
    });

    document.getElementById('hdr-shadow-switch')?.addEventListener('change', (e) => {
      if (!this.project.settings.headerStyle) return;
      this.project.settings.headerStyle.hasShadow = (e.target as HTMLInputElement).checked;
      this.updateStageContent();
    });

    document.getElementById('hdr-bg-switch')?.addEventListener('change', (e) => {
      if (!this.project.settings.headerStyle) return;
      this.project.settings.headerStyle.hasBackground = (e.target as HTMLInputElement).checked;
      this.updateStageContent();
    });

    // Cambiar Fondo Global
    document.getElementById('btn-change-global-bg')?.addEventListener('click', async () => {
      try {
        const selected = await open({
          multiple: false,
          directory: false,
          title: 'Seleccionar imagen de fondo global',
          filters: [{ name: 'Imágenes', extensions: ['webp', 'png', 'jpg', 'jpeg'] }]
        });

        if (!selected) return;
        const bgPath = Array.isArray(selected) ? selected[0] : selected;
        if (!bgPath) return;

        let relativeBg = bgPath;
        if (this.projectDir) {
          relativeBg = await invoke<string>('set_project_background', {
            projectDir: this.projectDir,
            sourceBgPath: bgPath
          });
        }

        this.project.settings.background = relativeBg;
        await this.updateStageContent();
        this.saveProjectData(false);
        this.showToast('🖼️ Fondo global actualizado');
      } catch (e) {
        console.error('Error actualizando fondo:', e);
        this.showToast(`❌ Error actualizando fondo: ${e}`);
      }
    });
  }

  private deleteCurrentStep() {
    if (this.project.steps.length <= 1) {
      alert('No puedes eliminar el único paso restante del proyecto.');
      return;
    }
    const stepNum = this.currentStepIndex + 1;
    if (confirm(`¿Estás seguro de eliminar el paso #${stepNum}?`)) {
      this.project.steps.splice(this.currentStepIndex, 1);
      this.currentStepIndex = Math.max(0, Math.min(this.currentStepIndex, this.project.steps.length - 1));
      this.selectStep(this.currentStepIndex);
      this.saveProjectData(false);
      this.showToast(`🗑️ Paso #${stepNum} eliminado`);
    }
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
      const isIntro = st.type === 'section';
      return `
        <div class="track-step-block ${isActive ? 'active' : ''}" style="width: ${widthPx}px; flex-shrink: 0;" data-index="${i}">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; font-weight: 700; color: ${isActive ? '#93c5fd' : '#cbd5e1'};">
              ${isIntro ? '🎬 Intro' : `#${i + 1}`}
            </span>
            <span style="font-size: 10px; color: var(--text-muted); font-family: monospace;">${(st.duration / 1000).toFixed(1)}s</span>
          </div>
          <div style="font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-muted);">
            ${st.transcript.slice(0, 18) || (isIntro ? 'Título Intro' : 'Sin texto')}...
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new CreatorStudio());
} else {
  new CreatorStudio();
}

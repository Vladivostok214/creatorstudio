use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RecordedStep {
    pub id: String,
    pub title: String,
    pub transcript: String,
    pub screenshot: String,
    pub cursor_x: f64,
    pub cursor_y: f64,
    pub duration: u64,
}

#[derive(Default)]
pub struct RecorderSession {
    pub is_active: bool,
    pub project_dir: String,
    pub project_title: String,
    pub steps: Vec<RecordedStep>,
}

#[derive(Default)]
pub struct AppState {
    pub session: Mutex<RecorderSession>,
}

const INJECTED_RECORDER_SCRIPT: &str = r#"
(function() {
  if (window.__CREATOR_RECORDER_INITIALIZED__) return;
  window.__CREATOR_RECORDER_INITIALIZED__ = true;

  window.__RECORDER_PAUSED__ = false;
  window.__RECORDER_LAST_CLICK_TIME__ = 0;
  window.__RECORDER_LOCAL_COUNT__ = 0;

  async function sendToRust(eventName, payload) {
    let sent = false;
    // 1. Try Tauri event emit
    if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.emit === 'function') {
      try {
        await window.__TAURI__.event.emit(eventName, payload);
        sent = true;
      } catch (e) {
        console.warn('[CreatorRecorder] event.emit failed:', e);
      }
    }
    // 2. Try Tauri plugin:event|emit via internals
    if (!sent && window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
      try {
        await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {
          event: eventName,
          payload: typeof payload === 'string' ? payload : JSON.stringify(payload)
        });
        sent = true;
      } catch (e) {
        console.warn('[CreatorRecorder] plugin:event|emit failed:', e);
      }
    }
    return sent;
  }

  function initHUD() {
    if (window.top !== window) return;
    if (document.getElementById('creator-recorder-hud')) return;

    const style = document.createElement('style');
    style.id = 'creator-recorder-styles';
    style.textContent = `
      #creator-recorder-hud {
        position: fixed;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.7), 0 0 20px rgba(59, 130, 246, 0.35);
        border-radius: 9999px;
        padding: 6px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        color: #f8fafc;
        user-select: none;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      #creator-recorder-hud:hover {
        border-color: rgba(96, 165, 250, 0.55);
        box-shadow: 0 12px 36px -5px rgba(0, 0, 0, 0.8), 0 0 25px rgba(59, 130, 246, 0.5);
      }
      .cr-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(239, 68, 68, 0.18);
        color: #f87171;
        border: 1px solid rgba(239, 68, 68, 0.4);
        padding: 3px 10px;
        border-radius: 9999px;
        font-weight: 700;
        font-size: 11px;
        letter-spacing: 0.5px;
      }
      .cr-badge.paused {
        background: rgba(234, 179, 8, 0.18);
        color: #facc15;
        border-color: rgba(234, 179, 8, 0.4);
      }
      .cr-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #ef4444;
        box-shadow: 0 0 8px #ef4444;
        animation: cr-pulse 1.4s infinite;
      }
      .cr-badge.paused .cr-dot {
        background: #facc15;
        box-shadow: 0 0 8px #facc15;
        animation: none;
      }
      @keyframes cr-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.85); }
      }
      .cr-counter {
        font-weight: 600;
        color: #94a3b8;
      }
      .cr-counter span {
        color: #38bdf8;
        font-weight: 700;
      }
      .cr-divider {
        width: 1px;
        height: 18px;
        background: rgba(255, 255, 255, 0.12);
      }
      .cr-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #e2e8f0;
        padding: 5px 12px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all 0.15s ease;
      }
      .cr-btn:hover {
        background: rgba(255, 255, 255, 0.16);
        color: #ffffff;
        transform: translateY(-1px);
      }
      .cr-btn:active {
        transform: translateY(0);
      }
      .cr-btn-snap {
        background: rgba(56, 189, 248, 0.15);
        border-color: rgba(56, 189, 248, 0.35);
        color: #38bdf8;
      }
      .cr-btn-snap:hover {
        background: rgba(56, 189, 248, 0.25);
        color: #ffffff;
      }
      .cr-btn-finish {
        background: linear-gradient(135deg, #2563eb, #3b82f6);
        border-color: rgba(96, 165, 250, 0.5);
        color: #ffffff;
        box-shadow: 0 0 12px rgba(59, 130, 246, 0.4);
      }
      .cr-btn-finish:hover {
        background: linear-gradient(135deg, #1d4ed8, #2563eb);
        box-shadow: 0 0 18px rgba(59, 130, 246, 0.6);
      }
      .cr-ripple {
        position: fixed;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(56, 189, 248, 0.45);
        border: 2px solid #38bdf8;
        transform: translate(-50%, -50%) scale(0.5);
        pointer-events: none;
        z-index: 2147483646;
        animation: cr-ripple-anim 0.45s ease-out forwards;
      }
      @keyframes cr-ripple-anim {
        0% { transform: translate(-50%, -50%) scale(0.4); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    const hud = document.createElement('div');
    hud.id = 'creator-recorder-hud';
    hud.innerHTML = `
      <div id="cr-status-badge" class="cr-badge">
        <span class="cr-dot"></span>
        <span id="cr-status-text">REC</span>
      </div>
      <div class="cr-counter">Pasos: <span id="cr-step-count">0</span></div>
      <div class="cr-divider"></div>
      <button id="cr-btn-snap" class="cr-btn cr-btn-snap" title="Capturar frame actual">📸 Capturar</button>
      <button id="cr-btn-undo" class="cr-btn" title="Deshacer el último clic">↩ Deshacer</button>
      <button id="cr-btn-pause" class="cr-btn" title="Pausar grabación">⏸️ Pausar</button>
      <div class="cr-divider"></div>
      <button id="cr-btn-finish" class="cr-btn cr-btn-finish">✨ Finalizar Grabación</button>
    `;

    document.body.appendChild(hud);

    const btnSnap = hud.querySelector('#cr-btn-snap');
    const btnUndo = hud.querySelector('#cr-btn-undo');
    const btnPause = hud.querySelector('#cr-btn-pause');
    const btnFinish = hud.querySelector('#cr-btn-finish');

    btnPause?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.__RECORDER_PAUSED__ = !window.__RECORDER_PAUSED__;
      const badge = hud.querySelector('#cr-status-badge');
      const text = hud.querySelector('#cr-status-text');
      if (window.__RECORDER_PAUSED__) {
        badge?.classList.add('paused');
        if (text) text.textContent = 'PAUSA';
        if (btnPause) btnPause.textContent = '▶️ Reanudar';
      } else {
        badge?.classList.remove('paused');
        if (text) text.textContent = 'REC';
        if (btnPause) btnPause.textContent = '⏸️ Pausar';
      }
    });

    async function captureWithCleanView(actionFn) {
      const hud = document.getElementById('creator-recorder-hud');
      const ripples = document.querySelectorAll('.cr-ripple');
      
      if (hud) hud.style.display = 'none';
      ripples.forEach(r => r.style.display = 'none');

      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 80);
        });
      });

      try {
        await actionFn();
      } finally {
        if (hud) hud.style.display = 'flex';
        ripples.forEach(r => r.style.display = '');
      }
    }

    btnSnap?.addEventListener('click', async (e) => {
      e.stopPropagation();
      window.__RECORDER_LOCAL_COUNT__++;
      const countEl = hud.querySelector('#cr-step-count');
      if (countEl) countEl.textContent = String(window.__RECORDER_LOCAL_COUNT__);

      await captureWithCleanView(async () => {
        await sendToRust('recorder-step', {
          rel_x: 0.5,
          rel_y: 0.5,
          subtitle: 'Captura de pantalla',
          title: 'Paso manual'
        });
      });
    });

    btnUndo?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (window.__RECORDER_LOCAL_COUNT__ > 0) window.__RECORDER_LOCAL_COUNT__--;
      const countEl = hud.querySelector('#cr-step-count');
      if (countEl) countEl.textContent = String(window.__RECORDER_LOCAL_COUNT__);

      await sendToRust('recorder-undo', {});
    });

    btnFinish?.addEventListener('click', async (e) => {
      e.stopPropagation();
      btnFinish.innerHTML = '⚡ Ensamblando...';
      await sendToRust('recorder-finish', {});
    });

    if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
      window.__TAURI__.event.listen('recorder-count-updated', (ev) => {
        try {
          const data = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
          if (data && typeof data.count === 'number') {
            window.__RECORDER_LOCAL_COUNT__ = data.count;
            const countEl = hud.querySelector('#cr-step-count');
            if (countEl) countEl.textContent = String(data.count);
          }
        } catch (e) {}
      });
    }
  }

  function showRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.className = 'cr-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);
  }

  function extractSemanticInfo(el) {
    if (!el) return { subtitle: 'Paso interactivo', title: 'Paso' };
    const interactive = el.closest('button, a, input, select, textarea, [role="button"], [role="link"], label, h1, h2, h3, nav') || el;
    
    let text = (
      interactive.innerText ||
      interactive.getAttribute('aria-label') ||
      interactive.placeholder ||
      interactive.title ||
      interactive.value ||
      interactive.getAttribute('alt') ||
      ''
    ).trim().replace(/\s+/g, ' ');

    if (text.length > 50) text = text.substring(0, 47) + '...';

    let actionText = text ? `Haz clic en "${text}"` : `Interactúa con la página`;
    let titleText = text || 'Paso interactivo';
    return { subtitle: actionText, title: titleText };
  }

  document.addEventListener('pointerdown', async (e) => {
    if (e.target && e.target.closest && e.target.closest('#creator-recorder-hud')) return;
    if (window.__RECORDER_PAUSED__) return;

    const now = Date.now();
    if (now - window.__RECORDER_LAST_CLICK_TIME__ < 350) return;
    window.__RECORDER_LAST_CLICK_TIME__ = now;

    const relX = Math.max(0, Math.min(1, e.clientX / window.innerWidth));
    const relY = Math.max(0, Math.min(1, e.clientY / window.innerHeight));
    const { subtitle, title } = extractSemanticInfo(e.target);

    window.__RECORDER_LOCAL_COUNT__++;
    const countEl = document.getElementById('cr-step-count');
    if (countEl) countEl.textContent = String(window.__RECORDER_LOCAL_COUNT__);

    const clickX = e.clientX;
    const clickY = e.clientY;

    const hud = document.getElementById('creator-recorder-hud');
    if (hud) hud.style.display = 'none';

    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 80);
      });
    });

    try {
      await sendToRust('recorder-step', {
        rel_x: relX,
        rel_y: relY,
        subtitle: subtitle,
        title: title
      });
    } finally {
      if (hud) hud.style.display = 'flex';
      showRipple(clickX, clickY);
    }
    console.log('[CreatorRecorder] Click limpio capturado y enviado a Rust:', relX, relY);
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHUD);
  } else {
    initHUD();
  }
})();
"#;

fn get_app_root() -> PathBuf {
    let current = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if current.ends_with("src-tauri") {
        current.parent().unwrap_or(&current).to_path_buf()
    } else {
        current
    }
}

#[cfg(target_os = "windows")]
fn capture_window_to_file(hwnd_val: isize, dest_path: &Path) -> Result<(), String> {
    use windows_sys::Win32::Foundation::*;
    use windows_sys::Win32::Graphics::Gdi::*;
    use windows_sys::Win32::UI::WindowsAndMessaging::*;

    let hwnd = hwnd_val as HWND;
    unsafe {
        let mut client_rect: RECT = std::mem::zeroed();
        GetClientRect(hwnd, &mut client_rect);
        let mut width = client_rect.right - client_rect.left;
        let mut height = client_rect.bottom - client_rect.top;

        if width <= 0 || height <= 0 {
            GetWindowRect(hwnd, &mut client_rect);
            width = client_rect.right - client_rect.left;
            height = client_rect.bottom - client_rect.top;
        }

        if width <= 0 || height <= 0 {
            return Err("Dimensiones de ventana inválidas para captura".to_string());
        }

        let mut pt = POINT { x: 0, y: 0 };
        ClientToScreen(hwnd, &mut pt);
        let screen_x = pt.x;
        let screen_y = pt.y;

        let hdc_screen = GetDC(std::ptr::null_mut());
        if hdc_screen.is_null() {
            return Err("No se pudo obtener el DC de la pantalla".to_string());
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let hbitmap = CreateCompatibleBitmap(hdc_screen, width, height);
        let old_bmp = SelectObject(hdc_mem, hbitmap);

        const CAPTUREBLT_FLAG: u32 = 0x40000000;
        BitBlt(
            hdc_mem,
            0,
            0,
            width,
            height,
            hdc_screen,
            screen_x,
            screen_y,
            SRCCOPY | CAPTUREBLT_FLAG,
        );

        let mut bi: BITMAPINFO = std::mem::zeroed();
        bi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bi.bmiHeader.biWidth = width;
        bi.bmiHeader.biHeight = -height;
        bi.bmiHeader.biPlanes = 1;
        bi.bmiHeader.biBitCount = 32;
        bi.bmiHeader.biCompression = BI_RGB;

        let mut raw_pixels = vec![0u8; (width * height * 4) as usize];
        let lines = GetDIBits(
            hdc_mem,
            hbitmap,
            0,
            height as u32,
            raw_pixels.as_mut_ptr() as *mut _,
            &mut bi,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, old_bmp);
        DeleteObject(hbitmap);
        DeleteDC(hdc_mem);
        ReleaseDC(std::ptr::null_mut(), hdc_screen);

        if lines == 0 {
            return Err("Error al extraer DIBits del bitmap".to_string());
        }

        for chunk in raw_pixels.chunks_exact_mut(4) {
            let b = chunk[0];
            let r = chunk[2];
            chunk[0] = r;
            chunk[2] = b;
            chunk[3] = 255;
        }

        image::save_buffer(
            dest_path,
            &raw_pixels,
            width as u32,
            height as u32,
            image::ExtendedColorType::Rgba8,
        ).map_err(|e| format!("Error guardando imagen PNG: {}", e))?;

        println!("[RUST-CAPTURE] ✅ Captura guardada en {:?} ({}x{})", dest_path, width, height);
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
fn capture_window_to_file(_hwnd_val: isize, _dest_path: &Path) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn save_project(project_json: String, file_path: Option<String>) -> Result<String, String> {
    println!("[RUST-IPC] 📥 Recibida petición save_project. Longitud payload: {} bytes", project_json.len());
    let target_path = if let Some(path) = file_path {
        println!("[RUST-IPC] Usando file_path proporcionado: {}", path);
        PathBuf::from(path)
    } else {
        let root = get_app_root();
        let chosen = root.join("public/assets/timeline.json");
        println!("[RUST-IPC] Ruta real de proyecto para timeline.json: {:?}", chosen);
        chosen
    };

    if let Some(parent) = target_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    fs::write(&target_path, &project_json)
        .map_err(|e| {
            println!("[RUST-IPC] ❌ Error al escribir en {:?}: {}", target_path, e);
            format!("Error guardando archivo: {}", e)
        })?;

    println!("[RUST-IPC] ✅ Guardado exitoso en {:?}", target_path);
    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
fn load_project_file(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&file_path);
    let target = if path.is_dir() {
        path.join("project.json")
    } else {
        path
    };

    fs::read_to_string(&target)
        .map_err(|e| format!("Error leyendo archivo {:?}: {}", target, e))
}

#[tauri::command]
fn create_blank_project(project_dir: String, project_title: String) -> Result<String, String> {
    let dir = PathBuf::from(&project_dir);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Error creando carpeta del proyecto: {}", e))?;
    }

    let assets_dir = dir.join("assets");
    let screenshots_dir = assets_dir.join("screenshots");
    let audio_dir = assets_dir.join("audio");

    fs::create_dir_all(&screenshots_dir).map_err(|e| format!("Error creando assets/screenshots: {}", e))?;
    fs::create_dir_all(&audio_dir).map_err(|e| format!("Error creando assets/audio: {}", e))?;

    let root = get_app_root();
    let default_bg = root.join("public/assets/creator_bg.webp");
    let dest_bg = assets_dir.join("creator_bg.webp");
    if default_bg.exists() && !dest_bg.exists() {
        let _ = fs::copy(&default_bg, &dest_bg);
    }

    let initial_json = serde_json::json!({
        "settings": {
            "title": project_title,
            "resolution": { "width": 1920, "height": 1080 },
            "fps": 30,
            "zoomFactor": 1.20,
            "background": "assets/creator_bg.webp",
            "headerStyle": {
                "text": project_title,
                "fontSize": 20,
                "color": "#ffffff",
                "hasShadow": false,
                "shadowColor": "rgba(0, 0, 0, 0.95)",
                "hasBackground": true,
                "backgroundColor": "rgba(15, 23, 42, 0.75)",
                "backgroundPadding": 10,
                "borderRadius": 8
            }
        },
        "steps": [
            {
                "id": "step_intro",
                "type": "section",
                "title": project_title,
                "transcript": project_title,
                "duration": 3000
            }
        ]
    });

    let project_file = dir.join("project.json");
    let formatted = serde_json::to_string_pretty(&initial_json).map_err(|e| e.to_string())?;
    fs::write(&project_file, formatted).map_err(|e| format!("Error escribiendo project.json: {}", e))?;

    Ok(project_file.to_string_lossy().to_string())
}

#[tauri::command]
fn import_step_screenshot(project_dir: String, source_image_path: String) -> Result<String, String> {
    let proj_dir = PathBuf::from(&project_dir);
    let src_path = PathBuf::from(&source_image_path);

    if !src_path.exists() {
        return Err(format!("No existe la imagen de origen: {}", source_image_path));
    }

    let screenshots_dir = proj_dir.join("assets/screenshots");
    let _ = fs::create_dir_all(&screenshots_dir);

    let ext = src_path.extension().and_then(|e| e.to_str()).unwrap_or("png");
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    let dest_filename = format!("screenshot_{}.{}", timestamp, ext);
    let dest_path = screenshots_dir.join(&dest_filename);

    fs::copy(&src_path, &dest_path)
        .map_err(|e| format!("Error copiando imagen a screenshots: {}", e))?;

    let relative_path = format!("assets/screenshots/{}", dest_filename);
    Ok(relative_path)
}

#[tauri::command]
fn set_project_background(project_dir: String, source_bg_path: String) -> Result<String, String> {
    let proj_dir = PathBuf::from(&project_dir);
    let src_path = PathBuf::from(&source_bg_path);

    if !src_path.exists() {
        return Err(format!("No existe la imagen de fondo: {}", source_bg_path));
    }

    let assets_dir = proj_dir.join("assets");
    let _ = fs::create_dir_all(&assets_dir);

    let ext = src_path.extension().and_then(|e| e.to_str()).unwrap_or("webp");
    let dest_filename = format!("custom_bg.{}", ext);
    let dest_path = assets_dir.join(&dest_filename);

    fs::copy(&src_path, &dest_path)
        .map_err(|e| format!("Error copiando imagen de fondo: {}", e))?;

    let relative_path = format!("assets/{}", dest_filename);
    Ok(relative_path)
}

#[tauri::command]
fn read_file_as_base64(file_path: String) -> Result<String, String> {
    use std::io::Read;
    let mut file = fs::File::open(&file_path).map_err(|e| format!("Error abriendo archivo {:?}: {}", file_path, e))?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| format!("Error leyendo bytes: {}", e))?;
    
    let b64 = base64_encode(&buffer);
    let ext = Path::new(&file_path).extension().and_then(|e| e.to_str()).unwrap_or("png").to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    };
    Ok(format!("data:{};base64,{}", mime, b64))
}

fn base64_encode(data: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;

        out.push(CHARSET[((triple >> 18) & 63) as usize] as char);
        out.push(CHARSET[((triple >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            out.push(CHARSET[((triple >> 6) & 63) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(CHARSET[(triple & 63) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

#[tauri::command]
async fn start_web_recorder(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    project_dir: String,
    project_title: String,
) -> Result<(), String> {
    let dir = PathBuf::from(&project_dir);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Error creando carpeta del proyecto: {}", e))?;
    }

    let assets_dir = dir.join("assets");
    let screenshots_dir = assets_dir.join("screenshots");
    let _ = fs::create_dir_all(&screenshots_dir);

    let root = get_app_root();
    let default_bg = root.join("public/assets/creator_bg.webp");
    let dest_bg = assets_dir.join("creator_bg.webp");
    if default_bg.exists() && !dest_bg.exists() {
        let _ = fs::copy(&default_bg, &dest_bg);
    }

    {
        let mut sess = state.session.lock().unwrap();
        sess.is_active = true;
        sess.project_dir = project_dir.clone();
        sess.project_title = project_title.clone();
        sess.steps.clear();
    }

    let parsed_url_str = if url.starts_with("http://") || url.starts_with("https://") {
        url
    } else {
        format!("https://{}", url)
    };

    let webview_url = WebviewUrl::External(
        parsed_url_str.parse().map_err(|e| format!("URL inválida: {}", e))?
    );

    if let Some(existing) = app.get_webview_window("web_recorder") {
        let _ = existing.close();
    }

    let builder = WebviewWindowBuilder::new(&app, "web_recorder", webview_url)
        .title(format!("Grabación Web — {}", project_title))
        .inner_size(1540.0, 900.0)
        .min_inner_size(1024.0, 600.0)
        .initialization_script(INJECTED_RECORDER_SCRIPT);

    builder.build().map_err(|e| format!("Error creando ventana de grabación: {}", e))?;

    Ok(())
}

#[derive(serde::Deserialize, serde::Serialize, Clone, Debug)]
#[allow(non_snake_case)]
struct RecorderStepPayload {
    #[serde(default)]
    rel_x: Option<f64>,
    #[serde(default)]
    relX: Option<f64>,
    #[serde(default)]
    rel_y: Option<f64>,
    #[serde(default)]
    relY: Option<f64>,
    #[serde(default)]
    subtitle: Option<String>,
    #[serde(default)]
    title: Option<String>,
}

fn do_record_web_step(
    app: &AppHandle,
    state: &AppState,
    rel_x: f64,
    rel_y: f64,
    subtitle: String,
    title: String,
) -> Result<usize, String> {
    let (project_dir, step_num) = {
        let sess = state.session.lock().unwrap();
        if !sess.is_active {
            return Err("No hay una sesión de grabación activa".to_string());
        }
        (sess.project_dir.clone(), sess.steps.len() + 1)
    };

    let filename = format!("screenshot_step_{}.png", step_num);
    let target_path = PathBuf::from(&project_dir).join("assets/screenshots").join(&filename);

    if let Some(win) = app.get_webview_window("web_recorder") {
        #[cfg(target_os = "windows")]
        {
            let hwnd = win.hwnd().map_err(|e| format!("Error obteniendo HWND: {}", e))?;
            capture_window_to_file(hwnd.0 as isize, &target_path)?;
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = std::fs::write(&target_path, b"");
        }
    } else {
        return Err("No se encontró la ventana de grabación".to_string());
    }

    let rel_screenshot_path = format!("assets/screenshots/{}", filename);
    let mut sess = state.session.lock().unwrap();
    sess.steps.push(RecordedStep {
        id: format!("step_{}", step_num),
        title: if title.trim().is_empty() { format!("Paso {}", step_num) } else { title },
        transcript: subtitle,
        screenshot: rel_screenshot_path,
        cursor_x: rel_x,
        cursor_y: rel_y,
        duration: 3000,
    });

    println!("[RUST-RECORDER] ✅ Paso {} guardado con éxito (Total: {})", step_num, sess.steps.len());
    Ok(sess.steps.len())
}

fn do_undo_last_web_step(state: &AppState) -> Result<usize, String> {
    let mut sess = state.session.lock().unwrap();
    if !sess.steps.is_empty() {
        let removed = sess.steps.pop().unwrap();
        let path = PathBuf::from(&sess.project_dir).join(&removed.screenshot);
        let _ = fs::remove_file(path);
        println!("[RUST-RECORDER] ↩ Paso deshecho (Quedan: {})", sess.steps.len());
    }
    Ok(sess.steps.len())
}

fn do_finish_web_recorder(app: &AppHandle, state: &AppState) -> Result<String, String> {
    let (project_dir, project_title, steps) = {
        let mut sess = state.session.lock().unwrap();
        if !sess.is_active {
            return Err("No hay sesión activa".to_string());
        }
        sess.is_active = false;
        (sess.project_dir.clone(), sess.project_title.clone(), sess.steps.clone())
    };

    if let Some(win) = app.get_webview_window("web_recorder") {
        let _ = win.close();
    }

    let steps_json = if steps.is_empty() {
        vec![serde_json::json!({
            "id": "step_intro",
            "type": "section",
            "title": project_title,
            "transcript": project_title,
            "duration": 3000,
            "marks": []
        })]
    } else {
        steps.into_iter().map(|s| {
            let words: Vec<&str> = s.transcript.split_whitespace().collect();
            let word_count = words.len().max(1);
            let total_speech_ms = 2200;
            let time_per_word = (total_speech_ms / word_count).max(150);
            let mut marks = Vec::new();
            let mut curr = 200;
            for w in words {
                let end = curr + time_per_word;
                marks.push(serde_json::json!({
                    "text": w,
                    "startMs": curr,
                    "endMs": end
                }));
                curr = end;
            }

            serde_json::json!({
                "id": s.id,
                "type": "click",
                "title": s.title,
                "transcript": s.transcript,
                "screenshot": s.screenshot.replace('\\', "/"),
                "clickCoords": {
                    "x": s.cursor_x,
                    "y": s.cursor_y
                },
                "cursorPosition": {
                    "x": s.cursor_x,
                    "y": s.cursor_y
                },
                "enableZoom": true,
                "duration": s.duration,
                "marks": marks
            })
        }).collect()
    };

    let project_data = serde_json::json!({
        "settings": {
            "title": project_title,
            "resolution": { "width": 1920, "height": 1080 },
            "fps": 30,
            "zoomFactor": 1.20,
            "background": "assets/creator_bg.webp",
            "headerStyle": {
                "text": project_title,
                "fontSize": 20,
                "color": "#ffffff",
                "hasShadow": false,
                "shadowColor": "rgba(0, 0, 0, 0.95)",
                "hasBackground": true,
                "backgroundColor": "rgba(15, 23, 42, 0.75)",
                "backgroundPadding": 10,
                "borderRadius": 8
            }
        },
        "steps": steps_json
    });

    let project_file = PathBuf::from(&project_dir).join("project.json");
    let formatted = serde_json::to_string_pretty(&project_data).map_err(|e| e.to_string())?;
    fs::write(&project_file, formatted).map_err(|e| format!("Error guardando project.json: {}", e))?;

    let file_path_str = project_file.to_string_lossy().to_string();

    println!("[RUST-RECORDER] ✨ Proyecto web finalizado y ensamblado en: {}", file_path_str);
    let _ = app.emit("web-recorder-finished", serde_json::json!({
        "projectFile": file_path_str,
        "projectDir": project_dir
    }));

    Ok(file_path_str)
}

#[tauri::command]
async fn start_render_job(app: AppHandle, project_dir: Option<String>, output_path: Option<String>) -> Result<String, String> {
    let (tx, rx) = std::sync::mpsc::channel();

    std::thread::spawn(move || {
        let candidate_paths = vec![
            app.path().resource_dir().ok().map(|p| p.join("render_engine.py")),
            app.path().resource_dir().ok().map(|p| p.join("_up_").join("render_engine.py")),
            std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.join("render_engine.py"))),
            Some(get_app_root().join("render_engine.py")),
            std::env::current_exe().ok().and_then(|p| p.parent().and_then(|d| d.parent()).and_then(|d| d.parent()).map(|d| d.join("render_engine.py"))),
        ];

        let mut script_path: Option<PathBuf> = None;
        for cand in candidate_paths.into_iter().flatten() {
            if cand.exists() {
                script_path = Some(cand);
                break;
            }
        }

        let script_path = script_path.unwrap_or_else(|| get_app_root().join("render_engine.py"));
        println!("[RUST-RENDER] Localizado renderizador en: {:?}", script_path);

        let working_dir = script_path.parent().unwrap_or_else(|| Path::new("."));

        let (mut cmd, used_uv) = {
            let uv_check = Command::new("uv").arg("--version").output();
            if uv_check.is_ok() && uv_check.unwrap().status.success() {
                let mut c = Command::new("uv");
                c.arg("run").arg("--with").arg("pillow").arg("python").arg("-u").arg(&script_path);
                (c, true)
            } else {
                let mut c = Command::new("python");
                c.arg("-u").arg(&script_path);
                (c, false)
            }
        };

        cmd.env("PYTHONUNBUFFERED", "1");

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        if let Some(ref p_dir) = project_dir {
            if !p_dir.trim().is_empty() {
                cmd.arg("--project-dir").arg(p_dir);
            }
        }

        if let Some(ref out) = output_path {
            if !out.trim().is_empty() {
                cmd.arg("--output").arg(out);
            }
        }

        cmd.current_dir(working_dir);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        println!("[RUST-RENDER] Modo de ejecución: {}", if used_uv { "⚡ UV Ultra-Fast" } else { "Standard Python" });

        let child_res = cmd.spawn();
        if let Err(e) = child_res {
            let _ = tx.send(Err(format!("Error iniciando proceso de renderizado: {}", e)));
            return;
        }
        let mut child = child_res.unwrap();

        let stdout_handle = if let Some(stdout) = child.stdout.take() {
            let app_clone = app.clone();
            Some(std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines().flatten() {
                    println!("[PY-RENDER] {}", line);
                    if line.contains("[PROGRESO]") {
                        let _ = app_clone.emit("render-progress", line.clone());
                    }
                }
            }))
        } else {
            None
        };

        let stderr_handle = if let Some(stderr) = child.stderr.take() {
            Some(std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                let mut err_lines = Vec::new();
                for line in reader.lines().flatten() {
                    println!("[PY-ERR] {}", line);
                    err_lines.push(line);
                }
                err_lines.join("\n")
            }))
        } else {
            None
        };

        let status_res = child.wait();
        if let Err(e) = status_res {
            let _ = tx.send(Err(format!("Error esperando renderizado: {}", e)));
            return;
        }
        let status = status_res.unwrap();

        if let Some(h) = stdout_handle {
            let _ = h.join();
        }
        let stderr_output = stderr_handle.and_then(|h| h.join().ok()).unwrap_or_default();

        if status.success() {
            let final_dest = output_path.unwrap_or_else(|| {
                if let Some(ref p_dir) = project_dir {
                    PathBuf::from(p_dir).join("output_tutorial.mp4").to_string_lossy().to_string()
                } else {
                    working_dir.join("output_tutorial.mp4").to_string_lossy().to_string()
                }
            });
            let _ = app.emit("render-progress", "[PROGRESO] 100% Finalizado con éxito");
            let _ = tx.send(Ok(format!("Video generado con éxito en: {}", final_dest)));
        } else {
            println!("[RUST-RENDER] ❌ Error en render:\n{}", stderr_output);
            let _ = tx.send(Err(format!("Error en el renderizador: {}", stderr_output)));
        }
    });

    rx.recv().map_err(|e| format!("Error en canal de renderizado: {}", e))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AppState::default())
    .plugin(tauri_plugin_log::Builder::default().build())
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
        use tauri::Listener;
        let app_handle = app.handle().clone();

        let h_step = app_handle.clone();
        app.listen("recorder-step", move |event| {
            let payload_str = event.payload();
            println!("[RUST-RECORDER-EVENT] recorder-step recibido: {}", payload_str);
            let parsed: Result<RecorderStepPayload, _> = serde_json::from_str(payload_str);
            let (rx, ry, sub, tit) = match parsed {
                Ok(data) => (
                    data.rel_x.or(data.relX).unwrap_or(0.5),
                    data.rel_y.or(data.relY).unwrap_or(0.5),
                    data.subtitle.unwrap_or_else(|| "Paso interactivo".to_string()),
                    data.title.unwrap_or_else(|| "Paso".to_string()),
                ),
                Err(_) => (0.5, 0.5, "Paso interactivo".to_string(), "Paso".to_string()),
            };

            let state: tauri::State<AppState> = h_step.state();
            match do_record_web_step(&h_step, &state, rx, ry, sub, tit) {
                Ok(count) => {
                    let _ = h_step.emit("recorder-count-updated", serde_json::json!({ "count": count }));
                }
                Err(e) => {
                    eprintln!("[RUST-RECORDER-ERR] Error al grabar paso: {}", e);
                }
            }
        });

        let h_undo = app_handle.clone();
        app.listen("recorder-undo", move |_| {
            println!("[RUST-RECORDER-EVENT] recorder-undo recibido");
            let state: tauri::State<AppState> = h_undo.state();
            if let Ok(count) = do_undo_last_web_step(&state) {
                let _ = h_undo.emit("recorder-count-updated", serde_json::json!({ "count": count }));
            }
        });

        let h_finish = app_handle.clone();
        app.listen("recorder-finish", move |_| {
            println!("[RUST-RECORDER-EVENT] recorder-finish recibido");
            let state: tauri::State<AppState> = h_finish.state();
            let _ = do_finish_web_recorder(&h_finish, &state);
        });

        Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        save_project,
        load_project_file,
        create_blank_project,
        import_step_screenshot,
        set_project_background,
        read_file_as_base64,
        start_render_job,
        start_web_recorder
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}


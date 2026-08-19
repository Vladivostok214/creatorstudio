use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

fn get_app_root() -> PathBuf {
    let current = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if current.ends_with("src-tauri") {
        current.parent().unwrap_or(&current).to_path_buf()
    } else {
        current
    }
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

    // Copiar fondo por defecto a la carpeta del proyecto si existe
    let root = get_app_root();
    let default_bg = root.join("public/assets/guideless_bg.webp");
    let dest_bg = assets_dir.join("guideless_bg.webp");
    if default_bg.exists() && !dest_bg.exists() {
        let _ = fs::copy(&default_bg, &dest_bg);
    }

    let initial_json = format!(r#"{{
  "settings": {{
    "title": "{}",
    "resolution": {{ "width": 1920, "height": 1080 }},
    "fps": 30,
    "zoomFactor": 1.20,
    "background": "assets/guideless_bg.webp",
    "headerStyle": {{
      "text": "{}",
      "fontSize": 20,
      "color": "#ffffff",
      "hasShadow": false,
      "shadowColor": "rgba(0, 0, 0, 0.95)",
      "hasBackground": true,
      "backgroundColor": "rgba(15, 23, 42, 0.75)",
      "backgroundPadding": 10,
      "borderRadius": 8
    }}
  }},
  "steps": [
    {{
      "id": "step-intro",
      "type": "section",
      "title": "{}",
      "transcript": "{}",
      "duration": 3000
    }}
  ]
}}"#, project_title, project_title, project_title, project_title);

    let project_file = dir.join("project.json");
    fs::write(&project_file, initial_json).map_err(|e| format!("Error escribiendo project.json: {}", e))?;

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
    
    // Codificación simple base64
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
fn check_ffmpeg_installed() -> bool {
    Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

#[tauri::command]
fn start_render_job(app: AppHandle, project_dir: Option<String>, output_path: Option<String>) -> Result<String, String> {
    let root = get_app_root();
    let script_path = root.join("render_engine.py");
    println!("[RUST-RENDER] Iniciando renderizador con alta velocidad (uv/python): {:?}", script_path);

    let (mut cmd, used_uv) = {
        let uv_check = Command::new("uv").arg("--version").output();
        if uv_check.is_ok() && uv_check.unwrap().status.success() {
            let mut c = Command::new("uv");
            c.arg("run").arg("--with").arg("pillow").arg("python").arg(&script_path);
            (c, true)
        } else {
            let mut c = Command::new("python");
            c.arg(&script_path);
            (c, false)
        }
    };

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

    cmd.current_dir(&root);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    println!("[RUST-RENDER] Modo de ejecución: {}", if used_uv { "⚡ UV Ultra-Fast" } else { "Standard Python" });

    let mut child = cmd.spawn().map_err(|e| format!("Error iniciando proceso de renderizado: {}", e))?;

    if let Some(stdout) = child.stdout.take() {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                println!("[PY-RENDER] {}", line);
                if line.contains("[PROGRESO]") {
                    let _ = app_clone.emit("render-progress", line.clone());
                }
            }
        });
    }

    let output = child.wait_with_output().map_err(|e| format!("Error esperando renderizado: {}", e))?;

    if output.status.success() {
        let final_dest = output_path.unwrap_or_else(|| {
            if let Some(ref p_dir) = project_dir {
                PathBuf::from(p_dir).join("output_tutorial.mp4").to_string_lossy().to_string()
            } else {
                root.join("output_tutorial.mp4").to_string_lossy().to_string()
            }
        });
        let _ = app.emit("render-progress", "[PROGRESO] 100% Finalizado con éxito");
        Ok(format!("Video generado con éxito en: {}", final_dest))
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        println!("[RUST-RENDER] ❌ Error en render:\n{}", err_msg);
        Err(format!("Error en el renderizador: {}", err_msg))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().build())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
        save_project,
        load_project_file,
        create_blank_project,
        import_step_screenshot,
        set_project_background,
        read_file_as_base64,
        check_ffmpeg_installed,
        start_render_job
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

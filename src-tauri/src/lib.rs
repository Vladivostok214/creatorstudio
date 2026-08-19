use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

#[tauri::command]
fn save_project(project_json: String, file_path: Option<String>) -> Result<String, String> {
    println!("[RUST-IPC] 📥 Recibida petición save_project. Longitud payload: {} bytes", project_json.len());
    let target_path = if let Some(path) = file_path {
        println!("[RUST-IPC] Usando file_path proporcionado: {}", path);
        PathBuf::from(path)
    } else {
        let current = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        println!("[RUST-IPC] Directorio de ejecución de Rust: {:?}", current);

        // Si current termina en "src-tauri", la raíz del proyecto es su padre ".."
        let root = if current.ends_with("src-tauri") {
            current.parent().unwrap_or(&current).to_path_buf()
        } else {
            current
        };

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
    fs::read_to_string(&file_path)
        .map_err(|e| format!("Error leyendo archivo {}: {}", file_path, e))
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
fn render_frames_to_mp4(
    output_path: String,
    fps: u32,
    images_pattern: String,
    audio_path: Option<String>,
) -> Result<String, String> {
    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y")
       .arg("-framerate")
       .arg(fps.to_string())
       .arg("-i")
       .arg(&images_pattern);

    if let Some(ref audio) = audio_path {
        if !audio.is_empty() {
            cmd.arg("-i").arg(audio).arg("-c:a").arg("aac");
        }
    }

    cmd.arg("-c:v")
       .arg("libx264")
       .arg("-pix_fmt")
       .arg("yuv420p")
       .arg("-crf")
       .arg("18")
       .arg("-preset")
       .arg("fast")
       .arg(&output_path);

    let output = cmd.output().map_err(|e| format!("Fallo al ejecutar ffmpeg: {}", e))?;
    if output.status.success() {
        Ok(format!("Video exportado exitosamente en: {}", output_path))
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("Error en FFmpeg: {}", err_msg))
    }
}

#[tauri::command]
fn start_render_job(app: AppHandle, output_path: Option<String>) -> Result<String, String> {
    let current = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let root = if current.ends_with("src-tauri") {
        current.parent().unwrap_or(&current).to_path_buf()
    } else {
        current
    };

    let script_path = root.join("render_engine.py");
    println!("[RUST-RENDER] Iniciando renderizador con alta velocidad (uv/python): {:?}", script_path);

    // Intentar primero con 'uv run --with pillow python' para máxima aceleración, o fallback a 'python'
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
        let final_dest = output_path.unwrap_or_else(|| root.join("output_tutorial.mp4").to_string_lossy().to_string());
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
        check_ffmpeg_installed,
        render_frames_to_mp4,
        start_render_job
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

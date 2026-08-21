#!/usr/bin/env python3
"""
CREATOR STUDIO VIDEO RENDER ENGINE (V25 Turbo Multi-Project)
- Pixel-Perfect 1:1 Matching con Studio Web DOM
- Máscara redondeada integrada de 12px que corta perfectamente las esquinas de los screenshots
- Centrado tipográfico exacto para el fondo del texto superior (Watermark)
- Transiciones cinematográficas fluidas (Crossfade continuo entre pasos)
"""

import os
import sys
import json
import argparse
import subprocess
import multiprocessing
from concurrent.futures import ProcessPoolExecutor
from PIL import Image, ImageDraw, ImageFont, ImageFilter

parser = argparse.ArgumentParser(description="Creator Studio Render Engine V25")
parser.add_argument("--project-dir", default="", help="Directorio raíz del proyecto a renderizar")
parser.add_argument("--output", default="", help="Ruta del archivo de video MP4 de salida")
args, _ = parser.parse_known_args()

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.abspath(args.project_dir) if args.project_dir else SCRIPT_DIR
PROJECT_ASSETS_DIR = os.path.join(PROJECT_DIR, "assets")
APP_PUBLIC_ASSETS = os.path.join(SCRIPT_DIR, "public", "assets")

OUTPUT_VIDEO_PATH = os.path.abspath(args.output) if args.output else os.path.join(PROJECT_DIR, "tutorial_render.mp4")

TIMELINE_PATH = ""
for candidate in [
    os.path.join(PROJECT_DIR, "project.json"),
    os.path.join(PROJECT_DIR, "timeline.json"),
    os.path.join(PROJECT_ASSETS_DIR, "timeline.json"),
    os.path.join(SCRIPT_DIR, "public", "assets", "timeline.json"),
    os.path.join(SCRIPT_DIR, "timeline.json")
]:
    if os.path.exists(candidate):
        TIMELINE_PATH = candidate
        break

if not TIMELINE_PATH:
    print(f"[ERROR] No se encontró project.json ni timeline.json en {PROJECT_DIR}")
    sys.exit(1)

DEFAULT_SETTINGS = {
    "resolution": {"width": 1920, "height": 1080},
    "fps": 30,
    "theme": "mac_dark",
    "background": "assets/creator_bg.webp",
    "zoomFactor": 1.20,
    "headerStyle": {
        "text": "Tutorial Interactivo",
        "fontSize": 22,
        "color": "#ffffff",
        "hasShadow": False,
        "shadowColor": "rgba(0, 0, 0, 0.95)",
        "hasBackground": True,
        "backgroundColor": "rgba(15, 23, 42, 0.75)",
        "backgroundPadding": 10,
        "borderRadius": 8
    }
}

def load_project():
    with open(TIMELINE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        steps = data
        settings = DEFAULT_SETTINGS
    elif isinstance(data, dict):
        steps = data.get("steps", [])
        settings = {**DEFAULT_SETTINGS, **data.get("settings", {})}
    else:
        steps = []
        settings = DEFAULT_SETTINGS
    return settings, steps

settings, steps = load_project()

CANVAS_W = float(settings.get("resolution", {}).get("width", 1920))
CANVAS_H = float(settings.get("resolution", {}).get("height", 1080))
fps = int(settings.get("fps", 30))
zoom_factor = float(settings.get("zoomFactor", 1.20))
header_style = settings.get("headerStyle", DEFAULT_SETTINGS["headerStyle"])
bg_setting = str(settings.get("background", "assets/creator_bg.webp"))

# Dimensiones exactas del Studio DOM
MOCKUP_W = 1540.0
PAGE_ASPECT_RATIO = 2.1893
VIEWPORT_W = MOCKUP_W
VIEWPORT_H = MOCKUP_W / PAGE_ASPECT_RATIO  # ~703.42px
MOCKUP_HEADER_H = 44.0
MOCKUP_H = VIEWPORT_H + MOCKUP_HEADER_H    # ~747.42px

# Centrado dentro del stage (padding 24px 60px 80px 60px)
AVAIL_CENTER_Y = 24.0 + (1080.0 - 24.0 - 80.0) / 2.0  # 512.0
MOCKUP_PX = (CANVAS_W - MOCKUP_W) / 2.0               # 190.0
MOCKUP_PY = AVAIL_CENTER_Y - (MOCKUP_H / 2.0)          # 138.29

# Timings de timeline
total_duration_ms = 0
step_timings = []
for s in steps:
    start_ms = total_duration_ms
    dur_ms = s.get("duration", 4000)
    end_ms = total_duration_ms + dur_ms
    step_timings.append((start_ms / 1000.0, end_ms / 1000.0))
    total_duration_ms = end_ms

total_duration_sec = total_duration_ms / 1000.0
total_frames = max(1, int(total_duration_sec * fps))

def lerp(v0, v1, t):
    return v0 + (v1 - v0) * t

def ease_out_cubic(t):
    t = max(0.0, min(1.0, t))
    return 1.0 - pow(1.0 - t, 3)

def ease_in_out_cubic(t):
    t = max(0.0, min(1.0, t))
    if t < 0.5:
        return 4.0 * t * t * t
    else:
        return 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0

def parse_rgba(color_str, default=(255, 255, 255, 255)):
    if not color_str:
        return default
    color_str = str(color_str).strip()
    if color_str.startswith("#"):
        hex_val = color_str.lstrip("#")
        if len(hex_val) == 6:
            r = int(hex_val[0:2], 16)
            g = int(hex_val[2:4], 16)
            b = int(hex_val[4:6], 16)
            return (r, g, b, 255)
        elif len(hex_val) == 8:
            r = int(hex_val[0:2], 16)
            g = int(hex_val[2:4], 16)
            b = int(hex_val[4:6], 16)
            a = int(hex_val[6:8], 16)
            return (r, g, b, a)
    elif color_str.startswith("rgba"):
        parts = color_str.replace("rgba(", "").replace(")", "").split(",")
        if len(parts) >= 4:
            r = int(parts[0].strip())
            g = int(parts[1].strip())
            b = int(parts[2].strip())
            a = int(float(parts[3].strip()) * 255)
            return (r, g, b, max(0, min(255, a)))
    elif color_str.startswith("rgb"):
        parts = color_str.replace("rgb(", "").replace(")", "").split(",")
        if len(parts) >= 3:
            r = int(parts[0].strip())
            g = int(parts[1].strip())
            b = int(parts[2].strip())
            return (r, g, b, 255)
    return default

def split_intro_lines(text, font, max_w=1200):
    words = text.split()
    lines = []
    curr = []
    dummy_img = Image.new("RGBA", (1, 1))
    draw_d = ImageDraw.Draw(dummy_img)

    for w in words:
        test_line = " ".join(curr + [w])
        w_test = draw_d.textlength(test_line, font=font)
        if w_test <= max_w:
            curr.append(w)
        else:
            if curr:
                lines.append(" ".join(curr))
            curr = [w]
    if curr:
        lines.append(" ".join(curr))
    return lines

def resolve_asset_path(rel_or_abs):
    if not rel_or_abs:
        return ""
    if os.path.isabs(rel_or_abs) and os.path.exists(rel_or_abs):
        return rel_or_abs
    clean_rel = rel_or_abs.replace("\\", "/").lstrip("/")
    
    # 1. Buscar en assets del proyecto
    cand1 = os.path.join(PROJECT_DIR, clean_rel)
    if os.path.exists(cand1):
        return cand1
    cand2 = os.path.join(PROJECT_ASSETS_DIR, clean_rel)
    if os.path.exists(cand2):
        return cand2
    cand3 = os.path.join(PROJECT_ASSETS_DIR, "screenshots", os.path.basename(clean_rel))
    if os.path.exists(cand3):
        return cand3
    # 2. Buscar en assets de la app engine
    cand4 = os.path.join(APP_PUBLIC_ASSETS, os.path.basename(clean_rel))
    if os.path.exists(cand4):
        return cand4
    return ""

_global_resources = {}

def init_worker():
    # Fuentes tipográficas (Buscar en app y proyecto)
    def find_font(name):
        f1 = os.path.join(PROJECT_ASSETS_DIR, name)
        if os.path.exists(f1): return f1
        f2 = os.path.join(APP_PUBLIC_ASSETS, name)
        if os.path.exists(f2): return f2
        return ""

    pjs_bold_path = find_font("PlusJakartaSans-Bold.ttf")
    inter_bold_path = find_font("Inter-Bold.ttf")
    inter_med_path = find_font("Inter-Medium.ttf")

    hdr_fsize = int(header_style.get("fontSize", 22))
    if pjs_bold_path:
        f_intro = ImageFont.truetype(pjs_bold_path, 64)
        f_header = ImageFont.truetype(pjs_bold_path, hdr_fsize)
    else:
        f_intro = ImageFont.truetype("arial.ttf", 64)
        f_header = ImageFont.truetype("arial.ttf", hdr_fsize)

    if inter_med_path:
        f_sub = ImageFont.truetype(inter_med_path, 26)
        f_sub_bold = ImageFont.truetype(inter_bold_path, 26)
        f_addr = ImageFont.truetype(inter_med_path, 12)
    else:
        f_sub = ImageFont.truetype("arial.ttf", 26)
        f_sub_bold = ImageFont.truetype("arial.ttf", 26)
        f_addr = ImageFont.truetype("arial.ttf", 12)

    # Cargar fondo personalizado o fallback
    bg_resolved = resolve_asset_path(bg_setting)
    if not bg_resolved or not os.path.exists(bg_resolved):
        if "guideless_bg" in bg_setting:
            bg_resolved = resolve_asset_path("assets/creator_bg.webp")
    if not bg_resolved or not os.path.exists(bg_resolved):
        bg_resolved = resolve_asset_path("assets/creator_bg.webp")

    if bg_resolved and os.path.exists(bg_resolved):
        bg_grad = Image.open(bg_resolved).convert("RGB").resize((int(CANVAS_W), int(CANVAS_H)), Image.Resampling.LANCZOS)
    else:
        bg_grad = Image.new("RGB", (int(CANVAS_W), int(CANVAS_H)), (15, 23, 42))

    # Pre-calcular la sombra difusa del Mockup (box-shadow: 0 30px 80px rgba(0,0,0,0.85))
    mockup_w_int = int(MOCKUP_W)
    mockup_h_int = int(MOCKUP_H)
    pre_mockup_shadow = Image.new("RGBA", (int(CANVAS_W), int(CANVAS_H)), (0, 0, 0, 0))
    draw_pms = ImageDraw.Draw(pre_mockup_shadow)
    sx1 = int(MOCKUP_PX)
    sy1 = int(MOCKUP_PY) + 30
    sx2 = sx1 + mockup_w_int
    sy2 = sy1 + mockup_h_int
    draw_pms.rounded_rectangle([sx1, sy1, sx2, sy2], radius=12, fill=(0, 0, 0, 217))
    pre_mockup_shadow = pre_mockup_shadow.filter(ImageFilter.GaussianBlur(radius=28))

    # Pre-crear máscara con esquinas redondeadas de 12px para el Mockup completo
    mockup_corner_mask = Image.new("L", (mockup_w_int, mockup_h_int), 0)
    draw_mcm = ImageDraw.Draw(mockup_corner_mask)
    draw_mcm.rounded_rectangle([0, 0, mockup_w_int, mockup_h_int], radius=12, fill=255)

    sc_dict = {}
    for s in steps:
        raw_shot = str(s.get("screenshot") or "")
        shot_path = resolve_asset_path(raw_shot)
        key = raw_shot
        if shot_path and os.path.exists(shot_path):
            sc_dict[key] = Image.open(shot_path).convert("RGBA")
        else:
            sc_dict[key] = Image.new("RGBA", (1920, 877), (240, 240, 240, 255))

    _global_resources["font_intro"] = f_intro
    _global_resources["font_header"] = f_header
    _global_resources["font_sub"] = f_sub
    _global_resources["font_sub_bold"] = f_sub_bold
    _global_resources["font_address"] = f_addr
    _global_resources["bg_gradient"] = bg_grad
    _global_resources["mockup_shadow"] = pre_mockup_shadow
    _global_resources["mockup_corner_mask"] = mockup_corner_mask
    _global_resources["screenshots"] = sc_dict

def render_single_frame(f_idx):
    t = f_idx / float(fps)

    font_intro = _global_resources["font_intro"]
    font_header = _global_resources["font_header"]
    font_sub = _global_resources["font_sub"]
    font_sub_bold = _global_resources["font_sub_bold"]
    font_address = _global_resources["font_address"]
    bg_gradient = _global_resources["bg_gradient"]
    mockup_shadow = _global_resources["mockup_shadow"]
    mockup_corner_mask = _global_resources["mockup_corner_mask"]
    screenshots = _global_resources["screenshots"]

    step_idx = 0
    for i, (start_sec, end_sec) in enumerate(step_timings):
        if start_sec <= t <= end_sec:
            step_idx = i
            break
    else:
        step_idx = len(steps) - 1

    step = steps[step_idx] if steps else {}
    prev_step = steps[step_idx - 1] if step_idx > 0 else None
    t_start, t_end = step_timings[step_idx] if step_timings else (0.0, 1.0)
    t_relative = t - t_start
    t_relative_ms = t_relative * 1000.0

    canvas = bg_gradient.copy()

    # =========================================================================
    # PASO 1 (INTRO CINEMATOGRÁFICA)
    # =========================================================================
    if step.get("type") == "section":
        intro_text = step.get("transcript") or step.get("title") or settings.get("headerStyle", {}).get("text", "")
        title_lines = split_intro_lines(intro_text, font_intro, max_w=1200)

        step_dur = (t_end - t_start)
        p = t_relative / step_dur if step_dur > 0 else 1.0

        fade_in_time = 0.50
        fade_out_time = 0.50

        if t_relative < fade_in_time:
            alpha_norm = ease_out_cubic(t_relative / fade_in_time)
        elif t_relative > (step_dur - fade_out_time):
            alpha_norm = ease_out_cubic((step_dur - t_relative) / fade_out_time)
        else:
            alpha_norm = 1.0

        alpha = int(alpha_norm * 255)

        line_height = 76
        total_text_h = len(title_lines) * line_height
        y_text = (CANVAS_H - total_text_h) / 2.0

        text_layer = Image.new("RGBA", (int(CANVAS_W), int(CANVAS_H)), (0, 0, 0, 0))
        shadow_layer = Image.new("RGBA", (int(CANVAS_W), int(CANVAS_H)), (0, 0, 0, 0))
        draw_txt = ImageDraw.Draw(text_layer)
        draw_shd = ImageDraw.Draw(shadow_layer)

        for line in title_lines:
            line_w = draw_txt.textlength(line, font=font_intro)
            x_text = (CANVAS_W - line_w) / 2.0
            draw_shd.text((x_text, y_text + 10), line, font=font_intro, fill=(0, 0, 0, int(alpha * 0.85)))
            draw_txt.text((x_text, y_text), line, font=font_intro, fill=(255, 255, 255, alpha))
            y_text += line_height

        blurred_shadow = shadow_layer.filter(ImageFilter.GaussianBlur(radius=14))
        canvas.paste(blurred_shadow, (0, 0), blurred_shadow)
        canvas.paste(text_layer, (0, 0), text_layer)

        final_frame = canvas.convert("RGB")
        return f_idx, final_frame.tobytes()

    # =========================================================================
    # PASOS 2+ (MOCKUP STAGE CON TRANSICIÓN FLUIDA Y HEADERSTYLE DINÁMICO)
    # =========================================================================
    
    # 1. Encabezado Superior (.top-right-watermark) - ALINEACIÓN Y CENTRADO EXACTO
    if header_style and header_style.get("text"):
        header_text = str(header_style.get("text", "")).strip()
        if header_text:
            pad_x = int(header_style.get("backgroundPadding", 10))
            pad_y = 6
            radius = int(header_style.get("borderRadius", 8))

            dummy_calc = ImageDraw.Draw(canvas)
            text_w = dummy_calc.textlength(header_text, font=font_header)
            
            # Cálculo de bounding box exacto y métricas de fuente
            bbox = font_header.getbbox(header_text)
            # bbox = (left, top, right, bottom)
            text_glyph_h = (bbox[3] - bbox[1]) if bbox else 22

            box_w = int(text_w + pad_x * 2)
            box_h = int(text_glyph_h + pad_y * 2 + 2)

            box_right = CANVAS_W - 64.0
            box_left = box_right - box_w
            box_top = 32.0
            box_bottom = box_top + box_h

            hdr_overlay = Image.new("RGBA", (int(CANVAS_W), int(CANVAS_H)), (0, 0, 0, 0))
            draw_hdr = ImageDraw.Draw(hdr_overlay)

            # Fondo Rectangular configurable
            has_bg = header_style.get("hasBackground", True)
            if has_bg:
                bg_col = parse_rgba(header_style.get("backgroundColor", "rgba(15, 23, 42, 0.75)"))
                draw_hdr.rounded_rectangle(
                    [box_left, box_top, box_right, box_bottom],
                    radius=radius,
                    fill=bg_col,
                    outline=(255, 255, 255, 38),
                    width=1
                )

            # Centrado vertical perfecto del texto compensando el offset del font glyph
            tx = box_left + pad_x
            ty = box_top + pad_y - (bbox[1] if bbox else 0)

            # Sombra de Texto Reactiva
            has_shadow = bool(header_style.get("hasShadow", False))
            if has_shadow:
                shd_col = parse_rgba(header_style.get("shadowColor", "rgba(0, 0, 0, 0.95)"))
                draw_hdr.text((tx, ty + 2), header_text, font=font_header, fill=shd_col)

            txt_col = parse_rgba(header_style.get("color", "#ffffff"))
            draw_hdr.text((tx, ty), header_text, font=font_header, fill=txt_col)
            canvas.paste(hdr_overlay, (0, 0), hdr_overlay)

    # 2. Mockup Container (1540px x 747.42px)
    mockup_w_int = int(MOCKUP_W)
    mockup_h_int = int(MOCKUP_H)
    header_h_int = int(MOCKUP_HEADER_H)
    page_h_int = int(VIEWPORT_H)
    mockup_img = Image.new("RGBA", (mockup_w_int, mockup_h_int), (30, 41, 59, 255))

    # Cargar captura actual
    raw_shot = str(step.get("screenshot") or "")
    raw_sc = screenshots.get(raw_shot, Image.new("RGBA", (1920, 877), (255, 255, 255, 255)))

    # 3. Transformación CSS de la Captura Actual
    zoom_trigger_sec = 0.70
    has_focus = bool(step.get("boundingBox")) or bool(step.get("clickCoords")) or bool(step.get("cursorPosition"))
    enable_zoom = step.get("enableZoom", True) and step.get("type") != "section" and has_focus

    if not enable_zoom or t_relative < zoom_trigger_sec:
        cur_scale = 1.0
        tx_pct = 0.0
        ty_pct = 0.0
    else:
        vp_scale = zoom_factor
        if step.get("boundingBox"):
            bx = float(step.get("boundingBox", {}).get("x", 0.5))
            by = float(step.get("boundingBox", {}).get("y", 0.5))
            bw = float(step.get("boundingBox", {}).get("width", 0.1))
            bh = float(step.get("boundingBox", {}).get("height", 0.05))
            cx = bx + bw / 2.0
            cy = by + bh / 2.0
        else:
            click = step.get("clickCoords") or step.get("cursorPosition") or {"x": 0.5, "y": 0.5}
            cx = float(click.get("x", 0.5))
            cy = float(click.get("y", 0.5))

        target_tx_pct = (0.5 - cx * vp_scale) * 100.0
        target_ty_pct = (0.5 - cy * vp_scale) * 100.0

        min_limit = (1.0 - vp_scale) * 100.0
        target_tx_pct = max(min_limit, min(0.0, target_tx_pct))
        target_ty_pct = max(min_limit, min(0.0, target_ty_pct))

        zoom_progress = min(1.0, (t_relative - zoom_trigger_sec) / 0.85)
        zoom_eased = ease_out_cubic(zoom_progress)

        tx_pct = lerp(0.0, target_tx_pct, zoom_eased)
        ty_pct = lerp(0.0, target_ty_pct, zoom_eased)
        cur_scale = lerp(1.0, vp_scale, zoom_eased)

    scaled_w = int(mockup_w_int * cur_scale)
    scaled_h = int(page_h_int * cur_scale)

    sc_resized = raw_sc.resize((scaled_w, scaled_h), Image.Resampling.LANCZOS)
    offset_x = int((tx_pct / 100.0) * mockup_w_int)
    offset_y = int((ty_pct / 100.0) * page_h_int)

    viewport_surface = Image.new("RGBA", (mockup_w_int, page_h_int), (11, 15, 25, 255))
    viewport_surface.paste(sc_resized, (offset_x, offset_y))

    # =========================================================================
    # TRANSICIONES FLUIDAS ENTRE PASOS (Crossfade Suave 0.45s)
    # =========================================================================
    crossfade_dur = 0.45
    if step_idx >= 1 and prev_step and prev_step.get("type") != "section" and t_relative < crossfade_dur:
        prev_raw_shot = str(prev_step.get("screenshot") or "")
        prev_sc = screenshots.get(prev_raw_shot)
        if prev_sc:
            # Estado del paso previo con su escala o sin escala
            prev_resized = prev_sc.resize((mockup_w_int, page_h_int), Image.Resampling.LANCZOS)
            prev_fade_surface = Image.new("RGBA", (mockup_w_int, page_h_int), (0, 0, 0, 0))
            prev_fade_surface.paste(prev_resized, (0, 0))
            
            fade_progress = t_relative / crossfade_dur
            alpha_prev = int((1.0 - ease_in_out_cubic(fade_progress)) * 255)
            
            # Aplicar canal alfa suave
            prev_fade_surface.putalpha(Image.new("L", (mockup_w_int, page_h_int), alpha_prev))
            viewport_surface.paste(prev_fade_surface, (0, 0), prev_fade_surface)

    # 4. Cursor y Ripple
    if step.get("type") != "section":
        target_click = step.get("clickCoords") or step.get("cursorPosition") or {"x": 0.5, "y": 0.5}

        if t_relative < zoom_trigger_sec:
            cur_x_norm = 0.50
            cur_y_norm = 0.60
            cur_alpha = 130
        else:
            move_progress = min(1.0, (t_relative - zoom_trigger_sec) / 0.90)
            move_eased = ease_out_cubic(move_progress)

            cur_x_norm = lerp(0.50, float(target_click.get("x", 0.5)), move_eased)
            cur_y_norm = lerp(0.60, float(target_click.get("y", 0.5)), move_eased)
            cur_alpha = int(lerp(130, 255, move_eased))

        cur_vx = int(cur_x_norm * mockup_w_int) - 2
        cur_vy = int(cur_y_norm * page_h_int) - 2

        # Efecto Ripple de clic
        if 1.20 <= t_relative <= 1.85:
            rip_p = (t_relative - 1.20) / 0.65
            rip_r = int(rip_p * 35) + 3
            rip_alpha = int((1.0 - rip_p) * 220)

            draw_vp = ImageDraw.Draw(viewport_surface)
            draw_vp.ellipse(
                [cur_vx - rip_r, cur_vy - rip_r, cur_vx + rip_r, cur_vy + rip_r],
                outline=(59, 130, 246, rip_alpha),
                width=3
            )

        # Cursor Vectorial SVG
        draw_cur = ImageDraw.Draw(viewport_surface)
        poly_arrow = [
            (cur_vx, cur_vy),
            (cur_vx, cur_vy + 22),
            (cur_vx + 6, cur_vy + 16),
            (cur_vx + 14, cur_vy + 16)
        ]

        draw_cur.polygon([(px + 1, py + 4) for px, py in poly_arrow], fill=(0, 0, 0, int(cur_alpha * 0.65)))
        draw_cur.polygon([(px - 1, py - 1) for px, py in poly_arrow], fill=(255, 255, 255, cur_alpha))
        draw_cur.polygon([(px + 1, py + 1) for px, py in poly_arrow], fill=(255, 255, 255, cur_alpha))
        draw_cur.polygon(poly_arrow, fill=(255, 255, 255, cur_alpha), outline=(255, 255, 255, cur_alpha))
        
        inner_poly = [
            (cur_vx + 2, cur_vy + 3),
            (cur_vx + 2, cur_vy + 19),
            (cur_vx + 6, cur_vy + 15),
            (cur_vx + 12, cur_vy + 15)
        ]
        draw_cur.polygon(inner_poly, fill=(0, 0, 0, cur_alpha))

    mockup_img.paste(viewport_surface, (0, header_h_int))

    # 5. Barra Superior Dark (44px)
    header_surface = Image.new("RGBA", (mockup_w_int, header_h_int), (15, 23, 42, 242))
    draw_hdr_bar = ImageDraw.Draw(header_surface)

    # Dots semáforo
    dot_r = 6
    dot_cy = header_h_int // 2
    draw_hdr_bar.ellipse([16, dot_cy - dot_r, 16 + 12, dot_cy + dot_r], fill=(239, 68, 68, 255))
    draw_hdr_bar.ellipse([16 + 12 + 6, dot_cy - dot_r, 16 + 12 + 6 + 12, dot_cy + dot_r], fill=(245, 158, 11, 255))
    draw_hdr_bar.ellipse([16 + (12 + 6) * 2, dot_cy - dot_r, 16 + (12 + 6) * 2 + 12, dot_cy + dot_r], fill=(16, 185, 129, 255))

    # Barra URL
    url_box_w = 480
    url_box_h = 26
    url_box_x = 84
    url_box_y = (header_h_int - url_box_h) // 2
    draw_hdr_bar.rounded_rectangle(
        [url_box_x, url_box_y, url_box_x + url_box_w, url_box_y + url_box_h],
        radius=6,
        fill=(0, 0, 0, 90),
        outline=(255, 255, 255, 15),
        width=1
    )

    page_url = f"🔒 {step.get('pageTitle', 'https://plataforma.com')}"
    draw_hdr_bar.text((url_box_x + 12, url_box_y + 6), page_url, font=font_address, fill=(148, 163, 184, 255))
    draw_hdr_bar.line([(0, header_h_int - 1), (mockup_w_int, header_h_int - 1)], fill=(255, 255, 255, 20), width=1)

    mockup_img.paste(header_surface, (0, 0))

    # 6. Recorte Perfecto de Esquinas (overflow: hidden con radio 12px)
    # Aplicamos la máscara pre-calculada de esquinas redondeadas para que ningún screenshot sobresalga
    mockup_img.putalpha(mockup_corner_mask)

    # 7. Mockup Transform (Posición y Escala por paso) + Fade-in Paso 1
    m_transform = step.get("mockupTransform") or {}
    user_offset_x = float(m_transform.get("offsetX", 0))
    user_offset_y = float(m_transform.get("offsetY", 0))
    user_scale = float(m_transform.get("scale", 1.0))

    base_scale = user_scale
    mockup_alpha_mult = 1.0
    if step_idx == 1 and t_relative < 0.60:
        stage_enter_p = ease_out_cubic(t_relative / 0.60)
        base_scale = lerp(user_scale * 0.96, user_scale, stage_enter_p)
        mockup_alpha_mult = stage_enter_p

    pos_x = int(MOCKUP_PX + user_offset_x)
    pos_y = int(MOCKUP_PY + user_offset_y)

    if base_scale == 1.0:
        canvas.paste(mockup_shadow, (int(user_offset_x), int(user_offset_y)), mockup_shadow)
        if mockup_alpha_mult < 1.0:
            anim_mask = Image.new("L", (mockup_w_int, mockup_h_int), int(255 * mockup_alpha_mult))
            canvas.paste(mockup_img, (pos_x, pos_y), anim_mask)
        else:
            canvas.paste(mockup_img, (pos_x, pos_y), mockup_img)
        
        # Borde exterior 1px
        draw_canv = ImageDraw.Draw(canvas)
        draw_canv.rounded_rectangle(
            [pos_x, pos_y, pos_x + mockup_w_int, pos_y + mockup_h_int],
            radius=12,
            outline=(255, 255, 255, int(31 * mockup_alpha_mult)),
            width=1
        )
    else:
        nw = max(100, int(mockup_w_int * base_scale))
        nh = max(100, int(mockup_h_int * base_scale))
        mockup_scaled = mockup_img.resize((nw, nh), Image.Resampling.LANCZOS)
        
        # Escalar sombra
        shadow_w = int(CANVAS_W * base_scale)
        shadow_h = int(CANVAS_H * base_scale)
        # Posición centrada respecto al offset
        nx = int(pos_x + (mockup_w_int - nw) / 2.0)
        ny = int(pos_y + (mockup_h_int - nh) / 2.0)
        
        canvas.paste(mockup_shadow, (int(user_offset_x), int(user_offset_y)), mockup_shadow)
        if mockup_alpha_mult < 1.0:
            anim_mask = Image.new("L", (nw, nh), int(255 * mockup_alpha_mult))
            canvas.paste(mockup_scaled, (nx, ny), anim_mask)
        else:
            canvas.paste(mockup_scaled, (nx, ny), mockup_scaled)
            
        draw_canv = ImageDraw.Draw(canvas)
        draw_canv.rounded_rectangle(
            [nx, ny, nx + nw, ny + nh],
            radius=int(12 * base_scale),
            outline=(255, 255, 255, int(31 * mockup_alpha_mult)),
            width=1
        )

    # 8. Subtítulos Inferiores (#subtitle-box) con Posición Libre
    transcript = step.get("transcript", "")
    marks = step.get("marks", [])
    if transcript:
        word_gap = 10
        word_widths = []
        if marks:
            for m in marks:
                is_w_act = (m["startMs"] <= t_relative_ms <= m["endMs"])
                f_use = font_sub_bold if is_w_act else font_sub
                word_widths.append(draw_canv.textlength(m["text"], font=f_use))
            total_text_w = sum(word_widths) + word_gap * max(0, len(marks) - 1)
        else:
            total_text_w = draw_canv.textlength(transcript, font=font_sub)

        pad_x = 36
        pad_y = 14
        cap_h = int(26 + pad_y * 2)  # 54px
        cap_w = max(540, int(total_text_w + pad_x * 2))
        
        # Posición configurable (default: centro inferior a 54px del borde)
        sub_pos = step.get("subtitlePos")
        if sub_pos and isinstance(sub_pos, dict):
            cap_x_cnt = int(float(sub_pos.get("x", 0.5)) * CANVAS_W)
            cap_y = int(float(sub_pos.get("y", (CANVAS_H - 54 - cap_h) / CANVAS_H)) * CANVAS_H)
        else:
            cap_x_cnt = int(CANVAS_W // 2)
            cap_y = int(CANVAS_H - 54 - cap_h)

        rect_left = cap_x_cnt - cap_w // 2
        rect_top = cap_y
        rect_right = cap_x_cnt + cap_w // 2
        rect_bottom = cap_y + cap_h

        # Sombra difusa: box-shadow: 0 20px 40px rgba(0,0,0,0.7)
        sub_shadow_layer = Image.new("RGBA", (int(CANVAS_W), int(CANVAS_H)), (0, 0, 0, 0))
        draw_ssl = ImageDraw.Draw(sub_shadow_layer)
        draw_ssl.rectangle([rect_left, rect_top + 20, rect_right, rect_bottom + 20], fill=(0, 0, 0, 178))
        sub_shadow_layer = sub_shadow_layer.filter(ImageFilter.GaussianBlur(radius=18))
        canvas.paste(sub_shadow_layer, (0, 0), sub_shadow_layer)

        # Caja de subtítulo
        sub_bg_color = parse_rgba(settings.get("subtitleBgColor"), default=(15, 23, 42, 242))
        sub_border_rad = int(settings.get("subtitleBorderRadius", 0))

        sub_box_layer = Image.new("RGBA", (int(CANVAS_W), int(CANVAS_H)), (0, 0, 0, 0))
        draw_sbl = ImageDraw.Draw(sub_box_layer)
        if sub_border_rad > 0:
            draw_sbl.rounded_rectangle([rect_left, rect_top, rect_right, rect_bottom], radius=sub_border_rad, fill=sub_bg_color, outline=(255, 255, 255, 38), width=1)
        else:
            draw_sbl.rectangle([rect_left, rect_top, rect_right, rect_bottom], fill=sub_bg_color, outline=(255, 255, 255, 38), width=1)
        canvas.paste(sub_box_layer, (0, 0), sub_box_layer)

        x_curr = cap_x_cnt - total_text_w / 2.0
        y_text = cap_y + pad_y - 2

        sub_txt_color = parse_rgba(settings.get("subtitleTextColor"), default=(255, 255, 255, 255))

        if marks:
            for m_idx, mark in enumerate(marks):
                is_word_active = (mark["startMs"] <= t_relative_ms <= mark["endMs"])
                font_to_use = font_sub_bold if is_word_active else font_sub
                
                if is_word_active:
                    glow_layer = Image.new("RGBA", (int(CANVAS_W), int(CANVAS_H)), (0, 0, 0, 0))
                    draw_glow = ImageDraw.Draw(glow_layer)
                    draw_glow.text((x_curr, y_text), mark["text"], font=font_to_use, fill=(255, 255, 255, 180))
                    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=4))
                    canvas.paste(glow_layer, (0, 0), glow_layer)
                    
                    text_color = (255, 255, 255, 255)
                else:
                    text_color = (sub_txt_color[0], sub_txt_color[1], sub_txt_color[2], 178)

                draw_canv.text((x_curr, y_text), mark["text"], font=font_to_use, fill=text_color)
                x_curr += word_widths[m_idx] + word_gap
        else:
            draw_canv.text((x_curr, y_text), transcript, font=font_sub, fill=sub_txt_color)

    final_frame = canvas.convert("RGB")
    return f_idx, final_frame.tobytes()

def main():
    print("=" * 70)
    print("  CREATOR STUDIO PIXEL-PERFECT MULTI-PROJECT VIDEO RENDER ENGINE (V25)")
    print("=" * 70)
    print(f"[PROYECTO] Directorio: {PROJECT_DIR}")
    print(f"[TIMELINE] Archivo: {TIMELINE_PATH} ({len(steps)} pasos cargados)")
    print(f"[INFO] Duración: {total_duration_sec:.2f}s | FPS: {fps} | Total fotogramas: {total_frames}")
    print(f"[FONDO] Setting: {bg_setting}")
    print(f"[HEADER] Sombra: {header_style.get('hasShadow', False)} | Fondo: {header_style.get('hasBackground', True)}")
    print(f"[SALIDA] Video Destino: {OUTPUT_VIDEO_PATH}")

    num_workers = max(1, multiprocessing.cpu_count() - 1)
    print(f"[TURBO] Acelerando con {num_workers} núcleos de CPU en paralelo.")

    def detect_best_encoder():
        candidates = [
            ("h264_nvenc", ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "19", "-pix_fmt", "yuv420p"]),
            ("h264_qsv", ["-c:v", "h264_qsv", "-global_quality", "20", "-pix_fmt", "nv12"]),
            ("h264_amf", ["-c:v", "h264_amf", "-quality", "speed", "-pix_fmt", "yuv420p"]),
            ("libx264", ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-preset", "faster"]),
        ]
        for name, args in candidates:
            try:
                test_cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", "nullsrc=s=64x64:d=0.1"] + args + ["-f", "null", "-"]
                res = subprocess.run(test_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if res.returncode == 0:
                    return name, args
            except Exception:
                pass
        return "libx264", ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-preset", "faster"]

    enc_name, enc_args = detect_best_encoder()
    print(f"[ENCODER] Motor de codificación seleccionado: {enc_name.upper()} ({'GPU Acelerada' if enc_name != 'libx264' else 'CPU Turbo'})")

    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{int(CANVAS_W)}x{int(CANVAS_H)}",
        "-pix_fmt", "rgb24",
        "-r", str(fps),
        "-i", "-"
    ] + enc_args + [OUTPUT_VIDEO_PATH]

    ffmpeg_proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    chunk_size = num_workers * 4
    all_indices = list(range(total_frames))

    print(f"[RENDER] Transmitiendo fotogramas directamente a FFmpeg...")

    with ProcessPoolExecutor(max_workers=num_workers, initializer=init_worker) as executor:
        for i in range(0, total_frames, chunk_size):
            chunk_indices = all_indices[i:i + chunk_size]
            results = list(executor.map(render_single_frame, chunk_indices))
            results.sort(key=lambda r: r[0])
            for _, raw_bytes in results:
                ffmpeg_proc.stdin.write(raw_bytes)

            progress = min(total_frames, i + chunk_size)
            pct = progress * 100 // total_frames
            print(f"[PROGRESO] {pct}% ({progress}/{total_frames})", flush=True)

    ffmpeg_proc.stdin.close()
    _, stderr = ffmpeg_proc.communicate()

    if ffmpeg_proc.returncode != 0:
        print(f"\n[ERROR] FFmpeg falló: {stderr.decode('utf-8', errors='ignore')}")
    else:
        print(f"\n[OK] Video renderizado exitosamente en: {OUTPUT_VIDEO_PATH}")

if __name__ == "__main__":
    main()

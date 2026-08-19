#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
CREATOR STUDIO PIXEL-PERFECT VIDEO RENDERER (V23 - Smooth Step Crossfade Transitions & Reactive HeaderStyle)
- Emulación 100% matemática y visual del Studio DOM:
  * Transiciones Fluidas entre Pasos (Crossfade):
      - Transición suave de disolución cruzada (0.4s) al cambiar de captura entre pasos continuos.
      - Animación de entrada suave (Scale + Fade-in) de Mockup tras la Intro del Paso 1.
  * Encabezado Superior (HeaderStyle) 100% Reactivo:
      - Sombra condicional estricta: `hasShadow: false` elimina por completo la sombra.
      - Fondo rectangular condicional: `hasBackground`, `backgroundPadding`, `backgroundColor`, `borderRadius`.
      - Medición precisa de texto con `getbbox()` y tamaño `fontSize` dinámico.
  * Aceleración Multiproceso con UV y Pillow.
"""

import os
import sys
import json
import argparse
import subprocess
import multiprocessing
from concurrent.futures import ProcessPoolExecutor
from PIL import Image, ImageDraw, ImageFont, ImageFilter

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

parser = argparse.ArgumentParser()
parser.add_argument("--output", type=str, default="", help="Ruta de salida del video MP4")
args = parser.parse_args()

# Directorios de trabajo
CREATOR_APP_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(CREATOR_APP_DIR, "public")
ASSETS_DIR = os.path.join(PUBLIC_DIR, "assets")
TIMELINE_PATH = os.path.join(ASSETS_DIR, "timeline.json")

OUTPUT_VIDEO_PATH = args.output if args.output else os.path.join(CREATOR_APP_DIR, "output_tutorial.mp4")

DEFAULT_SETTINGS = {
    "resolution": {"width": 1920, "height": 1080},
    "fps": 30,
    "theme": "mac_dark",
    "background": "assets/guideless_bg.webp",
    "zoomFactor": 1.20,
    "clickAnimationDurationMs": 1100,
    "headerStyle": {
        "text": "Encuentra las actividades del libro en PuntajeNacional",
        "fontSize": 20,
        "color": "#ffffff",
        "hasShadow": False,
        "shadowColor": "rgba(0, 0, 0, 0.95)",
        "hasBackground": True,
        "backgroundColor": "rgba(15, 23, 42, 0.75)",
        "backgroundPadding": 10,
        "borderRadius": 8,
    }
}

def load_project():
    if not os.path.exists(TIMELINE_PATH):
        raise FileNotFoundError(f"No se encontró timeline.json en {TIMELINE_PATH}")
    with open(TIMELINE_PATH, 'r', encoding='utf-8') as f:
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

_global_resources = {}

def init_worker():
    pjs_bold_path = os.path.join(ASSETS_DIR, "PlusJakartaSans-Bold.ttf")
    inter_bold_path = os.path.join(ASSETS_DIR, "Inter-Bold.ttf")
    inter_med_path = os.path.join(ASSETS_DIR, "Inter-Medium.ttf")

    hdr_fsize = int(header_style.get("fontSize", 20))
    if os.path.exists(pjs_bold_path):
        f_intro = ImageFont.truetype(pjs_bold_path, 64)
        f_header = ImageFont.truetype(pjs_bold_path, hdr_fsize)
    else:
        f_intro = ImageFont.truetype("arial.ttf", 64)
        f_header = ImageFont.truetype("arial.ttf", hdr_fsize)

    if os.path.exists(inter_med_path):
        f_sub = ImageFont.truetype(inter_med_path, 26)
        f_sub_bold = ImageFont.truetype(inter_bold_path, 26)
        f_addr = ImageFont.truetype(inter_med_path, 12)
    else:
        f_sub = ImageFont.truetype("arial.ttf", 26)
        f_sub_bold = ImageFont.truetype("arial.ttf", 26)
        f_addr = ImageFont.truetype("arial.ttf", 12)

    bg_path = os.path.join(ASSETS_DIR, "guideless_bg.webp")
    if os.path.exists(bg_path):
        bg_grad = Image.open(bg_path).convert("RGB").resize((int(CANVAS_W), int(CANVAS_H)), Image.Resampling.LANCZOS)
    else:
        bg_grad = Image.new("RGB", (int(CANVAS_W), int(CANVAS_H)), (100, 130, 190))

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

    sc_dict = {}
    for s in steps:
        raw_shot = str(s.get("screenshot") or "")
        clean_name = os.path.basename(raw_shot.replace("\\", "/").strip())
        if not clean_name:
            clean_name = "screenshot_1.webp"

        full_shot_path = os.path.join(ASSETS_DIR, clean_name)
        if clean_name not in sc_dict:
            if os.path.exists(full_shot_path):
                sc_dict[clean_name] = Image.open(full_shot_path).convert("RGBA")
            else:
                sc_dict[clean_name] = Image.new("RGBA", (1920, 877), (240, 240, 240, 255))

    _global_resources["font_intro"] = f_intro
    _global_resources["font_header"] = f_header
    _global_resources["font_sub"] = f_sub
    _global_resources["font_sub_bold"] = f_sub_bold
    _global_resources["font_address"] = f_addr
    _global_resources["bg_gradient"] = bg_grad
    _global_resources["mockup_shadow"] = pre_mockup_shadow
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
    screenshots = _global_resources["screenshots"]

    step_idx = 0
    for i, (start_sec, end_sec) in enumerate(step_timings):
        if start_sec <= t <= end_sec:
            step_idx = i
            break
    else:
        step_idx = len(steps) - 1

    step = steps[step_idx]
    prev_step = steps[step_idx - 1] if step_idx > 0 else None
    t_start, t_end = step_timings[step_idx]
    t_relative = t - t_start
    t_relative_ms = t_relative * 1000.0

    canvas = bg_gradient.copy()

    # =========================================================================
    # PASO 1 (INTRO CINEMATOGRÁFICA)
    # =========================================================================
    if step_idx == 0:
        fade_in = min(1.0, t_relative / 0.6)
        alpha = int(fade_in * 255)

        title_text = step.get("transcript") or step.get("title") or "Encuentra las actividades del libro en PuntajeNacional"
        title_lines = split_intro_lines(title_text, font_intro, max_w=1200)

        line_height = 76.0
        total_txt_h = len(title_lines) * line_height
        y_text_start = (CANVAS_H - total_txt_h) / 2.0

        shadow_layer = Image.new("RGBA", (int(CANVAS_W), int(CANVAS_H)), (0, 0, 0, 0))
        draw_shd = ImageDraw.Draw(shadow_layer)

        text_layer = Image.new("RGBA", (int(CANVAS_W), int(CANVAS_H)), (0, 0, 0, 0))
        draw_txt = ImageDraw.Draw(text_layer)

        y_text = y_text_start
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
    
    # 1. Encabezado Superior (.top-right-watermark)
    if header_style and header_style.get("text"):
        header_text = str(header_style.get("text", "")).strip()
        if header_text:
            pad_x = int(header_style.get("backgroundPadding", 10))
            pad_y = 6
            radius = int(header_style.get("borderRadius", 8))

            dummy_calc = ImageDraw.Draw(canvas)
            text_w = dummy_calc.textlength(header_text, font=font_header)
            
            # Obtener altura real de glifos para encajar el fondo de forma justa
            bbox = font_header.getbbox(header_text)
            text_glyph_h = (bbox[3] - bbox[1]) if bbox else 20

            box_w = int(text_w + pad_x * 2)
            box_h = int(text_glyph_h + pad_y * 2 + 4)

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

            tx = box_left + pad_x
            ty = box_top + pad_y - 1.0

            # Sombra de Texto Reactiva: solo si hasShadow es True
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
    clean_name = os.path.basename(raw_shot.replace("\\", "/").strip())
    if not clean_name:
        clean_name = "screenshot_1.webp"
    raw_sc = screenshots.get(clean_name, Image.new("RGBA", (1920, 877), (255, 255, 255, 255)))

    # 3. Transformación CSS de la Captura Actual
    zoom_trigger_sec = 0.70
    enable_zoom = step.get("enableZoom", True) and step.get("type") != "section" and bool(step.get("boundingBox"))

    if not enable_zoom or t_relative < zoom_trigger_sec:
        cur_scale = 1.0
        tx_pct = 0.0
        ty_pct = 0.0
    else:
        vp_scale = zoom_factor
        bx = step["boundingBox"]["x"]
        by = step["boundingBox"]["y"]
        bw = step["boundingBox"]["width"]
        bh = step["boundingBox"]["height"]

        cx = bx + bw / 2.0
        cy = by + bh / 2.0

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
    # TRANSICIONES FLUIDAS ENTRE PASOS (Crossfade 0.4s)
    # =========================================================================
    crossfade_dur = 0.40
    if step_idx > 1 and prev_step and prev_step.get("type") != "section" and t_relative < crossfade_dur:
        # Disolver captura del paso previo sobre la nueva
        prev_raw_shot = str(prev_step.get("screenshot") or "")
        prev_clean_name = os.path.basename(prev_raw_shot.replace("\\", "/").strip())
        if not prev_clean_name:
            prev_clean_name = "screenshot_1.webp"

        prev_sc = screenshots.get(prev_clean_name)
        if prev_sc:
            prev_resized = prev_sc.resize((mockup_w_int, page_h_int), Image.Resampling.LANCZOS)
            prev_fade_surface = Image.new("RGBA", (mockup_w_int, page_h_int), (0, 0, 0, 0))
            prev_fade_surface.paste(prev_resized, (0, 0))
            
            # Opacidad decreciente suave (1.0 -> 0.0)
            fade_progress = t_relative / crossfade_dur
            alpha_prev = int((1.0 - ease_in_out_cubic(fade_progress)) * 255)
            prev_fade_surface.putalpha(Image.new("L", (mockup_w_int, page_h_int), alpha_prev))
            viewport_surface.paste(prev_fade_surface, (0, 0), prev_fade_surface)

    # 4. Cursor y Ripple
    if step.get("type") != "section":
        target_click = step.get("clickCoords", {"x": 0.5, "y": 0.5})

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

    # 6. Mockup Fade-in & Scale tras Paso 1 (.mockup-stage-enter)
    mockup_scale = 1.0
    mockup_alpha_mult = 1.0
    if step_idx == 1 and t_relative < 0.60:
        stage_enter_p = ease_out_cubic(t_relative / 0.60)
        mockup_scale = lerp(0.96, 1.0, stage_enter_p)
        mockup_alpha_mult = stage_enter_p

    mockup_mask = Image.new("L", (mockup_w_int, mockup_h_int), int(255 * mockup_alpha_mult))
    draw_mask = ImageDraw.Draw(mockup_mask)
    draw_mask.rounded_rectangle([0, 0, mockup_w_int, mockup_h_int], radius=12, fill=int(255 * mockup_alpha_mult))

    if mockup_scale == 1.0:
        canvas.paste(mockup_shadow, (0, 0), mockup_shadow)
        canvas.paste(mockup_img, (int(MOCKUP_PX), int(MOCKUP_PY)), mockup_mask)
    else:
        # Escalado suave durante el stage-enter
        nw = int(mockup_w_int * mockup_scale)
        nh = int(mockup_h_int * mockup_scale)
        mockup_scaled = mockup_img.resize((nw, nh), Image.Resampling.LANCZOS)
        mask_scaled = mockup_mask.resize((nw, nh), Image.Resampling.LANCZOS)
        nx = int(CANVAS_W / 2.0 - nw / 2.0)
        ny = int(AVAIL_CENTER_Y - nh / 2.0)
        canvas.paste(mockup_shadow, (0, 0), mockup_shadow)
        canvas.paste(mockup_scaled, (nx, ny), mask_scaled)

    # Borde exterior 1px
    draw_canv = ImageDraw.Draw(canvas)
    draw_canv.rounded_rectangle(
        [int(MOCKUP_PX), int(MOCKUP_PY), int(MOCKUP_PX) + mockup_w_int, int(MOCKUP_PY) + mockup_h_int],
        radius=12,
        outline=(255, 255, 255, int(31 * mockup_alpha_mult)),
        width=1
    )

    # 7. Subtítulos Inferiores (#subtitle-box: bottom 54px, padding 14px 36px, Inter Medium 26px)
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
        sub_box_layer = Image.new("RGBA", (int(CANVAS_W), int(CANVAS_H)), (0, 0, 0, 0))
        draw_sbl = ImageDraw.Draw(sub_box_layer)
        draw_sbl.rectangle([rect_left, rect_top, rect_right, rect_bottom], fill=(15, 23, 42, 242), outline=(255, 255, 255, 38), width=1)
        canvas.paste(sub_box_layer, (0, 0), sub_box_layer)

        x_curr = cap_x_cnt - total_text_w / 2.0
        y_text = cap_y + pad_y - 2

        if marks:
            for m_idx, mark in enumerate(marks):
                is_word_active = (mark["startMs"] <= t_relative_ms <= mark["endMs"])
                font_to_use = font_sub_bold if is_word_active else font_sub
                
                if is_word_active:
                    # Glow blanco: text-shadow: 0 0 12px rgba(255,255,255,0.6)
                    glow_layer = Image.new("RGBA", (int(CANVAS_W), int(CANVAS_H)), (0, 0, 0, 0))
                    draw_glow = ImageDraw.Draw(glow_layer)
                    draw_glow.text((x_curr, y_text), mark["text"], font=font_to_use, fill=(255, 255, 255, 180))
                    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=4))
                    canvas.paste(glow_layer, (0, 0), glow_layer)
                    
                    text_color = (255, 255, 255, 255)
                else:
                    text_color = (255, 255, 255, 178)

                draw_canv.text((x_curr, y_text), mark["text"], font=font_to_use, fill=text_color)
                x_curr += word_widths[m_idx] + word_gap
        else:
            draw_canv.text((x_curr, y_text), transcript, font=font_sub, fill=(255, 255, 255, 255))

    final_frame = canvas.convert("RGB")
    return f_idx, final_frame.tobytes()

def main():
    print("=" * 70)
    print("  CREATOR STUDIO PIXEL-PERFECT VIDEO RENDERER (V23 TRANSITIONS & HEADER)")
    print("=" * 70)
    print(f"[TIMELINE] Cargados {len(steps)} pasos.")
    print(f"[INFO] Duración: {total_duration_sec:.2f}s | FPS: {fps} | Total fotogramas: {total_frames}")
    print(f"[HEADER] Sombra activa: {header_style.get('hasShadow', False)} | Fondo activo: {header_style.get('hasBackground', True)} | FontSize: {header_style.get('fontSize', 20)}px")
    print(f"[SALIDA] Destino: {OUTPUT_VIDEO_PATH}")

    num_workers = max(1, multiprocessing.cpu_count() - 1)
    print(f"[TURBO] Acelerando con {num_workers} núcleos de CPU en paralelo.")

    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{int(CANVAS_W)}x{int(CANVAS_H)}",
        "-pix_fmt", "rgb24",
        "-r", str(fps),
        "-i", "-",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", "17",
        "-preset", "faster",
        OUTPUT_VIDEO_PATH
    ]

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

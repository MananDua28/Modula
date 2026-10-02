import os
import math
from PIL import Image, ImageDraw, ImageFilter

def create_logo(size=1024):
    # Create image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Dimensions
    padding = size * 0.08
    rect = [padding, padding, size - padding, size - padding]
    radius = size * 0.22  # Apple squircle radius

    # Background squircle: Dark Charcoal / Obsidian
    # Gradient or solid sleek dark
    bg_color = (18, 18, 20, 255)
    border_color = (45, 45, 52, 255)

    # Draw rounded background
    draw.rounded_rectangle(rect, radius=radius, fill=bg_color, outline=border_color, width=int(size * 0.012))

    # Center coordinates
    cx, cy = size / 2, size / 2 - size * 0.02

    # Draw geometric minimalist modular planes (Isometric stacked layers)
    # Slab 1 (Bottom layer)
    # Slab 2 (Middle layer)
    # Slab 3 (Top layer)
    # Plus a glowing Canvas Red sync core / aperture

    scale = size * 0.42

    def iso_point(x, y, z):
        # Isometric projection
        px = cx + (x - y) * math.cos(math.radians(30)) * scale
        py = cy + (x + y) * math.sin(math.radians(30)) * scale - z * scale * 0.85
        return (px, py)

    # Function to draw an isometric slab
    def draw_slab(z, thickness, top_color, left_color, right_color, outline_color):
        w = 0.58
        d = 0.58
        
        # Vertices of top face
        p_top = [
            iso_point(0, -d, z + thickness),
            iso_point(w, 0, z + thickness),
            iso_point(0, d, z + thickness),
            iso_point(-w, 0, z + thickness)
        ]
        
        # Vertices of bottom face
        p_bot = [
            iso_point(0, -d, z),
            iso_point(w, 0, z),
            iso_point(0, d, z),
            iso_point(-w, 0, z)
        ]

        # Right face
        right_poly = [p_bot[1], p_top[1], p_top[2], p_bot[2]]
        draw.polygon(right_poly, fill=right_color, outline=outline_color)

        # Left face
        left_poly = [p_bot[3], p_top[3], p_top[2], p_bot[2]]
        draw.polygon(left_poly, fill=left_color, outline=outline_color)

        # Top face
        draw.polygon(p_top, fill=top_color, outline=outline_color)

    # Outlines and colors
    # Bottom slab: Darker slate
    draw_slab(
        z=-0.35, thickness=0.10,
        top_color=(36, 36, 42, 255),
        left_color=(24, 24, 28, 255),
        right_color=(30, 30, 35, 255),
        outline_color=(60, 60, 70, 255)
    )

    # Middle slab: Medium slate with red accent trace
    draw_slab(
        z=-0.12, thickness=0.10,
        top_color=(50, 50, 60, 255),
        left_color=(32, 32, 38, 255),
        right_color=(42, 42, 50, 255),
        outline_color=(75, 75, 88, 255)
    )

    # Top slab: Pure crisp white/silver face
    draw_slab(
        z=0.11, thickness=0.10,
        top_color=(245, 245, 248, 255),
        left_color=(190, 192, 200, 255),
        right_color=(215, 218, 226, 255),
        outline_color=(255, 255, 255, 255)
    )

    # Glowing Canvas Red Sync Core Orb (floating at center top)
    core_x, core_y = iso_point(0, 0, 0.42)
    r_core = size * 0.075

    # Red glow
    glow_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_img)
    glow_draw.ellipse(
        [core_x - r_core * 1.8, core_y - r_core * 1.8, core_x + r_core * 1.8, core_y + r_core * 1.8],
        fill=(225, 63, 43, 85)
    )
    glow_img = glow_img.filter(ImageFilter.GaussianBlur(radius=size * 0.04))
    img.alpha_composite(glow_img)

    # Red Core Circle
    draw = ImageDraw.Draw(img)
    draw.ellipse(
        [core_x - r_core, core_y - r_core, core_x + r_core, core_y + r_core],
        fill=(225, 63, 43, 255),
        outline=(255, 120, 100, 255),
        width=int(size * 0.01)
    )

    # Inner core highlight (subtle specular reflection)
    draw.ellipse(
        [core_x - r_core * 0.4, core_y - r_core * 0.6, core_x + r_core * 0.2, core_y - r_core * 0.1],
        fill=(255, 200, 190, 200)
    )

    return img

def main():
    assets_dir = "/Users/manan_dua/Canvas-Downloader/assets"
    os.makedirs(assets_dir, exist_ok=True)

    # Master 1024x1024
    img1024 = create_logo(1024)
    img1024.save(os.path.join(assets_dir, "icon-1024.png"))
    print("Generated icon-1024.png")

    # 512x512
    img512 = img1024.resize((512, 512), Image.Resampling.LANCZOS)
    img512.save(os.path.join(assets_dir, "icon.png"))
    print("Generated icon.png (512x512)")

    # 256x256
    img256 = img1024.resize((256, 256), Image.Resampling.LANCZOS)
    img256.save(os.path.join(assets_dir, "icon-256.png"))

    # Generate ICO for Windows (contains 16, 32, 48, 64, 128, 256)
    img1024.save(
        os.path.join(assets_dir, "icon.ico"),
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )
    print("Generated icon.ico (Windows)")

    # Generate ICNS for macOS using iconutil
    iconset_dir = os.path.join(assets_dir, "icon.iconset")
    os.makedirs(iconset_dir, exist_ok=True)

    sizes = [16, 32, 64, 128, 256, 512]
    for s in sizes:
        img_s = img1024.resize((s, s), Image.Resampling.LANCZOS)
        img_s.save(os.path.join(iconset_dir, f"icon_{s}x{s}.png"))
        
        s2 = s * 2
        if s2 <= 1024:
            img_s2 = img1024.resize((s2, s2), Image.Resampling.LANCZOS)
            img_s2.save(os.path.join(iconset_dir, f"icon_{s}x{s}@2x.png"))

    # Run iconutil
    cmd = f"iconutil -c icns '{iconset_dir}' -o '{os.path.join(assets_dir, 'icon.icns')}'"
    res = os.system(cmd)
    if res == 0:
        print("Generated icon.icns (macOS)")
        os.system(f"rm -rf '{iconset_dir}'")
    else:
        print("iconutil failed or not available, keeping icon.png")

    # Generate SVG logo for web UI
    svg_content = '''<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="64" height="64" rx="16" fill="#121214"/>
  <rect x="0.5" y="0.5" width="63" height="63" rx="15.5" stroke="#27272A"/>
  <!-- Modular isometric layers -->
  <path d="M32 44L47 35.5L32 27L17 35.5L32 44Z" fill="#24242A" stroke="#3F3F46" stroke-width="1.2"/>
  <path d="M32 37L47 28.5L32 20L17 28.5L32 37Z" fill="#3F3F46" stroke="#52525B" stroke-width="1.2"/>
  <path d="M32 30L47 21.5L32 13L17 21.5L32 30Z" fill="#FAFAFA" stroke="#FFFFFF" stroke-width="1.2"/>
  <!-- Canvas Red Sync Core -->
  <circle cx="32" cy="18" r="4.5" fill="#E13F2B"/>
  <circle cx="32" cy="18" r="6" stroke="#E13F2B" stroke-opacity="0.4" stroke-width="1.5"/>
</svg>'''
    with open(os.path.join(assets_dir, "icon.svg"), "w") as f:
        f.write(svg_content)
    print("Generated icon.svg")

if __name__ == "__main__":
    main()

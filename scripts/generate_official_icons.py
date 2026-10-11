import os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

def generate_official_icons():
    workspace_dir = "/Users/mac/sub restock ping"
    source_img_path = "/Users/mac/.gemini/antigravity/brain/8a103f40-232a-4348-8e00-442b1350550f/.user_uploaded/media_1791744476513.png"

    if not os.path.exists(source_img_path):
        print(f"Error: Source image not found at {source_img_path}")
        return

    src_im = Image.open(source_img_path).convert("RGBA")
    w, h = src_im.size

    # Official RestockPing palette from finalized icon
    pine_green_rgb = (27, 74, 58)  # #1B4A3A
    mint_green_rgb = (138, 224, 189)  # #8AE0BD

    # -------------------------------------------------------------
    # 1. Full-Bleed 1200 x 1200 Master Shopify App Store Icon
    # Shopify requires: 1200x1200px square, NO rounded corners.
    # Shopify's platform automatically applies the squircle mask.
    # -------------------------------------------------------------
    # The symbol (box + radar waves) is situated cleanly in (235, 225, 790, 780)
    symbol_crop = src_im.crop((235, 225, 790, 780)) # 555 x 555
    
    # Target 1200x1200 canvas
    master_1200 = Image.new("RGBA", (1200, 1200), (*pine_green_rgb, 255))
    
    # Scale symbol to occupy ~68% of the canvas (820 x 820 px)
    # This matches Shopify App Store safe-zone guidelines exactly.
    target_symbol_size = 830
    scaled_symbol = symbol_crop.resize((target_symbol_size, target_symbol_size), Image.Resampling.LANCZOS)
    
    paste_x = (1200 - target_symbol_size) // 2
    paste_y = (1200 - target_symbol_size) // 2
    master_1200.paste(scaled_symbol, (paste_x, paste_y))

    # -------------------------------------------------------------
    # 2. Transparent Squircle Icon (1200x1200 & 512x512)
    # For web headers, polaris banner, docs, and transparent contexts
    # -------------------------------------------------------------
    # Create high-precision squircle mask matching user's rounded corners
    arr = np.array(src_im, dtype=np.float32)
    bg_color = np.array([234.0, 234.0, 234.0]) # Off-white background in mockup
    dist_from_bg = np.linalg.norm(arr[:, :, :3] - bg_color, axis=2)
    alpha = np.clip((dist_from_bg - 12) / 20, 0.0, 1.0) * 255.0

    squircle_arr = np.copy(arr)
    squircle_arr[:, :, 3] = alpha
    squircle_img = Image.fromarray(squircle_arr.astype(np.uint8), mode="RGBA")
    
    # Crop to the squircle bounds (170..854) -> 684 x 684
    cropped_squircle = squircle_img.crop((170, 170, 854, 854))
    
    # Pad or resize squircle to standard dimensions
    squircle_1200 = cropped_squircle.resize((1200, 1200), Image.Resampling.LANCZOS)
    squircle_512 = cropped_squircle.resize((512, 512), Image.Resampling.LANCZOS)
    squircle_256 = cropped_squircle.resize((256, 256), Image.Resampling.LANCZOS)
    squircle_64 = cropped_squircle.resize((64, 64), Image.Resampling.LANCZOS)
    squircle_32 = cropped_squircle.resize((32, 32), Image.Resampling.LANCZOS)

    # -------------------------------------------------------------
    # 3. Save Files into Respective Project Locations
    # -------------------------------------------------------------
    dirs_to_ensure = [
        os.path.join(workspace_dir, "public"),
        os.path.join(workspace_dir, "public/listing"),
        os.path.join(workspace_dir, "app-store-assets")
    ]
    for d in dirs_to_ensure:
        os.makedirs(d, exist_ok=True)

    # Shopify App Store listing master (Full-Bleed Square 1200x1200)
    master_1200_path = os.path.join(workspace_dir, "public/listing/app-icon-1200x1200.png")
    master_1200.save(master_1200_path, "PNG", optimize=True)
    print(f"✓ Saved Master Shopify Listing Icon: {master_1200_path}")

    # App Store Assets directory
    app_store_1200_path = os.path.join(workspace_dir, "app-store-assets/app_icon_1200x1200.png")
    master_1200.save(app_store_1200_path, "PNG", optimize=True)
    print(f"✓ Saved App Store Assets Master Icon: {app_store_1200_path}")

    # Transparent squircle variants
    squircle_1200_path = os.path.join(workspace_dir, "public/listing/app-icon-squircle-1200x1200.png")
    squircle_1200.save(squircle_1200_path, "PNG", optimize=True)
    
    app_store_squircle_path = os.path.join(workspace_dir, "app-store-assets/app_icon_squircle_transparent.png")
    squircle_1200.save(app_store_squircle_path, "PNG", optimize=True)

    # Standard public icons (512x512)
    public_icon_path = os.path.join(workspace_dir, "public/app-icon.png")
    squircle_512.save(public_icon_path, "PNG", optimize=True)
    print(f"✓ Saved Public App Icon: {public_icon_path}")

    public_icon_512_path = os.path.join(workspace_dir, "public/app-icon-512.png")
    squircle_512.save(public_icon_512_path, "PNG", optimize=True)

    app_store_512_path = os.path.join(workspace_dir, "app-store-assets/app_icon_512x512.png")
    squircle_512.save(app_store_512_path, "PNG", optimize=True)

    # Favicon PNG
    favicon_32_path = os.path.join(workspace_dir, "public/favicon.png")
    squircle_32.save(favicon_32_path, "PNG")
    print(f"✓ Saved Favicon PNG: {favicon_32_path}")

    # Favicon ICO (Multi-resolution: 16, 32, 48)
    favicon_ico_path = os.path.join(workspace_dir, "public/favicon.ico")
    squircle_img.crop((170, 170, 854, 854)).save(
        favicon_ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)]
    )
    print(f"✓ Saved Favicon ICO: {favicon_ico_path}")

if __name__ == "__main__":
    generate_official_icons()

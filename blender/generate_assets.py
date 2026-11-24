"""
Cozy Village Sim — Modular 3D Asset Pack Generator for Blender 5.x
Run with:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python blender/generate_assets.py

Generates:
  1. public/assets/kit/*.glb     — Reusable modular pieces (bricks, walls, roofs, grass patches, wheat, trees, rocks, etc.)
  2. public/assets/models/*.glb  — Composed village buildings & villagers assembled from the exact same modular primitives.
"""

import math
import os
import random
import bpy
import bmesh
from mathutils import Matrix, Vector

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIT_DIR = os.path.join(ROOT_DIR, "public", "assets", "kit")
MODELS_DIR = os.path.join(ROOT_DIR, "public", "assets", "models")

os.makedirs(KIT_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

# Warm cozy miniature diorama palette (sRGB -> linear conversion handled via helper)
PALETTE = {
    "plaster": (0.94, 0.89, 0.78),
    "plaster_warm": (0.95, 0.85, 0.70),
    "timber_dark": (0.28, 0.17, 0.10),
    "timber_mid": (0.46, 0.29, 0.16),
    "timber_light": (0.65, 0.45, 0.26),
    "brick": (0.72, 0.32, 0.22),
    "brick_dark": (0.55, 0.23, 0.17),
    "stone": (0.58, 0.57, 0.54),
    "stone_dark": (0.40, 0.40, 0.42),
    "stone_light": (0.72, 0.71, 0.67),
    "roof_terracotta": (0.76, 0.31, 0.20),
    "roof_slate": (0.31, 0.39, 0.48),
    "roof_thatch": (0.84, 0.68, 0.30),
    "roof_moss": (0.36, 0.52, 0.28),
    "grass_1": (0.38, 0.64, 0.26),
    "grass_2": (0.48, 0.72, 0.30),
    "flower_yellow": (0.98, 0.84, 0.24),
    "flower_pink": (0.94, 0.48, 0.56),
    "flower_blue": (0.44, 0.72, 0.96),
    "wheat_gold": (0.92, 0.74, 0.24),
    "wheat_stem": (0.78, 0.62, 0.20),
    "pine_1": (0.18, 0.40, 0.23),
    "pine_2": (0.23, 0.49, 0.27),
    "oak_1": (0.31, 0.58, 0.24),
    "oak_2": (0.58, 0.66, 0.22),
    "oak_autumn": (0.85, 0.47, 0.18),
    "iron": (0.24, 0.26, 0.30),
    "ore_gold": (0.82, 0.62, 0.24),
    "water_wood": (0.42, 0.30, 0.20),
    "sail_cloth": (0.96, 0.93, 0.85),
    "skin": (0.95, 0.77, 0.64),
    "tunic_default": (0.34, 0.58, 0.76),
    "window_glow": (1.0, 0.82, 0.42),
    "forge_glow": (1.0, 0.42, 0.08),
    "rope": (0.76, 0.64, 0.42),
}

MATERIALS = {}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def get_mat(name, roughness=0.82, metallic=0.0, emission=0.0):
    key = (name, roughness, metallic, emission)
    if key in MATERIALS:
        return MATERIALS[key]

    mat = bpy.data.materials.new(name=f"mat_{name}")
    if mat.node_tree is None:
        mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    rgb = PALETTE[name]
    lin = (srgb_to_linear(rgb[0]), srgb_to_linear(rgb[1]), srgb_to_linear(rgb[2]), 1.0)
    bsdf.inputs["Base Color"].default_value = lin
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission > 0.0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = lin
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission
    MATERIALS[key] = mat
    return mat


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATERIALS.clear()


def finalize_mesh(obj, mat):
    mesh = obj.data
    for poly in mesh.polygons:
        poly.use_smooth = False
    if len(mesh.materials) == 0:
        mesh.materials.append(mat)
    else:
        mesh.materials[0] = mat
    return obj


def add_box(name, size, loc=(0, 0, 0), rot=(0, 0, 0), mat_name="plaster", bevel=0.0, **mat_kw):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if bevel > 0.0:
        bmesh.ops.bevel(
            bm,
            geom=list(bm.edges),
            offset=bevel,
            segments=1,
            affect="EDGES",
            clamp_overlap=True,
        )
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = Vector(loc)
    obj.rotation_euler = rot
    return finalize_mesh(obj, get_mat(mat_name, **mat_kw))


def add_prism_roof(name, width, depth, height, loc=(0, 0, 0), rot=(0, 0, 0), mat_name="roof_terracotta"):
    """Triangular gable roof centered in X/Y, base at Z=0, ridge along Y."""
    mesh = bpy.data.meshes.new(name)
    hw = width / 2.0
    hd = depth / 2.0
    verts = [
        (-hw, -hd, 0.0),
        (hw, -hd, 0.0),
        (hw, hd, 0.0),
        (-hw, hd, 0.0),
        (0.0, -hd, height),
        (0.0, hd, height),
    ]
    faces = [
        (0, 3, 2, 1),  # bottom
        (0, 1, 4),     # front gable
        (2, 3, 5),     # back gable
        (0, 4, 5, 3),  # left slope
        (1, 2, 5, 4),  # right slope
    ]
    mesh.from_pydata(verts, [], faces)
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = Vector(loc)
    obj.rotation_euler = rot
    return finalize_mesh(obj, get_mat(mat_name, roughness=0.86))


def add_cylinder(name, radius1, radius2, depth, segments=8, loc=(0, 0, 0), rot=(0, 0, 0), mat_name="stone", **mat_kw):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
    )
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = Vector(loc)
    obj.rotation_euler = rot
    return finalize_mesh(obj, get_mat(mat_name, **mat_kw))


def add_icosphere(name, radius, subdivisions=1, scale=(1, 1, 1), loc=(0, 0, 0), rot=(0, 0, 0), mat_name="oak_1", jitter=0.0, seed=0):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    rng = random.Random(seed)
    for v in bm.verts:
        v.co.x *= scale[0]
        v.co.y *= scale[1]
        v.co.z *= scale[2]
        if jitter > 0.0:
            v.co += Vector((
                rng.uniform(-jitter, jitter),
                rng.uniform(-jitter, jitter),
                rng.uniform(-jitter, jitter),
            ))
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = Vector(loc)
    obj.rotation_euler = rot
    return finalize_mesh(obj, get_mat(mat_name))


def export_glb(filepath, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_materials="EXPORT",
    )
    print(f"[Exported] {os.path.relpath(filepath, ROOT_DIR)} ({len(objects)} parts)")


# ==============================================================================
# MODULAR KIT BUILDERS (Reusable building blocks!)
# ==============================================================================

def build_stone_foundation(w=1.35, d=1.25, h=0.22, ox=0.0, oy=0.0, oz=0.0):
    parts = []
    parts.append(add_box("foundation_core", (w, d, h), (ox, oy, oz + h / 2), mat_name="stone", bevel=0.02))
    # Corner chunky bricks
    bw, bd, bh = 0.24, 0.24, h + 0.02
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(
                add_box(
                    "corner_brick",
                    (bw, bd, bh),
                    (ox + sx * (w / 2 - bw / 2 + 0.02), oy + sy * (d / 2 - bd / 2 + 0.02), oz + bh / 2),
                    mat_name="stone_light",
                    bevel=0.015,
                )
            )
    return parts


def build_timber_wall_segment(length=1.2, height=0.85, thickness=0.14, loc=(0, 0, 0), rot_z=0.0, style="plain"):
    """Modular half-timbered wall segment centered in X/Y, bottom at Z=0."""
    parts = []
    c, s = math.cos(rot_z), math.sin(rot_z)

    def place(lx, ly, lz):
        return (
            loc[0] + lx * c - ly * s,
            loc[1] + lx * s + ly * c,
            loc[2] + lz,
        )

    # Plaster body
    parts.append(add_box("wall_plaster", (length, thickness, height), place(0, 0, height / 2), (0, 0, rot_z), "plaster"))
    # Top & bottom beams
    beam_t = thickness + 0.04
    parts.append(add_box("beam_top", (length + 0.04, beam_t, 0.08), place(0, 0, height - 0.04), (0, 0, rot_z), "timber_dark"))
    parts.append(add_box("beam_bot", (length + 0.04, beam_t, 0.08), place(0, 0, 0.04), (0, 0, rot_z), "timber_dark"))
    # Side posts
    for sx in (-1, 1):
        parts.append(add_box("post", (0.09, beam_t, height), place(sx * (length / 2 - 0.04), 0, height / 2), (0, 0, rot_z), "timber_dark"))

    if style == "window":
        win_w, win_h = 0.34, 0.34
        # Glowing pane
        parts.append(add_box("win_pane", (win_w, thickness + 0.03, win_h), place(0, 0, height * 0.54), (0, 0, rot_z), "window_glow", roughness=0.2, emission=1.1))
        # Frame & mullions
        parts.append(add_box("win_sill", (win_w + 0.12, thickness + 0.10, 0.06), place(0, -0.02, height * 0.54 - win_h / 2 - 0.02), (0, 0, rot_z), "timber_mid"))
        parts.append(add_box("win_v", (0.04, thickness + 0.05, win_h), place(0, 0, height * 0.54), (0, 0, rot_z), "timber_dark"))
        parts.append(add_box("win_h", (win_w, thickness + 0.05, 0.04), place(0, 0, height * 0.54), (0, 0, rot_z), "timber_dark"))
    elif style == "door":
        dw, dh = 0.36, 0.58
        parts.append(add_box("door_leaf", (dw, thickness + 0.04, dh), place(0, -0.01, dh / 2 + 0.02), (0, 0, rot_z), "timber_mid"))
        parts.append(add_box("door_frame_t", (dw + 0.10, thickness + 0.07, 0.06), place(0, -0.01, dh + 0.03), (0, 0, rot_z), "timber_dark"))
        parts.append(add_box("door_step", (dw + 0.14, 0.22, 0.08), place(0, -thickness / 2 - 0.08, 0.04), (0, 0, rot_z), "stone_light"))
    else:
        # Decorative timber brace
        parts.append(add_box("mid_post", (0.07, beam_t - 0.01, height), place(0, 0, height / 2), (0, 0, rot_z), "timber_dark"))

    return parts


def build_brick_wall_segment(length=1.1, height=0.75, thickness=0.18, loc=(0, 0, 0), rot_z=0.0):
    parts = []
    c, s = math.cos(rot_z), math.sin(rot_z)

    def place(lx, ly, lz):
        return (loc[0] + lx * c - ly * s, loc[1] + lx * s + ly * c, loc[2] + lz)

    rows = 4
    cols = 4
    bh = height / rows
    bw = length / cols
    for r in range(rows):
        offset = (bw * 0.25) if r % 2 == 1 else -bw * 0.25
        for col in range(cols):
            bx = -length / 2 + bw * (col + 0.5) + offset * 0.45
            mat_name = "brick" if (r + col) % 2 == 0 else "brick_dark"
            parts.append(
                add_box(
                    f"brick_{r}_{col}",
                    (bw * 0.92, thickness, bh * 0.88),
                    place(bx, 0, bh * (r + 0.5)),
                    (0, 0, rot_z),
                    mat_name,
                    bevel=0.01,
                )
            )
    return parts


def build_pitched_roof(w=1.55, d=1.45, h=0.72, ox=0.0, oy=0.0, oz=0.0, mat_name="roof_terracotta", ridge_mat="timber_dark"):
    parts = []
    parts.append(add_prism_roof("roof_body", w, d, h, (ox, oy, oz), mat_name=mat_name))
    # Cozy ridge beam along Y
    parts.append(add_box("roof_ridge", (0.10, d + 0.08, 0.10), (ox, oy, oz + h - 0.02), mat_name=ridge_mat))
    return parts


def build_chimney(ox=0.0, oy=0.0, oz=0.0, h=0.65):
    parts = []
    parts.append(add_box("chimney_shaft", (0.24, 0.24, h), (ox, oy, oz + h / 2), mat_name="brick_dark", bevel=0.015))
    parts.append(add_box("chimney_cap", (0.30, 0.30, 0.08), (ox, oy, oz + h + 0.03), mat_name="stone_light", bevel=0.015))
    return parts


def build_wood_fence(length=1.4, ox=0.0, oy=0.0, oz=0.0, rot_z=0.0):
    parts = []
    c, s = math.cos(rot_z), math.sin(rot_z)

    def place(lx, ly, lz):
        return (ox + lx * c - ly * s, oy + lx * s + ly * c, oz + lz)

    for px in (-length * 0.45, 0.0, length * 0.45):
        parts.append(add_box("fence_post", (0.09, 0.09, 0.44), place(px, 0, 0.22), (0, 0, rot_z), "timber_mid"))
    for rz in (0.16, 0.34):
        parts.append(add_box("fence_rail", (length, 0.05, 0.06), place(0, 0, rz), (0, 0, rot_z), "timber_light"))
    return parts


def build_grass_patch(seed=42):
    rng = random.Random(seed)
    parts = []
    # Stylized grass tufts
    for i in range(9):
        x = rng.uniform(-0.65, 0.65)
        y = rng.uniform(-0.65, 0.65)
        h = rng.uniform(0.16, 0.28)
        mat = "grass_1" if i % 2 == 0 else "grass_2"
        parts.append(
            add_cylinder(
                f"grass_{i}",
                0.045,
                0.005,
                h,
                segments=4,
                loc=(x, y, h / 2),
                rot=(rng.uniform(-0.22, 0.22), rng.uniform(-0.22, 0.22), rng.uniform(0, 6.28)),
                mat_name=mat,
            )
        )
    # Tiny wildflowers
    flower_colors = ["flower_yellow", "flower_pink", "flower_blue"]
    for i in range(4):
        x = rng.uniform(-0.55, 0.55)
        y = rng.uniform(-0.55, 0.55)
        parts.append(add_cylinder(f"stem_{i}", 0.015, 0.015, 0.18, segments=4, loc=(x, y, 0.09), mat_name="grass_1"))
        parts.append(add_icosphere(f"flower_{i}", 0.055, subdivisions=1, loc=(x, y, 0.20), mat_name=flower_colors[i % 3]))
    return parts


def build_wheat_patch(seed=101):
    rng = random.Random(seed)
    parts = []
    # Organized cozy crop rows
    for row in (-0.48, 0.0, 0.48):
        for col in (-0.52, -0.18, 0.18, 0.52):
            jx = rng.uniform(-0.07, 0.07)
            jy = rng.uniform(-0.07, 0.07)
            h = rng.uniform(0.38, 0.52)
            parts.append(
                add_cylinder(
                    "stalk",
                    0.03,
                    0.015,
                    h,
                    segments=5,
                    loc=(col + jx, row + jy, h / 2),
                    rot=(rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), 0),
                    mat_name="wheat_stem",
                )
            )
            parts.append(
                add_icosphere(
                    "head",
                    0.075,
                    subdivisions=1,
                    scale=(0.8, 0.8, 1.5),
                    loc=(col + jx, row + jy, h + 0.02),
                    mat_name="wheat_gold",
                )
            )
    return parts


def build_path_stones(seed=7):
    rng = random.Random(seed)
    parts = []
    coords = [
        (-0.42, -0.35, 0.28, 0.22),
        (0.18, -0.40, 0.32, 0.24),
        (-0.12, 0.05, 0.36, 0.26),
        (0.45, 0.12, 0.24, 0.22),
        (-0.44, 0.38, 0.26, 0.22),
        (0.15, 0.44, 0.30, 0.22),
    ]
    for i, (x, y, sx, sy) in enumerate(coords):
        mat = "stone_light" if i % 2 == 0 else "stone"
        parts.append(
            add_cylinder(
                f"cobble_{i}",
                sx * 0.72,
                sx * 0.62,
                0.05,
                segments=6,
                loc=(x, y, 0.025),
                rot=(0, 0, rng.uniform(0, 6.28)),
                mat_name=mat,
            )
        )
    return parts


def build_tree_pine(seed=11):
    parts = []
    parts.append(add_cylinder("trunk", 0.14, 0.09, 0.65, segments=6, loc=(0, 0, 0.325), mat_name="timber_dark"))
    layers = [
        (0.70, 0.65, 0.80, "pine_1"),
        (0.56, 0.62, 1.22, "pine_2"),
        (0.38, 0.56, 1.62, "pine_1"),
    ]
    for i, (rad, h, z, mat) in enumerate(layers):
        parts.append(add_cylinder(f"cone_{i}", rad, 0.03, h, segments=7, loc=(0, 0, z), rot=(0, 0, i * 0.45), mat_name=mat))
    return parts


def build_tree_oak(seed=23):
    parts = []
    parts.append(add_cylinder("trunk", 0.16, 0.11, 0.80, segments=6, loc=(0, 0, 0.40), mat_name="timber_mid"))
    crowns = [
        (0.0, 0.0, 1.15, 0.55, "oak_1"),
        (0.32, 0.18, 1.02, 0.38, "oak_2"),
        (-0.28, 0.20, 1.06, 0.40, "oak_1"),
        (0.05, -0.30, 1.00, 0.36, "oak_2"),
        (-0.10, 0.05, 1.44, 0.35, "oak_2"),
    ]
    for i, (x, y, z, r, mat) in enumerate(crowns):
        parts.append(add_icosphere(f"crown_{i}", r, subdivisions=1, scale=(1.05, 1.05, 0.85), loc=(x, y, z), mat_name=mat, jitter=0.04, seed=seed + i))
    return parts


def build_rock_cluster(seed=33):
    parts = []
    parts.append(add_icosphere("rock_main", 0.46, subdivisions=1, scale=(1.15, 0.95, 0.72), loc=(0.0, 0.0, 0.24), mat_name="stone_dark", jitter=0.07, seed=seed))
    parts.append(add_icosphere("rock_side", 0.30, subdivisions=1, scale=(1.0, 1.1, 0.78), loc=(0.36, -0.20, 0.16), mat_name="stone", jitter=0.05, seed=seed + 1))
    parts.append(add_icosphere("rock_small", 0.22, subdivisions=1, scale=(1.1, 0.9, 0.65), loc=(-0.34, 0.24, 0.12), mat_name="stone_light", jitter=0.04, seed=seed + 2))
    # Subtle ore veins for the Smith!
    for i, (x, y, z) in enumerate([(0.16, 0.18, 0.42), (-0.18, -0.14, 0.38), (0.38, -0.14, 0.26)]):
        parts.append(add_box(f"ore_{i}", (0.11, 0.11, 0.11), (x, y, z), (0.4, 0.3, i), "ore_gold", roughness=0.35, metallic=0.6))
    return parts


def build_stump():
    parts = []
    parts.append(add_cylinder("stump_body", 0.18, 0.15, 0.24, segments=7, loc=(0, 0, 0.12), mat_name="timber_dark"))
    parts.append(add_cylinder("stump_top", 0.135, 0.135, 0.02, segments=7, loc=(0, 0, 0.245), mat_name="timber_light"))
    return parts


def build_dock_plank():
    parts = []
    for px in (-0.65, 0.65):
        for py in (-0.55, 0.55):
            parts.append(add_cylinder("piling", 0.08, 0.08, 0.95, segments=6, loc=(px, py, -0.22), mat_name="timber_dark"))
    for i in range(6):
        y = -0.68 + i * 0.27
        parts.append(add_box(f"plank_{i}", (1.55, 0.22, 0.08), (0, y, 0.22), mat_name="water_wood" if i % 2 == 0 else "timber_mid"))
    return parts


# ==============================================================================
# COMPOSED COZY BUILDINGS (Assembled from our modular kit!)
# ==============================================================================

def build_modular_house_shell(w, d, wall_h, roof_h, roof_mat="roof_thatch", ox=0.0, oy=0.0, oz=0.0):
    parts = []
    parts.extend(build_stone_foundation(w + 0.10, d + 0.10, 0.20, ox, oy, oz))
    z0 = oz + 0.20
    # 4 modular timber walls
    parts.extend(build_timber_wall_segment(w, wall_h, 0.12, (ox, oy - d / 2, z0), 0.0, style="door"))
    parts.extend(build_timber_wall_segment(w, wall_h, 0.12, (ox, oy + d / 2, z0), math.pi, style="window"))
    parts.extend(build_timber_wall_segment(d, wall_h, 0.12, (ox - w / 2, oy, z0), math.pi / 2, style="window"))
    parts.extend(build_timber_wall_segment(d, wall_h, 0.12, (ox + w / 2, oy, z0), -math.pi / 2, style="plain"))
    # Pitched roof
    parts.extend(build_pitched_roof(w + 0.30, d + 0.30, roof_h, ox, oy, z0 + wall_h - 0.02, mat_name=roof_mat))
    return parts


def export_all_kit_pieces():
    kit_builders = {
        "stone_foundation": lambda: build_stone_foundation(),
        "timber_wall": lambda: build_timber_wall_segment(style="plain"),
        "timber_wall_window": lambda: build_timber_wall_segment(style="window"),
        "timber_wall_door": lambda: build_timber_wall_segment(style="door"),
        "brick_wall": lambda: build_brick_wall_segment(),
        "roof_gable": lambda: build_pitched_roof(mat_name="roof_terracotta"),
        "roof_thatch": lambda: build_pitched_roof(mat_name="roof_thatch"),
        "chimney": lambda: build_chimney(),
        "wood_fence": lambda: build_wood_fence(),
        "dock_plank": lambda: build_dock_plank(),
        "grass_patch": lambda: build_grass_patch(),
        "wheat_patch": lambda: build_wheat_patch(),
        "path_stones": lambda: build_path_stones(),
        "tree_pine": lambda: build_tree_pine(),
        "tree_oak": lambda: build_tree_oak(),
        "rock_cluster": lambda: build_rock_cluster(),
        "stump": lambda: build_stump(),
    }
    for name, fn in kit_builders.items():
        reset_scene()
        objs = fn()
        export_glb(os.path.join(KIT_DIR, f"{name}.glb"), objs)


def build_town_hall():
    parts = []
    # Grand stone base + main hall
    parts.extend(build_modular_house_shell(1.55, 1.45, 0.95, 0.82, roof_mat="roof_terracotta"))
    # Bell cupola on roof
    parts.append(add_box("cupola_base", (0.44, 0.44, 0.36), (0, 0.0, 1.92), mat_name="plaster_warm"))
    for sx in (-0.17, 0.17):
        for sy in (-0.17, 0.17):
            parts.append(add_box("cupola_post", (0.06, 0.06, 0.32), (sx, sy, 2.24), mat_name="timber_dark"))
    parts.append(add_cylinder("bell", 0.10, 0.06, 0.14, segments=8, loc=(0, 0, 2.24), mat_name="ore_gold", roughness=0.3, metallic=0.8))
    parts.append(add_cylinder("cupola_roof", 0.38, 0.02, 0.38, segments=4, loc=(0, 0, 2.56), rot=(0, 0, math.pi / 4), mat_name="roof_slate"))
    parts.extend(build_chimney(0.42, 0.35, 1.45, 0.65))
    return parts


def build_cottage():
    parts = []
    parts.extend(build_modular_house_shell(1.22, 1.12, 0.78, 0.68, roof_mat="roof_thatch"))
    parts.extend(build_chimney(0.32, 0.22, 1.15, 0.55))
    return parts


def build_lumber_hut():
    parts = []
    parts.extend(build_modular_house_shell(1.16, 1.05, 0.72, 0.62, roof_mat="roof_moss", ox=-0.12, oy=0.08))
    # Stacked firewood logs beside hut
    for row in range(3):
        for col in range(3 - row):
            x = 0.62 + (col - (2 - row) * 0.5) * 0.13
            z = 0.08 + row * 0.11
            parts.append(add_cylinder("log", 0.06, 0.06, 0.56, segments=6, loc=(x, -0.05, z), rot=(math.pi / 2, 0, 0), mat_name="timber_mid"))
    # Chopping block
    parts.append(add_cylinder("chop_block", 0.16, 0.15, 0.28, segments=7, loc=(0.56, -0.58, 0.14), mat_name="timber_light"))
    return parts


def build_farmhouse():
    parts = []
    parts.extend(build_modular_house_shell(1.25, 1.15, 0.80, 0.72, roof_mat="roof_terracotta", ox=-0.10, oy=0.05))
    # Hay bales outside
    parts.append(add_box("hay_1", (0.34, 0.26, 0.24), (0.68, 0.10, 0.12), (0, 0, 0.2), "wheat_gold"))
    parts.append(add_box("hay_2", (0.30, 0.24, 0.22), (0.64, -0.22, 0.11), (0, 0, -0.15), "wheat_gold"))
    # Mini fence corner
    parts.extend(build_wood_fence(0.95, 0.15, -0.78, 0.0, 0.0))
    return parts


def build_fishing_dock():
    parts = []
    parts.extend(build_dock_plank())
    # Cozy small timber shelter on back of dock
    parts.append(add_box("shelter_body", (0.76, 0.62, 0.62), (0.0, 0.24, 0.55), mat_name="timber_mid"))
    parts.extend(build_pitched_roof(0.94, 0.78, 0.42, 0.0, 0.24, 0.86, mat_name="roof_slate"))
    # Barrel + fishing crate
    parts.append(add_cylinder("barrel", 0.14, 0.12, 0.30, segments=8, loc=(-0.48, -0.35, 0.41), mat_name="timber_dark"))
    parts.append(add_box("crate", (0.28, 0.24, 0.22), (0.46, -0.36, 0.37), mat_name="timber_light"))
    return parts


def build_smithy():
    parts = []
    parts.extend(build_stone_foundation(1.42, 1.32, 0.22))
    # Chunky brick walls on back & sides
    parts.extend(build_brick_wall_segment(1.30, 0.82, 0.16, (0.0, 0.56, 0.22), 0.0))
    parts.extend(build_brick_wall_segment(1.16, 0.82, 0.16, (-0.58, 0.0, 0.22), math.pi / 2))
    # Open front workshop pillars
    parts.append(add_box("pillar_r", (0.14, 0.14, 0.82), (0.58, -0.52, 0.63), mat_name="timber_dark"))
    parts.append(add_box("pillar_rb", (0.14, 0.14, 0.82), (0.58, 0.52, 0.63), mat_name="timber_dark"))
    # Slate roof
    parts.extend(build_pitched_roof(1.56, 1.46, 0.64, 0.0, 0.0, 1.02, mat_name="roof_slate"))
    # Tall brick furnace chimney + glowing hearth
    parts.extend(build_chimney(-0.34, 0.36, 1.38, 0.82))
    parts.append(add_box("furnace_box", (0.48, 0.40, 0.52), (-0.28, 0.28, 0.48), mat_name="stone_dark"))
    parts.append(add_box("furnace_glow", (0.28, 0.10, 0.24), (-0.28, 0.06, 0.42), mat_name="forge_glow", roughness=0.2, emission=2.2))
    # Iron anvil outside
    parts.append(add_box("anvil_base", (0.22, 0.16, 0.18), (0.24, -0.20, 0.31), mat_name="iron", roughness=0.4, metallic=0.85))
    parts.append(add_box("anvil_top", (0.36, 0.18, 0.10), (0.24, -0.20, 0.44), mat_name="iron", roughness=0.35, metallic=0.9))
    return parts


def build_builder_yard():
    parts = []
    parts.extend(build_stone_foundation(1.42, 1.28, 0.16))
    # Open timber workshop shed
    for sx in (-0.56, 0.56):
        for sy in (-0.48, 0.48):
            parts.append(add_box("post", (0.11, 0.11, 0.84), (sx, sy, 0.58), mat_name="timber_dark"))
    parts.extend(build_pitched_roof(1.46, 1.24, 0.50, 0.0, 0.0, 0.98, mat_name="roof_thatch"))
    # Lumber plank stack & stone blocks
    for i in range(3):
        parts.append(add_box(f"plank_{i}", (0.72, 0.18, 0.07), (-0.16, -0.10, 0.20 + i * 0.08), (0, 0, 0.08), "timber_light"))
    parts.append(add_box("stone_block_1", (0.26, 0.26, 0.24), (0.36, 0.16, 0.28), mat_name="stone_light", bevel=0.015))
    parts.append(add_box("stone_block_2", (0.24, 0.24, 0.22), (0.38, -0.18, 0.27), mat_name="stone", bevel=0.015))
    return parts


def build_well():
    parts = []
    # Stone well ring
    parts.append(add_cylinder("well_base", 0.48, 0.46, 0.46, segments=10, loc=(0, 0, 0.23), mat_name="stone"))
    parts.append(add_cylinder("well_rim", 0.52, 0.52, 0.08, segments=10, loc=(0, 0, 0.48), mat_name="stone_light"))
    # Roof posts & miniature gable
    parts.append(add_box("post_l", (0.08, 0.08, 0.72), (-0.38, 0, 0.80), mat_name="timber_dark"))
    parts.append(add_box("post_r", (0.08, 0.08, 0.72), (0.38, 0, 0.80), mat_name="timber_dark"))
    parts.append(add_cylinder("axle", 0.035, 0.035, 0.78, segments=6, loc=(0, 0, 0.96), rot=(0, math.pi / 2, 0), mat_name="timber_mid"))
    parts.extend(build_pitched_roof(0.98, 0.76, 0.42, 0.0, 0.0, 1.14, mat_name="roof_terracotta"))
    return parts


def build_windmill_base():
    parts = []
    parts.append(add_cylinder("base_stone", 0.68, 0.56, 0.60, segments=8, loc=(0, 0, 0.30), mat_name="stone"))
    parts.append(add_cylinder("tower_plaster", 0.54, 0.40, 1.35, segments=8, loc=(0, 0, 1.26), mat_name="plaster_warm"))
    parts.append(add_cylinder("cap_roof", 0.52, 0.04, 0.58, segments=8, loc=(0, 0, 2.22), mat_name="roof_terracotta"))
    parts.append(add_box("door", (0.28, 0.14, 0.46), (0, -0.58, 0.25), mat_name="timber_mid"))
    # Hub sticking out front (-Y in Blender -> +Z in Three.js)
    parts.append(add_cylinder("hub", 0.09, 0.09, 0.30, segments=8, loc=(0, -0.48, 1.72), rot=(math.pi / 2, 0, 0), mat_name="timber_dark"))
    return parts


def build_windmill_blades():
    """Centered at origin, spinning in XZ plane (around Y in Blender -> Z in Three.js)."""
    parts = []
    parts.append(add_cylinder("center_hub", 0.10, 0.10, 0.12, segments=8, loc=(0, 0, 0), rot=(math.pi / 2, 0, 0), mat_name="timber_dark"))
    for i in range(4):
        ang = i * (math.pi / 2)
        c, s = math.cos(ang), math.sin(ang)
        # Spar
        sx, sz = c * 0.56, s * 0.56
        parts.append(add_box(f"spar_{i}", (1.10, 0.05, 0.06), (sx, 0, sz), (0, -ang, 0), "timber_mid"))
        # Sail cloth slightly offset
        cx = c * 0.64 - s * 0.12
        cz = s * 0.64 + c * 0.12
        parts.append(add_box(f"sail_{i}", (0.82, 0.025, 0.24), (cx, -0.02, cz), (0, -ang, 0), "sail_cloth"))
    return parts


def build_scaffold():
    """Cozy wooden construction site frame shown while Builders hammer a building."""
    parts = []
    parts.extend(build_stone_foundation(1.24, 1.16, 0.14))
    for sx in (-0.54, 0.54):
        for sy in (-0.50, 0.50):
            parts.append(add_box("scaf_post", (0.07, 0.07, 0.92), (sx, sy, 0.46), mat_name="timber_light"))
    for sz in (0.42, 0.84):
        parts.append(add_box("bar_f", (1.14, 0.06, 0.06), (0, -0.50, sz), mat_name="timber_mid"))
        parts.append(add_box("bar_b", (1.14, 0.06, 0.06), (0, 0.50, sz), mat_name="timber_mid"))
        parts.append(add_box("bar_l", (0.06, 1.06, 0.06), (-0.54, 0, sz), mat_name="timber_mid"))
        parts.append(add_box("bar_r", (0.06, 1.06, 0.06), (0.54, 0, sz), mat_name="timber_mid"))
    parts.append(add_box("planks_top", (1.06, 0.36, 0.05), (0, 0, 0.46), mat_name="timber_light"))
    return parts


def build_villager():
    """Cute chunky miniature figurine (tinted per job in Three.js)."""
    parts = []
    # Feet
    parts.append(add_box("foot_l", (0.11, 0.15, 0.08), (-0.08, 0.0, 0.04), mat_name="timber_dark"))
    parts.append(add_box("foot_r", (0.11, 0.15, 0.08), (0.08, 0.0, 0.04), mat_name="timber_dark"))
    # Tunic / body
    parts.append(add_cylinder("tunic", 0.18, 0.13, 0.34, segments=8, loc=(0, 0, 0.25), mat_name="tunic_default"))
    # Head
    parts.append(add_icosphere("head", 0.15, subdivisions=2, loc=(0, 0, 0.53), mat_name="skin"))
    # Little backpack
    parts.append(add_box("pack", (0.18, 0.10, 0.20), (0, 0.16, 0.30), mat_name="timber_mid", bevel=0.02))
    return parts


def export_all_models():
    model_builders = {
        "town_hall": build_town_hall,
        "cottage": build_cottage,
        "lumber_hut": build_lumber_hut,
        "farmhouse": build_farmhouse,
        "fishing_dock": build_fishing_dock,
        "smithy": build_smithy,
        "builder_yard": build_builder_yard,
        "well": build_well,
        "windmill_base": build_windmill_base,
        "windmill_blades": build_windmill_blades,
        "scaffold": build_scaffold,
        "villager": build_villager,
    }
    for name, fn in model_builders.items():
        reset_scene()
        objs = fn()
        export_glb(os.path.join(MODELS_DIR, f"{name}.glb"), objs)


if __name__ == "__main__":
    print("=== Generating Cozy Village Modular Asset Pack ===")
    export_all_kit_pieces()
    export_all_models()
    print("=== All assets generated successfully! ===")

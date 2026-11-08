"""Export the Mule as a phone-weight GLB for the AR preview app.

    H:\\Blender\\blender.exe -b --factory-startup --python ar_preview/export_glb.py

Builds the print-accurate model (build_mule.py) and writes ar_preview/mule.glb at true scale (metres, Y up).
Each viewport gets its own quad (Ad_Top_Front, Ad_Top_Back, Ad_Bottom_Front, Ad_Bottom_Back) with UVs 0..1 over
exactly the visible opening, so the app can drop any artwork onto it; the panels behind are plain white stock.
The quads carry their viewport size in inches as glTF extras (viewport_w_in, viewport_h_in).
"""
import os
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import build_mule as bm_  # noqa: E402
import build_signframe as sf  # noqa: E402

IN = sf.IN
OUT = os.path.join(HERE, "mule.glb")


def ad_quad(name, sy, z0, h):
    """Quad on the outward face of a panel covering the viewport, UV (0,0) bottom-left as seen from outside."""
    me = bpy.data.meshes.new(name)
    b = bmesh.new()
    y = sy * (bm_.PANEL_T + 0.01) * IN
    xl, xr = sy * bm_.VIEW_W / 2, -sy * bm_.VIEW_W / 2       # viewer's left/right (front viewer looks along +Y)
    vs = [b.verts.new((x * IN, y, z * IN)) for x, z in ((xl, z0), (xr, z0), (xr, z0 + h), (xl, z0 + h))]
    f = b.faces.new(vs)
    uvl = b.loops.layers.uv.new("UVMap")
    for loop, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uvl].uv = uv
    bmesh.ops.recalc_face_normals(b, faces=[f])
    if (f.normal.y > 0) != (sy > 0):
        f.normal_flip()
    b.to_mesh(me)
    b.free()
    ob = bpy.data.objects.new(name, me)
    ob["viewport_w_in"], ob["viewport_h_in"] = round(bm_.VIEW_W, 3), round(h, 3)
    m = sf.material(f"AdArt_{name[3:]}", (0.86, 0.86, 0.85), rough=0.35)
    me.materials.append(m)
    bpy.data.collections["Mule"].objects.link(ob)
    return ob


def main():
    bm_.build()
    bpy.data.objects.remove(bpy.data.objects["HW_RetainingBolts"])     # optional bolts, not on a standard Mule
    stock = sf.material("PanelStock", (0.86, 0.86, 0.85), rough=0.45)
    for ob in list(bpy.data.objects):
        if ob.name.startswith("Panel_"):
            ob.data.materials.clear()
            ob.data.materials.append(stock)
    for vp, z0, h in (("Top", bm_.Z_TOP_VIEW, bm_.TOP_VIEW_H), ("Bottom", bm_.Z_BOT_VIEW, bm_.BOT_VIEW_H)):
        for side, sy in (("Front", -1), ("Back", 1)):
            ad_quad(f"Ad_{vp}_{side}", sy, z0, h)
    # procedural bump/bevel nodes do not export; keep the plain PBR values
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    tris = sum(sum(len(p.vertices) - 2 for p in o.evaluated_get(dg).data.polygons)
               for o in bpy.data.objects if o.type == "MESH")
    xs = [(o.matrix_world @ v.co).x for o in bpy.data.objects if o.type == "MESH" for v in o.data.vertices]
    ys = [(o.matrix_world @ v.co).y for o in bpy.data.objects if o.type == "MESH" for v in o.data.vertices]
    zs = [(o.matrix_world @ v.co).z for o in bpy.data.objects if o.type == "MESH" for v in o.data.vertices]
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_yup=True,
                              export_extras=True, export_cameras=False, export_lights=False)
    print(f"GLB {OUT}: {tris} triangles, {os.path.getsize(OUT) / 1e6:.2f} MB, "
          f"{(max(xs) - min(xs)) / IN:.1f} x {(max(ys) - min(ys)) / IN:.1f} x {max(zs) / IN:.1f} in (w x d x h); "
          f"viewports {bm_.VIEW_W:.2f} x {bm_.TOP_VIEW_H:.2f} and {bm_.VIEW_W:.2f} x {bm_.BOT_VIEW_H:.2f} in")


main()

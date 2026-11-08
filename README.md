# The Mule AR Preview

A web app for Android phones. Glenn opens a link in Chrome, stands where the client wants a sign, places a life-size
Mule on the ground, puts the client's ad on it, and snaps a photo to text or email to the client.
No app store and no install. It can be added to the home screen like an app.

**Live:** https://jurglefoogle.github.io/mule-ar/ (GitHub Pages from https://github.com/jurglefoogle/mule-ar,
branch `main`; a push redeploys it in about a minute).

## What it does

- **Place:** point at the ground, then tap. The sign is true size (7.6 ft wide, 6.6 ft tall) and can't be scaled.
- **Turn:** drag a finger sideways across the screen. **Face me** turns the front towards the phone.
  **Move** picks the sign up again.
- **Ads (Adjust):** the samples, or the client's own artwork from the phone (**Client top ad…**, **Client bottom ad…**), on
  both faces or just one. Artwork is cropped to fill the viewport: 84 × 42 in on top and 84 × 13 in on the bottom.
- **Snap:** the white button takes a photo of the camera view with the sign. **Info: on** adds a strip at the bottom
  reading "THE MULE by ASININE SIGNS · asininesigns.com · 918.230.0056". Then **Share** opens Android's share
  sheet (Messages, Gmail, WhatsApp…) and **Save** keeps it on the phone.
- **Light:** if the phone reports the scene's light, the sign takes on its brightness, colour and sun direction,
  and its shadow falls the right way. Otherwise a soft overhead light is used. If the sign still looks too bright
  or too dark next to the real scene, **Adjust → Sign brightness** scales all its lighting (the phone remembers it).
- **Without AR** (a desktop, an iPhone, an older Android phone): a 3D preview where ads can still be tried.

## What the phone needs

- Chrome on Android, with **Google Play Services for AR** (ARCore) installed. Most mid-range and better phones from
  2019 on have it. The list is at https://developers.google.com/ar/devices.
- An internet connection: the 3D library (three.js) loads from a CDN.
- The page must be served over **HTTPS**, or from `localhost`. AR is blocked on plain `http://` addresses.

## Putting it online (pick one)

**Netlify Drop (easiest, free, about 2 minutes)**
1. Go to https://app.netlify.com/drop and sign in.
2. Drag the whole `ar_preview` folder onto the page.
3. You get an `https://….netlify.app` link. Open it in Chrome on the phone, then use ⋮ → *Add to Home screen*.

**GitHub Pages**: push this folder to a repository, then turn on Pages under Settings → Pages (branch `main`,
folder `/`).

## Testing from this PC over USB (no hosting)

1. On the phone, turn on Developer options and then USB debugging, and plug it into the PC.
2. In `ar_preview/`:
   ```
   python -m http.server 8765
   adb reverse tcp:8765 tcp:8765
   ```
3. On the phone, open Chrome at `http://localhost:8765`. Chrome counts localhost as secure, so AR works.

**Debug log:** add `?debug` to the address (e.g. `…/mule-ar/?debug`) to show a small green log panel: whether AR is
supported, which session features the phone granted, and the camera picture size or the error when a snap fails.
Errors also pop up as a message at the bottom, with or without `?debug`.

## Files

| File | What it is |
|---|---|
| `index.html` | The page: home screen, AR controls, photo screen |
| `app.js` | Everything else: three.js scene, WebXR session, ads, photo |
| `mule.glb` | The Mule, exported from the print-accurate model (about 9,100 triangles, 0.3 MB) |
| `export_glb.py` | Rebuilds `mule.glb` from `../build_mule.py` |
| `ads/` | Sample ads, the same ones as in the website video |
| `manifest.webmanifest`, `icon-*.png` | Home-screen icon and name |

To re-export the model after a change to `build_mule.py`, run this from the SignFrame folder (CPU only):

```
H:\Blender\blender.exe -b --factory-startup --python ar_preview/export_glb.py
```

## Known limits and things not yet tried on a real phone

- **Untested on a phone so far.** Only the desktop 3D preview has been tested; AR needs the real device.
- **The photo** uses Chrome's camera-access feature for WebXR. If a phone doesn't offer it, **Snap** says so; take
  an ordinary screenshot instead (Power + Volume down), which captures the sign too. If a photo comes out upside
  down, the camera image's row order differs on that phone; this is a one-line fix in `capture()`.
- People and objects in front of the sign don't hide it (no occlusion). A native ARCore app could add that.
- **Focus is up to Chrome.** WebXR gives a web page no focus control, and ARCore runs the camera at fixed focus for
  tracking, so close objects (under about 1 m) can look soft. A native ARCore app can switch on autofocus.
- The bottom viewport uses the 13 in from the prints; the website says 15 in. This is still open with Glenn.

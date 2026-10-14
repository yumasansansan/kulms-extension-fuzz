// SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
// holder and its license, in the machine-readable form of the REUSE
// specification: the GNU General Public License, version 3 or any later version
// (LICENSES/GPL-3.0-or-later.txt).
//
// The 2D context of a canvas, for what the extension does with one: it draws
// an image of the page on a canvas of the image's size and reads the pixels
// back, to find a QR code in them (popup.js, src/auth-totp-register.js). jsdom
// has no canvas. This one does as the HTML Standard's canvas element
// (§4.12.5, https://html.spec.whatwg.org/multipage/canvas.html) does:
// - getContext("2d") gives the canvas's one context, and any other kind null;
// - a canvas's bitmap is transparent black, and is so again whenever its
//   width or height is set (set bitmap dimensions,
//   #concept-canvas-set-bitmap-dimensions);
// - drawImage(image, dx, dy) draws nothing for an image that is not usable
//   (not fully decodable, or of no natural size), and an image that is not
//   origin-clean (its data CORS-cross-origin) makes the context not
//   origin-clean (#dom-context-2d-drawimage);
// - getImageData(sx, sy, sw, sh) throws an IndexSizeError when sw or sh is 0
//   and a SecurityError when the context is not origin-clean; its rectangle
//   has the corners (sx, sy) and (sx + sw, sy + sh), whatever their signs,
//   and what of it lies outside the bitmap comes out transparent black
//   (#dom-context-2d-getimagedata).
// The arguments are Web IDL longs (timeOf() of harness/clock.mjs). Its work is
// counted as the steps go: a bitmap made anew, a pixel at a time; an image
// drawn, each of its pixels; an ImageData read, each of its pixels
// (harness/work.mjs).
import { timeOf as longOf } from "./clock.mjs";
import { step, uncounted } from "./work.mjs";

// The most bytes an ImageData has before its making runs out of memory, as
// Chrome's does (a RangeError, "Out of memory at ImageData creation").
const MOST_BYTES = 2 ** 31 - 1;

// Gives window `w` the 2D context of a canvas. `pixelsOf(image)` gives an
// image's decoded pixels, { width, height, data } (RGBA, 4 bytes a pixel), or
// null when it has none (not fully decodable); `foreign(image)` whether its
// data is CORS-cross-origin; `drawn(canvas)` what the page drew on one of its
// own canvases before the extension came to it ({ data, foreign }), or null.
// It gives back sourceOf(data): the image or the page's canvas whose pixels
// an ImageData that getImageData() gave holds, the last one drawn there.
export function installCanvas(w, { pixelsOf, foreign = () => false, drawn = () => null }) {
  const states = new WeakMap(); // canvas → { context, bitmap, clean, source }
  const sources = new WeakMap();
  // The state of a canvas: at first what the page drew on it.
  const stateOf = (canvas) => {
    let s = states.get(canvas);
    if (s) return s;
    s = { context: null, bitmap: null, clean: true, source: null, page: drawn(canvas) };
    states.set(canvas, s);
    return s;
  };
  // The bitmap of the canvas's size: transparent black when made anew, but
  // for what the page drew on it before.
  const bitmapOf = (canvas) => {
    const s = stateOf(canvas);
    const width = canvas.width;
    const height = canvas.height;
    if (s.bitmap) return s.bitmap;
    step(1 + width * height);
    s.bitmap = { width, height, data: new Uint8ClampedArray(width * height * 4) };
    if (s.page) {
      s.bitmap.data.set(s.page.data.subarray(0, s.bitmap.data.length));
      if (s.page.foreign) s.clean = false;
      s.source = canvas;
      s.page = null;
    }
    return s.bitmap;
  };
  // Setting the width or the height sets the bitmap's dimensions anew.
  for (const name of ["width", "height"]) {
    const d = Object.getOwnPropertyDescriptor(w.HTMLCanvasElement.prototype, name);
    Object.defineProperty(w.HTMLCanvasElement.prototype, name, {
      ...d,
      set(v) {
        d.set.call(this, v);
        const s = stateOf(this);
        s.bitmap = null;
        s.page = null;
        s.source = null;
      },
    });
  }
  w.HTMLCanvasElement.prototype.getContext = function (kind) {
    if (String(kind) !== "2d") return null;
    const canvas = this;
    const s = stateOf(canvas);
    if (s.context) return s.context;
    s.context = {
      canvas,
      drawImage(image, dx, dy) {
        const b = bitmapOf(canvas);
        const src = pixelsOf(image);
        if (!src || src.width === 0 || src.height === 0) return; // not usable: nothing drawn
        step(1 + src.width * src.height);
        const x0 = longOf(dx, w);
        const y0 = longOf(dy, w);
        for (let y = 0; y < src.height; y++) {
          const ty = y + y0;
          if (ty < 0 || ty >= b.height) continue;
          for (let x = 0; x < src.width; x++) {
            const tx = x + x0;
            if (tx < 0 || tx >= b.width) continue;
            for (let k = 0; k < 4; k++) b.data[(ty * b.width + tx) * 4 + k] = src.data[(y * src.width + x) * 4 + k] ?? 0;
          }
        }
        if (foreign(image)) s.clean = false;
        s.source = image;
      },
      getImageData(sx, sy, sw, sh) {
        let x0 = longOf(sx, w);
        let y0 = longOf(sy, w);
        let width = longOf(sw, w);
        let height = longOf(sh, w);
        if (width === 0 || height === 0) throw new w.DOMException(`Failed to execute 'getImageData' on 'CanvasRenderingContext2D': The source ${width === 0 ? "width" : "height"} is 0.`, "IndexSizeError");
        const b = bitmapOf(canvas);
        if (!s.clean) throw new w.DOMException("Failed to execute 'getImageData' on 'CanvasRenderingContext2D': The canvas has been tainted by cross-origin data.", "SecurityError");
        if (width < 0) {
          x0 += width;
          width = -width;
        }
        if (height < 0) {
          y0 += height;
          height = -height;
        }
        if (width * height * 4 > MOST_BYTES) throw new w.RangeError("Out of memory at ImageData creation");
        step(1 + width * height);
        // The page's array, made without the count of its own that the page's
        // constructor has: the step above is the count of it.
        const data = uncounted(() => new w.Uint8ClampedArray(width * height * 4));
        for (let y = 0; y < height; y++) {
          const fy = y + y0;
          if (fy < 0 || fy >= b.height) continue;
          for (let x = 0; x < width; x++) {
            const fx = x + x0;
            if (fx < 0 || fx >= b.width) continue;
            for (let k = 0; k < 4; k++) data[(y * width + x) * 4 + k] = b.data[(fy * b.width + fx) * 4 + k];
          }
        }
        if (s.source) sources.set(data, s.source);
        return { data, width, height, colorSpace: "srgb" };
      },
    };
    return s.context;
  };
  return { sourceOf: (data) => sources.get(data) || null };
}

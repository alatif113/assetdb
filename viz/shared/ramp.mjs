// The heatmap's color scale: magma, black through purple and red to cream (even steps, colorblind safe).
export const MAGMA = ['#000004', '#180f3d', '#440f76', '#721f81', '#9e2f7f', '#cd4071', '#f1605d', '#fd9567', '#fec98d', '#fcfdbf'];
const RGB = MAGMA.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));

/** Color for t in 0..1 as [r, g, b]. */
export function ramp(t) {
	const c = Math.max(0, Math.min(1, Number.isNaN(t) ? 0 : t)), x = c * (RGB.length - 1), i = Math.min(RGB.length - 2, Math.floor(x)), f = x - i;
	return RGB[i].map((v, k) => Math.round(v + (RGB[i + 1][k] - v) * f));
}
export const rgbCss = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
/** Readable text color on a background. */
export const ink = (c) => ((0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 140 ? '#13171a' : '#ffffff');

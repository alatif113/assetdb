// The predefined icon outputs. The `adb_icon` macro (configured on the Settings page) can only produce these names,
// and the explorer draws a glyph for each. Keep this list in step with ICON_CHOICES in generator.js (a test checks it).
const S = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const ICONS = {
	server: S('<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>'),
	desktop: S('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>'),
	laptop: S('<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 19h19"/>'),
	mobile: S('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>'),
	tablet: S('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M11 18h2"/>'),
	network: S('<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>'),
	printer: S('<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M7 14h10v6H7z"/>'),
	iot: S('<circle cx="12" cy="12" r="2.2"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8"/>'),
	virtual: S('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/>'),
	storage: S('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
	cloud: S('<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5 4 4 0 0 1 17.5 18z"/>'),
	other: S('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 12h6"/>'),
};
export const ICON_NAMES = Object.keys(ICONS);
/** The glyph for an icon name; anything unknown gets the neutral one. */
export const iconSvg = (name) => ICONS[name] || ICONS.other;

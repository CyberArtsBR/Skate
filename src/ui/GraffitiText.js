import { GRAFFITI_ATLAS } from './graffiti-atlas.js';
import { publicAssetUrl } from '../config/publicAssetUrl.js';
import './graffiti-text.css';

const states = new WeakMap();
const imageCache = new Map();
const paletteColors = {
  gold: ['#fff459', '#ffb600', '#846000'],
  fire: ['#fff126', '#ff3811', '#8b0000'],
  green: ['#81ff20', '#30d000', '#125900'],
  red: ['#ff6560', '#f5140c', '#810000'],
  cyan: ['#36efff', '#6748ff', '#251058'],
};

function loadAtlas(palette) {
  if (!imageCache.has(palette)) {
    const image = new Image();
    const promise = new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load graffiti alphabet ${palette}`));
    });
    image.src = publicAssetUrl(`fonts/graffiti/${GRAFFITI_ATLAS[palette].file}`);
    imageCache.set(palette, promise);
  }
  return imageCache.get(palette);
}

function normalizeCharacter(character) {
  // Preserve the original accessible text; the source alphabets are uppercase.
  return character.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function characterMetrics(character, atlas) {
  if (/\s/.test(character)) return { advance: .36, space: true };
  const glyph = atlas.glyphs[normalizeCharacter(character)];
  if (glyph) {
    const width = glyph.w / glyph.h * glyph.scale;
    return { glyph, width, advance: width + .018 };
  }
  // These marks are absent from one or more sheets. Small drawn symbols keep
  // the scores and degrees legible without substituting the actual alphabet.
  const widths = { '+': .49, '°': .3, ':': .2, ',': .2, '.': .17, '!': .25, '-': .42, '%': .72 };
  return { width: widths[character] || .62, advance: (widths[character] || .62) + .03, fallback: character };
}

function measureText(text, atlas) {
  return [...text].reduce((width, character) => width + characterMetrics(character, atlas).advance, 0);
}

function availableWidth(element, options) {
  if (Number.isFinite(options.maxWidth) && options.maxWidth > 0) return options.maxWidth;
  const ownMaximum = getComputedStyle(element).maxWidth;
  const cap = ownMaximum.endsWith('px') ? parseFloat(ownMaximum) : Infinity;
  const bounded = width => Math.min(width, cap);
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (parent.classList.contains('hud-block')) {
      // HUD blocks use width:max-content. Their measured width is therefore
      // determined by this canvas, and cannot be the limit for its next draw.
      // Use the actual grid track, so a changing score can grow naturally.
      const grid = parent.parentElement;
      const tracks = grid ? getComputedStyle(grid).gridTemplateColumns.split(/\s+/).map(parseFloat) : [];
      const track = parent.classList.contains('hud-time') ? tracks.at(-1) : tracks[0];
      if (track > 0) return bounded(Math.max(1, track - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0)));
      continue;
    }
    if (style.display === 'contents' || style.width === 'fit-content' || style.width === 'max-content') continue;
    // These fit-content feedback boxes get their width from the text itself.
    if (parent.classList.contains('hud-trick-feedback')) continue;
    const width = parent.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0);
    if (width > 0) return bounded(width);
  }
  return bounded(globalThis.innerWidth || 1200);
}

function layoutLines(text, atlas, fontSize, width, options) {
  const paragraphs = String(text).split('\n');
  if (!options.wrap) return paragraphs;
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measureText(candidate, atlas) * fontSize > width) {
        lines.push(line); line = word;
      } else line = candidate;
    }
    lines.push(line);
  }
  return lines;
}

function drawFallback(ctx, character, x, y, size, width, palette) {
  const colors = paletteColors[palette];
  const gradient = ctx.createLinearGradient(0, y, 0, y + size);
  gradient.addColorStop(0, colors[0]); gradient.addColorStop(.65, colors[1]); gradient.addColorStop(1, colors[2]);
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = gradient; ctx.strokeStyle = '#080909';
  ctx.lineWidth = Math.max(1.6, size * .057); ctx.lineJoin = 'round';
  ctx.beginPath();
  if (character === '+') {
    const w = width * size, cy = size * .56, arm = size * .085;
    ctx.moveTo(w * .5 - arm, cy - w * .45); ctx.lineTo(w * .5 + arm, cy - w * .45);
    ctx.lineTo(w * .5 + arm, cy - arm); ctx.lineTo(w, cy - arm);
    ctx.lineTo(w, cy + arm); ctx.lineTo(w * .5 + arm, cy + arm);
    ctx.lineTo(w * .5 + arm, cy + w * .45); ctx.lineTo(w * .5 - arm, cy + w * .45);
    ctx.lineTo(w * .5 - arm, cy + arm); ctx.lineTo(0, cy + arm);
    ctx.lineTo(0, cy - arm); ctx.lineTo(w * .5 - arm, cy - arm); ctx.closePath();
  } else if (character === '°') {
    ctx.arc(size * .145, size * .17, size * .11, 0, Math.PI * 2);
    ctx.arc(size * .145, size * .17, size * .043, 0, Math.PI * 2, true);
  } else if (character === ':' || character === '.' || character === ',') {
    const radius = size * .065;
    if (character === ':') ctx.roundRect(size * .045, size * .31, radius * 2, radius * 2, radius * .15);
    ctx.roundRect(size * .045, size * .76, radius * 2, radius * 2, radius * .15);
    if (character === ',') { ctx.moveTo(size * .17, size * .82); ctx.lineTo(size * .055, size * 1.01); ctx.lineTo(size * .065, size * .8); }
  } else if (character === '!') {
    ctx.moveTo(size * .045, size * .05); ctx.lineTo(size * .23, size * .05);
    ctx.lineTo(size * .16, size * .68); ctx.lineTo(size * .065, size * .68); ctx.closePath();
    ctx.roundRect(size * .065, size * .79, size * .12, size * .14, size * .015);
  } else if (character === '-') {
    ctx.moveTo(0, size * .47); ctx.lineTo(size * .42, size * .43); ctx.lineTo(size * .42, size * .59); ctx.lineTo(0, size * .63); ctx.closePath();
  } else {
    ctx.font = `900 ${size * .85}px Impact, Arial Black, sans-serif`;
    ctx.textBaseline = 'bottom'; ctx.strokeText(character, 0, size * .97); ctx.fillText(character, 0, size * .97);
    ctx.restore(); return;
  }
  ctx.stroke(); ctx.fill('evenodd'); ctx.restore();
}

function render(state) {
  const { element, text, options, image, canvas } = state;
  if (!image || !element.isConnected) return;
  const atlas = GRAFFITI_ATLAS[options.palette];
  const computed = getComputedStyle(element);
  const desiredSize = Number(options.fontSize) || parseFloat(computed.fontSize) || 32;
  const limit = Math.max(1, availableWidth(element, options));
  const maxLines = Math.max(1, Math.floor(Number(options.maxLines) || 2));
  let size = desiredSize, lines = layoutLines(text, atlas, size, limit, options);
  // Reflow at progressively smaller sizes so long trick names keep useful
  // line breaks instead of being squeezed into one very short strip.
  for (let step = 0; options.wrap && lines.length > maxLines && step < 24; step++) {
    size *= .92; lines = layoutLines(text, atlas, size, limit, options);
  }
  const measured = lines.map(line => measureText(line, atlas));
  const longest = Math.max(0, ...measured);
  size = Math.min(size, longest ? limit / longest : size);
  const width = Math.max(1, Math.min(Math.floor(limit), Math.ceil(longest * size + size * .04)));
  const lineHeight = size * 1.08;
  const height = Math.max(1, Math.ceil((lines.length - 1) * lineHeight + size * 1.04));
  const pixelRatio = Math.min(2, globalThis.devicePixelRatio || 1);
  const renderKey = [text, options.palette, width, height, size, options.align, lines.join('\n')].join('|');
  if (state.renderKey === renderKey) return;
  state.renderKey = renderKey;
  canvas.width = Math.ceil(width * pixelRatio); canvas.height = Math.ceil(height * pixelRatio);
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(pixelRatio, pixelRatio); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  lines.forEach((line, row) => {
    const lineWidth = measured[row] * size;
    let x = options.align === 'right' ? width - lineWidth : options.align === 'center' ? (width - lineWidth) / 2 : 0;
    for (const character of line) {
      const metric = characterMetrics(character, atlas);
      if (metric.glyph) {
        const g = metric.glyph, h = size * g.scale;
        const y = row * lineHeight + (size - h) * (character === '-' ? .6 : 1);
        ctx.drawImage(image, g.x, g.y, g.w, g.h, x, y, metric.width * size, h);
      } else if (!metric.space) drawFallback(ctx, metric.fallback, x, row * lineHeight, size, metric.width, options.palette);
      x += metric.advance * size;
    }
  });
  element.classList.add('is-graffiti-ready');
}

/** Render supplied graffiti artwork while keeping element.textContent intact. */
export function setGraffitiText(element, text, options = {}) {
  if (!element) return;
  const label = String(text ?? '');
  const palette = Object.hasOwn(GRAFFITI_ATLAS, options.palette) ? options.palette : 'gold';
  const normalized = { palette, wrap: false, maxLines: 2, align: 'left', ...options, palette };
  const key = JSON.stringify(normalized);
  let state = states.get(element);
  if (state?.text === label && state.optionsKey === key) return state;
  if (!state) {
    const original = document.createElement('span'); original.className = 'graffiti-text-source';
    const canvas = document.createElement('canvas'); canvas.className = 'graffiti-text-art'; canvas.setAttribute('aria-hidden', 'true');
    element.replaceChildren(original, canvas); element.classList.add('graffiti-text');
    state = { element, original, canvas, text: '', options: normalized, image: null };
    states.set(element, state);
    if (typeof ResizeObserver === 'function') {
      state.observer = new ResizeObserver(() => {
        if (state.frame) cancelAnimationFrame(state.frame);
        state.frame = requestAnimationFrame(() => { state.frame = 0; render(state); });
      });
      state.observer.observe(element.parentElement || element);
    }
  }
  state.text = label; state.original.textContent = label; state.optionsKey = key;
  const paletteChanged = state.options.palette !== palette;
  state.options = normalized; element.dataset.graffitiPalette = palette;
  if (paletteChanged) state.image = null;
  if (state.image) render(state);
  else {
    loadAtlas(palette).then(image => {
      if (states.get(element) !== state || state.options.palette !== palette) return;
      state.image = image; render(state);
    }).catch(() => { element.classList.remove('is-graffiti-ready'); });
  }
  return state;
}

export function disposeGraffitiText(element) {
  const state = states.get(element);
  if (!state) return;
  state.observer?.disconnect();
  if (state.frame) cancelAnimationFrame(state.frame);
  element.textContent = state.text;
  element.classList.remove('graffiti-text', 'is-graffiti-ready');
  delete element.dataset.graffitiPalette; states.delete(element);
}

export function disposeGraffitiTextTree(root) {
  if (!root) return;
  if (root.classList?.contains('graffiti-text')) disposeGraffitiText(root);
  root.querySelectorAll?.('.graffiti-text').forEach(disposeGraffitiText);
}

export function refreshGraffitiTextTree(root) {
  if (!root) return;
  const elements = [...root.querySelectorAll('.graffiti-text')];
  if (root.classList?.contains('graffiti-text')) elements.unshift(root);
  for (const element of elements) {
    const state = states.get(element);
    if (state) render(state);
  }
}

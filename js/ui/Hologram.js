const selector = '.card[data-rarity], .mini-card[data-rarity]';
const foilRarities = new Set(['rare', 'epic', 'legendary', 'special']);
export const hasCardFoil = rarity => foilRarities.has(rarity);
const visible = new Set();
const watched = new WeakSet();
let initialized = false;
let host;
let orientationEnabled = false;
let frame = 0;
let orientation = [50, 50];

function reduced() {
  return document.documentElement.classList.contains('reduced-motion')
    || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function shine(card, x, y) {
  card.style.setProperty('--foil-x', `${x}%`);
  card.style.setProperty('--foil-y', `${y}%`);
}

function orient(event) {
  if (reduced() || !visible.size || event.gamma == null || event.beta == null) return;
  orientation = [Math.min(100, Math.max(0, 50 + event.gamma)), Math.min(100, Math.max(0, 20 + event.beta))];
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    for (const card of visible) {
      if (card.classList.contains('card-3d')) continue;
      card.classList.add('foil-input');
      shine(card, ...orientation);
    }
  });
}

export function canRequestFoilTilt() {
  return typeof window.DeviceOrientationEvent?.requestPermission === 'function';
}

export async function enableFoilTilt() {
  if (orientationEnabled) return true;
  try {
    if (canRequestFoilTilt() && await window.DeviceOrientationEvent.requestPermission() !== 'granted') return false;
    window.addEventListener('deviceorientation', orient);
    orientationEnabled = true;
    return true;
  } catch { return false; }
}

export function initHolograms(root) {
  if (initialized) return;
  initialized = true;
  host = root;
  const observer = new IntersectionObserver(records => {
    for (const { target, isIntersecting } of records) {
      target.classList.toggle('foil-visible', isIntersecting);
      if (isIntersecting) visible.add(target);
      else {
        visible.delete(target);
        target.classList.remove('foil-input');
      }
    }
  });
  const watch = card => {
    if (card.classList.contains('card-3d') || watched.has(card) || !hasCardFoil(card.dataset.rarity)) return;
    watched.add(card);
    card.classList.remove('foil-visible', 'foil-input');
    if (!card.querySelector(':scope > .foil-sheet')) {
      const foil = document.createElement('span');
      foil.className = 'foil-sheet';
      foil.setAttribute('aria-hidden', 'true');
      card.append(foil);
    }
    observer.observe(card);
  };
  const eachCard = (node, fn) => {
    if (!(node instanceof Element)) return;
    if (node.matches(selector)) fn(node);
    node.querySelectorAll(selector).forEach(fn);
  };
  new MutationObserver(records => {
    for (const { addedNodes, removedNodes } of records) {
      removedNodes.forEach(node => eachCard(node, card => {
        if (host.contains(card)) return;
        visible.delete(card);
        watched.delete(card);
        observer.unobserve(card);
      }));
      addedNodes.forEach(node => eachCard(node, card => { if (host.contains(card)) watch(card); }));
    }
  }).observe(root, { subtree: true, childList: true });
  root.querySelectorAll(selector).forEach(watch);
  root.addEventListener('pointermove', event => {
    const card = event.target.closest(selector);
    if (!card || card.classList.contains('card-3d') || !visible.has(card) || reduced()) return;
    const rect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    card.classList.add('foil-input');
    shine(card, 100 * (event.clientX - rect.left) / rect.width, 100 * (event.clientY - rect.top) / rect.height);
  }, { passive: true });
  const reset = event => {
    const card = event.target.closest(selector);
    if (!card || card.classList.contains('card-3d') || (event.relatedTarget instanceof Node && card.contains(event.relatedTarget))) return;
    card.classList.remove('foil-input');
    card.style.removeProperty('--foil-x');
    card.style.removeProperty('--foil-y');
  };
  root.addEventListener('pointerout', reset);
  root.addEventListener('pointercancel', reset);
  if (window.DeviceOrientationEvent && !canRequestFoilTilt()) void enableFoilTilt();
}

/**
 * Crossfade scene transition using an HTML overlay.
 * Fades to black, calls the transition callback, then fades back in.
 */
export function crossfadeTransition(
  duration: number,
  onMidpoint: () => void,
): void {
  const fade = document.createElement('div');
  fade.style.cssText = `position:fixed;inset:0;z-index:9999;background:#000;opacity:0;transition:opacity ${duration / 1000}s;pointer-events:none;`;
  document.body.appendChild(fade);

  // Force reflow then fade in the black overlay
  fade.offsetHeight;
  fade.style.opacity = '1';

  setTimeout(() => {
    onMidpoint();

    // Fade out the overlay to reveal the new scene
    requestAnimationFrame(() => {
      fade.style.opacity = '0';
      fade.addEventListener('transitionend', () => fade.remove());
    });
  }, duration);
}

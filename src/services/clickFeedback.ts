const controls = 'button,a[href],[role="button"],[role="link"],[role="option"],input[type="button"],input[type="submit"],input[type="reset"],summary';

/** Delegation also covers controls mounted later and dialogs rendered in portals. */
export function installClickFeedback(root: Document = document) {
  const motion = root.defaultView?.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Map<Element, Animation>();
  const pulse = (target: EventTarget | null) => {
    const element = target instanceof Element ? target.closest(controls) : null;
    if (!element || element.closest(':disabled,[aria-disabled="true"],[inert]') || motion?.matches || !element.animate) return;
    animations.get(element)?.cancel();
    // Individual scale preserves existing transforms; opacity also works on inline links.
    const animation = element.animate([
      { scale: '0.96', opacity: 0.65 },
      { scale: '1', opacity: 1 },
    ], { duration: 160, easing: 'ease-out' });
    animations.set(element, animation);
    const clear = () => { if (animations.get(element) === animation) animations.delete(element); };
    void animation.finished.then(clear, clear);
  };
  const pointer = (event: PointerEvent) => { if (event.button === 0 && event.isPrimary) pulse(event.target); };
  const keyboard = (event: KeyboardEvent) => { if (!event.repeat && (event.key === 'Enter' || event.key === ' ')) pulse(event.target); };
  // Keyboard/assistive activation may emit click without a pointer or key event.
  const click = (event: MouseEvent) => { if (event.detail === 0 && !(event.target instanceof Element && animations.has(event.target.closest(controls)!))) pulse(event.target); };
  const stop = () => { for (const animation of animations.values()) animation.cancel(); animations.clear(); };
  motion?.addEventListener('change', stop);
  root.addEventListener('pointerdown', pointer, true);
  root.addEventListener('keydown', keyboard, true);
  root.addEventListener('click', click, true);
  return () => {
    root.removeEventListener('pointerdown', pointer, true);
    root.removeEventListener('keydown', keyboard, true);
    root.removeEventListener('click', click, true);
    motion?.removeEventListener('change', stop);
    stop();
  };
}

// Pointer lock for uninterrupted looking, with drag support in restricted embeds.
export function createMouseLook(
  canvas,
  { isPlaying, onLook, onLockChange, onFallback },
) {
  const doc = canvas.ownerDocument;
  let dragging = false;
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  let wasLocked = false;
  let pending = false;
  let fallbackNotified = false;
  const locked = () => doc.pointerLockElement === canvas;

  function endDrag() {
    dragging = false;
    const previousId = pointerId;
    pointerId = null;
    if (previousId !== null && canvas.hasPointerCapture(previousId)) {
      canvas.releasePointerCapture(previousId);
    }
  }
  function fallback() {
    pending = false;
    if (isPlaying()) {
      const firstNotice = !fallbackNotified;
      fallbackNotified = true;
      onFallback?.(firstNotice);
    }
  }
  function capture() {
    if (!isPlaying() || locked() || pending) return;
    if (!canvas.requestPointerLock) {
      fallback();
      return;
    }
    pending = true;
    try {
      const result = canvas.requestPointerLock();
      result?.catch(fallback);
    } catch {
      fallback();
    }
  }
  function release() {
    endDrag();
    if (locked()) doc.exitPointerLock();
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (!isPlaying() || ![0, 2].includes(event.button) || locked()) return;
    event.preventDefault();
    dragging = true;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    capture();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!isPlaying() || locked() || !dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    onLook(dx, dy);
  });
  doc.addEventListener("mousemove", (event) => {
    if (isPlaying() && locked()) onLook(event.movementX, event.movementY);
  });
  doc.addEventListener("pointerlockchange", () => {
    pending = false;
    const active = locked();
    const lost = wasLocked && !active;
    wasLocked = active;
    if (active) endDrag();
    canvas.classList.toggle("mouse-locked", active);
    onLockChange?.(active, lost);
    if (active && !isPlaying()) release();
  });
  doc.addEventListener("pointerlockerror", fallback);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("lostpointercapture", endDrag);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  return { capture, release, locked };
}

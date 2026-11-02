import { useEffect, useRef } from 'react';

// Moves the keyboard focus into a popup when it opens, so keys pressed in it (Esc) are not
// delivered to the element that was focused on the board (which would deselect it). Attach
// the returned ref, with tabIndex -1, to the popup's root. A field that already took the
// focus (autofocus) keeps it.
export function useModalFocus() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, []);
  return ref;
}

// Props for the blurred backdrop of a popup: a click on it closes the popup, but only when the
// press and the release are both on the backdrop, so selecting text in the popup and letting go
// outside does not close it. Every popup uses this (R1.17).
export function useBackdropClose(onClose) {
  const pressedOutside = useRef(false);
  return {
    onMouseDown: (e) => {
      pressedOutside.current = e.target === e.currentTarget;
    },
    onClick: (e) => {
      if (e.target === e.currentTarget && pressedOutside.current) onClose();
    },
  };
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Top of a non-modal header popup: 8px below the header, following its height changes.
export function useBelowHeader(headerRef) {
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    const header = headerRef.current;
    const position = () => setTop(header.getBoundingClientRect().bottom + 8);
    position();
    const observer = new ResizeObserver(position);
    observer.observe(header);
    window.addEventListener('resize', position);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
    };
  }, [headerRef]);
  return top;
}

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
// outside does not close it. Every modal popup uses this (R1.17).
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

export function useOutsideClose(ref, onClose, ignoreRef) {
  const pressedOutside = useRef(false);
  useEffect(() => {
    const outside = (e) => !ref.current?.contains(e.target) && !ignoreRef.current?.contains(e.target);
    const onDown = (e) => { pressedOutside.current = outside(e); };
    const onClick = (e) => {
      if (pressedOutside.current && outside(e)) onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('click', onClick, true);
    };
  }, [ref, onClose, ignoreRef]);
}

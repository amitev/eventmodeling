import { useRef } from 'react';

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

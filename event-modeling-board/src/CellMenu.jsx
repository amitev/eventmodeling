import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { KINDS, LANE_TYPES, nextLaneTypes } from './model/model.js';
import { useModalFocus } from './dialogs/popup.js';

export function CellMenu({
  x, y, kinds, full, canRemove, laneType,
  onAdd, onCopyContext, onAddSlice, onRemoveSlice, onAddLane, onClose,
}) {
  const menu = useModalFocus();
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = menu.current;
    const { width, height } = el.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
    el.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [menu, x, y]);

  useEffect(() => {
    const outside = (e) => {
      if (!menu.current?.contains(e.target)) onClose();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', outside, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', outside, true);
      window.removeEventListener('resize', onClose);
    };
  }, [menu, onClose]);

  const run = (action) => {
    onClose();
    action();
  };

  const onKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault();
      onClose();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const buttons = [...menu.current.querySelectorAll('button:not(:disabled)')];
      const current = buttons.indexOf(document.activeElement);
      const index = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
        : (current + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[index]?.focus();
    }
  };

  return createPortal(
    <div
      ref={menu}
      className="cell-menu"
      style={position}
      role="menu"
      aria-label="Cell actions"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {kinds.map((kind) => (
        <button
          key={kind}
          type="button"
          role="menuitem"
          disabled={full}
          title={full ? 'This Spec Cell already has an element' : undefined}
          onClick={() => run(() => onAdd(kind))}
        >
          <span className="cell-menu-kind" style={{ background: KINDS[kind].color }} aria-hidden="true" />
          Add {KINDS[kind].label}
        </button>
      ))}
      <div className="cell-menu-separator" role="separator" />
      <button type="button" role="menuitem" onClick={() => run(onCopyContext)}>Copy Context</button>
      <button type="button" role="menuitem" onClick={() => run(onAddSlice)}>Add next slice</button>
      <button
        type="button"
        role="menuitem"
        className="cell-menu-delete"
        disabled={!canRemove}
        title={canRemove ? undefined : "A Chapter's last slice cannot be deleted"}
        onClick={() => run(onRemoveSlice)}
      >
        Delete current slice
      </button>
      <div className="cell-menu-separator" role="separator" />
      {[laneType, ...nextLaneTypes(laneType)].map((type) => (
        <button
          key={type}
          type="button"
          role="menuitem"
          onClick={() => run(() => onAddLane(type))}
        >
          Add {LANE_TYPES[type].label} lane
        </button>
      ))}
    </div>,
    document.body
  );
}

'use client';
import { useEffect, useId, useRef, useState } from 'react';
export function Menu({
  label,
  trigger,
  children,
  className = '',
}: {
  label: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  function focusItem(last = false) {
    requestAnimationFrame(() => {
      const items = root.current?.querySelectorAll<HTMLElement>(
        '[role="menu"] a, [role="menu"] button',
      );
      items?.[last ? items.length - 1 : 0]?.focus();
    });
  }
  return (
    <div
      ref={root}
      className={`shell-menu ${className}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          if (!open) {
            setOpen(true);
            focusItem(event.key === 'ArrowUp' || event.key === 'End');
            return;
          }
          const items = Array.from(
            root.current?.querySelectorAll<HTMLElement>('[role="menu"] a, [role="menu"] button') ??
              [],
          );
          const current = items.indexOf(document.activeElement as HTMLElement);
          const index =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? items.length - 1
                : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[index]?.focus();
        }
        if (event.key === 'Tab') setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
          if (!open) focusItem();
        }}
      >
        {trigger}
        <span className="chevron" aria-hidden="true">
          ⌄
        </span>
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          className="shell-menu-options"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a,button')) close();
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

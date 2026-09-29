"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode; className?: string };

/** Native modal semantics provide focus containment, Escape, and focus restoration. */
export default function Modal({ open, onClose, labelledBy, children, className = "" }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <dialog ref={dialog} aria-labelledby={labelledBy} className={`pf-modal ${className}`}
      onCancel={(event) => { event.preventDefault(); close.current(); }}
      onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close.current(); } }}>
      {children}
    </dialog>, document.body,
  );
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export interface ComboboxDropdownPosition {
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
}

export function useFieldCombobox<T extends HTMLElement = HTMLDivElement>() {
    const rootRef = useRef<T>(null);
    const controlRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [open, setOpen] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState<ComboboxDropdownPosition | null>(null);

    const updatePosition = useCallback(() => {
        const control = controlRef.current;
        if (!control) {
            return;
        }

        const rect = control.getBoundingClientRect();
        const viewport = window.visualViewport;
        const viewportHeight = viewport?.height ?? window.innerHeight;
        const viewportTop = viewport?.offsetTop ?? 0;
        const visibleBottom = viewportTop + viewportHeight;
        const spaceBelow = visibleBottom - rect.bottom;
        const spaceAbove = rect.top - viewportTop;
        const gap = 8;
        const preferredHeight = 240;

        if (spaceBelow >= 140 || spaceBelow >= spaceAbove) {
            setDropdownPosition({
                top: rect.bottom + gap,
                left: rect.left,
                width: rect.width,
                maxHeight: Math.max(120, Math.min(preferredHeight, spaceBelow - gap - 12)),
            });
            return;
        }

        setDropdownPosition({
            bottom: viewportHeight - rect.top + gap,
            left: rect.left,
            width: rect.width,
            maxHeight: Math.max(120, Math.min(preferredHeight, spaceAbove - gap - 12)),
        });
    }, []);

    useLayoutEffect(() => {
        if (!open) {
            setDropdownPosition(null);
            return;
        }

        updatePosition();

        const viewport = window.visualViewport;
        viewport?.addEventListener('resize', updatePosition);
        viewport?.addEventListener('scroll', updatePosition);
        window.addEventListener('resize', updatePosition);

        return () => {
            viewport?.removeEventListener('resize', updatePosition);
            viewport?.removeEventListener('scroll', updatePosition);
            window.removeEventListener('resize', updatePosition);
        };
    }, [open, updatePosition]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) {
                return;
            }

            if (rootRef.current?.contains(target) || listRef.current?.contains(target)) {
                return;
            }

            setOpen(false);
        };

        document.addEventListener('pointerdown', handlePointerDown, true);
        return () => document.removeEventListener('pointerdown', handlePointerDown, true);
    }, [open]);

    const preventBlur = (event: ReactPointerEvent) => {
        event.preventDefault();
    };

    return {
        rootRef,
        controlRef,
        listRef,
        open,
        setOpen,
        dropdownPosition,
        preventBlur,
    };
}

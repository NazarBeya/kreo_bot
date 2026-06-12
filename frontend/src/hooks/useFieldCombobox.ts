import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export function useFieldCombobox<T extends HTMLElement = HTMLDivElement>() {
    const rootRef = useRef<T>(null);
    const controlRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [open, setOpen] = useState(false);

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
        preventBlur,
    };
}

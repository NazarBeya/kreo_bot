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

        const handleOutsideClick = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) {
                return;
            }

            if (rootRef.current?.contains(target) || listRef.current?.contains(target)) {
                return;
            }

            setOpen(false);
        };

        document.addEventListener('click', handleOutsideClick, true);
        return () => document.removeEventListener('click', handleOutsideClick, true);
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

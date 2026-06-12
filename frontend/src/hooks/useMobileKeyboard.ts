import { useEffect, useState } from 'react';

const isTextControl = (element: Element | null): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        return true;
    }

    if (element instanceof HTMLInputElement) {
        return element.type !== 'file' && element.type !== 'checkbox' && element.type !== 'radio';
    }

    return false;
};

export function useMobileKeyboard(): boolean {
    const [keyboardOpen, setKeyboardOpen] = useState(false);

    useEffect(() => {
        const handleFocusIn = (event: FocusEvent) => {
            const target = event.target;
            if (target instanceof Element && isTextControl(target)) {
                document.body.classList.add('keyboard-open');
                setKeyboardOpen(true);

                // Scroll the input to the center of the viewport after keyboard animations settle
                window.setTimeout(() => {
                    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }, 200);
            }
        };

        const handleFocusOut = (event: FocusEvent) => {
            const target = event.target;
            if (target instanceof Element && isTextControl(target)) {
                window.setTimeout(() => {
                    // Only remove keyboard-open if focus did not move to another input control
                    if (!isTextControl(document.activeElement)) {
                        document.body.classList.remove('keyboard-open');
                        setKeyboardOpen(false);
                    }
                }, 100);
            }
        };

        const dismissKeyboard = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }

            // If user clicked outside any input/select, blur the current active text control
            const clickedField = target.closest('input, textarea, select, label, .geo-combobox, .preland-field');
            if (!clickedField) {
                const active = document.activeElement;
                if (active instanceof HTMLElement && isTextControl(active)) {
                    active.blur();
                }
            }
        };

        const blurOnEnter = (event: KeyboardEvent) => {
            const target = event.target;
            if (event.defaultPrevented || event.key !== 'Enter' || !(target instanceof HTMLElement)) {
                return;
            }

            if (isTextControl(target) && target.tagName !== 'TEXTAREA') {
                target.blur();
            }
        };

        const applyEnterKeyHint = () => {
            document.querySelectorAll('input, textarea').forEach((element) => {
                if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
                    return;
                }

                if (element.type === 'file' || element.type === 'checkbox' || element.type === 'radio') {
                    return;
                }

                element.enterKeyHint = 'done';
            });
        };

        document.addEventListener('focusin', handleFocusIn, true);
        document.addEventListener('focusout', handleFocusOut, true);
        document.addEventListener('pointerdown', dismissKeyboard, true);
        document.addEventListener('keydown', blurOnEnter, true);
        
        applyEnterKeyHint();
        const observer = new MutationObserver(applyEnterKeyHint);
        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            document.removeEventListener('focusin', handleFocusIn, true);
            document.removeEventListener('focusout', handleFocusOut, true);
            document.removeEventListener('pointerdown', dismissKeyboard, true);
            document.removeEventListener('keydown', blurOnEnter, true);
            observer.disconnect();
            document.body.classList.remove('keyboard-open');
        };
    }, []);

    return keyboardOpen;
}

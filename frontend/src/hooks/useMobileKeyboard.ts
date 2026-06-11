import { useEffect, useState } from 'react';

const KEYBOARD_THRESHOLD_PX = 120;

const isTextField = (element: EventTarget | null): element is HTMLInputElement | HTMLTextAreaElement => (
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
);

const isTextControl = (element: Element | null): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        return true;
    }

    if (element instanceof HTMLInputElement) {
        return element.type !== 'file' && element.type !== 'checkbox' && element.type !== 'radio';
    }

    return false;
};

const isFieldTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) {
        return false;
    }

    if (isTextControl(target.closest('input, textarea, select'))) {
        return true;
    }

    const label = target.closest('label');
    return Boolean(label && isTextControl(label.querySelector('input, textarea, select')));
};

export function useMobileKeyboard(): boolean {
    const [keyboardOpen, setKeyboardOpen] = useState(false);

    useEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) {
            return;
        }

        const updateKeyboardState = () => {
            const keyboardHeight = window.innerHeight - viewport.height;
            setKeyboardOpen(keyboardHeight > KEYBOARD_THRESHOLD_PX);
        };

        viewport.addEventListener('resize', updateKeyboardState);
        viewport.addEventListener('scroll', updateKeyboardState);
        updateKeyboardState();

        return () => {
            viewport.removeEventListener('resize', updateKeyboardState);
            viewport.removeEventListener('scroll', updateKeyboardState);
        };
    }, []);

    useEffect(() => {
        document.body.classList.toggle('keyboard-open', keyboardOpen);
        return () => {
            document.body.classList.remove('keyboard-open');
        };
    }, [keyboardOpen]);

    useEffect(() => {
        const dismissKeyboard = (event: PointerEvent) => {
            if (isFieldTarget(event.target)) {
                return;
            }

            const active = document.activeElement;
            if (isTextField(active)) {
                active.blur();
            }
        };

        const scrollFieldIntoView = (event: FocusEvent) => {
            const target = event.target;
            if (!isTextField(target)) {
                return;
            }

            window.setTimeout(() => {
                target.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }, 320);
        };

        const blurOnEnter = (event: KeyboardEvent) => {
            const target = event.target;
            if (event.key !== 'Enter' || !isTextField(target)) {
                return;
            }

            target.blur();
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

        document.addEventListener('pointerdown', dismissKeyboard);
        document.addEventListener('focusin', scrollFieldIntoView);
        document.addEventListener('keydown', blurOnEnter);
        applyEnterKeyHint();

        const observer = new MutationObserver(applyEnterKeyHint);
        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            document.removeEventListener('pointerdown', dismissKeyboard);
            document.removeEventListener('focusin', scrollFieldIntoView);
            document.removeEventListener('keydown', blurOnEnter);
            observer.disconnect();
        };
    }, []);

    return keyboardOpen;
}

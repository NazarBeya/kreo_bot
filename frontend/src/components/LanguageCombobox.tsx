import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldCombobox } from '../hooks/useFieldCombobox';

interface LanguageComboboxProps {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
    placeholder?: string;
}

export const LanguageCombobox: React.FC<LanguageComboboxProps> = ({
    label,
    value,
    options,
    onChange,
    placeholder = 'en, de, fr...',
}) => {
    const {
        rootRef,
        controlRef,
        listRef,
        open,
        setOpen,
        dropdownPosition,
        preventBlur,
    } = useFieldCombobox<HTMLLabelElement>();
    const [query, setQuery] = useState(value);
    const wasOpenRef = useRef(false);

    useEffect(() => {
        setQuery(value);
    }, [value]);

    useEffect(() => {
        if (wasOpenRef.current && !open) {
            const normalized = query.trim().toLowerCase().slice(0, 8);
            if (normalized !== value) {
                onChange(normalized);
                setQuery(normalized);
            }
        }

        wasOpenRef.current = open;
    }, [open, onChange, query, value]);

    const filteredOptions = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        const unique = Array.from(new Set(options.map((option) => option.toLowerCase())));

        if (!normalized) {
            return unique;
        }

        return unique.filter((option) => option.includes(normalized));
    }, [options, query]);

    const commitValue = (nextValue: string) => {
        const normalized = nextValue.trim().toLowerCase().slice(0, 8);
        setQuery(normalized);
        onChange(normalized);
        setOpen(false);
    };

    const normalizedQuery = query.trim().toLowerCase();
    const canAddCustom = Boolean(normalizedQuery) && !filteredOptions.includes(normalizedQuery);

    return (
        <label className="preland-field field-combobox" ref={rootRef}>
            <span>{label}</span>
            <div className={`field-combobox-control${open ? ' open' : ''}`} ref={controlRef}>
                <input
                    autoComplete="off"
                    autoCorrect="off"
                    enterKeyHint="done"
                    onChange={(event) => {
                        setQuery(event.target.value.toLowerCase());
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            commitValue(query);
                        }

                        if (event.key === 'Escape') {
                            setQuery(value);
                            setOpen(false);
                            (event.target as HTMLInputElement).blur();
                        }
                    }}
                    placeholder={placeholder}
                    spellCheck={false}
                    type="text"
                    value={query}
                />
                {open && dropdownPosition && (
                    <ul
                        className="field-combobox-list field-combobox-list--floating"
                        ref={listRef}
                        role="listbox"
                        style={{
                            top: dropdownPosition.top,
                            bottom: dropdownPosition.bottom,
                            left: dropdownPosition.left,
                            width: dropdownPosition.width,
                            maxHeight: dropdownPosition.maxHeight,
                        }}
                    >
                        <li role="option">
                            <button
                                className={!value ? 'active' : ''}
                                onPointerDown={preventBlur}
                                onClick={() => commitValue('')}
                                type="button"
                            >
                                не вказано
                            </button>
                        </li>
                        {canAddCustom && (
                            <li role="option">
                                <button
                                    className="custom"
                                    onPointerDown={preventBlur}
                                    onClick={() => commitValue(query)}
                                    type="button"
                                >
                                    додати «{normalizedQuery}»
                                </button>
                            </li>
                        )}
                        {filteredOptions.map((option) => (
                            <li key={option} role="option">
                                <button
                                    className={option === value ? 'active' : ''}
                                    onPointerDown={preventBlur}
                                    onClick={() => commitValue(option)}
                                    type="button"
                                >
                                    {option}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </label>
    );
};

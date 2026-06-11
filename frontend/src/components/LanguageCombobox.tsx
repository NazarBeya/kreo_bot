import React, { useEffect, useMemo, useRef, useState } from 'react';

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
    const rootRef = useRef<HTMLLabelElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState(value);

    useEffect(() => {
        setQuery(value);
    }, [value]);

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

    const handleBlur = () => {
        window.setTimeout(() => {
            if (rootRef.current?.contains(document.activeElement)) {
                return;
            }

            commitValue(query);
        }, 120);
    };

    return (
        <label className="preland-field field-combobox" ref={rootRef}>
            <span>{label}</span>
            <div className={`field-combobox-control${open ? ' open' : ''}`}>
                <input
                    autoComplete="off"
                    autoCorrect="off"
                    enterKeyHint="done"
                    onBlur={handleBlur}
                    onChange={(event) => {
                        setQuery(event.target.value.toLowerCase());
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            commitValue(query);
                            (event.target as HTMLInputElement).blur();
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
                {open && (
                    <ul className="field-combobox-list" role="listbox">
                        <li role="option">
                            <button
                                className={!value ? 'active' : ''}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => commitValue('')}
                                type="button"
                            >
                                не вказано
                            </button>
                        </li>
                        {filteredOptions.map((option) => (
                            <li key={option} role="option">
                                <button
                                    className={option === value ? 'active' : ''}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => commitValue(option)}
                                    type="button"
                                >
                                    {option}
                                </button>
                            </li>
                        ))}
                        {query.trim() && !filteredOptions.includes(query.trim().toLowerCase()) && (
                            <li role="option">
                                <button
                                    className="custom"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => commitValue(query)}
                                    type="button"
                                >
                                    додати «{query.trim().toLowerCase()}»
                                </button>
                            </li>
                        )}
                    </ul>
                )}
            </div>
        </label>
    );
};

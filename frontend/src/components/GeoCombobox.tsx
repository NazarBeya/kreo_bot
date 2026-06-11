import React, { useMemo, useRef, useState } from 'react';

const QUICK_GEOS = ['DE', 'IL', 'PL', 'GB', 'US'];

interface GeoComboboxProps {
    label: string;
    options: string[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder?: string;
}

const isGeoCode = (value: string) => /^[A-Z]{2}$/.test(value);

const normalizeGeo = (value: string) => value.trim().toUpperCase().slice(0, 2);

export const GeoCombobox: React.FC<GeoComboboxProps> = ({
    label,
    options,
    selected,
    onChange,
    placeholder = 'DE, FR, PL...',
}) => {
    const rootRef = useRef<HTMLElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const customSelected = useMemo(
        () => selected.filter((geo) => !QUICK_GEOS.includes(geo)),
        [selected],
    );

    const uniqueOptions = useMemo(() => {
        const merged = new Set([...options, ...selected].map((item) => item.toUpperCase()));
        return Array.from(merged).filter((item) => !QUICK_GEOS.includes(item));
    }, [options, selected]);

    const filteredOptions = useMemo(() => {
        const normalized = query.trim().toUpperCase();
        if (!normalized) {
            return uniqueOptions;
        }

        return uniqueOptions.filter((option) => option.includes(normalized));
    }, [query, uniqueOptions]);

    const toggleQuickGeo = (geo: string) => {
        onChange(
            selected.includes(geo)
                ? selected.filter((item) => item !== geo)
                : [...selected, geo],
        );
    };

    const addGeo = (geo: string) => {
        const normalized = normalizeGeo(geo);
        if (!isGeoCode(normalized) || selected.includes(normalized)) {
            return;
        }

        onChange([...selected, normalized]);
        setQuery('');
        setOpen(false);
    };

    const removeCustomGeo = (geo: string) => {
        onChange(selected.filter((item) => item !== geo));
    };

    const toggleDropdownGeo = (geo: string) => {
        const normalized = normalizeGeo(geo);
        if (!isGeoCode(normalized)) {
            return;
        }

        if (QUICK_GEOS.includes(normalized)) {
            toggleQuickGeo(normalized);
            return;
        }

        onChange(
            selected.includes(normalized)
                ? selected.filter((item) => item !== normalized)
                : [...selected, normalized],
        );
        setQuery('');
    };

    const handleBlur = () => {
        window.setTimeout(() => {
            if (rootRef.current?.contains(document.activeElement)) {
                return;
            }

            if (query.trim()) {
                addGeo(query);
            }

            setQuery('');
            setOpen(false);
        }, 120);
    };

    const normalizedQuery = normalizeGeo(query);

    return (
        <section className="upload-option-group geo-combobox" ref={rootRef}>
            <h3>{label}</h3>
            <div className="geo-quick-options">
                {QUICK_GEOS.map((geo) => (
                    <button
                        className={selected.includes(geo) ? 'active' : ''}
                        key={geo}
                        onClick={() => toggleQuickGeo(geo)}
                        type="button"
                    >
                        {geo}
                    </button>
                ))}
            </div>
            {customSelected.length > 0 && (
                <div className="geo-combobox-chips">
                    {customSelected.map((geo) => (
                        <button
                            className="active"
                            key={geo}
                            onClick={() => removeCustomGeo(geo)}
                            type="button"
                        >
                            {geo} ×
                        </button>
                    ))}
                </div>
            )}
            <div className={`field-combobox-control${open ? ' open' : ''}`}>
                <input
                    autoComplete="off"
                    autoCorrect="off"
                    enterKeyHint="done"
                    onBlur={handleBlur}
                    onChange={(event) => {
                        setQuery(event.target.value.toUpperCase());
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            if (isGeoCode(normalizedQuery)) {
                                addGeo(normalizedQuery);
                            }
                            (event.target as HTMLInputElement).blur();
                        }

                        if (event.key === 'Escape') {
                            setQuery('');
                            setOpen(false);
                            (event.target as HTMLInputElement).blur();
                        }

                        if (event.key === 'Backspace' && !query && customSelected.length > 0) {
                            removeCustomGeo(customSelected[customSelected.length - 1]);
                        }
                    }}
                    placeholder={placeholder}
                    spellCheck={false}
                    type="text"
                    value={query}
                />
                {open && (
                    <ul className="field-combobox-list" role="listbox">
                        {filteredOptions.map((option) => (
                            <li key={option} role="option">
                                <button
                                    className={selected.includes(option) ? 'active' : ''}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => toggleDropdownGeo(option)}
                                    type="button"
                                >
                                    {option}
                                </button>
                            </li>
                        ))}
                        {isGeoCode(normalizedQuery)
                            && !QUICK_GEOS.includes(normalizedQuery)
                            && !uniqueOptions.includes(normalizedQuery) && (
                            <li role="option">
                                <button
                                    className="custom"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => addGeo(normalizedQuery)}
                                    type="button"
                                >
                                    додати «{normalizedQuery}»
                                </button>
                            </li>
                        )}
                    </ul>
                )}
            </div>
        </section>
    );
};

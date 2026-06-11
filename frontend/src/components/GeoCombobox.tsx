import React, { useMemo } from 'react';

const QUICK_GEOS = ['DE', 'IL', 'PL', 'GB', 'US'];

interface GeoComboboxProps {
    label: string;
    options: string[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder?: string;
}

export const GeoCombobox: React.FC<GeoComboboxProps> = ({
    label,
    options,
    selected,
    onChange,
    placeholder = 'виберіть ГЕО...',
}) => {
    const customSelected = useMemo(
        () => selected.filter((geo) => !QUICK_GEOS.includes(geo)),
        [selected],
    );

    const uniqueOptions = useMemo(() => {
        const merged = new Set([...options, ...selected].map((item) => item.toUpperCase()));
        return Array.from(merged)
            .filter((item) => !QUICK_GEOS.includes(item))
            .sort();
    }, [options, selected]);

    const toggleQuickGeo = (geo: string) => {
        onChange(
            selected.includes(geo)
                ? selected.filter((item) => item !== geo)
                : [...selected, geo],
        );
    };

    const removeCustomGeo = (geo: string) => {
        onChange(selected.filter((item) => item !== geo));
    };

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val && !selected.includes(val)) {
            onChange([...selected, val]);
        }
        // Reset the select value back to empty/placeholder after selecting
        e.target.value = '';
    };

    return (
        <section className="upload-option-group geo-combobox">
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
            <div className="preland-field" style={{ marginTop: '12px' }}>
                <select value="" onChange={handleSelectChange}>
                    <option value="">{placeholder}</option>
                    {uniqueOptions.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
            </div>
        </section>
    );
};

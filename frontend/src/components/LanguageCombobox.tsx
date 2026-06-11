import React from 'react';

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
    placeholder = 'виберіть мову...',
}) => {
    const sortedOptions = React.useMemo(() => {
        const unique = Array.from(new Set(options.map((opt) => opt.toLowerCase())));
        return unique.sort();
    }, [options]);

    return (
        <label className="preland-field">
            <span>{label}</span>
            <select
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
            >
                <option value="">{placeholder}</option>
                {sortedOptions.map((opt) => (
                    <option key={opt} value={opt}>
                        {opt.toUpperCase()}
                    </option>
                ))}
            </select>
        </label>
    );
};

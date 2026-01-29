import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'accent' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    icon?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * Button Component
 * Accessible button with multiple variants and loading state
 */
export const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    children,
    disabled,
    className = '',
    ...props
}) => {
    const baseClasses = 'btn transition-all duration-200 font-semibold';

    const variantClasses = {
        primary: 'btn-primary',
        accent: 'btn-accent',
        ghost: 'btn-ghost',
        danger: 'btn-danger'
    };

    const sizeClasses = {
        sm: 'btn-sm',
        md: '',
        lg: 'btn-lg'
    };

    return (
        <button
            className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
            disabled={disabled || loading}
            aria-busy={loading}
            {...props}
        >
            {loading ? (
                <span className="spinner" aria-hidden="true" />
            ) : icon ? (
                <span className="flex-shrink-0" aria-hidden="true">{icon}</span>
            ) : null}
            <span>{children}</span>
        </button>
    );
};

export default Button;

// Flat ESLint config (replaces the legacy .eslintrc.json).
// Goal: 0 errors on the existing codebase; style/strictness issues surface as warnings.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
    {
        ignores: [
            'dist',
            'node_modules',
            '.next',
            'coverage',
            'docs',
            'public',
            'playwright',
            'supabase',
            'test_sdk.js', // stray UTF-16 (binary-looking) scratch file
            '**/*.config.js',
            '**/*.mjs'
        ]
    },
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{ts,tsx}'],
        plugins: { 'react-hooks': reactHooks },
        languageOptions: {
            globals: { ...globals.browser, ...globals.node }
        },
        rules: {
            // React hooks correctness (warn so legacy code does not block CI)
            'react-hooks/rules-of-hooks': 'warn',
            'react-hooks/exhaustive-deps': 'warn',

            // Carried over from .eslintrc.json
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
            ],
            '@typescript-eslint/no-explicit-any': 'warn',
            'no-console': 'off',

            // Downgrade noisy recommended rules to warnings for the existing codebase
            '@typescript-eslint/ban-ts-comment': 'warn',
            '@typescript-eslint/no-empty-object-type': 'warn',
            '@typescript-eslint/no-unsafe-function-type': 'warn',
            '@typescript-eslint/no-unused-expressions': 'warn',
            '@typescript-eslint/no-require-imports': 'warn',
            'no-empty': 'warn',
            'no-useless-escape': 'warn',
            'no-irregular-whitespace': 'warn',
            'no-case-declarations': 'warn',
            'prefer-const': 'warn'
        }
    }
);

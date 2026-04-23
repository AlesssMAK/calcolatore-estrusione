import { forwardRef } from 'react';
import css from './Input.module.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, type, className, ...rest }, ref) => {
    return (
      <div className={css.input_container}>
        <input
          ref={ref}
          type={type}
          className={`${css.input} ${error ? css.error : ''} ${className || ''}`}
          {...rest}
        />

        {error && <p className={css.error_text}>{error}</p>}
      </div>
    );
  }
);

export default Input;

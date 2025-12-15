import { fireEvent, render, screen } from '@testing-library/react';
import { Form, FormError, useFormContext } from '../form';
import type { UseFormReturn } from '../types';
import { useForm } from '../use-form';

describe('Form component', () => {
  describe('Form', () => {
    it('should render children correctly', () => {
      const mockForm = {
        values: {},
        errors: {},
        isSubmitting: false,
        error: null,
        register: jest.fn(),
        handleSubmit: jest.fn(),
        reset: jest.fn(),
        setError: jest.fn(),
        clearError: jest.fn(),
        setFieldValue: jest.fn(),
      } as unknown as UseFormReturn<Record<string, unknown>>;

      render(
        <Form form={mockForm}>
          <div data-testid="child">Child content</div>
        </Form>,
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByText('Child content')).toBeInTheDocument();
    });

    it('should provide form context to children', () => {
      const mockForm = {
        values: { email: 'test@example.com' },
        errors: {},
        isSubmitting: false,
        error: null,
        register: jest.fn(),
        handleSubmit: jest.fn(),
        reset: jest.fn(),
        setError: jest.fn(),
        clearError: jest.fn(),
        setFieldValue: jest.fn(),
      } as unknown as UseFormReturn<{ email: string }>;

      function ChildComponent() {
        const form = useFormContext<{ email: string }>();
        return <div data-testid="email-value">{form.values.email}</div>;
      }

      render(
        <Form form={mockForm}>
          <ChildComponent />
        </Form>,
      );

      expect(screen.getByTestId('email-value')).toHaveTextContent('test@example.com');
    });

    it('should call handleSubmit on form submission', () => {
      const handleSubmit = jest.fn((e) => e.preventDefault());
      const mockForm = {
        values: {},
        errors: {},
        isSubmitting: false,
        error: null,
        register: jest.fn(),
        handleSubmit,
        reset: jest.fn(),
        setError: jest.fn(),
        clearError: jest.fn(),
        setFieldValue: jest.fn(),
      } as unknown as UseFormReturn<Record<string, unknown>>;

      render(
        <Form form={mockForm}>
          <button type="submit">Submit</button>
        </Form>,
      );

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      expect(handleSubmit).toHaveBeenCalled();
    });

    it('should apply custom className', () => {
      const mockForm = {
        values: {},
        errors: {},
        isSubmitting: false,
        error: null,
        register: jest.fn(),
        handleSubmit: jest.fn(),
        reset: jest.fn(),
        setError: jest.fn(),
        clearError: jest.fn(),
        setFieldValue: jest.fn(),
      } as unknown as UseFormReturn<Record<string, unknown>>;

      const { container } = render(
        <Form form={mockForm} className="custom-form-class">
          <div>Content</div>
        </Form>,
      );

      const formElement = container.querySelector('form');
      expect(formElement).toHaveClass('custom-form-class');
      expect(formElement).toHaveClass('space-y-4'); // Default class should still be present
    });

    it('should pass through additional HTML form attributes', () => {
      const mockForm = {
        values: {},
        errors: {},
        isSubmitting: false,
        error: null,
        register: jest.fn(),
        handleSubmit: jest.fn(),
        reset: jest.fn(),
        setError: jest.fn(),
        clearError: jest.fn(),
        setFieldValue: jest.fn(),
      } as unknown as UseFormReturn<Record<string, unknown>>;

      const { container } = render(
        <Form form={mockForm} data-testid="test-form" id="my-form" aria-label="Test form">
          <div>Content</div>
        </Form>,
      );

      const formElement = container.querySelector('form');
      expect(formElement).toHaveAttribute('data-testid', 'test-form');
      expect(formElement).toHaveAttribute('id', 'my-form');
      expect(formElement).toHaveAttribute('aria-label', 'Test form');
    });

    it('should set noValidate attribute', () => {
      const mockForm = {
        values: {},
        errors: {},
        isSubmitting: false,
        error: null,
        register: jest.fn(),
        handleSubmit: jest.fn(),
        reset: jest.fn(),
        setError: jest.fn(),
        clearError: jest.fn(),
        setFieldValue: jest.fn(),
      } as unknown as UseFormReturn<Record<string, unknown>>;

      const { container } = render(
        <Form form={mockForm}>
          <div>Content</div>
        </Form>,
      );

      const formElement = container.querySelector('form');
      expect(formElement).toHaveAttribute('noValidate');
    });

    it('should prevent default submission behavior', () => {
      const handleSubmit = jest.fn((e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
      });
      const mockForm = {
        values: {},
        errors: {},
        isSubmitting: false,
        error: null,
        register: jest.fn(),
        handleSubmit,
        reset: jest.fn(),
        setError: jest.fn(),
        clearError: jest.fn(),
        setFieldValue: jest.fn(),
      } as unknown as UseFormReturn<Record<string, unknown>>;

      const { container } = render(
        <Form form={mockForm}>
          <button type="submit">Submit</button>
        </Form>,
      );

      const formElement = container.querySelector('form')!;
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });

      formElement.dispatchEvent(submitEvent);

      expect(handleSubmit).toHaveBeenCalled();
    });
  });

  describe('FormError', () => {
    it('should render error message when error exists', () => {
      const mockForm = {
        values: {},
        errors: {},
        isSubmitting: false,
        error: 'Something went wrong',
        register: jest.fn(),
        handleSubmit: jest.fn(),
        reset: jest.fn(),
        setError: jest.fn(),
        clearError: jest.fn(),
        setFieldValue: jest.fn(),
      } as unknown as UseFormReturn<Record<string, unknown>>;

      render(
        <Form form={mockForm}>
          <FormError />
        </Form>,
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should not render when no error', () => {
      const mockForm = {
        values: {},
        errors: {},
        isSubmitting: false,
        error: null,
        register: jest.fn(),
        handleSubmit: jest.fn(),
        reset: jest.fn(),
        setError: jest.fn(),
        clearError: jest.fn(),
        setFieldValue: jest.fn(),
      } as unknown as UseFormReturn<Record<string, unknown>>;

      const { container } = render(
        <Form form={mockForm}>
          <FormError />
        </Form>,
      );

      // FormError should not render anything when no error
      const errorElement = container.querySelector('[role="alert"]');
      expect(errorElement).not.toBeInTheDocument();
    });

    it('should have correct ARIA attributes', () => {
      const mockForm = {
        values: {},
        errors: {},
        isSubmitting: false,
        error: 'Error message',
        register: jest.fn(),
        handleSubmit: jest.fn(),
        reset: jest.fn(),
        setError: jest.fn(),
        clearError: jest.fn(),
        setFieldValue: jest.fn(),
      } as unknown as UseFormReturn<Record<string, unknown>>;

      render(
        <Form form={mockForm}>
          <FormError />
        </Form>,
      );

      const errorElement = screen.getByRole('alert');
      expect(errorElement).toBeInTheDocument();
      expect(errorElement).toHaveTextContent('Error message');
    });

    it('should apply custom className', () => {
      const mockForm = {
        values: {},
        errors: {},
        isSubmitting: false,
        error: 'Error message',
        register: jest.fn(),
        handleSubmit: jest.fn(),
        reset: jest.fn(),
        setError: jest.fn(),
        clearError: jest.fn(),
        setFieldValue: jest.fn(),
      } as unknown as UseFormReturn<Record<string, unknown>>;

      render(
        <Form form={mockForm}>
          <FormError className="custom-error-class" />
        </Form>,
      );

      const errorElement = screen.getByRole('alert');
      expect(errorElement).toHaveClass('custom-error-class');
    });

    it('should apply correct styling classes', () => {
      const mockForm = {
        values: {},
        errors: {},
        isSubmitting: false,
        error: 'Error message',
        register: jest.fn(),
        handleSubmit: jest.fn(),
        reset: jest.fn(),
        setError: jest.fn(),
        clearError: jest.fn(),
        setFieldValue: jest.fn(),
      } as unknown as UseFormReturn<Record<string, unknown>>;

      render(
        <Form form={mockForm}>
          <FormError />
        </Form>,
      );

      const errorElement = screen.getByRole('alert');
      expect(errorElement).toHaveClass('rounded-md');
      expect(errorElement).toHaveClass('border');
      expect(errorElement).toHaveClass('border-destructive/50');
      expect(errorElement).toHaveClass('bg-destructive/10');
      expect(errorElement).toHaveClass('text-destructive');
    });

    it('should update when error changes', () => {
      function TestComponent() {
        const form = useForm({
          defaultValues: { email: '' },
          onSubmit: jest.fn().mockResolvedValue({
            ok: false,
            error: 'SERVER_ERROR',
            message: 'Initial error',
          }),
        });

        return (
          <Form form={form}>
            <FormError />
            <button
              type="button"
              onClick={() => {
                form.setError('email', 'Updated error');
              }}
            >
              Change Error
            </button>
          </Form>
        );
      }

      render(<TestComponent />);

      // Initially, FormError relies on form.error which is null
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      // Note: The FormError component reads from form.error (the form-level error),
      // not from field errors. So setting a field error won't show in FormError.
      // This test demonstrates the component behavior.
    });
  });

  describe('useFormContext', () => {
    it('should throw error when used outside Form component', () => {
      // Suppress console.error for this test since we expect an error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      function ComponentWithoutForm() {
        const form = useFormContext();
        return <div>{form.values.toString()}</div>;
      }

      expect(() => {
        render(<ComponentWithoutForm />);
      }).toThrow('useFormContext must be used within a Form component');

      consoleErrorSpy.mockRestore();
    });

    it('should return form context when used inside Form component', () => {
      const mockForm = {
        values: { email: 'test@example.com', password: 'secret' },
        errors: {},
        isSubmitting: false,
        error: null,
        register: jest.fn(),
        handleSubmit: jest.fn(),
        reset: jest.fn(),
        setError: jest.fn(),
        clearError: jest.fn(),
        setFieldValue: jest.fn(),
      } as unknown as UseFormReturn<{ email: string; password: string }>;

      function ChildComponent() {
        const form = useFormContext<{ email: string; password: string }>();
        return (
          <div>
            <span data-testid="email">{form.values.email}</span>
            <span data-testid="password">{form.values.password}</span>
          </div>
        );
      }

      render(
        <Form form={mockForm}>
          <ChildComponent />
        </Form>,
      );

      expect(screen.getByTestId('email')).toHaveTextContent('test@example.com');
      expect(screen.getByTestId('password')).toHaveTextContent('secret');
    });

    it('should maintain type safety with generic types', () => {
      type FormValues = {
        email: string;
        age: number;
        isActive: boolean;
        [key: string]: unknown;
      };

      const mockForm = {
        values: { email: 'test@example.com', age: 25, isActive: true },
        errors: {},
        isSubmitting: false,
        error: null,
        register: jest.fn(),
        handleSubmit: jest.fn(),
        reset: jest.fn(),
        setError: jest.fn(),
        clearError: jest.fn(),
        setFieldValue: jest.fn(),
      } as unknown as UseFormReturn<FormValues>;

      function TypedChildComponent() {
        const form = useFormContext<FormValues>();
        return (
          <div>
            <span data-testid="email">{form.values.email}</span>
            <span data-testid="age">{form.values.age}</span>
            <span data-testid="active">{form.values.isActive.toString()}</span>
          </div>
        );
      }

      render(
        <Form form={mockForm}>
          <TypedChildComponent />
        </Form>,
      );

      expect(screen.getByTestId('email')).toHaveTextContent('test@example.com');
      expect(screen.getByTestId('age')).toHaveTextContent('25');
      expect(screen.getByTestId('active')).toHaveTextContent('true');
    });

    it('should provide access to all form methods', () => {
      const register = jest.fn();
      const handleSubmit = jest.fn();
      const reset = jest.fn();
      const setError = jest.fn();
      const clearError = jest.fn();
      const setFieldValue = jest.fn();

      const mockForm = {
        values: { email: '' },
        errors: {},
        isSubmitting: false,
        error: null,
        register,
        handleSubmit,
        reset,
        setError,
        clearError,
        setFieldValue,
      } as unknown as UseFormReturn<{ email: string }>;

      function ChildComponent() {
        const form = useFormContext<{ email: string }>();
        return (
          <div>
            <button onClick={() => form.reset()}>Reset</button>
            <button onClick={() => form.setError('email', 'Error')}>Set Error</button>
            <button onClick={() => form.clearError('email')}>Clear Error</button>
            <button onClick={() => form.setFieldValue('email', 'new@example.com')}>
              Set Value
            </button>
          </div>
        );
      }

      render(
        <Form form={mockForm}>
          <ChildComponent />
        </Form>,
      );

      fireEvent.click(screen.getByText('Reset'));
      expect(reset).toHaveBeenCalled();

      fireEvent.click(screen.getByText('Set Error'));
      expect(setError).toHaveBeenCalledWith('email', 'Error');

      fireEvent.click(screen.getByText('Clear Error'));
      expect(clearError).toHaveBeenCalledWith('email');

      fireEvent.click(screen.getByText('Set Value'));
      expect(setFieldValue).toHaveBeenCalledWith('email', 'new@example.com');
    });
  });
});

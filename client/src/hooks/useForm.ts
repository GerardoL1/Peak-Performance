import { useState } from 'react';
import { describeError, fieldErrors } from '../api/client';
import { useToast } from '../components/Toast';

/**
 * Minimal form state: string values, server-side field errors, and a submit helper
 * that shows a toast on success and maps API errors onto the fields.
 */
export function useForm<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const bind = (name: keyof T & string) => ({
    name,
    value: values[name],
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });

  const submit = async (action: () => Promise<unknown>, successMessage: string, onDone?: () => void) => {
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      await action();
      toast(successMessage);
      onDone?.();
    } catch (err) {
      const byField = fieldErrors(err);
      setErrors(byField);
      setFormError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return { values, setValues, bind, errors, formError, busy, submit };
}

export const toStr = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));

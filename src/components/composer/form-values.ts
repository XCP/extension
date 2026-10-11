export type FormValues<Options> = { [Key in keyof Options]?: Options[Key] | string };

export function readFormValues<Options>(formData: FormData): FormValues<Options> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === 'string') values[key] = value;
  }
  return values;
}

export function formBoolean(value: boolean | string | undefined): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  return value === true || value === 'true' || value === 'yes';
}

/** Input labels come from the tool registry (`inputs[].label`, set on gallery apps and other labelled inputs); the fallback is our default copy. */
export const inputLabel = (tool: { inputs?: readonly unknown[] } | null | undefined, name: string, fallback: string): string => {
  const i: any = (tool?.inputs ?? []).find((x: any) => x?.name === name);
  return typeof i?.label === 'string' && i.label.trim() ? i.label.trim() : fallback;
};

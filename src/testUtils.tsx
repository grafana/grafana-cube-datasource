import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { select } from 'react-select-event';

export function setup(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const user = userEvent.setup();

  const { rerender, ...result } = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);

  return {
    ...result,
    user,
    rerender: (rerenderUi: React.ReactElement) =>
      rerender(<QueryClientProvider client={client}>{rerenderUi}</QueryClientProvider>),
  };
}

export const selectOptionInTest = async (
  input: HTMLElement,
  optionOrOptions: string | RegExp | Array<string | RegExp>
) => await waitFor(() => select(input, optionOrOptions, { container: document.body }));

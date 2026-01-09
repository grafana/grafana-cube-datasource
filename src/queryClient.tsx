import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

// Provider component (use when you want to wrap multiple children)
export const QueryProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

// HOC: wrap a component so it is automatically provided with the shared QueryClient
export const withQueryClient = <P extends object>(Component: React.ComponentType<P>): React.FC<P> => {
  const Wrapped: React.FC<P> = (props) => (
    <QueryClientProvider client={queryClient}>
      <Component {...props} />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
  Wrapped.displayName = `withQueryClient(${Component.displayName || Component.name || 'Component'})`;
  return Wrapped;
};

export default queryClient;

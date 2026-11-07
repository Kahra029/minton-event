import type { ReactNode } from 'react';

export function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

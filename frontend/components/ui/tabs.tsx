"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type TabsContextValue = {
  value: string;
  setValue: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

export function Tabs({
  defaultValue,
  value: controlledValue,
  onValueChange,
  children,
  className,
}: {
  defaultValue: string;
  /** Optional: pass value + onValueChange to switch tabs from code. */
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [innerValue, setInnerValue] = React.useState(defaultValue);
  const value = controlledValue ?? innerValue;
  const setValue = (next: string) => {
    setInnerValue(next);
    onValueChange?.(next);
  };

  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("inline-flex rounded-md border bg-muted p-1", className)}
      role="tablist"
      {...props}
    />
  );
}

export function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const context = React.useContext(TabsContext);
  const selected = context?.value === value;

  return (
    <button
      className={cn(
        "rounded px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
        selected && "bg-card text-foreground shadow-sm",
        className,
      )}
      role="tab"
      type="button"
      aria-selected={selected}
      onClick={() => context?.setValue(value)}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const context = React.useContext(TabsContext);

  if (context?.value !== value) {
    return null;
  }

  return (
    <div className={className} role="tabpanel">
      {children}
    </div>
  );
}

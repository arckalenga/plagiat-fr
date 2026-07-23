import * as React from "react";
import { cn } from "../lib/utils";

export function Button({ className, variant = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = { primary: "bg-forest-900 text-white hover:bg-forest-700", secondary: "bg-white border border-black/10 hover:bg-sand", ghost: "hover:bg-black/5", danger: "bg-red-700 text-white hover:bg-red-800" };
  return <button className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500", styles[variant], className)} {...props} />;
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="h-12 w-full rounded-xl border border-black/15 bg-white px-4 text-sm outline-none transition placeholder:text-black/40 focus:border-forest-500 focus:ring-2 focus:ring-forest-100" {...props} />;
}
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-black/[.08] bg-white shadow-soft", className)} {...props} />;
}
export function Badge({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "amber" | "red" | "gray" }) {
  const tones = { green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800", gray: "bg-gray-100 text-gray-700" };
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone])}>{children}</span>;
}

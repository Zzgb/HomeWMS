"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function DatePicker({ value, onChange, placeholder = "选择日期", className }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value);
    return new Date();
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;

  const selectDay = (day: number) => {
    const m = String(month + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    onChange(`${year}-${m}-${d}`);
    setOpen(false);
  };

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const display = value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : "";

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          !display && "text-muted-foreground"
        )}
      >
        <Calendar className="mr-2 h-4 w-4 opacity-50" />
        <span className={!display ? "text-muted-foreground" : ""}>
          {display || placeholder}
        </span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 rounded-md border bg-popover p-3 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} className="p-1 hover:bg-accent rounded text-sm">&lt;</button>
            <span className="text-sm font-medium">{year}年{month + 1}月</span>
            <button type="button" onClick={nextMonth} className="p-1 hover:bg-accent rounded text-sm">&gt;</button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
              <div key={d} className="py-1 text-muted-foreground">{d}</div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`e${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelected = value === dateStr;
              const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => selectDay(day)}
                  className={cn(
                    "py-1 rounded text-sm hover:bg-accent",
                    isSelected && "bg-primary text-primary-foreground hover:bg-primary/90",
                    isToday && !isSelected && "border border-primary/50"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
          {display && (
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground py-1"
            >
              清除
            </button>
          )}
        </div>
      )}
    </div>
  );
}

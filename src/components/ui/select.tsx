"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
};

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  /** Width / shrink styles for the wrapper (select stays fluid inside). */
  wrapperClassName?: string;
  /** Set false to keep a native list (e.g. `multiple`). Default: searchable. */
  searchable?: boolean;
};

function optionLabel(children: React.ReactNode): string {
  if (children == null || children === false) return "";
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) return children.map(optionLabel).join("");
  if (React.isValidElement(children)) {
    return optionLabel(
      (children.props as { children?: React.ReactNode }).children,
    );
  }
  return "";
}

/** Walk `<option>` / `<optgroup>` children into a flat list. */
export function parseSelectOptions(
  children: React.ReactNode,
  group?: string,
): SelectOption[] {
  const out: SelectOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const type = child.type;
    const props = child.props as {
      children?: React.ReactNode;
      value?: string | number | readonly string[];
      disabled?: boolean;
      label?: string;
    };
    if (type === React.Fragment) {
      out.push(...parseSelectOptions(props.children, group));
      return;
    }
    if (type === "optgroup") {
      out.push(...parseSelectOptions(props.children, props.label));
      return;
    }
    if (type === "option") {
      const value =
        props.value != null ? String(props.value) : optionLabel(props.children);
      out.push({
        value,
        label: optionLabel(props.children) || value,
        disabled: Boolean(props.disabled),
        group,
      });
    }
  });
  return out;
}

/** Case-insensitive filter used by every searchable select. */
export function filterSelectOptions(
  options: SelectOption[],
  query: string,
): SelectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => {
    const hay = `${o.label} ${o.value} ${o.group ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}

function emitSelectChange(
  el: HTMLSelectElement | null,
  value: string,
  onChange?: React.ChangeEventHandler<HTMLSelectElement>,
) {
  if (el) el.value = value;
  onChange?.({
    target: el ?? ({ value } as HTMLSelectElement),
    currentTarget: el ?? ({ value } as HTMLSelectElement),
  } as React.ChangeEvent<HTMLSelectElement>);
}

const NativeSelect = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, wrapperClassName, children, searchable: _s, ...props }, ref) => (
    <div className={cn("relative min-w-0", wrapperClassName ?? "w-full")}>
      <select
        ref={ref}
        className={cn(
          [
            "flex h-9 w-full appearance-none rounded-md",
            "border border-[#d9e0ea] bg-white",
            "px-3 pr-8 text-[0.8125rem] text-[#0b1f33]",
            "outline-none transition-[border-color,box-shadow] duration-150",
            "hover:border-[#c5d0e0]",
            "focus:border-[#1a56db]",
            "focus:shadow-[0_0_0_3px_rgba(26,86,219,0.12)]",
            "disabled:cursor-not-allowed disabled:bg-[#f4f6fa] disabled:opacity-60",
          ].join(" "),
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[#8b9bb0]"
      >
        <ChevronDown className="size-3" />
      </span>
    </div>
  ),
);
NativeSelect.displayName = "NativeSelect";

/**
 * Shared select — searchable dropdown with the same API as a native `<select>`
 * (`value`, `onChange`, `name`, `<option>` children, react-hook-form `register()`).
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      wrapperClassName,
      children,
      searchable = true,
      multiple,
      size,
      disabled,
      value,
      defaultValue,
      onChange,
      onBlur,
      name,
      id,
      required,
      ...props
    },
    ref,
  ) => {
    const useNative =
      !searchable || Boolean(multiple) || (typeof size === "number" && size > 1);

    if (useNative) {
      return (
        <NativeSelect
          ref={ref}
          className={className}
          wrapperClassName={wrapperClassName}
          multiple={multiple}
          size={size}
          disabled={disabled}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          onBlur={onBlur}
          name={name}
          id={id}
          required={required}
          {...props}
        >
          {children}
        </NativeSelect>
      );
    }

    return (
      <SearchableSelect
        ref={ref}
        className={className}
        wrapperClassName={wrapperClassName}
        disabled={disabled}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        onBlur={onBlur}
        name={name}
        id={id}
        required={required}
        {...props}
      >
        {children}
      </SearchableSelect>
    );
  },
);
Select.displayName = "Select";

const SearchableSelect = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      wrapperClassName,
      children,
      disabled,
      value: valueProp,
      defaultValue,
      onChange,
      onBlur,
      name,
      id,
      required,
      autoFocus,
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) => {
    const hiddenRef = React.useRef<HTMLSelectElement>(null);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const panelRef = React.useRef<HTMLDivElement>(null);
    const searchRef = React.useRef<HTMLInputElement>(null);
    const listId = React.useId();

    const options = React.useMemo(
      () => parseSelectOptions(children),
      [children],
    );

    const isControlled = valueProp !== undefined;
    const [uncontrolled, setUncontrolled] = React.useState(() =>
      defaultValue != null ? String(defaultValue) : "",
    );
    const current = isControlled
      ? valueProp == null
        ? ""
        : String(valueProp)
      : uncontrolled;

    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [active, setActive] = React.useState(0);
    const [panelStyle, setPanelStyle] = React.useState<React.CSSProperties>({});
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => setMounted(true), []);

    const setRefs = React.useCallback(
      (el: HTMLSelectElement | null) => {
        hiddenRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      },
      [ref],
    );

    React.useEffect(() => {
      if (isControlled) return;
      const el = hiddenRef.current;
      if (el && el.value !== uncontrolled) setUncontrolled(el.value);
    }, [isControlled, options, uncontrolled]);

    const filtered = React.useMemo(
      () => filterSelectOptions(options, query),
      [options, query],
    );

    const selected = options.find((o) => o.value === current);
    const selectedLabel = selected?.label ?? "";
    const isEmpty = current === "";

    const placePanel = React.useCallback(() => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 4;
      const maxH = 280;
      const spaceBelow = window.innerHeight - r.bottom - gap;
      const spaceAbove = r.top - gap;
      const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
      const width = Math.max(r.width, 180);
      const left = Math.min(
        Math.max(8, r.left),
        window.innerWidth - width - 8,
      );
      setPanelStyle({
        position: "fixed",
        left,
        width,
        zIndex: 80,
        ...(openUp
          ? {
              bottom: window.innerHeight - r.top + gap,
              maxHeight: Math.min(maxH, spaceAbove),
            }
          : {
              top: r.bottom + gap,
              maxHeight: Math.min(maxH, Math.max(160, spaceBelow)),
            }),
      });
    }, []);

    React.useEffect(() => {
      if (!open) return;
      placePanel();
      const onWin = () => placePanel();
      window.addEventListener("resize", onWin);
      window.addEventListener("scroll", onWin, true);
      return () => {
        window.removeEventListener("resize", onWin);
        window.removeEventListener("scroll", onWin, true);
      };
    }, [open, placePanel, filtered.length]);

    React.useEffect(() => {
      if (!open) return;
      const idx = filtered.findIndex((o) => o.value === current);
      setActive(idx >= 0 ? idx : 0);
      const t = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }, [open, current, filtered]);

    React.useEffect(() => {
      if (!open) return;
      const onDown = (e: MouseEvent) => {
        const t = e.target as Node;
        if (triggerRef.current?.contains(t)) return;
        if (panelRef.current?.contains(t)) return;
        setOpen(false);
        setQuery("");
      };
      document.addEventListener("mousedown", onDown);
      return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    const commit = (next: string) => {
      if (!isControlled) setUncontrolled(next);
      emitSelectChange(hiddenRef.current, next, onChange);
      setOpen(false);
      setQuery("");
      triggerRef.current?.focus();
    };

    const moveActive = (dir: 1 | -1) => {
      if (!filtered.length) return;
      setActive((i) => {
        let n = i;
        for (let step = 0; step < filtered.length; step += 1) {
          n = (n + dir + filtered.length) % filtered.length;
          if (!filtered[n]?.disabled) return n;
        }
        return i;
      });
    };

    const onTriggerKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === " "
      ) {
        e.preventDefault();
        setOpen(true);
      }
    };

    const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveActive(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveActive(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const opt = filtered[active];
        if (opt && !opt.disabled) commit(opt.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setQuery("");
        triggerRef.current?.focus();
      }
    };

    const triggerClass = cn(
      [
        "flex h-9 w-full items-center rounded-md",
        "border border-[#d9e0ea] bg-white",
        "px-3 pr-8 text-left text-[0.8125rem] text-[#0b1f33]",
        "outline-none transition-[border-color,box-shadow] duration-150",
        "hover:border-[#c5d0e0]",
        "focus:border-[#1a56db]",
        "focus:shadow-[0_0_0_3px_rgba(26,86,219,0.12)]",
        "disabled:cursor-not-allowed disabled:bg-[#f4f6fa] disabled:opacity-60",
      ].join(" "),
      className?.replace(/\bselect-field\b/g, ""),
    );

    const groups = React.useMemo(() => {
      const seen: { name: string | undefined; items: { opt: SelectOption; index: number }[] }[] =
        [];
      filtered.forEach((opt, index) => {
        const last = seen[seen.length - 1];
        if (last && last.name === opt.group) last.items.push({ opt, index });
        else seen.push({ name: opt.group, items: [{ opt, index }] });
      });
      return seen;
    }, [filtered]);

    return (
      <div className={cn("relative min-w-0", wrapperClassName ?? "w-full")}>
        <select
          ref={setRefs}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
          disabled={disabled}
          name={name}
          required={required}
          onBlur={onBlur}
          {...props}
          {...(isControlled
            ? { value: current, onChange }
            : {
                defaultValue:
                  defaultValue != null ? String(defaultValue) : undefined,
                onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                  setUncontrolled(e.target.value);
                  onChange?.(e);
                },
              })}
        >
          {children}
        </select>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          className={cn("relative", triggerClass)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-required={required}
          onClick={() => {
            if (disabled) return;
            setOpen((v) => !v);
            setQuery("");
          }}
          onKeyDown={onTriggerKey}
          onBlur={() => {
            const el = hiddenRef.current;
            if (!el || !onBlur) return;
            onBlur({
              target: el,
              currentTarget: el,
            } as React.FocusEvent<HTMLSelectElement>);
          }}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              isEmpty || !selectedLabel ? "text-[#94a3b8]" : "text-[#0b1f33]",
            )}
          >
            {selectedLabel || "Select"}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 right-2.5 size-3 -translate-y-1/2 text-[#8b9bb0]",
              open && "rotate-180",
            )}
          />
        </button>
        {mounted && open
          ? createPortal(
              <div
                ref={panelRef}
                style={panelStyle}
                className="flex flex-col overflow-hidden rounded-md border border-[#d9e0ea] bg-white shadow-[0_8px_24px_rgba(11,31,51,0.12)]"
              >
                <div className="relative shrink-0 border-b border-[#eef1f4] p-1.5">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-[#8b9bb0]"
                  />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActive(0);
                    }}
                    onKeyDown={onSearchKey}
                    placeholder="Search…"
                    aria-label="Search options"
                    className="h-8 w-full rounded-md border border-[#d9e0ea] bg-[#f8fafc] py-1 pr-2 pl-8 text-[0.8125rem] text-[#0b1f33] outline-none placeholder:text-[#94a3b8] focus:border-[#1a56db] focus:bg-white"
                  />
                </div>
                <ul
                  id={listId}
                  role="listbox"
                  className="min-h-0 flex-1 overflow-y-auto py-1"
                >
                  {filtered.length === 0 ? (
                    <li className="px-3 py-2 text-[0.75rem] text-[#8b9bb0]">
                      No matches
                    </li>
                  ) : (
                    groups.map((g) => (
                      <React.Fragment key={g.name ?? "__default"}>
                        {g.name ? (
                          <li className="px-3 pt-1.5 pb-0.5 text-[0.65rem] font-semibold tracking-wide text-[#8b9bb0] uppercase">
                            {g.name}
                          </li>
                        ) : null}
                        {g.items.map(({ opt, index }) => {
                          const isSel = opt.value === current;
                          const isActive = index === active;
                          return (
                            <li key={`${opt.group ?? ""}:${opt.value}:${index}`} role="presentation">
                              <button
                                type="button"
                                role="option"
                                aria-selected={isSel}
                                disabled={opt.disabled}
                                className={cn(
                                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[0.8125rem]",
                                  opt.disabled && "cursor-not-allowed opacity-50",
                                  isActive && "bg-[#e8eefb]",
                                  isSel && !isActive && "bg-[#f4f7fb]",
                                  !opt.disabled && "hover:bg-[#e8eefb]",
                                )}
                                onMouseEnter={() => setActive(index)}
                                onClick={() => {
                                  if (!opt.disabled) commit(opt.value);
                                }}
                              >
                                <span className="min-w-0 flex-1 truncate text-[#0b1f33]">
                                  {opt.label}
                                </span>
                                {isSel ? (
                                  <Check className="size-3.5 shrink-0 text-[#1a56db]" />
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </React.Fragment>
                    ))
                  )}
                </ul>
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  },
);
SearchableSelect.displayName = "SearchableSelect";

"use client";

import { useEffect, useId, useRef, useState } from "react";

export default function FoundationSearch({ names, initialValue }: { names: string[]; initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const matches = names.filter((name) => name.toLowerCase().includes(value.trim().toLowerCase()));
  const options = ["", ...matches.slice(0, 50)];

  useEffect(() => {
    if (open && active >= 0) {
      list.current?.children[active]?.scrollIntoView({ block: "nearest" });
    }
  }, [active, open]);

  function choose(name: string) {
    setValue(name);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="foundation-search" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <div className="foundation-search-control">
        <input
          ref={input}
          type="text"
          name="q"
          value={value}
          placeholder="Select or search a foundation"
          aria-label="Foundation name"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setValue(event.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((index) => event.key === "ArrowDown"
                ? Math.min(open ? index + 1 : 0, options.length - 1)
                : Math.max(open ? index - 1 : options.length - 1, 0));
            } else if (event.key === "Enter" && open && active >= 0) {
              event.preventDefault();
              choose(options[active]);
            } else if (event.key === "Escape") {
              setOpen(false);
              setActive(-1);
            }
          }}
        />
        <button type="button" className="foundation-search-toggle"
          aria-label={open ? "Close foundation list" : "Open foundation list"}
          aria-expanded={open} aria-controls={`${id}-list`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            input.current?.focus();
            setOpen(!open);
            setActive(-1);
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d={open ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
          </svg>
        </button>
      </div>
      {open && (
        <div className="foundation-search-menu">
          <ul ref={list} id={`${id}-list`} role="listbox" aria-label="Foundations">
            {options.map((name, index) => (
              <li key={name} id={`${id}-option-${index}`} role="option"
                aria-selected={value === name}
                className={active === index ? "active" : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(name)}>
                {name || "All foundations"}
              </li>
            ))}
          </ul>
          <p className="foundation-search-help" role="status">
            {matches.length === 0 ? "No matching foundations. Try another name."
              : matches.length > 50 ? `Showing 50 of ${matches.length.toLocaleString()}. Type to narrow the list.`
              : `${matches.length.toLocaleString()} foundation${matches.length === 1 ? "" : "s"}`}
          </p>
        </div>
      )}
    </div>
  );
}

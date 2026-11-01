"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="ew-password">
      <input type={visible ? "text" : "password"} {...props} />
      <button
        type="button"
        className="ew-password-toggle"
        aria-label={visible ? "Ascunde parola" : "Arată parola"}
        aria-pressed={visible}
        onMouseDown={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") event.preventDefault();
        }}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <EyeOff aria-hidden="true" strokeWidth={1.75} />
        ) : (
          <Eye aria-hidden="true" strokeWidth={1.75} />
        )}
      </button>
    </span>
  );
}
